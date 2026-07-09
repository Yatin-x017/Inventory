import * as XLSX from 'xlsx'

// Column-name candidates we auto-detect to populate the normalized
// txn_date / amount / reference_no / description fields, regardless of
// which supplier's template a file uses. Everything (matched or not)
// still gets kept verbatim in `raw` + `columns` for exact export.
const DATE_KEYS = ['Order Date', 'Transaction Date', 'Txn Date', 'Date']
const AMOUNT_KEYS = ['Transfer Amount', 'Order Amount', 'Amount', 'Total']
const REFERENCE_KEYS = ['Order ID', 'RPOS Ref No', 'ESTEL Ref', 'Reference', 'Reference No', 'Ref No']
const DESCRIPTION_KEYS = ['Partner Name', 'Description', 'Note', 'Notes', 'Remarks']

function normalizeKey(key) {
  return key.trim().replace(/\s+/g, ' ').toLowerCase()
}

function findValue(row, candidates) {
  // Map normalized header -> original key, so lookups tolerate whitespace
  // variants (e.g. this JIO template's "Partner  Name" double space)
  // while candidate priority order (e.g. Transfer Amount before Order
  // Amount) is still respected.
  const normalizedRowKeys = new Map(Object.keys(row).map((k) => [normalizeKey(k), k]))
  for (const candidate of candidates) {
    const rowKey = normalizedRowKeys.get(normalizeKey(candidate))
    if (rowKey !== undefined && row[rowKey] !== undefined && row[rowKey] !== '') {
      return { key: rowKey, value: row[rowKey] }
    }
  }
  return { key: null, value: undefined }
}

// Parses "DD.MM.YYYY" (JIO template) as well as normal Date-parseable
// strings and Excel serial date numbers. Falls back to today's date
// string if nothing is recognizable, so an import never hard-fails on a
// single bad row.
function parseDateValue(value) {
  if (value == null || value === '') return new Date().toISOString().slice(0, 10)
  if (typeof value === 'number') {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      return `${parsed.y}-${mm}-${dd}`
    }
  }
  const str = String(value).trim()
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dotMatch) {
    const [, d, m, y] = dotMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, d, m, y] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(str)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function parseAmountValue(value) {
  if (value == null || value === '') return 0
  const cleaned = String(value).replace(/[₹,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

// Some supplier portals (e.g. this JIO PRM export) save a plain
// tab-separated text file with a ".xls" extension rather than a real
// binary workbook — SheetJS's XLSX.read chokes on those. We detect that
// case and parse it as TSV/CSV text directly.
function looksLikeDelimitedText(buffer) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 8))
  // Real .xlsx is a zip (starts "PK"), real legacy .xls is an OLE2
  // compound file (starts with a fixed magic byte sequence). Anything
  // else that begins with plain ASCII is almost certainly delimited text.
  return !(head.startsWith('PK') || buffer[0] === 0xd0)
}

function parseDelimitedText(text) {
  const delimiter = text.includes('\t') ? '\t' : ','
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { columns: [], rows: [] }
  const columns = lines[0].split(delimiter).map((c) => c.trim())
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delimiter)
    const row = {}
    columns.forEach((col, i) => {
      row[col] = (cells[i] ?? '').toString().trim()
    })
    return row
  })
  return { columns, rows }
}

// Reads a File (from an <input type="file">) and returns
// { columns: string[], rows: object[] } — rows keyed by original header.
export async function parseSupplierFile(file) {
  const buffer = new Uint8Array(await file.arrayBuffer())

  if (looksLikeDelimitedText(buffer)) {
    const text = new TextDecoder('utf-8').decode(buffer)
    const { columns, rows } = parseDelimitedText(text)
    if (rows.length > 0) return { columns, rows }
    // fall through to XLSX parsing if the text parse produced nothing
  }

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
  const columns = json.length > 0 ? Object.keys(json[0]) : []
  return { columns, rows: json }
}

// Converts parsed rows into the shape supplier_transactions expects for
// insert, auto-detecting date/amount/reference/description from
// whichever known column names are present.
export function buildTransactionRows({ supplierId, columns, rows, userId }) {
  return rows.map((row) => {
    const { value: dateValue } = findValue(row, DATE_KEYS)
    const { value: amountValue } = findValue(row, AMOUNT_KEYS)
    const { value: refValue } = findValue(row, REFERENCE_KEYS)
    const { value: descValue } = findValue(row, DESCRIPTION_KEYS)
    return {
      supplier_id: supplierId,
      txn_date: parseDateValue(dateValue),
      amount: parseAmountValue(amountValue),
      reference_no: refValue != null ? String(refValue) : null,
      description: descValue != null ? String(descValue) : null,
      raw: row,
      columns,
      created_by: userId,
    }
  })
}

// Re-exports a supplier's transactions back to .xlsx, preserving the
// original column order/shape they were imported with (falls back to a
// generic Date/Amount/Reference/Description shape for rows with no
// `raw` data, e.g. manually added entries).
export function exportTransactionsToWorkbook(transactions, supplierName) {
  const columns =
    transactions.find((t) => t.columns?.length)?.columns ??
    ['Date', 'Amount', 'Reference', 'Description']

  const data = transactions.map((t) => {
    if (t.raw && Object.keys(t.raw).length > 0) return t.raw
    return {
      Date: t.txn_date,
      Amount: t.amount,
      Reference: t.reference_no ?? '',
      Description: t.description ?? '',
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, (supplierName || 'Ledger').slice(0, 31))
  XLSX.writeFile(workbook, `${(supplierName || 'supplier').replace(/\s+/g, '_')}_ledger.xlsx`)
}
