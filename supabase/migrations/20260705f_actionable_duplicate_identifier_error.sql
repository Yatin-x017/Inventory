-- Makes "Duplicate IMEI/serial" errors actually actionable.
--
-- Root cause: bulk_add_serialized_units() (20260704_bulk_add_serialized_
-- units_rpc.sql) catches the unique_violation from device_identifiers'
-- unique constraint and re-raises a generic message:
--   "Duplicate IMEI/serial — one of these values already exists in
--   inventory."
-- That's not a bug in the constraint itself (it's correctly stopping the
-- same IMEI/serial from being entered twice) — but it throws away the
-- one piece of information Postgres already handed it: which value
-- conflicted. With several rows/fields on screen at once, there's no way
-- to tell which entry to fix or what it's already attached to, so a
-- perfectly legitimate rejection reads like a stuck/broken form.
--
-- Fix: pull the offending value out of the constraint violation's detail
-- text and look up what it's already attached to, so the error reads
-- like e.g.:
--   IMEI/serial "359310123456789" is already in inventory — assigned to
--   OPPO Reno 11 Pro (Black) [in_stock].
-- Falls back to the old generic message if the value can't be parsed out
-- (e.g. detail text format changes in a future Postgres version).
--
-- Full replace-in-place — same signature, same happy-path behavior.
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
    declare
      v_pg_detail text;
      v_dup_value text;
      v_existing record;
    begin
      get stacked diagnostics v_pg_detail = pg_exception_detail;
      v_dup_value := (regexp_match(v_pg_detail, 'identifier_value\)=\(([^)]*)\)'))[1];

      if v_dup_value is null then
        raise exception 'Duplicate IMEI/serial — one of these values already exists in inventory.';
      end if;

      -- The row that already holds this value is untouched by this
      -- (about to be rolled back) call, so it's safe to look up here.
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
    end;
end;
$$;

grant execute on function public.bulk_add_serialized_units(jsonb) to authenticated;

notify pgrst, 'reload schema';
