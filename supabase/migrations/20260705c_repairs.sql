-- Repair job tickets ("Repairs" page).
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Standalone table, optionally linked to the existing customer ledger
-- (customer_id), but self-contained via a name/phone snapshot so a ticket
-- still renders fully even if the linked customer is later deleted.

-- ── Table ───────────────────────────────────────────────────────────────

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),

  -- Optional link into the udhar/customer ledger. Soft reference, same
  -- pattern as bill_items -> items/products: never let deleting a customer
  -- block deleting (or keeping) their repair history.
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,

  device_brand text,
  device_model text,
  device_imei text,
  issue_description text not null,

  status text not null default 'received'
    check (status in ('received', 'diagnosing', 'in_progress', 'waiting_for_parts', 'completed', 'delivered', 'cancelled')),

  estimated_cost numeric(12, 2),
  final_cost numeric(12, 2),
  -- [{ "name": "Screen", "cost": 1200 }, ...] — freeform enough that no
  -- separate parts catalog is needed for a first version of this page.
  parts_used jsonb not null default '[]'::jsonb,
  technician_notes text,

  received_date date not null default current_date,
  completed_date date,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repairs_status_idx on public.repairs (status);
create index if not exists repairs_received_date_idx on public.repairs (received_date desc);
create index if not exists repairs_customer_id_idx on public.repairs (customer_id);

-- Reuses the set_updated_at() helper created in 20260701_customer_ledger.sql.
drop trigger if exists repairs_set_updated_at on public.repairs;
create trigger repairs_set_updated_at
  before update on public.repairs
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────
-- Repairs are a front-desk/sales-floor feature like Billing: any signed-in
-- staff member (owner/builder/salesman) can log and update a ticket.
-- Deleting a ticket outright is restricted to owner/builder, same tier as
-- inventory management, so a salesman can't erase repair history.

alter table public.repairs enable row level security;

create policy "staff_select_repairs"
  on public.repairs for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "staff_insert_repairs"
  on public.repairs for insert
  to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "staff_update_repairs"
  on public.repairs for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "owner_builder_delete_repairs"
  on public.repairs for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

notify pgrst, 'reload schema';
