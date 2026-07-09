// Print-only "account statement" layout — the udhar-ledger equivalent of
// InvoicePrint.jsx, showing every transaction between DR Telecommunication
// and one retailer over a chosen date range, with a running balance
// (the okCredit-style "send statement" feature).
//
// Rendered off-screen and rasterized by src/lib/statementPdf.js. Unlike
// an invoice (always fits one page), a statement can run to many rows, so
// this renders at its natural height and statementPdf.js paginates the
// captured canvas into as many A4 pages as needed.

const BRAND = '#2563eb'
const BRAND_TINT = '#eff4ff'
const BRAND_TINT_2 = '#dbe7ff'

const COMPANY = {
  name: 'DR Telecommunication',
  initials: 'DR',
  addressLines: [
    'Ground Floor, Riddhi Siddhi Tower, Hameerpur, Bansur,',
    'Kotputli-Behror, Rajasthan \u2013 301402',
  ],
  phone: '+91 99505 75218',
  email: 'support@drtelecommunication.com',
  gstin: '08CLGPS8769D1ZG',
}

const printColors = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', colorAdjust: 'exact' }

function formatMoney(n) {
  return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`
}

function formatDate(d) {
  if (!d) return '\u2014'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const TYPE_META = {
  udhar: { label: 'Udhar given', column: 'debit' },
  payment: { label: 'Payment received', column: 'credit' },
  owed: { label: 'You owe them', column: 'credit' },
  paid_out: { label: 'You paid them', column: 'debit' },
}

// forCapture: always rendered (statementPdf.js mounts this off-screen);
// the on-screen version only appears via @media print, matching the
// existing InvoicePrint convention.
export default function LedgerStatementPrint({
  customer,
  transactions,
  openingBalance,
  closingBalance,
  from,
  to,
  generatedByName,
  forCapture = false,
}) {
  let running = openingBalance

  const rows = transactions.map((t) => {
    const meta = TYPE_META[t.type] ?? { label: t.type, column: 'debit' }
    const signed = (t.type === 'udhar' || t.type === 'paid_out' ? 1 : -1) * Number(t.amount)
    running += signed
    return { ...t, meta, debit: meta.column === 'debit' ? Number(t.amount) : 0, credit: meta.column === 'credit' ? Number(t.amount) : 0, balanceAfter: running }
  })

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  return (
    <div
      className={
        forCapture
          ? 'flex w-[794px] flex-col bg-white font-bold text-black'
          : 'hidden bg-white font-bold text-black print:flex print:flex-col'
      }
      style={printColors}
    >
      <div className="h-2.5 w-full shrink-0" style={{ backgroundColor: BRAND, ...printColors }} />

      <div className="flex flex-col px-9 pb-8 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: BRAND }}>
          <div className="flex items-start gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
              style={{ backgroundColor: BRAND, ...printColors }}
            >
              {COMPANY.initials}
            </div>
            <div>
              <div className="text-[22px] font-bold uppercase tracking-tight">{COMPANY.name}</div>
              {COMPANY.addressLines.map((line) => (
                <div key={line} className="text-[12px] leading-snug text-black">
                  {line}
                </div>
              ))}
              <div className="mt-1.5 flex gap-4 text-[12px] text-black">
                <span>Ph: {COMPANY.phone}</span>
                <span>Email: {COMPANY.email}</span>
              </div>
              <div className="text-[12px] font-bold text-black">GSTIN: {COMPANY.gstin}</div>
            </div>
          </div>
          <div className="text-right">
            <div
              className="inline-block rounded px-3 py-1.5 text-[13px] font-bold uppercase text-white"
              style={{ backgroundColor: BRAND, ...printColors }}
            >
              Account Statement
            </div>
            <div className="mt-2.5 text-[12px]">
              <span className="text-black">Period: </span>
              <span className="font-bold" style={{ color: BRAND }}>
                {formatDate(from)} &ndash; {formatDate(to)}
              </span>
            </div>
            <div className="text-[12px]">
              <span className="text-black">Generated: </span>
              <span className="font-bold">{formatDate(new Date())}</span>
              {generatedByName && <span className="text-black"> by {generatedByName}</span>}
            </div>
          </div>
        </div>

        {/* Retailer info */}
        <div
          className="mt-4 rounded-lg px-3.5 py-2.5 text-[12.5px]"
          style={{ backgroundColor: BRAND_TINT, ...printColors }}
        >
          <span className="font-bold uppercase tracking-wide" style={{ color: BRAND }}>
            Statement for{' '}
          </span>
          <span className="font-bold">{customer?.name}</span>
          {customer?.phone && <span className="text-black"> &nbsp;|&nbsp; Ph: {customer.phone}</span>}
          {customer?.address && <span className="text-black"> &nbsp;|&nbsp; {customer.address}</span>}
        </div>

        {/* Opening balance */}
        <div className="mt-4 flex justify-between rounded-md px-2.5 py-2 text-[13px]" style={{ backgroundColor: BRAND_TINT_2, ...printColors }}>
          <span className="font-bold">Opening balance (as of {formatDate(from)})</span>
          <span className="font-bold">
            {openingBalance >= 0 ? formatMoney(openingBalance) + ' due' : 'You owe ' + formatMoney(Math.abs(openingBalance))}
          </span>
        </div>

        {/* Transaction table */}
        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left uppercase text-black" style={{ backgroundColor: BRAND_TINT, ...printColors }}>
              <th className="w-20 rounded-l-md py-2.5 pl-2.5 pr-2 font-bold">Date</th>
              <th className="py-2.5 pr-2 font-bold">Description</th>
              <th className="w-24 py-2.5 pr-2 text-right font-bold">Debit</th>
              <th className="w-24 py-2.5 pr-2 text-right font-bold">Credit</th>
              <th className="w-28 rounded-r-md py-2.5 pr-2.5 text-right font-bold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-black">
                  No transactions in this period.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-200">
                <td className="py-2 pl-2.5 pr-2 align-top">{formatDate(r.transaction_date)}</td>
                <td className="py-2 pr-2 align-top">
                  {r.meta.label}
                  {r.description && <span className="text-black"> &middot; {r.description}</span>}
                </td>
                <td className="py-2 pr-2 text-right align-top">{r.debit > 0 ? formatMoney(r.debit) : '\u2014'}</td>
                <td className="py-2 pr-2 text-right align-top">{r.credit > 0 ? formatMoney(r.credit) : '\u2014'}</td>
                <td className="py-2 pr-2.5 text-right align-top">{formatMoney(r.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals + closing balance */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 text-[13px]">
            <div className="flex justify-between py-1 text-black">
              <span>Total debit (udhar / paid to them)</span>
              <span>{formatMoney(totalDebit)}</span>
            </div>
            <div className="flex justify-between py-1 text-black">
              <span>Total credit (payments / owed to them)</span>
              <span>{formatMoney(totalCredit)}</span>
            </div>
            <div
              className="mt-1.5 flex justify-between rounded-md px-2.5 py-2 text-[15px] font-bold text-white"
              style={{ backgroundColor: BRAND, ...printColors }}
            >
              <span>Closing balance</span>
              <span>
                {closingBalance >= 0 ? formatMoney(closingBalance) + ' due' : 'You owe ' + formatMoney(Math.abs(closingBalance))}
              </span>
            </div>
          </div>
        </div>

        {/* Signature */}
        <div className="mt-10 flex items-end justify-between gap-6 border-t-2 pt-4" style={{ borderColor: BRAND_TINT_2 }}>
          <div className="max-w-[60%] text-[10.5px] leading-relaxed text-black">
            This is a system-generated statement of account and reflects the ledger as recorded in DR Telecommunication's records as of the generation date above. Please report any discrepancy within 7 days.
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="h-12 w-40 border-b-2" style={{ borderColor: BRAND }} />
            <div className="text-[10.5px] text-black">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  )
}
