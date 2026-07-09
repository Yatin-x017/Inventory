-- Fixes "Bulk add units" failing with:
--   insert or update on table "inventory_units" violates foreign key
--   constraint "inventory_units_product_id_fkey"
--
-- Root cause: the old flow created/matched each variant's `products` row
-- and then inserted its `inventory_units` rows as several separate REST
-- calls straight from the browser (see BulkAddItemModal.jsx /
-- bulkAddSerializedUnits in useStore.js). Matching "does this variant's
-- product already exist" was done against the browser's in-memory
-- `products` cache, not a fresh read of the table. If that cache was even
-- slightly stale — a product deleted from another tab/session, a retry
-- after a previous partial failure, RLS silently returning fewer rows
-- than expected, etc. — the browser would happily insert
-- `inventory_units` rows against a `product_id` that no longer existed
-- (or never existed) in the database, which Postgres correctly rejects.
--
-- Fix: move the whole batch into a single Postgres function call. Each
-- RPC call runs inside one transaction, so every variant is matched
-- against the LIVE table at insert time (not a client-side cache) and
-- every unit it creates is guaranteed to reference a product row that
-- really exists in that same transaction — either the whole batch
-- commits together, or none of it does. This also lets each variant
-- carry its own selling price instead of one shared price for the batch.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Safe to run multiple times.

create or replace function public.bulk_add_serialized_units(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text := payload->>'category';
  v_brand text := payload->>'brand';
  v_model text := payload->>'model';
  v_sku text := nullif(trim(payload->>'sku'), '');
  v_hsn text := nullif(trim(payload->>'hsn_code'), '');
  v_gst numeric := coalesce(nullif(payload->>'gst_rate', '')::numeric, 18);
  v_warranty_months int := nullif(payload->>'warranty_months', '')::int;
  v_image_url text := nullif(trim(payload->>'image_url'), '');
  v_location_type text := coalesce(nullif(payload->>'location_type', ''), 'shelf');
  v_location_label text := nullif(trim(payload->>'location_label'), '');
  v_base_price numeric := coalesce(nullif(payload->>'price', '')::numeric, 0);
  v_cost_price numeric := nullif(payload->>'cost_price', '')::numeric;

  v_location_id uuid;
  v_variant jsonb;
  v_unit jsonb;
  v_product_id uuid;
  v_variant_price numeric;
  v_unit_id uuid;
  v_warranty_start date;
  v_warranty_end date;
  v_products_created int := 0;
  v_products_reused int := 0;
  v_units_added int := 0;
begin
  if v_brand is null or trim(v_brand) = '' or v_model is null or trim(v_model) = '' then
    raise exception 'Brand and model are required.';
  end if;

  -- Location is shared across the whole batch, resolved once up front.
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

  for v_variant in select * from jsonb_array_elements(coalesce(payload->'variants', '[]'::jsonb))
  loop
    -- Per-variant price, falling back to the batch's shared base price
    -- if this particular variant's row was left blank.
    v_variant_price := coalesce(nullif(v_variant->>'price', '')::numeric, v_base_price);
    v_product_id := null;

    select id into v_product_id
    from public.products
    where category = v_category
      and lower(trim(brand)) = lower(trim(v_brand))
      and lower(trim(model)) = lower(trim(v_model))
      and lower(trim(coalesce(color, ''))) = lower(trim(coalesce(v_variant->>'color', '')))
      and lower(trim(coalesce(specs->>'ram', ''))) = lower(trim(coalesce(v_variant->>'ram', '')))
      and lower(trim(coalesce(specs->>'storage', ''))) = lower(trim(coalesce(v_variant->>'storage', '')))
    limit 1
    for update;

    if v_product_id is null then
      insert into public.products (
        category, brand, model, color, sku, price, cost_price,
        warranty_months, specs, config, hsn_code, gst_rate, image_url, is_serialized
      ) values (
        v_category, trim(v_brand), trim(v_model),
        nullif(trim(v_variant->>'color'), ''),
        v_sku, v_variant_price, v_cost_price, v_warranty_months,
        jsonb_strip_nulls(jsonb_build_object(
          'ram', nullif(trim(v_variant->>'ram'), ''),
          'storage', nullif(trim(v_variant->>'storage'), '')
        )),
        '{}'::jsonb, v_hsn, v_gst, v_image_url, true
      )
      returning id into v_product_id;
      v_products_created := v_products_created + 1;
    else
      v_products_reused := v_products_reused + 1;
    end if;

    for v_unit in select * from jsonb_array_elements(coalesce(v_variant->'units', '[]'::jsonb))
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
  end loop;

  return jsonb_build_object(
    'productsCreated', v_products_created,
    'productsReused', v_products_reused,
    'unitsAdded', v_units_added
  );
exception
  when unique_violation then
    raise exception 'Duplicate IMEI/serial — one of these values already exists in inventory.';
end;
$$;

grant execute on function public.bulk_add_serialized_units(jsonb) to authenticated;

notify pgrst, 'reload schema';
