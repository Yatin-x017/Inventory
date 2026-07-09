-- Backup / restore system.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Safe to run multiple times.
--
-- Pieces:
--   1. A private `backups` storage bucket that the `backup-export` edge
--      function writes weekly (and on-demand) JSON snapshots into.
--   2. RLS so owner/builder can list/download/delete those snapshots
--      directly from the app (no extra edge function needed just to
--      browse backups).
--   3. `restore_from_backup(payload jsonb)` — an atomic, owner-only RPC
--      that wipes the app's tables and reloads them from a backup JSON
--      blob (either one picked from the `backups` bucket, or a file the
--      owner uploads from their computer). Runs as one transaction: it
--      either fully restores or fully rolls back.
--   4. Commented instructions (not auto-run — needs your project's real
--      URL + service role key) for scheduling `backup-export` weekly
--      with pg_cron + pg_net.

-- ── 1. Storage bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- ── 2. Storage RLS (owner/builder only) ─────────────────────────────────

drop policy if exists "owner_builder_read_backups" on storage.objects;
create policy "owner_builder_read_backups"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'backups'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'builder')
    )
  );

drop policy if exists "owner_builder_delete_backups" on storage.objects;
create policy "owner_builder_delete_backups"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'backups'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'builder')
    )
  );

-- Uploads always go through the backup-export edge function using the
-- service role key, which bypasses RLS entirely — no insert policy for
-- regular authenticated users is needed (or wanted).

-- ── 3. restore_from_backup RPC ──────────────────────────────────────────

create or replace function public.restore_from_backup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_tables jsonb := payload->'tables';
  v_row_counts jsonb := '{}'::jsonb;
  v_count int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'owner' then
    raise exception 'Only the owner can restore a backup.';
  end if;

  if v_tables is null then
    raise exception 'Backup file is missing its "tables" payload.';
  end if;

  -- Wipe in child-to-parent order so FKs never block a delete.
  delete from public.bill_items;
  delete from public.bills;
  delete from public.customer_transactions;
  delete from public.customers;
  delete from public.device_identifiers;
  delete from public.inventory_units;
  delete from public.products;
  delete from public.item_tags;
  delete from public.item_locations;
  delete from public.tags;
  delete from public.items;
  delete from public.locations;

  -- Reload in parent-to-child order. Each table is optional in the
  -- payload (jsonb_array_elements over an empty/missing array is a
  -- no-op), so a backup taken before a newer table existed still restores
  -- everything it does contain.

  insert into public.locations select * from jsonb_populate_recordset(null::public.locations, coalesce(v_tables->'locations', '[]'::jsonb));
  insert into public.items select * from jsonb_populate_recordset(null::public.items, coalesce(v_tables->'items', '[]'::jsonb));
  insert into public.tags select * from jsonb_populate_recordset(null::public.tags, coalesce(v_tables->'tags', '[]'::jsonb));
  insert into public.item_locations select * from jsonb_populate_recordset(null::public.item_locations, coalesce(v_tables->'item_locations', '[]'::jsonb));
  insert into public.item_tags select * from jsonb_populate_recordset(null::public.item_tags, coalesce(v_tables->'item_tags', '[]'::jsonb));
  insert into public.products select * from jsonb_populate_recordset(null::public.products, coalesce(v_tables->'products', '[]'::jsonb));
  insert into public.inventory_units select * from jsonb_populate_recordset(null::public.inventory_units, coalesce(v_tables->'inventory_units', '[]'::jsonb));
  insert into public.device_identifiers select * from jsonb_populate_recordset(null::public.device_identifiers, coalesce(v_tables->'device_identifiers', '[]'::jsonb));

  -- customers/customer_transactions.created_by points at profiles, which
  -- this restore never touches. If a backup is being replayed onto a
  -- different project (disaster recovery onto a fresh Supabase project),
  -- those profile ids won't exist — null the reference out rather than
  -- failing the whole restore over a soft "who created this" field.
  insert into public.customers
  select c.* from jsonb_populate_recordset(null::public.customers, coalesce(v_tables->'customers', '[]'::jsonb)) c;
  update public.customers set created_by = null
  where created_by is not null and created_by not in (select id from public.profiles);

  insert into public.customer_transactions
  select t.* from jsonb_populate_recordset(null::public.customer_transactions, coalesce(v_tables->'customer_transactions', '[]'::jsonb)) t;
  update public.customer_transactions set created_by = null
  where created_by is not null and created_by not in (select id from public.profiles);

  insert into public.bills select * from jsonb_populate_recordset(null::public.bills, coalesce(v_tables->'bills', '[]'::jsonb));
  insert into public.bill_items select * from jsonb_populate_recordset(null::public.bill_items, coalesce(v_tables->'bill_items', '[]'::jsonb));

  select jsonb_object_agg(t, cnt) into v_row_counts
  from (
    select 'locations' t, count(*) cnt from public.locations
    union all select 'items', count(*) from public.items
    union all select 'tags', count(*) from public.tags
    union all select 'item_locations', count(*) from public.item_locations
    union all select 'item_tags', count(*) from public.item_tags
    union all select 'products', count(*) from public.products
    union all select 'inventory_units', count(*) from public.inventory_units
    union all select 'device_identifiers', count(*) from public.device_identifiers
    union all select 'customers', count(*) from public.customers
    union all select 'customer_transactions', count(*) from public.customer_transactions
    union all select 'bills', count(*) from public.bills
    union all select 'bill_items', count(*) from public.bill_items
  ) counts;

  return jsonb_build_object('ok', true, 'rowCounts', v_row_counts);
end;
$$;

grant execute on function public.restore_from_backup(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ── 4. Weekly cron (run manually, once, after deploying backup-export) ──
-- This part is commented out on purpose: it needs your real project URL
-- and service role key, which should never be committed to a migration
-- file that lives in git. After running `supabase functions deploy
-- backup-export`, run the block below yourself in the Supabase SQL
-- editor with the placeholders filled in (Project Settings → API for
-- both values):
--
-- create extension if not exists pg_cron with schema extensions;
-- create extension if not exists pg_net with schema extensions;
--
-- select cron.schedule(
--   'weekly-inventory-backup',
--   '0 3 * * 0',  -- every Sunday 03:00 UTC
--   $cron$
--   select net.http_post(
--     url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/backup-export',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );
--
-- To change the schedule or remove it later:
--   select cron.unschedule('weekly-inventory-backup');
