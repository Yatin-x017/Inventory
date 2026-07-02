-- Customer ledger (udhar / payments) for owner + builder roles.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Standalone from the existing Bills/sales system — no foreign keys into bills/items.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null check (type in ('udhar', 'payment')),
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  transaction_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists customer_transactions_customer_id_idx
  on public.customer_transactions (customer_id);

create index if not exists customer_transactions_date_idx
  on public.customer_transactions (transaction_date desc);

-- ── updated_at trigger ──────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ── Balance view ────────────────────────────────────────────────────────
-- balance > 0  → customer owes the shop (net udhar outstanding)
-- balance <= 0 → customer is settled / has overpaid
-- security_invoker means this view is subject to the querying user's RLS,
-- so it never leaks data the caller couldn't already see on the base tables.

create or replace view public.customer_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  coalesce(sum(t.amount) filter (where t.type = 'udhar'), 0) as total_udhar,
  coalesce(sum(t.amount) filter (where t.type = 'payment'), 0) as total_payment,
  coalesce(sum(t.amount) filter (where t.type = 'udhar'), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'payment'), 0) as balance,
  max(t.transaction_date) as last_transaction_date
from public.customers c
left join public.customer_transactions t on t.customer_id = c.id
group by c.id;

-- ── Row Level Security ──────────────────────────────────────────────────
-- Owner and builder get identical, full access. Salesman has no access at all
-- (mirrors the existing owner/builder-only Inventory management tier).

alter table public.customers enable row level security;
alter table public.customer_transactions enable row level security;

create policy "owner_builder_select_customers"
  on public.customers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

create policy "owner_builder_insert_customers"
  on public.customers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

create policy "owner_builder_update_customers"
  on public.customers for update
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

create policy "owner_builder_delete_customers"
  on public.customers for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

create policy "owner_builder_select_customer_transactions"
  on public.customer_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

create policy "owner_builder_insert_customer_transactions"
  on public.customer_transactions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

create policy "owner_builder_update_customer_transactions"
  on public.customer_transactions for update
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

create policy "owner_builder_delete_customer_transactions"
  on public.customer_transactions for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );
