-- Fixes "Add item" (single-item / AddItemModal.jsx) failing with:
--   duplicate key value violates unique constraint "products_sku_key"
--
-- Root cause: createSerializedProduct() in useStore.js always ran an
-- unconditional INSERT into `products`, unlike bulkAddSerializedUnits()
-- (20260704_bulk_add_serialized_units_rpc.sql) which first looks for an
-- existing product matching category+brand+model+color+specs and reuses
-- it. So restocking a phone model you already have — same brand, model,
-- color, RAM/storage, SKU — creates a second `products` row with the
-- same SKU, and `products_sku_key` (UNIQUE on sku) correctly rejects it.
-- The bulk-add flow doesn't hit this because it already matches/reuses;
-- the single-item flow never did.
--
-- Fix: same pattern as the bulk-add fix — move product match-or-create
-- and unit/identifier insertion into one Postgres function, run in a
-- single transaction, matching against the LIVE table (not the browser's
-- in-memory cache). If a variant already exists, its id is reused and
-- only new inventory_units/device_identifiers rows are added — no second
-- products row, so no SKU collision. Also gives a friendly message
-- (instead of the raw Postgres error) if a genuine SKU conflict slips
-- through, e.g. reusing someone else's SKU for a different model.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Safe to run multiple times.

create or replace function public.create_serialized_product(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text := payload->>'category';
  v_brand text := payload->>'brand';
  v_model text := payload->>'model';
  v_color text := nullif(trim(payload->>'color'), '');
  v_sku text := nullif(trim(payload->>'sku'), '');
  v_ram text := nullif(trim(payload#>>'{specs,ram}'), '');
  v_storage text := nullif(trim(payload#>>'{specs,storage}'), '');
  v_price numeric := coalesce(nullif(payload->>'price', '')::numeric, 0);
  v_cost_price numeric := nullif(payload->>'cost_price', '')::numeric;
  v_warranty_months int := nullif(payload->>'warranty_months', '')::int;
  v_hsn text := coalesce(nullif(trim(payload->>'hsn_code'), ''), '85171300');
  v_gst numeric := coalesce(nullif(payload->>'gst_rate', '')::numeric, 18);
  v_image_url text := nullif(trim(payload->>'image_url'), '');
  v_location_type text := coalesce(nullif(payload->>'location_type', ''), 'shelf');
  v_location_label text := nullif(trim(payload->>'location_label'), '');

  v_location_id uuid;
  v_product_id uuid;
  v_product_created boolean := false;
  v_unit jsonb;
  v_unit_id uuid;
  v_warranty_start date;
  v_warranty_end date;
  v_units_added int := 0;
begin
  if v_brand is null or trim(v_brand) = '' or v_model is null or trim(v_model) = '' then
    raise exception 'Brand and model are required.';
  end if;

  if v_location_label is not null then
    select id into v_location_id
    from public.locations
    where type = v_location_type and lower(label) = lower(v_location_label)
    limit 1;

    if v_location_id is null then
      insert into public.locations (type, label)
      values (v_location_type, v_location_label)
      returning id into v_location_id;
    end if;
  end if;

  if v_warranty_months is not null then
    v_warranty_start := current_date;
    v_warranty_end := current_date + (v_warranty_months || ' months')::interval;
  end if;

  -- Match against the LIVE table, same variant key as bulk-add, so
  -- restocking an existing model/color/config reuses its product row
  -- instead of creating a duplicate (and colliding on SKU).
  select id into v_product_id
  from public.products
  where category = v_category
    and lower(trim(brand)) = lower(trim(v_brand))
    and lower(trim(model)) = lower(trim(v_model))
    and lower(trim(coalesce(color, ''))) = lower(trim(coalesce(v_color, '')))
    and lower(trim(coalesce(specs->>'ram', ''))) = lower(trim(coalesce(v_ram, '')))
    and lower(trim(coalesce(specs->>'storage', ''))) = lower(trim(coalesce(v_storage, '')))
  limit 1
  for update;

  if v_product_id is null then
    insert into public.products (
      category, brand, model, color, sku, price, cost_price,
      warranty_months, specs, config, hsn_code, gst_rate, image_url, is_serialized
    ) values (
      v_category, trim(v_brand), trim(v_model), v_color,
      v_sku, v_price, v_cost_price, v_warranty_months,
      jsonb_strip_nulls(jsonb_build_object('ram', v_ram, 'storage', v_storage)),
      coalesce(payload->'config', '{}'::jsonb),
      v_hsn, v_gst, v_image_url, true
    )
    returning id into v_product_id;
    v_product_created := true;
  end if;

  for v_unit in select * from jsonb_array_elements(coalesce(payload->'units', '[]'::jsonb))
  loop
    insert into public.inventory_units (
      product_id, status, purchase_price, location_id,
      warranty_start_date, warranty_end_date
    ) values (
      v_product_id, 'in_stock', v_cost_price, v_location_id,
      v_warranty_start, v_warranty_end
    )
    returning id into v_unit_id;

    if nullif(trim(v_unit->>'imei1'), '') is not null then
      insert into public.device_identifiers (unit_id, product_id, identifier_value, identifier_type)
      values (v_unit_id, v_product_id, trim(v_unit->>'imei1'), 'IMEI_1');
    end if;
    if nullif(trim(v_unit->>'imei2'), '') is not null then
      insert into public.device_identifiers (unit_id, product_id, identifier_value, identifier_type)
      values (v_unit_id, v_product_id, trim(v_unit->>'imei2'), 'IMEI_2');
    end if;
    if nullif(trim(v_unit->>'serial'), '') is not null then
      insert into public.device_identifiers (unit_id, product_id, identifier_value, identifier_type)
      values (v_unit_id, v_product_id, trim(v_unit->>'serial'), 'SERIAL_NUMBER');
    end if;
    if nullif(trim(v_unit->>'barcode'), '') is not null then
      insert into public.device_identifiers (unit_id, product_id, identifier_value, identifier_type)
      values (v_unit_id, v_product_id, trim(v_unit->>'barcode'), 'BARCODE');
    end if;

    v_units_added := v_units_added + 1;
  end loop;

  return jsonb_build_object(
    'productId', v_product_id,
    'productCreated', v_product_created,
    'unitsAdded', v_units_added
  );
exception
  when unique_violation then
    declare
      v_pg_detail text;
      v_constraint text;
      v_dup_value text;
      v_existing record;
    begin
      get stacked diagnostics v_pg_detail = pg_exception_detail, v_constraint = constraint_name;

      -- Duplicate IMEI/serial/barcode.
      if v_constraint = 'device_identifiers_identifier_value_key' or v_pg_detail ~ 'identifier_value' then
        v_dup_value := (regexp_match(v_pg_detail, 'identifier_value\)=\(([^)]*)\)'))[1];
        if v_dup_value is null then
          raise exception 'Duplicate IMEI/serial — one of these values already exists in inventory.';
        end if;

        select p.brand, p.model, p.color, iu.status
        into v_existing
        from public.device_identifiers di
        join public.inventory_units iu on iu.id = di.unit_id
        join public.products p on p.id = di.product_id
        where di.identifier_value = v_dup_value
        limit 1;

        if found then
          raise exception 'IMEI/serial "%" is already in inventory — assigned to % % % (status: %).',
            v_dup_value, v_existing.brand, v_existing.model, coalesce(v_existing.color, ''), v_existing.status;
        else
          raise exception 'IMEI/serial "%" is already in inventory.', v_dup_value;
        end if;
      end if;

      -- Duplicate SKU on `products` — friendly message instead of the
      -- raw Postgres error, naming what already owns that SKU.
      if v_constraint = 'products_sku_key' or v_pg_detail ~ '\(sku\)' then
        v_dup_value := (regexp_match(v_pg_detail, '\(sku\)=\(([^)]*)\)'))[1];

        select p.brand, p.model, p.color
        into v_existing
        from public.products p
        where p.sku = v_dup_value
        limit 1;

        if found then
          raise exception 'SKU "%" is already used by % % %. Leave SKU blank or use a different one for a different model, or add units without changing the SKU to restock this exact model.',
            v_dup_value, v_existing.brand, v_existing.model, coalesce(v_existing.color, '');
        else
          raise exception 'SKU "%" is already in use on another product.', v_dup_value;
        end if;
      end if;

      raise;
    end;
end;
$$;

grant execute on function public.create_serialized_product(jsonb) to authenticated;

notify pgrst, 'reload schema';
