-- Allow deleting an item from `items` even after it's been sold at least
-- once. Run this in the Supabase SQL editor (or via `supabase db push`).
--
-- Right now bill_items.item_id -> items.id has the default ON DELETE NO
-- ACTION behaviour, so deleting a sold item fails with:
--   update or delete on table "items" violates foreign key constraint
--   "bill_items_item_id_fkey" on table "bill_items"
--
-- bill_items already stores its own copy of item_name / item_sku /
-- unit_price / quantity at the time of sale (see completeSale in
-- useStore.js), so it doesn't actually need a live item_id to render past
-- receipts — it's only used as a soft back-reference. Switching to
-- ON DELETE SET NULL keeps all bill history intact and just clears that
-- back-reference when the source item is removed.

alter table public.bill_items
  alter column item_id drop not null;

alter table public.bill_items
  drop constraint if exists bill_items_item_id_fkey;

alter table public.bill_items
  add constraint bill_items_item_id_fkey
  foreign key (item_id) references public.items(id) on delete set null;
