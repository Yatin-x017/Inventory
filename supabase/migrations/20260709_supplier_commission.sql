-- Supplier transactions carry a flat 3% per-transaction commission that
-- gets deducted before settlement, and settled amounts are rounded to
-- the nearest 10 (common practice for recharge/PRM-style distributor
-- ledgers like the JIO import). This adds a generated `net_amount`
-- column so that figure is computed once, consistently, everywhere the
-- ledger is read — rather than recomputed ad hoc in the frontend and
-- risking drift between the Suppliers list and a supplier's detail page.
--
-- net_amount = round((amount * 0.97) / 10) * 10
--
-- Run this in the Supabase SQL editor (or via `supabase db push`). Safe
-- to run multiple times.

alter table public.supplier_transactions
  add column if not exists net_amount numeric(14, 2)
  generated always as (round((amount * 0.97) / 10) * 10) stored;

comment on column public.supplier_transactions.net_amount is
  'amount after a flat 3% per-transaction commission is deducted, rounded to the nearest 10. This is the figure the ledger totals/stat cards use — "amount" stays the untouched raw imported value for exact re-export.';

create or replace view public.supplier_balances
with (security_invoker = true) as
select
  s.id as supplier_id,
  count(t.id) as txn_count,
  coalesce(sum(t.amount), 0) as total_amount,
  coalesce(sum(t.net_amount), 0) as total_net_amount,
  max(t.txn_date) as last_txn_date,
  min(t.txn_date) as first_txn_date
from public.suppliers s
left join public.supplier_transactions t on t.supplier_id = s.id
group by s.id;
