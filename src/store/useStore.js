import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { sendInvoiceEmail } from '../services/emailService'
import { useCustomerStore } from './useCustomerStore'
import { useRepairStore } from './useRepairStore'

export const useStore = create((set, get) => ({
  items: [],
  locations: [],
  tags: [],
  bills: [],
  billLogs: [],
  products: [],
  inventoryUnits: [],
  loading: false,
  billsLoading: false,
  billLogsLoading: false,

  // Quick-bill modal, triggered from anywhere in the app by the global
  // barcode-scan listener (see useGlobalScanListener / Layout.jsx). The
  // nonce forces CreateBillModal to remount on every new scan so its
  // internal step/selection state always starts fresh.
  quickBillOpen: false,
  quickBillQuery: '',
  quickBillNonce: 0,

  openQuickBill: (query = '') =>
    set((s) => ({ quickBillOpen: true, quickBillQuery: query, quickBillNonce: s.quickBillNonce + 1 })),
  closeQuickBill: () => set({ quickBillOpen: false, quickBillQuery: '' }),

  fetchAll: async () => {
    set({ loading: true })
    const [{ data: items }, { data: locations }, { data: tags }] = await Promise.all([
      supabase
        .from('items')
        .select('*, item_locations(quantity, locations(*)), item_tags(tags(*))')
        .order('name'),
      supabase.from('locations').select('*').order('label'),
      supabase.from('tags').select('*').order('name'),
    ])
    set({ items: items ?? [], locations: locations ?? [], tags: tags ?? [], loading: false })
    // Serialized catalog (products/IMEI) loads alongside but doesn't block
    // the legacy items table from rendering.
    get().fetchSerializedCatalog()
  },

  // --- Serialized catalog (products + per-unit IMEI/serial) ---

  fetchSerializedCatalog: async () => {
    const [{ data: products, error: productsError }, { data: units, error: unitsError }] = await Promise.all([
      supabase.from('products').select('*').order('brand'),
      supabase
        .from('inventory_units')
        .select('*, device_identifiers(identifier_value, identifier_type), locations(id, label, type)')
        .order('created_at', { ascending: false }),
    ])
    if (productsError) throw productsError
    if (unitsError) throw unitsError
    set({ products: products ?? [], inventoryUnits: units ?? [] })
  },

  deleteProduct: async (productId) => {
    const { error } = await supabase.from('products').delete().eq('id', productId)
    if (error) {
      // 23503 = foreign_key_violation, from a sold unit's bill_items row
      // still pointing at this product. 20260703b_fix_product_delete_and_
      // imei_search.sql makes bill_items.product_id/unit_id ON DELETE SET
      // NULL so this shouldn't fire — kept as a friendly fallback in case
      // that migration hasn't been run on this Supabase project yet.
      if (error.code === '23503') {
        throw new Error('This product has past sales on record. Run the latest Supabase migration to allow deleting it anyway.')
      }
      throw error
    }
    await get().fetchSerializedCatalog()
  },

  deleteInventoryUnit: async (unitId) => {
    const { error } = await supabase.from('inventory_units').delete().eq('id', unitId)
    if (error) {
      if (error.code === '23503') {
        throw new Error('This unit has past sales on record. Run the latest Supabase migration to allow deleting it anyway.')
      }
      throw error
    }
    await get().fetchSerializedCatalog()
  },

  // "Edit details" on an IMEI/serial-tracked unit from Manage Inventory.
  // Identifiers are edited by delete-then-reinsert per identifier_type
  // (there's no unique constraint on (unit_id, identifier_type) to safely
  // upsert against) — same duplicate-IMEI handling as createSerializedProduct.
  updateInventoryUnitDetails: async (unitId, {
    purchasePrice, locationId, warrantyStartDate, warrantyEndDate,
    imei1, imei2, serial, barcode,
  }) => {
    const { error } = await supabase
      .from('inventory_units')
      .update({
        purchase_price: purchasePrice === '' || purchasePrice == null ? null : Number(purchasePrice),
        location_id: locationId || null,
        warranty_start_date: warrantyStartDate || null,
        warranty_end_date: warrantyEndDate || null,
      })
      .eq('id', unitId)
    if (error) throw error

    const unit = get().inventoryUnits.find((u) => u.id === unitId)
    const identifierMap = {
      IMEI_1: imei1,
      IMEI_2: imei2,
      SERIAL_NUMBER: serial,
      BARCODE: barcode,
    }
    for (const [type, rawValue] of Object.entries(identifierMap)) {
      const value = rawValue?.trim() || null
      await supabase.from('device_identifiers').delete().eq('unit_id', unitId).eq('identifier_type', type)
      if (value) {
        const { error: idError } = await supabase.from('device_identifiers').insert({
          unit_id: unitId,
          product_id: unit?.product_id,
          identifier_type: type,
          identifier_value: value,
        })
        if (idError) {
          if (idError.code === '23505') {
            const dupValue = idError.details?.match(/identifier_value\)=\(([^)]*)\)/)?.[1]
            throw new Error(
              dupValue
                ? `IMEI/serial "${dupValue}" is already in inventory.`
                : 'Duplicate IMEI/serial — one of these values already exists in inventory.'
            )
          }
          throw idError
        }
      }
    }
    await get().fetchSerializedCatalog()
  },


  // Unified search across the legacy items table and serialized products
  // that still have in-stock units. Returns a flat list the bill modal can
  // render without caring which table a result came from.
  searchCatalog: (query) => {
    const { items, products, inventoryUnits } = get()
    const q = query.trim().toLowerCase()
    if (!q) return []

    const legacyResults = items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          item.brand?.toLowerCase().includes(q)
      )
      .map((item) => ({ kind: 'legacy', item }))

    const serializedResults = products
      .map((product) => {
        const units = inventoryUnits.filter((u) => u.product_id === product.id && u.status === 'in_stock')
        const label = `${product.brand} ${product.model} ${product.color || ''}`.trim()
        const matchesText =
          label.toLowerCase().includes(q) ||
          product.sku?.toLowerCase().includes(q) ||
          product.brand?.toLowerCase().includes(q)
        const matchesImei = units.some((u) =>
          u.device_identifiers?.some((d) => d.identifier_value.toLowerCase().includes(q))
        )
        if (!matchesText && !matchesImei) return null
        return { kind: 'serialized', product, units }
      })
      .filter(Boolean)

    return [...serializedResults, ...legacyResults].slice(0, 20)
  },

  searchItems: (query, tagFilter) => {
    const items = get().items
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q)
      const matchesTag =
        !tagFilter || item.item_tags?.some((it) => it.tags?.id === tagFilter)
      return matchesQuery && matchesTag
    })
  },

  addItem: async (item) => {
    const { data, error } = await supabase.from('items').insert(item).select().single()
    if (error) throw error
    await get().fetchAll()
    return data
  },

  // One-shot creation: item + its first location + its tags, resolving
  // existing locations/tags by name so duplicates aren't created.
  createItemWithDetails: async ({ name, sku, brand, price, hsnCode, gstRate, image_url, locationType, locationLabel, quantity, tagNames }) => {
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        name,
        sku: sku || null,
        brand: brand || null,
        price: Number(price) || 0,
        hsn_code: hsnCode?.trim() || '85171300',
        gst_rate: gstRate === '' || gstRate == null ? 18 : Number(gstRate),
        image_url: image_url || null,
      })
      .select()
      .single()
    if (itemError) throw itemError

    if (locationLabel?.trim()) {
      const existing = get().locations.find(
        (l) => l.type === locationType && l.label.toLowerCase() === locationLabel.trim().toLowerCase()
      )
      let locationId = existing?.id
      if (!locationId) {
        const { data: newLoc, error: locError } = await supabase
          .from('locations')
          .insert({ type: locationType, label: locationLabel.trim() })
          .select()
          .single()
        if (locError) throw locError
        locationId = newLoc.id
      }
      const { error: linkError } = await supabase
        .from('item_locations')
        .upsert({ item_id: item.id, location_id: locationId, quantity: quantity || 1 })
      if (linkError) throw linkError
    }

    const cleanTags = [...new Set((tagNames || []).map((t) => t.trim()).filter(Boolean))]
    for (const tagName of cleanTags) {
      const existingTag = get().tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
      let tagId = existingTag?.id
      if (!tagId) {
        const { data: newTag, error: tagError } = await supabase
          .from('tags')
          .insert({ name: tagName })
          .select()
          .single()
        if (tagError) throw tagError
        tagId = newTag.id
      }
      await supabase.from('item_tags').insert({ item_id: item.id, tag_id: tagId })
    }

    await get().fetchAll()
    return item
  },

  // Creates a serialized product (phone/headphone/TWS) plus one
  // inventory_unit + its device_identifiers per physical unit scanned in.
  // locationLabel/locationType are optional and apply to every unit created.
  // Runs as ONE Postgres transaction via the create_serialized_product
  // RPC (see supabase/migrations/20260705g_fix_create_serialized_
  // product_duplicate_sku.sql). Previously this always inserted a brand
  // new `products` row, so restocking a model you already had (same
  // brand/model/color/specs/SKU) collided with `products_sku_key`. The
  // RPC now matches against the LIVE table and reuses the existing
  // product if that variant already exists — same pattern already used
  // by bulkAddSerializedUnits — so no duplicate product row, no SKU
  // collision, and units always attach to a product id that really
  // exists in this same transaction.
  createSerializedProduct: async ({
    category, brand, model, color, sku, price, costPrice, warrantyMonths,
    specs, config, hsnCode, gstRate, imageUrl, locationType, locationLabel, units,
  }) => {
    const payload = {
      category,
      brand: brand.trim(),
      model: model.trim(),
      color: color?.trim() || null,
      sku: sku?.trim() || null,
      price: Number(price) || 0,
      cost_price: costPrice === '' || costPrice == null ? null : Number(costPrice),
      warranty_months: warrantyMonths === '' || warrantyMonths == null ? null : Number(warrantyMonths),
      specs: specs || {},
      config: config || {},
      hsn_code: hsnCode?.trim() || '85171300',
      gst_rate: gstRate === '' || gstRate == null ? 18 : Number(gstRate),
      image_url: imageUrl?.trim() || null,
      location_type: locationType,
      location_label: locationLabel?.trim() || null,
      units: units.map((u) => ({
        imei1: u.imei1?.trim() || null,
        imei2: u.imei2?.trim() || null,
        serial: u.serial?.trim() || null,
        barcode: u.barcode?.trim() || null,
      })),
    }

    const { data, error } = await supabase.rpc('create_serialized_product', { payload })
    if (error) throw new Error(error.message)

    await get().fetchSerializedCatalog()
    return data
  },

  // Bulk creation: one shared "base" model (category/brand/model/pricing/
  // warranty/etc) fanned out across many rows, where each row only carries
  // what actually changes per unit — color, config (ram/storage), and its
  // IMEI/serial/barcode. Rows are grouped by (color, ram, storage); each
  // distinct variant reuses an existing product if brand+model+category+
  // color+specs already match one in the catalog, otherwise a new product
  // is created — then every unit in that group is attached to it. Lets a
  // shop reload a whole carton of one model (mixed colors/storage configs)
  // in a single pass instead of repeating the full product form per variant.
  // Runs the whole batch as ONE Postgres transaction via the
  // bulk_add_serialized_units RPC (see
  // supabase/migrations/20260704_bulk_add_serialized_units_rpc.sql).
  // Previously this matched/created each variant's `products` row and
  // then inserted its `inventory_units` rows as several separate client
  // calls, matching against the browser's in-memory product cache. Any
  // staleness there (a product deleted elsewhere, a retried submit,
  // etc.) could make the browser insert a unit against a product id that
  // no longer existed, which Postgres rejects with
  // `inventory_units_product_id_fkey`. Doing it server-side in one
  // transaction means every variant is matched against the live table at
  // insert time and every unit it creates is guaranteed to reference a
  // product row that really exists — the batch either fully commits or
  // fully rolls back.
  bulkAddSerializedUnits: async ({
    category, brand, model, sku, price, costPrice, warrantyMonths,
    hsnCode, gstRate, imageUrl, locationType, locationLabel, rows,
  }) => {
    const brandT = brand.trim()
    const modelT = model.trim()

    const cleanRows = rows.filter(
      (r) => r.imei1?.trim() || r.imei2?.trim() || r.serial?.trim() || r.barcode?.trim()
    )
    if (cleanRows.length === 0) throw new Error('Scan at least one unit.')

    const requiresImei = category === 'phone'
    if (requiresImei && cleanRows.some((r) => !r.imei1?.trim())) {
      throw new Error('IMEI 1 is required for every unit.')
    }

    // Group rows by variant (color + ram + storage) so each distinct
    // combo becomes (or reuses) exactly one `products` row. Each variant
    // carries its own selling price — taken from the first row in that
    // group with a price filled in, falling back to the shared batch
    // price if every row in the group left it blank.
    const groups = new Map()
    for (const row of cleanRows) {
      const color = row.color?.trim() || ''
      const ram = row.ram?.trim() || ''
      const storage = row.storage?.trim() || ''
      const key = [color.toLowerCase(), ram.toLowerCase(), storage.toLowerCase()].join('|')
      if (!groups.has(key)) groups.set(key, { color, ram, storage, price: '', rows: [] })
      const group = groups.get(key)
      group.rows.push(row)
      if (!group.price && row.price != null && String(row.price).trim() !== '') {
        group.price = row.price
      }
    }

    const payload = {
      category,
      brand: brandT,
      model: modelT,
      sku: sku?.trim() || null,
      price: price === '' || price == null ? 0 : Number(price),
      cost_price: costPrice === '' || costPrice == null ? null : Number(costPrice),
      warranty_months: warrantyMonths === '' || warrantyMonths == null ? null : Number(warrantyMonths),
      hsn_code: hsnCode?.trim() || '85171300',
      gst_rate: gstRate === '' || gstRate == null ? 18 : Number(gstRate),
      image_url: imageUrl?.trim() || null,
      location_type: locationType,
      location_label: locationLabel?.trim() || null,
      variants: [...groups.values()].map((group) => ({
        color: group.color || null,
        ram: group.ram || null,
        storage: group.storage || null,
        price: group.price === '' || group.price == null ? null : Number(group.price),
        units: group.rows.map((row) => ({
          imei1: row.imei1?.trim() || null,
          imei2: row.imei2?.trim() || null,
          serial: row.serial?.trim() || null,
          barcode: row.barcode?.trim() || null,
        })),
      })),
    }

    const { data, error } = await supabase.rpc('bulk_add_serialized_units', { payload })
    if (error) {
      if (error.code === '23505' || /duplicate imei\/serial/i.test(error.message || '')) {
        throw new Error('Duplicate IMEI/serial — one of these values already exists in inventory.')
      }
      throw error
    }

    await get().fetchSerializedCatalog()
    return { ...data, variantCount: groups.size, unitsAdded: data?.unitsAdded ?? cleanRows.length }
  },

  addLocationToItem: async (itemId, locationType, locationLabel, quantity) => {
    const existing = get().locations.find(
      (l) => l.type === locationType && l.label.toLowerCase() === locationLabel.trim().toLowerCase()
    )
    let locationId = existing?.id
    if (!locationId) {
      const { data: newLoc, error: locError } = await supabase
        .from('locations')
        .insert({ type: locationType, label: locationLabel.trim() })
        .select()
        .single()
      if (locError) throw locError
      locationId = newLoc.id
    }
    const { error } = await supabase
      .from('item_locations')
      .upsert({ item_id: itemId, location_id: locationId, quantity: quantity || 1 })
    if (error) throw error
    await get().fetchAll()
  },

  updateItem: async (id, updates) => {
    const { error } = await supabase.from('items').update(updates).eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  deleteItem: async (id) => {
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) {
      // 23503 = foreign_key_violation. Happens when the item has past
      // bill_items referencing it. Once the accompanying migration
      // (20260703_allow_item_delete_with_bill_history.sql) is applied this
      // won't fire anymore — bill_items.item_id becomes ON DELETE SET NULL
      // since bills already keep their own copy of the item name/sku/price.
      // Kept as a friendly fallback in case that migration hasn't run yet.
      if (error.code === '23503') {
        throw new Error('This item has past sales on record. Run the latest Supabase migration to allow deleting it anyway.')
      }
      throw error
    }
    await get().fetchAll()
  },

  setItemLocation: async (itemId, locationId, quantity) => {
    const { error } = await supabase
      .from('item_locations')
      .upsert({ item_id: itemId, location_id: locationId, quantity })
    if (error) throw error
    await get().fetchAll()
  },

  removeItemLocation: async (itemId, locationId) => {
    const { error } = await supabase
      .from('item_locations')
      .delete()
      .eq('item_id', itemId)
      .eq('location_id', locationId)
    if (error) throw error
    await get().fetchAll()
  },

  addTagToItem: async (itemId, tagName) => {
    const clean = tagName.trim()
    if (!clean) return
    const existingTag = get().tags.find((t) => t.name.toLowerCase() === clean.toLowerCase())
    let tagId = existingTag?.id
    if (!tagId) {
      const { data: newTag, error: tagError } = await supabase
        .from('tags')
        .insert({ name: clean })
        .select()
        .single()
      if (tagError) throw tagError
      tagId = newTag.id
    }
    const { error } = await supabase.from('item_tags').upsert({ item_id: itemId, tag_id: tagId })
    if (error) throw error
    await get().fetchAll()
  },

  removeTagFromItem: async (itemId, tagId) => {
    const { error } = await supabase
      .from('item_tags')
      .delete()
      .eq('item_id', itemId)
      .eq('tag_id', tagId)
    if (error) throw error
    await get().fetchAll()
  },

  addLocation: async (location) => {
    const { error } = await supabase.from('locations').insert(location)
    if (error) throw error
    await get().fetchAll()
  },

  addTag: async (name) => {
    const { error } = await supabase.from('tags').insert({ name })
    if (error) throw error
    await get().fetchAll()
  },

  // --- Billing ---

  fetchBills: async () => {
    set({ billsLoading: true })
    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      set({ billsLoading: false })
      throw error
    }
    set({ bills: data ?? [], billsLoading: false })
  },

  // Full history for the Bill Logs page — every non-voided bill from the
  // past year, not just the last 50 shown on the Billing page's "Recent
  // Sales" list. Voiding doesn't delete the row (see void_bill in
  // SCHEMA.md), so voided bills are filtered out client-side the same way
  // Billing.jsx does (`status === 'void' || voided`) since which of those
  // two columns is actually in use isn't tracked in this repo.
  fetchBillLogs: async () => {
    set({ billLogsLoading: true })
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .gte('created_at', oneYearAgo.toISOString())
      .order('created_at', { ascending: false })
    if (error) {
      set({ billLogsLoading: false })
      throw error
    }
    const nonVoid = (data ?? []).filter((b) => !(b.status === 'void' || b.voided))
    set({ billLogs: nonVoid, billLogsLoading: false })
  },

  // cartLines: [{ item_id, item_name, item_sku, unit_price, quantity, location_id, location_label }]
  // discount: flat rupee amount taken off the subtotal.
  // paymentMethod: one of 'cash' | 'upi' | 'netbanking' | 'emi'.
  // emiCompany: free-text financing company name, only meaningful (and
  // only written) when paymentMethod === 'emi'.
  // paidAmount: how much the customer actually handed over now. Defaults to
  // the full total (i.e. fully paid) when omitted. Anything less is treated
  // as a pay-later/EMI balance and gets written to the customer udhar ledger.
  completeSale: async ({ customerName, customerEmail, customerPhone, notes, cartLines, discount = 0, paymentMethod, emiCompany, paidAmount, saleDate }) => {
    if (!customerName?.trim()) throw new Error('Customer name is required.')
    if (!customerPhone?.trim()) throw new Error('Customer phone number is required.')
    if (!paymentMethod) throw new Error('Payment method is required.')

    const { data, error } = await supabase.rpc('complete_sale', {
      p_customer_name: customerName || '',
      p_customer_email: customerEmail || '',
      p_customer_phone: customerPhone || '',
      p_notes: notes || '',
      p_items: cartLines,
    })
    if (error) throw error
    const billId = data

    const subtotal = cartLines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
    const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), subtotal)
    const total = subtotal - safeDiscount
    const safePaidAmount = Math.min(Math.max(Number(paidAmount ?? total) || 0, 0), total)
    const dueAmount = Math.max(total - safePaidAmount, 0)

    const { data: billRow, error: updateError } = await supabase
      .from('bills')
      .update({
        discount: safeDiscount,
        payment_method: paymentMethod,
        emi_company: paymentMethod === 'emi' ? (emiCompany?.trim() || null) : null,
        total,
        paid_amount: safePaidAmount,
        ...(saleDate ? { sale_date: saleDate } : {}),
      })
      .eq('id', billId)
      .select('invoice_number, created_at, sale_date')
      .single()
    if (updateError) throw updateError

    // Snapshot each line's HSN code / GST rate onto its bill_items row so
    // the printed invoice — now and on reprint later — reflects the rate
    // that applied at sale time, even if the item's HSN/GST or the item
    // itself changes/gets deleted afterwards. Best-effort: a failure here
    // shouldn't block the sale that's already been recorded.
    const catalogItems = get().items
    const linesWithTax = cartLines.map((line) => {
      const catalogItem = catalogItems.find((i) => i.id === line.item_id)
      return {
        ...line,
        hsn_code: catalogItem?.hsn_code ?? '85171300',
        gst_rate: catalogItem?.gst_rate ?? 18,
      }
    })
    try {
      await Promise.all(
        linesWithTax.map((line) =>
          line.item_id
            ? supabase
                .from('bill_items')
                .update({ hsn_code: line.hsn_code, gst_rate: line.gst_rate })
                .eq('bill_id', billId)
                .eq('item_id', line.item_id)
            : Promise.resolve()
        )
      )
    } catch (err) {
      console.error('Failed to snapshot HSN/GST onto bill_items:', err)
    }

    if (dueAmount > 0) {
      await get().recordPayLaterDue({
        billId,
        customerName,
        customerPhone,
        amount: dueAmount,
        invoiceNumber: billRow?.invoice_number,
      })
    }

    if (customerEmail) {
      await get().sendBillEmail({
        billId,
        invoiceNumber: billRow?.invoice_number,
        customerName,
        customerEmail,
        items: cartLines,
        total,
        date: new Date().toLocaleDateString('en-IN'),
      })
    }

    await Promise.all([get().fetchAll(), get().fetchBills()])
    return {
      id: billId,
      invoiceNumber: billRow?.invoice_number,
      createdAt: billRow?.created_at,
      saleDate: billRow?.sale_date,
      subtotal,
      discount: safeDiscount,
      paymentMethod,
      emiCompany: paymentMethod === 'emi' ? (emiCompany?.trim() || null) : null,
      total,
      paidAmount: safePaidAmount,
      dueAmount,
      lines: linesWithTax,
    }
  },

  // Finds (by phone) or creates a `customers` row, then writes a udhar
  // (credit) transaction for the given pay-later balance. Used by
  // completeSale / completeSerializedSale whenever a checkout is left with
  // a due amount. Non-fatal by design — the bill itself already keeps
  // paid_amount/due_amount and the customer's name/phone, so a failure
  // here (e.g. a transient RLS/network hiccup) doesn't lose money data;
  // it just means the ledger entry needs to be added manually later.
  recordPayLaterDue: async ({ billId, customerName, customerPhone, amount, invoiceNumber }) => {
    const phone = customerPhone?.trim()
    if (!phone || !(amount > 0)) return
    try {
      // Only ever matches/creates within the 'billing' pool — a phone
      // match against someone's manually-managed udhar account (added via
      // the Customers page) must never silently attach a POS sale to it.
      const { data: existing, error: findError } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phone)
        .eq('source', 'billing')
        .maybeSingle()
      if (findError) throw findError

      let customerId = existing?.id
      if (!customerId) {
        const { data: created, error: createError } = await supabase
          .from('customers')
          .insert({ name: customerName?.trim() || 'Customer', phone, source: 'billing' })
          .select('id')
          .single()
        if (createError) throw createError
        customerId = created.id
      }

      const { error: txError } = await supabase.from('customer_transactions').insert({
        customer_id: customerId,
        bill_id: billId ?? null,
        type: 'udhar',
        amount,
        description: invoiceNumber
          ? `Pay later balance — Invoice ${invoiceNumber}`
          : 'Pay later balance',
      })
      if (txError) throw txError
    } catch (err) {
      console.error('Failed to record pay-later udhar entry:', err)
    }
  },

  // Sells one specific IMEI/serial unit. Kept separate from completeSale
  // (legacy items path) since it hits a different RPC and stock table.
  completeSerializedSale: async ({
    customerName,
    customerEmail,
    customerPhone,
    notes,
    unitId,
    unitPrice,
    discount = 0,
    paymentMethod,
    emiCompany,
    paidAmount,
    saleDate,
  }) => {
    if (!customerName?.trim()) throw new Error('Customer name is required.')
    if (!customerPhone?.trim()) throw new Error('Customer phone number is required.')
    if (!paymentMethod) throw new Error('Payment method is required.')

    const { data: billId, error } = await supabase.rpc('complete_serialized_sale', {
      p_customer_name: customerName || '',
      p_customer_email: customerEmail || '',
      p_customer_phone: customerPhone || '',
      p_notes: notes || '',
      p_unit_id: unitId,
      p_unit_price: unitPrice,
    })
    if (error) throw error

    const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), unitPrice)
    const total = unitPrice - safeDiscount
    const safePaidAmount = Math.min(Math.max(Number(paidAmount ?? total) || 0, 0), total)
    const dueAmount = Math.max(total - safePaidAmount, 0)

    const { data: billRow, error: updateError } = await supabase
      .from('bills')
      .update({
        discount: safeDiscount,
        payment_method: paymentMethod,
        emi_company: paymentMethod === 'emi' ? (emiCompany?.trim() || null) : null,
        total,
        paid_amount: safePaidAmount,
        ...(saleDate ? { sale_date: saleDate } : {}),
      })
      .eq('id', billId)
      .select('invoice_number, created_at, sale_date')
      .single()
    if (updateError) throw updateError

    // Snapshot HSN/GST/config (RAM, storage, color) onto the bill_items
    // row for this unit, same reasoning as the legacy path above — the
    // printed invoice should reflect what applied at sale time.
    const unit = get().inventoryUnits.find((u) => u.id === unitId)
    const product = unit ? get().products.find((p) => p.id === unit.product_id) : null
    const config = product
      ? { ...(product.specs || {}), color: product.color || undefined }
      : {}
    const hsnCode = product?.hsn_code ?? '85171300'
    const gstRate = product?.gst_rate ?? 18
    try {
      await supabase
        .from('bill_items')
        .update({ hsn_code: hsnCode, gst_rate: gstRate, config })
        .eq('bill_id', billId)
        .eq('unit_id', unitId)
    } catch (err) {
      console.error('Failed to snapshot HSN/GST/config onto bill_items:', err)
    }

    if (dueAmount > 0) {
      await get().recordPayLaterDue({
        billId,
        customerName,
        customerPhone,
        amount: dueAmount,
        invoiceNumber: billRow?.invoice_number,
      })
    }

    if (customerEmail) {
      await get().sendBillEmail({
        billId,
        invoiceNumber: billRow?.invoice_number,
        customerName,
        customerEmail,
        items: [{ item_name: 'Item', unit_price: unitPrice, quantity: 1 }],
        total,
        date: new Date().toLocaleDateString('en-IN'),
      })
    }

    await get().fetchSerializedCatalog()
    await get().fetchBills()
    return {
      id: billId,
      invoiceNumber: billRow?.invoice_number,
      createdAt: billRow?.created_at,
      saleDate: billRow?.sale_date,
      subtotal: unitPrice,
      discount: safeDiscount,
      paymentMethod,
      emiCompany: paymentMethod === 'emi' ? (emiCompany?.trim() || null) : null,
      total,
      paidAmount: safePaidAmount,
      dueAmount,
      hsnCode,
      gstRate,
      config,
    }
  },

  sendBillEmail: async ({ billId, invoiceNumber, customerName, customerEmail, items, total, date }) => {
    await supabase.from('bills').update({ email_status: 'pending' }).eq('id', billId)
    if (!invoiceNumber) {
      const { data: billRow } = await supabase
        .from('bills')
        .select('invoice_number')
        .eq('id', billId)
        .single()
      invoiceNumber = billRow?.invoice_number || `DRT/${billId.slice(0, 8).toUpperCase()}`
    }
    try {
      await sendInvoiceEmail({
        customerName: customerName || 'Customer',
        customerEmail,
        invoiceNumber,
        items,
        total,
        date,
      })
      await supabase.from('bills').update({ email_status: 'sent' }).eq('id', billId)
    } catch (err) {
      await supabase.from('bills').update({ email_status: 'failed' }).eq('id', billId)
    }
  },

  resendBillEmail: async (bill) => {
    const items = bill.bill_items ?? []
    const total = items.reduce((s, li) => s + (li.unit_price || 0) * (li.quantity || 0), 0)
    await get().sendBillEmail({
      billId: bill.id,
      invoiceNumber: bill.invoice_number,
      customerName: bill.customer_name,
      customerEmail: bill.customer_email,
      items,
      total,
      date: new Date(bill.created_at).toLocaleDateString('en-IN'),
    })
    await get().fetchBills()
  },

  voidBill: async (billId) => {
    const { error } = await supabase.rpc('void_bill', { p_bill_id: billId })
    if (error) throw error
    // No-op if the bill had no serialized lines.
    const { error: restockError } = await supabase.rpc('restock_units_for_bill', { p_bill_id: billId })
    if (restockError) throw restockError
    await Promise.all([
      get().fetchBills(),
      get().fetchSerializedCatalog(),
      useCustomerStore.getState().fetchCustomers(),
    ])
  },

  // Permanently removes a bill (unlike voidBill, which keeps the row and
  // just reverses stock) — for cleaning up dummy/test bills from Bill
  // Logs. Does NOT restore stock/inventory, since a bill worth hard-
  // deleting was never a real sale to begin with; void first if the stock
  // impact of a real sale needs undoing, then delete the voided row after.
  deleteBill: async (billId) => {
    // Best-effort: a bill's pay-later balance may have written a
    // customer_transactions udhar row (see recordPayLaterDue) — clean it
    // up too so a deleted dummy bill doesn't leave a phantom due amount
    // behind on the Pay Later Customers page. Never blocks the delete
    // itself if this fails (e.g. RLS/network hiccup).
    try {
      await supabase.from('customer_transactions').delete().eq('bill_id', billId)
    } catch (err) {
      console.error('Failed to clean up customer_transactions for deleted bill:', err)
    }

    const { error: itemsError } = await supabase.from('bill_items').delete().eq('bill_id', billId)
    if (itemsError) throw itemsError

    const { error } = await supabase.from('bills').delete().eq('id', billId)
    if (error) throw error

    set((s) => ({
      billLogs: s.billLogs.filter((b) => b.id !== billId),
      bills: s.bills.filter((b) => b.id !== billId),
    }))
    useCustomerStore.getState().fetchCustomers()
  },

  // --- Backup / restore ---
  // Snapshots live as JSON files in the private `backups` storage bucket,
  // written by the `backup-export` edge function (weekly via pg_cron, or
  // on demand from the Backups page). Listing/downloading them uses the
  // signed-in user's own session directly against Storage (RLS restricts
  // this to owner/builder — see 20260705_backup_system.sql); only the
  // write path (upload/prune) goes through the edge function, since it
  // needs the service role key to read every table regardless of RLS.

  backups: [],
  backupsLoading: false,

  fetchBackupsList: async () => {
    set({ backupsLoading: true })
    const { data, error } = await supabase.storage.from('backups').list('weekly', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    set({ backupsLoading: false })
    if (error) throw error
    set({ backups: data ?? [] })
  },

  triggerBackupNow: async () => {
    const { data, error } = await supabase.functions.invoke('backup-export')
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    await get().fetchBackupsList()
    return data
  },

  downloadBackup: async (path) => {
    const { data, error } = await supabase.storage.from('backups').download(`weekly/${path}`)
    if (error) throw error
    return data // Blob — caller triggers the browser save.
  },

  deleteBackup: async (path) => {
    const { error } = await supabase.storage.from('backups').remove([`weekly/${path}`])
    if (error) throw error
    await get().fetchBackupsList()
  },

  // Owner-only, atomic (single Postgres transaction) restore — see
  // restore_from_backup() in 20260705_backup_system.sql. Wipes every
  // table this app owns and reloads it from the given backup JSON.
  restoreFromBackup: async (backupJson) => {
    const { data, error } = await supabase.rpc('restore_from_backup', { payload: backupJson })
    if (error) throw error
    await Promise.all([
      get().fetchAll(),
      get().fetchBills(),
      useCustomerStore.getState().fetchCustomers(),
      useRepairStore.getState().fetchRepairs(),
    ])
    return data
  },
}))
