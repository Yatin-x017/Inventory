import * as XLSX from 'xlsx'

// ── Shared column headers for the import template / parser ──
// Kept as an ordered array so the template generator and the parser agree
// on exact wording (parsing is case/space-insensitive, see normalizeKey).
export const IMPORT_COLUMNS = [
  'Bill Group',
  'Customer Name',
  'Customer Phone',
  'Customer Email',
  'Item SKU',
  'Item Name',
  'Quantity',
  'Unit Price',
  'Discount',
  'Payment Method',
  'Paid Amount',
  'Sale Date',
  'Notes',
]

const EXAMPLE_ROWS = [
  {
    'Bill Group': 'INV-1001',
    'Customer Name': 'Rahul Sharma',
    'Customer Phone': '9876543210',
    'Customer Email': '',
    'Item SKU': 'CBL-USBC-1M',
    'Item Name': 'USB-C Cable 1m',
    Quantity: 2,
    'Unit Price': '',
    Discount: 50,
    'Payment Method': 'cash',
    'Paid Amount': '',
    'Sale Date': '',
    Notes: '',
  },
  {
    'Bill Group': 'INV-1001',
    'Customer Name': 'Rahul Sharma',
    'Customer Phone': '9876543210',
    'Customer Email': '',
    'Item SKU': 'TG-25W',
    'Item Name': '25W Charger',
    Quantity: 1,
    'Unit Price': '',
    Discount: '',
    'Payment Method': '',
    'Paid Amount': '',
    'Sale Date': '',
    Notes: 'Leave Bill Group blank to make every row its own bill',
  },
]

// --- Download template ---

export function downloadBillsImportTemplate() {
  const ws = XLSX.utils.json_to_sheet(EXAMPLE_ROWS, { header: IMPORT_COLUMNS })
  ws['!cols'] = IMPORT_COLUMNS.map((h) => ({ wch: Math.max(14, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bills')
  XLSX.writeFile(wb, 'bills-import-template.xlsx')
}

// --- Export ---

function formatDateForExport(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// One row per bill line item (not per bill) — the natural shape for
// accounting/GST review, and it round-trips cleanly back through the
// importer above since every row already carries its own Bill Group.
export function exportBillsToExcel(bills, filename) {
  const rows = []
  for (const bill of bills) {
    const items = bill.bill_items?.length ? bill.bill_items : [null]
    for (const li of items) {
      rows.push({
        'Invoice Number': bill.invoice_number || '',
        'Bill Date': formatDateForExport(bill.sale_date || bill.created_at),
        'Customer Name': bill.customer_name || '',
        'Customer Phone': bill.customer_phone || '',
        'Customer Email': bill.customer_email || '',
        'Item Name': li?.item_name || '',
        'Item SKU': li?.item_sku || '',
        Quantity: li?.quantity ?? '',
        'Unit Price': li?.unit_price ?? '',
        'Line Total': li ? Number(li.unit_price || 0) * Number(li.quantity || 0) : '',
        Discount: bill.discount || 0,
        'Payment Method': bill.payment_method || '',
        'Bill Total': bill.total ?? '',
        'Paid Amount': bill.paid_amount ?? '',
        'Due Amount': bill.due_amount ?? 0,
        'Email Status': bill.email_status || '',
      })
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0] ?? {}).map((h) => ({ wch: Math.max(12, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bills')
  XLSX.writeFile(wb, filename || `bill-logs-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// Lets a user fix just the rows that failed and re-upload only those,
// instead of re-editing (and re-submitting) the entire original file.
export function exportFailedRows(failedRows) {
  const rows = failedRows.map((f) => ({ ...f.row, Error: f.reason }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Failed rows')
  XLSX.writeFile(wb, `bills-import-errors-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// --- Parse ---

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[\s_]+/g, '')
}

// Builds a lookup so header matching survives minor spelling drift
// ("item sku", "Item_SKU", "itemsku" all resolve the same way) — cashiers
// filling this out by hand won't always match the template exactly.
const KEY_ALIASES = {
  billgroup: 'billGroup',
  customername: 'customerName',
  customerphone: 'customerPhone',
  customerphonenumber: 'customerPhone',
  customeremail: 'customerEmail',
  itemsku: 'itemSku',
  sku: 'itemSku',
  itemname: 'itemName',
  quantity: 'quantity',
  qty: 'quantity',
  unitprice: 'unitPrice',
  price: 'unitPrice',
  discount: 'discount',
  paymentmethod: 'paymentMethod',
  paidamount: 'paidAmount',
  saledate: 'saleDate',
  date: 'saleDate',
  notes: 'notes',
  note: 'notes',
}

function normalizeRow(rawRow) {
  const out = {}
  for (const [key, value] of Object.entries(rawRow)) {
    const normalized = KEY_ALIASES[normalizeKey(key)]
    if (normalized) out[normalized] = value
  }
  return out
}

// Reads the uploaded file into an array of normalized row objects.
// cellDates:true so a real Excel date cell comes through as a JS Date
// instead of the serial-number-since-1900 XLSX otherwise returns.
export async function parseBillsWorkbook(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  return rawRows.map(normalizeRow)
}

const VALID_PAYMENT_METHODS = ['cash', 'upi', 'netbanking', 'emi']

function toDateInputValue(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

// Matches a row's item against the live catalog by SKU first (exact,
// case-insensitive), then by name — mirrors how Billing.jsx's search/
// addToCart resolves items, so an imported row behaves like a cashier
// having picked the same item from the search box.
function matchCatalogItem(row, items) {
  const sku = String(row.itemSku || '').trim().toLowerCase()
  const name = String(row.itemName || '').trim().toLowerCase()
  if (sku) {
    const bySku = items.find((i) => (i.sku || '').trim().toLowerCase() === sku)
    if (bySku) return bySku
  }
  if (name) {
    const byName = items.find((i) => (i.name || '').trim().toLowerCase() === name)
    if (byName) return byName
  }
  return null
}

function bestLocationFor(item) {
  const locs = item.item_locations ?? []
  return locs.reduce((best, l) => (!best || (l.quantity || 0) > (best.quantity || 0) ? l : best), null)
}

function stockFor(item) {
  return (item.item_locations ?? []).reduce((s, l) => s + (l.quantity || 0), 0)
}

// Turns parsed spreadsheet rows into ready-to-submit bill groups (one per
// distinct Bill Group / customer combo) plus a list of row-level errors.
// Only matches against `items` (the legacy/bulk catalog) — serialized
// products need a specific IMEI/unit selected per SCHEMA.md, which can't
// be inferred safely from a spreadsheet row, so those are reported as
// unsupported rather than guessed at.
export function buildBillGroupsFromRows(rows, items) {
  const rowErrors = []
  const groupsByKey = new Map()
  const pendingStockUse = new Map() // item_id -> running qty reserved so far in this import

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // header is row 1 in the spreadsheet
    const customerName = String(row.customerName || '').trim()
    const customerPhone = String(row.customerPhone || '').trim()

    if (!customerName) {
      rowErrors.push({ row, reason: `Row ${rowNumber}: Customer Name is required.` })
      return
    }
    if (!customerPhone) {
      rowErrors.push({ row, reason: `Row ${rowNumber}: Customer Phone is required.` })
      return
    }
    if (!row.itemSku && !row.itemName) {
      rowErrors.push({ row, reason: `Row ${rowNumber}: Item SKU or Item Name is required.` })
      return
    }

    const item = matchCatalogItem(row, items)
    if (!item) {
      rowErrors.push({
        row,
        reason: `Row ${rowNumber}: No catalog item matches SKU/Name "${row.itemSku || row.itemName}". Only standard inventory items can be imported, not serialized/IMEI products.`,
      })
      return
    }

    const location = bestLocationFor(item)
    const availableStock = stockFor(item)
    const quantity = Math.max(1, Math.round(Number(row.quantity) || 1))
    const alreadyReserved = pendingStockUse.get(item.id) || 0

    if (!location || availableStock - alreadyReserved < quantity) {
      rowErrors.push({
        row,
        reason: `Row ${rowNumber}: "${item.name}" doesn't have enough stock (${Math.max(availableStock - alreadyReserved, 0)} available, ${quantity} requested).`,
      })
      return
    }

    const paymentMethodRaw = String(row.paymentMethod || '').trim().toLowerCase()
    const paymentMethod = VALID_PAYMENT_METHODS.includes(paymentMethodRaw) ? paymentMethodRaw : 'cash'
    if (row.paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethodRaw)) {
      rowErrors.push({
        row,
        reason: `Row ${rowNumber}: Payment Method "${row.paymentMethod}" is not one of cash / upi / netbanking / emi — defaulted to cash. Fix and re-import if that's wrong.`,
      })
      // Not a fatal error — sale still proceeds with the 'cash' fallback.
    }

    pendingStockUse.set(item.id, alreadyReserved + quantity)

    const groupKey = String(row.billGroup || '').trim() || `__row_${index}`
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        key: groupKey,
        customerName,
        customerPhone,
        customerEmail: String(row.customerEmail || '').trim(),
        notes: String(row.notes || '').trim(),
        discount: 0,
        paymentMethod,
        paidAmount: null,
        saleDate: toDateInputValue(row.saleDate),
        cartLines: [],
        sourceRows: [],
      })
    }
    const group = groupsByKey.get(groupKey)
    group.cartLines.push({
      item_id: item.id,
      item_name: item.name,
      item_sku: item.sku || '',
      unit_price: row.unitPrice !== '' && row.unitPrice != null ? Number(row.unitPrice) : Number(item.price) || 0,
      quantity,
      location_id: location.locations?.id,
      location_label: location.locations?.label,
    })
    group.sourceRows.push(rowNumber)
    // Discount / Paid Amount / Sale Date are bill-level — take the first
    // non-blank value seen across the group's rows rather than requiring
    // the cashier to repeat them on every line.
    if (row.discount !== '' && row.discount != null && !group.discountSet) {
      group.discount = Number(row.discount) || 0
      group.discountSet = true
    }
    if (row.paidAmount !== '' && row.paidAmount != null && group.paidAmount == null) {
      group.paidAmount = Number(row.paidAmount)
    }
  })

  return { groups: [...groupsByKey.values()], rowErrors }
}
