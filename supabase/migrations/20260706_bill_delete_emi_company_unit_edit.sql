-- Three unrelated additions bundled together, all requested at once:
--
-- 1. Bill Logs "Delete" (permanent, for removing dummy/test bills) —
--    needs DELETE policies on bills + bill_items, since RLS only had
--    SELECT/UPDATE for them before now (void_bill never actually deleted
--    a row, see SCHEMA.md). Owner/builder only, same tier as every other
--    destructive inventory action in this app.
--
-- 2. bills.emi_company — free-text "financed through" field, only
--    meaningful when payment_method = 'emi'. Nullable, no backfill needed.
--
-- 3. Inventory Manage page "Edit details" on IMEI/serial-tracked units —
--    needs UPDATE on inventory_units and INSERT/UPDATE/DELETE on
--    device_identifiers (identifiers are edited by delete-then-reinsert
--    per identifier_type client-side, since there's no unique constraint
--    on (unit_id, identifier_type) to safely upsert against).
--
-- Safe to run multiple times.

-- ── 1. Bill Logs delete ─────────────────────────────────────────────────

drop policy if exists "owner_builder_delete_bills" on public.bills;
create policy "owner_builder_delete_bills"
  on public.bills for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_delete_bill_items" on public.bill_items;
create policy "owner_builder_delete_bill_items"
  on public.bill_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

-- (customer_transactions already has an owner_builder delete policy from
-- 20260701_customer_ledger.sql, which the app also relies on here to clean
-- up a deleted bill's pay-later ledger entry — nothing new needed there.)

-- ── 2. EMI financing company ────────────────────────────────────────────

alter table public.bills
  add column if not exists emi_company text;

-- ── 3. Edit details on IMEI/serial-tracked units ────────────────────────

alter table public.inventory_units enable row level security;
alter table public.device_identifiers enable row level security;

drop policy if exists "owner_builder_update_inventory_units" on public.inventory_units;
create policy "owner_builder_update_inventory_units"
  on public.inventory_units for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_insert_device_identifiers" on public.device_identifiers;
create policy "owner_builder_insert_device_identifiers"
  on public.device_identifiers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_update_device_identifiers" on public.device_identifiers;
create policy "owner_builder_update_device_identifiers"
  on public.device_identifiers for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_delete_device_identifiers" on public.device_identifiers;
create policy "owner_builder_delete_device_identifiers"
  on public.device_identifiers for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );
