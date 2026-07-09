-- Fixes: deleting a bill from Bill Logs (added in
-- 20260706_bill_delete_emi_company_unit_edit.sql) throws
--   update or delete on table "bills" violates foreign key constraint
--   "inventory_units_bill_id_fkey" on table "inventory_units"
-- for any bill that sold a serialized (IMEI/serial-tracked) unit —
-- `inventory_units.bill_id` was left as the default NO ACTION/RESTRICT,
-- so Postgres refuses the delete rather than orphan the reference.
--
-- Same reasoning SCHEMA.md already documents for bill_items' *_id
-- columns ("every one of them must be ON DELETE SET NULL, or deleting a
-- previously-sold item/product/unit fails with a foreign key violation")
-- applies here too — `inventory_units.bill_id` is a soft back-reference
-- ("which bill sold this unit"), not something that should block a
-- delete. The unit itself, its `status` ('sold'), and its
-- warranty/purchase-price fields are untouched; only the pointer back to
-- the now-deleted bill is cleared.
--
-- Safe to run multiple times.

alter table public.inventory_units
  drop constraint if exists inventory_units_bill_id_fkey;

alter table public.inventory_units
  add constraint inventory_units_bill_id_fkey
  foreign key (bill_id) references public.bills(id) on delete set null;

notify pgrst, 'reload schema';
