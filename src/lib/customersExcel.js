import * as XLSX from 'xlsx'

// ── Export ──
// One row per retailer, using whatever columns are currently meaningful
// (ledger balance, totals, assignment) rather than a fixed import shape —
// this file is meant to be read by a human in Excel, not re-imported as-is.

function formatDateForExport(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function exportCustomersToExcel(customers, filename) {
  const rows = customers.map((c) => ({
    Name: c.name || '',
    Phone: c.phone || '',
    Address: c.address || '',
    'Assigned To': c.assigned_profile?.full_name || '',
    Balance: c.balance ?? 0,
    'Total Udhar': c.total_udhar ?? 0,
    'Total Payment': c.total_payment ?? 0,
    'Last Activity': formatDateForExport(c.last_transaction_date),
    Notes: c.notes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0] ?? { Name: '' }).map((h) => ({ wch: Math.max(12, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Retailers')
  XLSX.writeFile(wb, filename || `retailers-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function exportFailedCustomerRows(failedRows) {
  const rows = failedRows.map((f) => ({ ...f.row, Error: f.reason }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Failed rows')
  XLSX.writeFile(wb, `retailers-import-errors-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Import — no fixed template ──
// Rather than requiring a specific template, headers are matched loosely
// against a wide set of common aliases so any reasonably-labelled sheet
// (a phone's contacts export, another shop's spreadsheet, etc.) works.

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[\s_.\-]+/g, '')
}

const KEY_ALIASES = {
  name: 'name',
  fullname: 'name',
  customername: 'name',
  customer: 'name',
  retailername: 'name',
  retailer: 'name',
  retailershopname: 'name',
  shopname: 'name',
  clientname: 'name',
  partyname: 'name',
  party: 'name',

  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  mobilenumber: 'phone',
  contact: 'phone',
  contactnumber: 'phone',
  contactno: 'phone',
  number: 'phone',
  whatsapp: 'phone',
  whatsappnumber: 'phone',

  address: 'address',
  location: 'address',
  shopaddress: 'address',

  notes: 'notes',
  note: 'notes',
  remark: 'notes',
  remarks: 'notes',
  comment: 'notes',
  comments: 'notes',
  description: 'notes',

  assignedto: 'assignedTo',
  assigned: 'assignedTo',
  marketingmember: 'assignedTo',
  member: 'assignedTo',
  salesman: 'assignedTo',
  handler: 'assignedTo',
  agent: 'assignedTo',

  balance: 'balance',
  openingbalance: 'balance',
}

function normalizeRow(rawRow) {
  const out = {}
  for (const [key, value] of Object.entries(rawRow)) {
    const normalized = KEY_ALIASES[normalizeKey(key)]
    if (!normalized) continue
    // First recognized column wins if a sheet happens to have two
    // headers that alias to the same field.
    if (out[normalized] === undefined || out[normalized] === '') out[normalized] = value
  }
  return out
}

// Reads any .xlsx/.xls/.csv file into an array of normalized row objects.
// Unrecognized columns are simply dropped rather than rejecting the file —
// there's no template the sheet has to conform to.
export async function parseCustomersWorkbook(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  return rawRows.map(normalizeRow)
}

// Turns parsed rows into ready-to-submit retailer records, skipping rows
// that are missing a name or that duplicate a phone number already on
// file (or duplicated earlier in the same sheet).
export function buildCustomersFromRows(rows, { existingCustomers = [], marketingMembers = [] } = {}) {
  const rowErrors = []
  const toCreate = []
  const seenPhones = new Set(
    existingCustomers.map((c) => (c.phone || '').trim().toLowerCase()).filter(Boolean)
  )

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // header is row 1
    const name = String(row.name || '').trim()
    const phone = String(row.phone || '').trim()
    const address = String(row.address || '').trim()
    const notes = String(row.notes || '').trim()

    if (!name) {
      rowErrors.push({ row, reason: `Row ${rowNumber}: a name/customer name column is required.` })
      return
    }

    const phoneKey = phone.toLowerCase()
    if (phoneKey && seenPhones.has(phoneKey)) {
      rowErrors.push({ row, reason: `Row ${rowNumber}: "${name}" (${phone}) already exists — skipped.` })
      return
    }
    if (phoneKey) seenPhones.add(phoneKey)

    let assignedTo = null
    const assignedName = String(row.assignedTo || '').trim().toLowerCase()
    if (assignedName) {
      const match = marketingMembers.find((m) => m.full_name?.trim().toLowerCase() === assignedName)
      if (match) assignedTo = match.id
      // No match is not a fatal error — the retailer is just imported unassigned.
    }

    toCreate.push({ name, phone, address, notes, assignedTo, rowNumber })
  })

  return { toCreate, rowErrors }
}
