-- Suppliers ledger (JIO / VIVO / OPPO / etc.) with per-supplier daily
-- transaction imports. Different suppliers get very different report
-- formats from their portals (e.g. JIO's recharge/PRM transaction export
-- has ~17 columns, a stock supplier might just be Date/Amount/Note), so
-- the transaction table stores the full original row as `raw` jsonb
-- (for faithful re-export) alongside a few normalized columns
-- (txn_date, amount) used for ledger totals and date filtering
-- regardless of which supplier's format it came from.
--
-- Owner/builder only — mirrors the customer_ledger (20260701) access
-- tier, since supplier purchasing/commissions aren't a salesman concern.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`). Safe
-- to run multiple times.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text, -- freeform, e.g. 'Recharge', 'Stock' — not enforced, just a label
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_transactions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  txn_date date not null,
  amount numeric(14, 2) not null default 0,
  reference_no text,
  description text,
  -- Every original column from the imported row, keyed by its exact
  -- source header (e.g. "Order Amount", "Transfer Amount", "Partner
  -- Name"...), so exports can reconstruct the exact template a supplier
  -- was imported with.
  raw jsonb not null default '{}'::jsonb,
  -- Ordered header list for the import batch this row came from, so the
  -- UI/export can render columns in the original order rather than
  -- jsonb's unordered keys.
  columns text[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists supplier_transactions_supplier_id_idx
  on public.supplier_transactions (supplier_id);

create index if not exists supplier_transactions_date_idx
  on public.supplier_transactions (txn_date desc);

-- ── updated_at trigger (reuses the function from customer_ledger) ───────

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ── Balance / summary view ───────────────────────────────────────────────

create or replace view public.supplier_balances
with (security_invoker = true) as
select
  s.id as supplier_id,
  count(t.id) as txn_count,
  coalesce(sum(t.amount), 0) as total_amount,
  max(t.txn_date) as last_txn_date,
  min(t.txn_date) as first_txn_date
from public.suppliers s
left join public.supplier_transactions t on t.supplier_id = s.id
group by s.id;

-- ── Row Level Security ────────────────────────────────────────────────

alter table public.suppliers enable row level security;
alter table public.supplier_transactions enable row level security;

drop policy if exists "owner_builder_select_suppliers" on public.suppliers;
create policy "owner_builder_select_suppliers"
  on public.suppliers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_insert_suppliers" on public.suppliers;
create policy "owner_builder_insert_suppliers"
  on public.suppliers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_update_suppliers" on public.suppliers;
create policy "owner_builder_update_suppliers"
  on public.suppliers for update
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

drop policy if exists "owner_builder_delete_suppliers" on public.suppliers;
create policy "owner_builder_delete_suppliers"
  on public.suppliers for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_select_supplier_transactions" on public.supplier_transactions;
create policy "owner_builder_select_supplier_transactions"
  on public.supplier_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_insert_supplier_transactions" on public.supplier_transactions;
create policy "owner_builder_insert_supplier_transactions"
  on public.supplier_transactions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_delete_supplier_transactions" on public.supplier_transactions;
create policy "owner_builder_delete_supplier_transactions"
  on public.supplier_transactions for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

notify pgrst, 'reload schema';
