-- Adds partial-payment tracking to `bills` so a sale can be marked as
-- "paid ₹X of ₹Y now, rest later" (EMI / pay-later), and makes sure a
-- pay-later balance gets written into the existing customers/udhar ledger
-- so it shows up on the new "Pay Later Customers" page. Run this in the
-- Supabase SQL editor (or via `supabase db push`). Safe to run multiple
-- times.

-- ── 1. bills.paid_amount / bills.due_amount ────────────────────────────

alter table public.bills
  add column if not exists paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0);

-- Backfill: every bill created before this migration was fully collected
-- at time of sale (the app had no partial-payment concept yet), so treat
-- historical rows as "paid in full" rather than "100% due".
update public.bills
set paid_amount = coalesce(total, 0)
where paid_amount = 0;

alter table public.bills
  add column if not exists due_amount numeric(12, 2)
  generated always as (greatest(coalesce(total, 0) - paid_amount, 0)) stored;

create index if not exists bills_due_amount_idx
  on public.bills (due_amount)
  where due_amount > 0;

-- ── 2. Let billing-capable roles write the pay-later ledger entry ──────
-- Checkout (any role that can create a bill — owner/builder/salesman) now
-- also finds-or-creates a `customers` row by phone and inserts a
-- `customer_transactions` udhar row for the due amount. The customer
-- ledger's existing policies only allowed owner/builder, which would make
-- checkout silently fail to record the pay-later balance for a salesman.

drop policy if exists "billing_roles_select_customers" on public.customers;
create policy "billing_roles_select_customers"
  on public.customers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_insert_customers" on public.customers;
create policy "billing_roles_insert_customers"
  on public.customers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_select_customer_transactions" on public.customer_transactions;
create policy "billing_roles_select_customer_transactions"
  on public.customer_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_insert_customer_transactions" on public.customer_transactions;
create policy "billing_roles_insert_customer_transactions"
  on public.customer_transactions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );

-- Note: the pre-existing owner_builder_update_customers /
-- owner_builder_delete_customers / owner_builder_update_customer_transactions /
-- owner_builder_delete_customer_transactions policies from
-- 20260701_customer_ledger.sql are left untouched on purpose — editing or
-- deleting ledger entries stays owner/builder-only. This migration only
-- widens SELECT/INSERT so a salesman's checkout can create the record in
-- the first place.

create index if not exists customers_phone_idx on public.customers (phone);
