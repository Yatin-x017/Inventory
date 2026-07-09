-- Fixes two bugs reported against the serialized (IMEI/serial) catalog:
--
-- 1. "update or delete on table products violates foreign key constraint
--     bill_items_product_id_fkey on table bill_items"
--    Deleting a product (or its inventory_units) fails once it has ever
--    been sold, because bill_items.product_id/unit_id still point at it
--    with the default ON DELETE NO ACTION behaviour. Exactly the same
--    class of bug as the one already fixed for the legacy items table in
--    20260703_allow_item_delete_with_bill_history.sql — bill_items already
--    keeps its own copy of item_name/unit_price/quantity at sale time, so
--    it doesn't need a live product/unit row to keep rendering past bills.
--
-- 2. IMEI/serial numbers not matching anything in the Billing page's
--    search. fetchSerializedCatalog() embeds device_identifiers under each
--    inventory_unit (see useStore.js). If device_identifiers has RLS
--    enabled but no (or too narrow a) SELECT policy, PostgREST silently
--    returns an empty array for that embed instead of erroring — the
--    product still shows up (by name/brand/sku), but every unit's IMEI/
--    serial list is empty, so typing/scanning an IMEI never matches. This
--    re-creates SELECT policies on products / inventory_units /
--    device_identifiers so every logged-in staff role (owner, builder,
--    salesman) — i.e. anyone who can open the Billing page — can read
--    them, matching the existing bills UPDATE policy's role set.
--
-- Safe to run multiple times.

-- ── 1. Let products / inventory_units be deleted after a sale ─────────────

alter table public.bill_items
  alter column product_id drop not null;

alter table public.bill_items
  drop constraint if exists bill_items_product_id_fkey;

alter table public.bill_items
  add constraint bill_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- Only run this block if bill_items has a unit_id column referencing
-- inventory_units (it does in this schema, to record which exact IMEI/
-- serial was sold). Same soft-reference fix as above.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bill_items' and column_name = 'unit_id'
  ) then
    alter table public.bill_items alter column unit_id drop not null;
    alter table public.bill_items drop constraint if exists bill_items_unit_id_fkey;
    alter table public.bill_items
      add constraint bill_items_unit_id_fkey
      foreign key (unit_id) references public.inventory_units(id) on delete set null;
  end if;
end $$;

-- ── 2. Make sure billing-capable roles can read the serialized catalog ────

alter table public.products enable row level security;
alter table public.inventory_units enable row level security;
alter table public.device_identifiers enable row level security;

drop policy if exists "billing_roles_select_products" on public.products;
create policy "billing_roles_select_products"
  on public.products for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_select_inventory_units" on public.inventory_units;
create policy "billing_roles_select_inventory_units"
  on public.inventory_units for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_select_device_identifiers" on public.device_identifiers;
create policy "billing_roles_select_device_identifiers"
  on public.device_identifiers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );
