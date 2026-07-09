-- Adds permanent per-sale invoice PDF storage.
--
-- This is the migration `src/lib/invoicePdf.js` and `supabase/SCHEMA.md`
-- have referenced by name (`20260705b_invoice_pdf_storage.sql`) since the
-- "Original PDF" feature was built — but the file itself was never
-- actually committed/run. Net effect: `bills.invoice_pdf_path` doesn't
-- exist and the `invoices` bucket doesn't exist, so
-- `generateAndStoreInvoicePdf()` has been failing on *every single sale*
-- since the feature shipped — both the storage upload and the follow-up
-- `bills` update have nothing to write to/into. This is silent by design
-- (see the comment in invoicePdf.js: a PDF failure must never block a
-- sale that's already been recorded), which is exactly why it's gone
-- unnoticed — Bill Logs has been falling back to its reconstructed view
-- for every bill, and the "Original PDF" button has never once appeared.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`), then
-- new sales will start getting a stored PDF. This can't backfill PDFs for
-- past bills — that snapshot is only ever taken once, at checkout time.
--
-- Safe to run multiple times.

-- ── 1. Column ────────────────────────────────────────────────────────────

alter table public.bills
  add column if not exists invoice_pdf_path text;

-- ── 2. Storage bucket ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- ── 3. Storage RLS ───────────────────────────────────────────────────────
-- invoicePdf.js uploads directly from the browser under the signed-in
-- user's own session (no edge function/service role involved here, unlike
-- the `backups` bucket), so whichever roles can complete a sale need
-- INSERT + UPDATE (upsert: true does an insert-or-update) on this bucket,
-- and whichever roles can see the "Original PDF" button in Bill Logs
-- (currently: everyone who can reach that page — no role gate on the
-- button itself) need SELECT so createSignedUrl() can actually read it.

drop policy if exists "billing_roles_select_invoices" on storage.objects;
create policy "billing_roles_select_invoices"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_insert_invoices" on storage.objects;
create policy "billing_roles_insert_invoices"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'builder', 'salesman')
    )
  );

drop policy if exists "billing_roles_update_invoices" on storage.objects;
create policy "billing_roles_update_invoices"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'builder', 'salesman')
    )
  )
  with check (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'builder', 'salesman')
    )
  );

notify pgrst, 'reload schema';
