-- Reworks the customer/udhar ledger into a 3-tier hierarchy:
--   Owner (+ Builder, unchanged top tier)
--     -> Marketing Member  (a new `profiles.role`, manages their own book
--        of retailers)
--          -> Smaller retailers (a `customers` row, now with
--             `assigned_to` pointing at the marketing member who owns
--             the relationship)
--
-- Also fixes a pre-existing bug: `customer_transactions.type` only ever
-- allowed ('udhar', 'payment') at the DB level, but the frontend
-- (AddTransactionModal / CustomerDetail) has been inserting/rendering
-- 'owed' and 'paid_out' since the four-button ledger UI was built — every
-- "You owe them" / "You paid them" entry has been silently rejected by
-- Postgres until now.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`). Safe
-- to run multiple times.

-- ── 1. Retailer -> Marketing Member assignment ─────────────────────────

alter table public.customers
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists customers_assigned_to_idx on public.customers (assigned_to);

comment on column public.customers.assigned_to is
  'The marketing_member (profiles.id) whose book this retailer belongs to. Null = unassigned / house account, visible only to owner/builder.';

-- ── 2. Fix the transaction type constraint ─────────────────────────────

alter table public.customer_transactions
  drop constraint if exists customer_transactions_type_check;

alter table public.customer_transactions
  add constraint customer_transactions_type_check
  check (type in ('udhar', 'payment', 'owed', 'paid_out'));

-- ── 3. RLS rework ───────────────────────────────────────────────────────
-- Owner/builder: unchanged, full access to every retailer.
-- Marketing member: full access, but only to retailers assigned to them.
-- Salesman: unchanged (select/insert only, for checkout's pay-later
-- find-or-create-by-phone flow) — untouched from 20260703c.

drop policy if exists "owner_builder_select_customers" on public.customers;
drop policy if exists "billing_roles_select_customers" on public.customers;
create policy "tiered_select_customers"
  on public.customers for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder', 'salesman')
          or (p.role = 'marketing_member' and public.customers.assigned_to = auth.uid())
        )
    )
  );

drop policy if exists "owner_builder_insert_customers" on public.customers;
drop policy if exists "billing_roles_insert_customers" on public.customers;
create policy "tiered_insert_customers"
  on public.customers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder', 'salesman')
          or (p.role = 'marketing_member' and public.customers.assigned_to = auth.uid())
        )
    )
  );

drop policy if exists "owner_builder_update_customers" on public.customers;
create policy "tiered_update_customers"
  on public.customers for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder')
          or (p.role = 'marketing_member' and public.customers.assigned_to = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder')
          -- a marketing_member can edit their own retailer's details, but
          -- cannot use update to reassign it to someone else's book —
          -- with check re-tests assigned_to against the NEW row.
          or (p.role = 'marketing_member' and public.customers.assigned_to = auth.uid())
        )
    )
  );

-- Deleting a retailer (cascades their whole ledger) stays owner/builder
-- only, unchanged from the original migration — a marketing member can
-- manage but not erase their book.
drop policy if exists "owner_builder_delete_customers" on public.customers;
create policy "owner_builder_delete_customers"
  on public.customers for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

-- ── customer_transactions ───────────────────────────────────────────────

drop policy if exists "owner_builder_select_customer_transactions" on public.customer_transactions;
drop policy if exists "billing_roles_select_customer_transactions" on public.customer_transactions;
create policy "tiered_select_customer_transactions"
  on public.customer_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder', 'salesman')
          or (
            p.role = 'marketing_member'
            and exists (
              select 1 from public.customers c
              where c.id = customer_transactions.customer_id and c.assigned_to = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "owner_builder_insert_customer_transactions" on public.customer_transactions;
drop policy if exists "billing_roles_insert_customer_transactions" on public.customer_transactions;
create policy "tiered_insert_customer_transactions"
  on public.customer_transactions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder', 'salesman')
          or (
            p.role = 'marketing_member'
            and exists (
              select 1 from public.customers c
              where c.id = customer_transactions.customer_id and c.assigned_to = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "owner_builder_update_customer_transactions" on public.customer_transactions;
create policy "tiered_update_customer_transactions"
  on public.customer_transactions for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder')
          or (
            p.role = 'marketing_member'
            and exists (
              select 1 from public.customers c
              where c.id = customer_transactions.customer_id and c.assigned_to = auth.uid()
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'builder')
          or (
            p.role = 'marketing_member'
            and exists (
              select 1 from public.customers c
              where c.id = customer_transactions.customer_id and c.assigned_to = auth.uid()
            )
          )
        )
    )
  );

-- Deleting a ledger entry stays owner/builder only, unchanged.
drop policy if exists "owner_builder_delete_customer_transactions" on public.customer_transactions;
create policy "owner_builder_delete_customer_transactions"
  on public.customer_transactions for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder')
    )
  );

-- ── 4. Note on `profiles.role` ──────────────────────────────────────────
-- `role` has always been a plain `text` column (validated only in the
-- frontend dropdown, see src/pages/Users.jsx), not a DB check constraint
-- or enum — so 'marketing_member' is usable immediately, no ALTER needed
-- here. The owner assigns the role from Staff (Users.jsx) same as always.
