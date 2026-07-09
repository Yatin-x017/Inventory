-- Adds real billing fields to `bills`: a flat rupee discount and the
-- payment method used to settle the sale. Run this in the Supabase SQL
-- editor (or via `supabase db push`).
--
-- Design note: rather than changing the signature/body of the existing
-- `complete_sale` / `complete_serialized_sale` RPC functions (whose exact
-- current definitions aren't in this repo), the frontend now does a
-- follow-up `update` on the freshly created bill row to set `discount`,
-- `payment_method`, and the final discounted `total`. This keeps the
-- stock-deduction / invoice-numbering logic inside those RPCs completely
-- untouched, so nothing here can break them.

alter table public.bills
  add column if not exists discount numeric(12, 2) not null default 0 check (discount >= 0);

alter table public.bills
  add column if not exists payment_method text
    check (payment_method in ('cash', 'upi', 'netbanking', 'emi'));

-- Backfill: any historical bills without a payment method recorded are
-- assumed to have been cash sales so the column can be made useful for
-- reporting without leaving old rows blank.
update public.bills
set payment_method = 'cash'
where payment_method is null;

-- ── RLS: allow the checkout follow-up update ───────────────────────────
-- The frontend now runs a plain client-side `update` on the just-created
-- bill row (to set discount/payment_method/total) right after the
-- `complete_sale` / `complete_serialized_sale` RPC returns. That update is
-- subject to `bills`' existing Row Level Security, so whichever role can
-- currently create a bill also needs an UPDATE policy or the checkout will
-- silently fail to save these fields.
--
-- IMPORTANT: this repo doesn't contain the original `bills` RLS policies,
-- so the policy below is a best-effort guess mirroring the roles that use
-- Billing in the app (owner, builder, salesman). If your project already
-- has an equivalent (or differently-scoped) UPDATE policy on `bills`,
-- drop or adjust this one to avoid duplicating/conflicting policies.
drop policy if exists "billing_roles_update_bills" on public.bills;
create policy "billing_roles_update_bills"
  on public.bills for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'builder', 'salesman')
    )
  );
