// Print-only invoice layout for DR Telecommunication.
// Rendered inside the Billing receipt modal; only this block goes to paper.

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

const TERMS = [
  'Goods once sold will not be taken back or exchanged.',
  'Warranty, if any, is as per the manufacturer\u2019s terms only.',
  'Please verify IMEI/serial number and accessories before leaving the store.',
  'Subject to Kotputli-Behror jurisdiction only. E. & O.E.',
]

// Forces browsers (Chrome/Edge/Firefox/Safari) to actually render
// background colors when the user prints/saves as PDF, instead of
// silently stripping them in "print-friendly" mode.
const printColors = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', colorAdjust: 'exact' }

function formatMoney(n) {
  return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`
}

function invoiceDate(iso) {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Renders a line's config snapshot (RAM/storage/color for serialized
// sales) as a compact "128GB · 8GB RAM · Black" string under the item name.
function configLabel(config) {
  if (!config) return ''
  const parts = [config.storage, config.ram && `${config.ram} RAM`, config.color].filter(Boolean)
  return parts.join(' \u00b7 ')
}

// All prices in this app are tax-inclusive (the norm for retail POS in
// India), so GST is displayed by working backwards from each line's
// total: taxable value = inclusive amount / (1 + rate/100). The flat
// rupee discount is spread across lines proportionally to their share of
// the subtotal before splitting out tax, so taxable value + CGST + SGST
// across all lines always reconciles exactly to the invoice Total below.
function computeGstBreakdown(lines, subtotal, discount) {
  const byRate = new Map()
  for (const l of lines) {
    const lineAmount = l.unit_price * l.quantity
    const share = subtotal > 0 ? lineAmount / subtotal : 0
    const netAmount = lineAmount - discount * share
    const rate = Number(l.gst_rate ?? 18)
    const taxable = netAmount / (1 + rate / 100)
    const tax = netAmount - taxable
    const prev = byRate.get(rate) || { rate, taxable: 0, tax: 0 }
    prev.taxable += taxable
    prev.tax += tax
    byRate.set(rate, prev)
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate)
}

// forCapture: renders this always-flex/visible (instead of print-only)
// for src/lib/invoicePdf.js, which mounts this off-screen and rasterizes
// it with html2canvas right after checkout to produce the stored PDF
// copy of the invoice — the on-screen render only ever shows via
// `@media print`, so html2canvas would otherwise capture nothing.
export default function InvoicePrint({ receipt, forCapture = false }) {
  const lines = receipt.lines ?? []
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
  const discountAmt = receipt.discount ?? 0
  const gstBreakdown = computeGstBreakdown(lines, subtotal || receipt.subtotal || 0, discountAmt)
  const totalTaxable = gstBreakdown.reduce((s, g) => s + g.taxable, 0)

  return (
    <div
      className={
        forCapture
          ? 'flex w-[794px] flex-col overflow-hidden bg-white font-bold text-black'
          : 'hidden bg-white font-bold text-black print:flex print:h-[281mm] print:max-h-[281mm] print:flex-col print:overflow-hidden'
      }
      style={printColors}
    >
      {/* Top brand rule */}
      <div className="h-2.5 w-full shrink-0" style={{ backgroundColor: BRAND, ...printColors }} />

      <div className="flex flex-1 flex-col px-9 pb-7 pt-6">
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
              Tax Invoice &mdash; Standard
            </div>
            <div className="mt-2.5 text-[12px]">
              <span className="text-black">Invoice No: </span>
              <span className="font-bold" style={{ color: BRAND }}>{receipt.invoiceNumber || '\u2014'}</span>
            </div>
            <div className="text-[12px]">
              <span className="text-black">Date: </span>
              <span className="font-bold">{invoiceDate(receipt.saleDate || receipt.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div
          className="mt-4 rounded-lg px-3.5 py-2.5 text-[12.5px]"
          style={{ backgroundColor: BRAND_TINT, ...printColors }}
        >
          <span className="font-bold uppercase tracking-wide" style={{ color: BRAND }}>Billed to </span>
          <span className="font-bold">{receipt.customerName || 'Walk-in Customer'}</span>
          {receipt.customerPhone && (
            <span className="text-black"> &nbsp;|&nbsp; Ph: {receipt.customerPhone}</span>
          )}
        </div>

        {/* Item by item table */}
        <table className="mt-5 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left uppercase text-black" style={{ backgroundColor: BRAND_TINT, ...printColors }}>
              <th className="w-8 rounded-l-md py-2.5 pl-2.5 pr-2 font-bold">#</th>
              <th className="py-2.5 pr-2 font-bold">Item</th>
              <th className="w-16 py-2.5 pr-2 text-right font-bold">HSN</th>
              <th className="w-14 py-2.5 pr-2 text-right font-bold">Qty</th>
              <th className="w-24 py-2.5 pr-2 text-right font-bold">Rate</th>
              <th className="w-28 rounded-r-md py-2.5 pr-2.5 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.item_id ?? i} className="border-b border-neutral-200">
                <td className="py-2.5 pl-2.5 pr-2 align-top">{i + 1}</td>
                <td className="py-2.5 pr-2 align-top">
                  {l.item_name}
                  {l.item_sku && <span className="text-black"> ({l.item_sku})</span>}
                  {configLabel(l.config) && (
                    <div className="text-[10.5px] text-black">{configLabel(l.config)}</div>
                  )}
                  {(l.imei1 || l.imei2 || l.serial) && (
                    <div className="text-[10.5px] text-black">
                      {[
                        l.imei1 && `IMEI 1: ${l.imei1}`,
                        l.imei2 && `IMEI 2: ${l.imei2}`,
                        l.serial && `Serial: ${l.serial}`,
                      ]
                        .filter(Boolean)
                        .join(' \u00b7 ')}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right align-top text-black">{l.hsn_code || '\u2014'}</td>
                <td className="py-2.5 pr-2 text-right align-top">{l.quantity}</td>
                <td className="py-2.5 pr-2 text-right align-top">{formatMoney(l.unit_price)}</td>
                <td className="py-2.5 pr-2.5 text-right align-top">{formatMoney(l.unit_price * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 flex justify-end pt-3">
          <div className="w-64 text-[13px]">
            <div className="flex justify-between py-1">
              <span className="text-black">Subtotal</span>
              <span>{formatMoney(receipt.subtotal ?? subtotal)}</span>
            </div>
            {receipt.discount > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-black">Discount</span>
                <span>-{formatMoney(receipt.discount)}</span>
              </div>
            )}
            <div className="flex justify-between py-1 text-black">
              <span>Taxable Value</span>
              <span>{formatMoney(totalTaxable)}</span>
            </div>
            {gstBreakdown.map((g) => (
              <div key={g.rate} className="flex flex-col">
                <div className="flex justify-between py-1 text-black">
                  <span>CGST @ {(g.rate / 2).toFixed(1)}%</span>
                  <span>{formatMoney(g.tax / 2)}</span>
                </div>
                <div className="flex justify-between py-1 text-black">
                  <span>SGST @ {(g.rate / 2).toFixed(1)}%</span>
                  <span>{formatMoney(g.tax / 2)}</span>
                </div>
              </div>
            ))}
            <div
              className="mt-1.5 flex justify-between rounded-md px-2.5 py-2 text-[15px] font-bold text-white"
              style={{ backgroundColor: BRAND, ...printColors }}
            >
              <span>Total (incl. GST)</span>
              <span>{formatMoney(receipt.total ?? subtotal)}</span>
            </div>
            {receipt.dueAmount > 0 && (
              <>
                <div className="mt-1.5 flex justify-between py-1">
                  <span className="text-black">Paid now</span>
                  <span>{formatMoney(receipt.paidAmount)}</span>
                </div>
                <div className="flex justify-between rounded-md px-2.5 py-1.5 font-bold" style={{ backgroundColor: '#fef3c7', ...printColors }}>
                  <span>Due (pay later)</span>
                  <span>{formatMoney(receipt.dueAmount)}</span>
                </div>
              </>
            )}
            {receipt.paymentMethod && (
              <div className="mt-1.5 flex justify-between text-[12px]">
                <span className="text-black">Payment Mode</span>
                <span className="font-bold uppercase">{receipt.paymentMethod}</span>
              </div>
            )}
            {receipt.paymentMethod === 'emi' && receipt.emiCompany && (
              <div className="flex justify-between text-[12px]">
                <span className="text-black">EMI Company</span>
                <span className="font-bold">{receipt.emiCompany}</span>
              </div>
            )}
          </div>
        </div>

        {/* Thank-you note fills the middle of the page on short bills */}
        <div className="mt-6 text-center text-[12px] font-bold italic" style={{ color: BRAND }}>
          Thank you for shopping with {COMPANY.name}!
        </div>

        {/* Footer: terms, QR placeholder, signature \u2014 pinned to the bottom of the sheet */}
        <div className="mt-auto flex items-end justify-between gap-6 border-t-2 pt-4" style={{ borderColor: BRAND_TINT_2 }}>
          <div className="max-w-[60%] text-[10.5px] leading-relaxed text-black">
            <div className="mb-1.5 text-[11px] font-bold uppercase" style={{ color: BRAND }}>
              Terms &amp; Conditions
            </div>
            <ol className="list-decimal space-y-1 pl-4">
              {TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-md border-2 border-dashed text-center text-[9px] text-black"
              style={{ borderColor: BRAND_TINT_2 }}
            >
              QR&nbsp;Code
            </div>
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
