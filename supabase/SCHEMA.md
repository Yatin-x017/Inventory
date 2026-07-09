# DR Telecommunication Inventory — Supabase schema notes

This repo's `supabase/migrations/` only contains incremental changes — the
base schema was created by hand in the Supabase SQL editor and was never
checked in. This file documents the tables/relationships as reverse-engineered
from the frontend (`src/store/useStore.js`, `src/store/useCustomerStore.js`)
plus the migrations, so future changes don't have to be reconstructed from
scratch again. Treat it as a living doc — update it whenever you `alter table`
directly in the Supabase dashboard.

## Two parallel product systems

The app tracks stock two different ways, and they don't share rows:

| | Legacy / bulk items | Serialized (IMEI/serial) products |
|---|---|---|
| Catalog table | `items` | `products` |
| Stock table | `item_locations` (qty per location) | `inventory_units` (1 row per physical unit) |
| Identifiers | none (just `sku`) | `device_identifiers` (IMEI 1/2, serial, barcode) |
| Sold via | `complete_sale()` RPC | `complete_serialized_sale()` RPC |
| Bill line stores | `bill_items.item_id` (soft ref) | `bill_items.product_id` + `bill_items.unit_id` (soft refs) |

A single bill (`bills`) can contain lines from either system — `bill_items`
has columns for both and only the relevant one is populated per row.

## Tables

### `profiles`
One row per authenticated user. `role` is one of `owner`, `builder`,
`marketing_member`, `salesman` — used everywhere for RLS instead of
Supabase custom claims. `role` is plain `text` (no DB check
constraint/enum), validated only by the dropdown in `Users.jsx`.

### `items` (legacy/bulk catalog)
`id, name, sku, brand, price, image_url, created_at, ...`
Bulk goods without per-unit tracking (accessories, cables, etc).

### `locations`
`id, type, label` — shared by both stock systems (shelf/box/showroom, etc).

### `item_locations`
Join table: `item_id, location_id, quantity` — how many of an `items` row
sit at a given location.

### `tags` / `item_tags`
Freeform labels on `items` (e.g. the "dummy" tag in the Other Items table).

### `products` (serialized catalog)
`id, category, brand, model, color, sku, price, cost_price,
warranty_months, specs (jsonb), config (jsonb), image_url, is_serialized,
created_at`
One row per phone/TWS *model+color*, not per physical unit.

### `inventory_units`
`id, product_id -> products.id, status ('in_stock' | 'sold' | ...),
purchase_price, location_id -> locations.id, warranty_start_date,
warranty_end_date, bill_id -> bills.id (nullable, ON DELETE SET NULL),
created_at`
One row per physical unit of a `products` row. `bill_id` is a soft
back-reference to whichever bill sold this unit — set by
`complete_serialized_sale()` — and must stay `ON DELETE SET NULL` (fixed
in `20260706b_inventory_units_bill_id_set_null.sql`), or permanently
deleting a bill that sold a serialized unit fails with a foreign key
violation. Editable from the Manage
Inventory page's "Edit details" action (owner/builder only) — see
`updateInventoryUnitDetails` in `useStore.js` and
`20260706_bill_delete_emi_company_unit_edit.sql` for the UPDATE policy
this needs.

### `device_identifiers`
`id, unit_id -> inventory_units.id, product_id -> products.id,
identifier_value, identifier_type ('IMEI_1' | 'IMEI_2' | 'SERIAL_NUMBER' |
'BARCODE')`
Unique constraint on `identifier_value` (duplicate-IMEI inserts throw
Postgres `23505`, caught explicitly in `createSerializedProduct`).
**RLS on this table must allow SELECT for every billing-capable role** —
if it doesn't, `fetchSerializedCatalog()`'s embedded
`device_identifiers(...)` select silently comes back empty per unit (no
error), which makes IMEI/serial search in the Billing page match nothing
even though the product itself still shows up by name.

### `bills`
`id, invoice_number, customer_name, customer_email, customer_phone, notes,
discount, payment_method ('cash'|'upi'|'netbanking'|'emi'), emi_company,
total, email_status, created_at, sale_date, invoice_pdf_path`
`emi_company` (added in `20260706_bill_delete_emi_company_unit_edit.sql`)
is a free-text "financed through" name, only populated when
`payment_method = 'emi'`. Bills can now also be **permanently deleted**
(not just voided) from the Bill Logs page — owner/builder only, see the
same migration for the DELETE policies this needs on `bills` /
`bill_items` (deleting also removes the bill's `customer_transactions`
pay-later entry, if any, and clears `inventory_units.bill_id` for any
serialized unit it sold — see `20260706b_inventory_units_bill_id_set_null.sql`).
Created by `complete_sale()` / `complete_serialized_sale()` RPCs, then
patched client-side with `discount` / `payment_method` / final `total`
(see `20260703_bill_discount_and_payment_method.sql`). `sale_date`
(added in `20260704_bill_sale_date.sql`) is the editable "date of
purchase" printed on the invoice — defaults to today but can be
backdated by the cashier at checkout; `created_at` is left alone as the
true system record-creation timestamp and still drives invoice
numbering and the Recent Sales / Bill Logs ordering. `invoice_pdf_path`
(added in `20260705b_invoice_pdf_storage.sql`) points at a stored PDF
snapshot of the exact invoice printed/emailed at sale time, in the
private `invoices` storage bucket at `<bill_id>.pdf` — written
fire-and-forget by `src/lib/invoicePdf.js` right after checkout, and
nullable since older bills (or a failed upload) simply fall back to
Bill Logs' reconstructed view. These PDFs also get mirrored into the
`backups` bucket by `backup-export` (see `20260705_backup_system.sql`).

### `bill_items`
`id, bill_id -> bills.id, item_id -> items.id (nullable, ON DELETE SET
NULL), product_id -> products.id (nullable, ON DELETE SET NULL), unit_id ->
inventory_units.id (nullable, ON DELETE SET NULL), item_name, item_sku,
unit_price, quantity`
Stores its own copy of `item_name` / `unit_price` / `quantity` at sale
time, so it never needs a live `items`/`products`/`inventory_units` row to
render a past receipt — the `*_id` columns are soft back-references only.
**Every one of them must be `ON DELETE SET NULL`**, or deleting a
previously-sold item/product/unit fails with a foreign key violation
(`23503`). See:
- `20260703_allow_item_delete_with_bill_history.sql` (fixes `item_id`)
- `20260703b_fix_product_delete_and_imei_search.sql` (fixes `product_id`
  and `unit_id`)

### `customers` / `customer_transactions`
Udhar (credit) ledger, unrelated to `bills`. See
`20260701_customer_ledger.sql` for full definitions — that migration is
complete and self-contained (tables + RLS + `customer_balances` view).

**3-tier hierarchy** (added in
`20260707_customer_hierarchy_and_statements.sql`): Owner/Builder sit at
the top with full access to every retailer. `customers.assigned_to`
(nullable, `references profiles(id)`) points at the `marketing_member`
who owns that retailer relationship — a marketing member's RLS policies
scope every select/insert/update on `customers` and
`customer_transactions` to `assigned_to = auth.uid()`; deleting a
retailer (and its whole ledger) stays owner/builder-only. Retailers with
`assigned_to = null` are an "unassigned / house account" only owner/
builder can see. `customer_transactions.type` was widened in the same
migration to `('udhar', 'payment', 'owed', 'paid_out')` — the original
`20260701` constraint only allowed the first two, which meant every
"You owe them" / "You paid them" entry from the four-button ledger UI
had been silently rejected by Postgres.

**Statements**: `src/lib/statementPdf.js` + `LedgerStatementPrint.jsx`
generate a downloadable, paginated PDF of one retailer's transactions
(with running balance) between any two dates the owner picks — an
okCredit-style "send statement" feature. Purely client-side (renders
off-screen, rasterizes with html2canvas, paginates into jsPDF pages); no
new tables or storage involved.

### `repairs`
`id, customer_id -> customers.id (nullable, on delete set null),
customer_name, customer_phone, device_brand, device_model, device_imei,
issue_description, status ('received'|'diagnosing'|'in_progress'|
'waiting_for_parts'|'completed'|'delivered'|'cancelled'), estimated_cost,
final_cost, parts_used (jsonb array of {name, cost}), technician_notes,
received_date, completed_date, created_by -> profiles.id, created_at,
updated_at`
Repair job tickets (the Repairs page). Self-contained like `bills` —
`customer_name`/`customer_phone` are a snapshot, and `customer_id` is an
optional soft link into the udhar ledger for repeat customers. See
`20260705c_repairs.sql`. RLS: any signed-in staff member can create/view/
update a ticket (same tier as Billing); deleting one outright is
owner/builder only, like inventory management.

## Auth

Email/password (`signInWithPassword`) and Google OAuth
(`signInWithOAuth({ provider: 'google' })`, see `AuthContext.jsx`) are both
supported sign-in methods. Google requires the provider to be turned on in
the Supabase dashboard (Authentication → Providers → Google, with a Client
ID/secret from Google Cloud Console and the project's callback URL added
as an authorized redirect URI) — nothing to configure in this repo beyond
that.

Every screen after login depends on a `profiles` row matching
`auth.users.id` for role-based access (see `Users.jsx` for how the owner
adds staff). A Google sign-in whose email isn't already provisioned as
staff will authenticate with Supabase but have no matching `profiles` row;
`AuthContext`'s `noAccount` flag catches this and `ProtectedRoute` bounces
it back to `/login?error=no-account` (which signs the session back out)
instead of letting an unrecognized Google account into the app with no
role. To let an existing staff member use Google, the owner needs their
Google account's email to match how their staff profile was set up, or
Supabase's account-linking settings need to tie the two together — that's
project configuration, not something this frontend can control.

## RPC functions (not in this repo — live only in Supabase)

- `complete_sale(p_customer_name, p_customer_email, p_customer_phone,
  p_notes, p_items)` — creates a `bills` row, inserts `bill_items` for the
  legacy cart, decrements `item_locations.quantity`. Returns the new
  `bills.id`.
- `complete_serialized_sale(p_customer_name, p_customer_email,
  p_customer_phone, p_notes, p_unit_id, p_unit_price)` — creates a `bills`
  row, inserts one `bill_items` row, marks the `inventory_units` row
  `sold`. Returns the new `bills.id`.
- `void_bill(p_bill_id)` — reverses a sale.
- `restock_units_for_bill(p_bill_id)` — sets any serialized units from a
  voided bill back to `in_stock`.

If you ever need to change these, pull their current definition from the
Supabase SQL editor first (Database → Functions) — this repo doesn't have
their source.

## Recurring gotcha: soft references from `bill_items`

Because `bill_items` snapshots everything it needs to render a receipt,
**none of its `*_id` foreign keys should ever block a delete**. Whenever a
new sellable table is added, make sure the matching `bill_items` column is:
1. nullable, and
2. `on delete set null` (not the Postgres default `no action`).

Otherwise deleting anything that has ever been sold throws a `23503`
foreign key violation, which is exactly the bug this schema doc was
written to stop from recurring.

## Recurring gotcha: RLS on embedded selects

Supabase/PostgREST embeds (e.g. `.select('*, device_identifiers(...)')`)
don't error when RLS blocks the embedded table — they just return `[]` for
that relation. If a "detail" table used only for search/lookup (like
`device_identifiers`) starts silently returning nothing for a role, check
its RLS policies before assuming it's a frontend bug.

## Backup / restore

`20260705_backup_system.sql` adds a private `backups` storage bucket plus
`restore_from_backup(payload jsonb)`, an owner-only RPC that atomically
wipes and reloads every table above from a JSON snapshot.

Snapshots are written by the `backup-export` edge function
(`supabase/functions/backup-export/`), which exports every table into one
JSON blob and uploads it to `backups/weekly/`. It's called two ways:
weekly by a `pg_cron` job (wired up manually — see the commented block at
the bottom of the migration, since it needs your real project URL +
service role key, which shouldn't live in a committed migration file),
and on demand by the "Backup now" button on the Backups page
(owner/builder only).

Restoring (`src/pages/Backups.jsx`) works from either a snapshot picked
out of the `backups` bucket or a `.json` file the owner uploads directly
(e.g. one downloaded earlier, or migrating data into a fresh project).
Both funnel into the same `restore_from_backup` RPC after a typed
"RESTORE" confirmation, since it overwrites every row in every table
listed above.

`repairs` (added later, in `20260705c_repairs.sql`) is included in both
the export list (`backup-export/index.ts`) and the restore RPC (extended
in `20260705d_restore_includes_repairs.sql`) — whenever a new table is
added to the app, it needs to be added in both places, or it silently
falls out of every future backup/restore.

This project's Postgres rejects any `UPDATE`/`DELETE` with no `WHERE`
clause at all ("DELETE requires a WHERE clause"). The wipe step in
`restore_from_backup()` originally used bare `delete from public.<table>;`
statements, which failed outright — restore never worked.
`20260705e_fix_restore_where_clause.sql` re-creates the function with
`where true` added to each wipe delete (same behavior — every row —
just an explicit condition instead of an implicit one). Any future table
added to the restore wipe list needs `where true` too, or it'll hit the
same error.

