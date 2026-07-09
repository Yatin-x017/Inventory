import { createPortal } from 'react-dom'
import { Receipt, Printer } from 'lucide-react'
import Button from './ui/Button'
import InvoicePrint from './InvoicePrint'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

// receipt: { id, invoiceNumber, lines, total, customerName, customerPhone, created_at }
//
// Rendered via a portal straight to document.body, not inline wherever the
// caller happens to sit in the tree. Layout.jsx wraps the whole app shell
// (sidebar + page content) in a `print:hidden` div; any page — Billing.jsx
// included — that rendered this modal as a normal child would have it
// silently swallowed by that ancestor's `display: none` at print time,
// no matter what print:block classes InvoicePrint itself has. A portal
// escapes that ancestor entirely so printing works regardless of which
// page opened the receipt.
export default function ReceiptModal({ receipt, onClose }) {
  return createPortal(
    <div
      onMouseDown={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm print:static print:bg-transparent print:p-0"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-2xl border border-border bg-surface shadow-card-hover print:w-full print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-accent" />
            <h2 className="text-[15px] font-semibold">Sale complete</h2>
          </div>
          <button onClick={onClose} className="text-[13px] text-muted hover:text-text">
            Close
          </button>
        </div>

        <div className="px-5 py-5 print:hidden">
          <div className="text-center text-[13px] text-muted">
            {new Date(receipt.created_at).toLocaleString('en-IN')}
          </div>
          {receipt.invoiceNumber && (
            <div className="mt-0.5 text-center text-[11.5px] text-muted">{receipt.invoiceNumber}</div>
          )}
          {receipt.customerName && (
            <div className="mt-1 text-center text-[13.5px] font-medium">{receipt.customerName}</div>
          )}

          <div className="mt-4 flex flex-col gap-2 border-y border-dashed border-border py-3">
            {receipt.lines.map((l, i) => (
              <div key={l.item_id ?? i} className="flex items-center justify-between text-[13px]">
                <span className="min-w-0 truncate pr-2">
                  {l.item_name} × {l.quantity}
                </span>
                <span className="shrink-0 font-medium">{formatMoney(l.unit_price * l.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-1">
            {receipt.subtotal != null && receipt.discount > 0 && (
              <>
                <div className="flex items-center justify-between text-[13px] text-muted">
                  <span>Subtotal</span>
                  <span>{formatMoney(receipt.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px] text-danger">
                  <span>Discount</span>
                  <span>-{formatMoney(receipt.discount)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold">Total</span>
              <span className="text-[18px] font-semibold">{formatMoney(receipt.total)}</span>
            </div>
            {receipt.dueAmount > 0 && (
              <>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted">Paid now</span>
                  <span className="font-medium">{formatMoney(receipt.paidAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px] text-warning">
                  <span>Due (pay later)</span>
                  <span className="font-medium">{formatMoney(receipt.dueAmount)}</span>
                </div>
              </>
            )}
            {receipt.paymentMethod && (
              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>Paid via</span>
                <span className="font-medium uppercase">{receipt.paymentMethod}</span>
              </div>
            )}
          </div>
        </div>

        <InvoicePrint receipt={receipt} />

        <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4 print:hidden">
          <Button variant="secondary" onClick={onClose}>Done</Button>
          <Button onClick={() => window.print()}>
            <Printer size={15} /> Print
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
