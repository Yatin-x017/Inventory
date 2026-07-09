import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { History, Search, Receipt as ReceiptIcon, IndianRupee, FileText, FileCheck2, FileCog, Download, Upload, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useAuth } from '../context/AuthContext'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import ReceiptModal from '../components/ReceiptModal'
import ImportBillsModal from '../components/ImportBillsModal'
import { exportBillsToExcel } from '../lib/billsExcel'
import { getInvoicePdfUrl, generateAndStoreInvoicePdf } from '../lib/invoicePdf'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

// Rebuilds the { id, invoiceNumber, lines, ... } shape ReceiptModal /
// InvoicePrint expect (see the comment on completeSale in useStore.js)
// from a raw `bills` row + its embedded `bill_items`, so a past invoice
// from this page can be viewed/reprinted exactly like a fresh one.
function billToReceipt(bill) {
  const lines = (bill.bill_items ?? []).map((li) => ({
    item_id: li.item_id,
    item_name: li.item_name,
    item_sku: li.item_sku,
    unit_price: li.unit_price,
    quantity: li.quantity,
    hsn_code: li.hsn_code,
    gst_rate: li.gst_rate,
  }))
  const subtotal = lines.reduce((s, l) => s + (l.unit_price || 0) * (l.quantity || 0), 0)
  return {
    id: bill.id,
    invoiceNumber: bill.invoice_number,
    lines,
    subtotal,
    discount: bill.discount || 0,
    paymentMethod: bill.payment_method,
    emiCompany: bill.emi_company || null,
    total: bill.total ?? subtotal,
    paidAmount: bill.paid_amount ?? bill.total ?? subtotal,
    dueAmount: bill.due_amount || 0,
    customerName: bill.customer_name,
    customerPhone: bill.customer_phone,
    created_at: bill.created_at,
    saleDate: bill.sale_date,
  }
}

// A read-only, searchable record of every sale handed out over the past
// year — separate from Billing.jsx's "Recent Sales" list, which only ever
// keeps the last 50. Voided bills are excluded (see fetchBillLogs).
export default function BillLogs() {
  const { billLogs, billLogsLoading, fetchBillLogs, resendBillEmail, deleteBill } = useStore()
  const { canManageInventory } = useAuth()
  const [query, setQuery] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [pdfLoadingId, setPdfLoadingId] = useState(null)
  const [generatingPdfId, setGeneratingPdfId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    fetchBillLogs()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return billLogs
    return billLogs.filter((b) =>
      [b.customer_name, b.customer_phone, b.invoice_number]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    )
  }, [billLogs, query])

  const totals = useMemo(() => {
    const revenue = billLogs.reduce((s, b) => s + (b.total || 0), 0)
    return { count: billLogs.length, revenue }
  }, [billLogs])

  async function handleResendEmail(bill) {
    setResendingId(bill.id)
    try {
      await resendBillEmail(bill)
      await fetchBillLogs()
    } finally {
      setResendingId(null)
    }
  }

  // Backfills/retries the stored PDF for a bill that never got one — the
  // upload is fire-and-forget at checkout time (see src/lib/invoicePdf.js)
  // so it can silently fail from a slow connection, the tab backgrounding
  // mid-render, etc. Reuses the same billToReceipt() reconstruction that
  // powers the "View" button, since it has everything a fresh render needs.
  async function handleGeneratePdf(bill) {
    setGeneratingPdfId(bill.id)
    try {
      const ok = await generateAndStoreInvoicePdf(billToReceipt(bill))
      if (ok) {
        await fetchBillLogs()
        toast.success('Invoice PDF generated')
      } else {
        toast.error("Couldn't generate the PDF — check your connection and try again.")
      }
    } finally {
      setGeneratingPdfId(null)
    }
  }

  // Opens the exact PDF that was printed/emailed at sale time (see
  // src/lib/invoicePdf.js), rather than the reconstructed view below.
  async function handleViewOriginalPdf(bill) {
    setPdfLoadingId(bill.id)
    try {
      const url = await getInvoicePdfUrl(bill.invoice_pdf_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(`Couldn't open the stored invoice: ${err.message}`)
    } finally {
      setPdfLoadingId(null)
    }
  }

  // Permanent delete — for removing dummy/test bills, not real sales (void
  // those instead, from the Billing page, so stock gets restored).
  async function handleDeleteBill(bill) {
    if (
      !confirm(
        `Permanently delete ${bill.invoice_number || 'this bill'}? This can't be undone and won't restore any stock — void it first from the Billing page if it was a real sale.`
      )
    )
      return
    setDeletingId(bill.id)
    try {
      await deleteBill(bill.id)
      toast.success('Bill deleted')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Bill Logs</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Every non-voided sale handed out in the past year.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canManageInventory && (
            <Button
              variant="secondary"
              size="sm"
              icon={Upload}
              iconPosition="leading"
              onClick={() => setShowImport(true)}
            >
              Import
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            iconPosition="leading"
            disabled={filtered.length === 0}
            onClick={() => exportBillsToExcel(filtered, `bill-logs-${new Date().toISOString().slice(0, 10)}.xlsx`)}
          >
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={FileText} label="Bills" value={totals.count} hint="In the past year" tone="accent" />
        <StatCard
          icon={IndianRupee}
          label="Total Revenue"
          value={formatMoney(totals.revenue)}
          hint="Across all logged bills"
          tone="success"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search by customer name, phone, or invoice number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      {billLogsLoading && <p className="text-[13px] text-muted">Loading…</p>}

      {!billLogsLoading && filtered.length === 0 && (
        <EmptyState
          icon={History}
          title={billLogs.length === 0 ? 'No bills in the past year' : 'No matches'}
          description={
            billLogs.length === 0
              ? 'Sales completed from the Billing page will show up here automatically.'
              : 'Try a different name, phone number, or invoice number.'
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((b, i) => (
            <div
              key={b.id}
              className="flex animate-pop-in flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover sm:flex-row sm:items-center sm:justify-between"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">
                  {b.customer_name?.trim() || 'Walk-in customer'}
                </div>
                <div className="truncate text-[12.5px] text-muted">
                  {b.invoice_number && `${b.invoice_number} · `}
                  {(b.bill_items ?? []).length} item{(b.bill_items ?? []).length === 1 ? '' : 's'}
                  {b.payment_method ? ` · ${b.payment_method.toUpperCase()}` : ''}
                  {b.created_at ? ` · ${new Date(b.created_at).toLocaleString('en-IN')}` : ''}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{formatMoney(b.total)}</span>
                {b.due_amount > 0 && <Badge tone="warning">{formatMoney(b.due_amount)} due</Badge>}
                {b.email_status === 'sent' && <Badge tone="success">Emailed</Badge>}
                {b.email_status === 'pending' && <Badge tone="warning">Sending…</Badge>}
                {b.email_status === 'failed' && (
                  <>
                    <Badge tone="danger">Email failed</Badge>
                    {canManageInventory && (
                      <button
                        onClick={() => handleResendEmail(b)}
                        disabled={resendingId === b.id}
                        className="rounded-md px-2 py-1 text-[11.5px] font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
                      >
                        {resendingId === b.id ? 'Sending…' : 'Send Again'}
                      </button>
                    )}
                  </>
                )}
                {b.invoice_pdf_path && (
                  <button
                    onClick={() => handleViewOriginalPdf(b)}
                    disabled={pdfLoadingId === b.id}
                    title="Opens the exact PDF printed/emailed at sale time"
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
                  >
                    <FileCheck2 size={13} /> {pdfLoadingId === b.id ? 'Opening…' : 'Original PDF'}
                  </button>
                )}
                {!b.invoice_pdf_path && (
                  <button
                    onClick={() => handleGeneratePdf(b)}
                    disabled={generatingPdfId === b.id}
                    title="The PDF wasn't saved at checkout time — generate one now from this bill's details"
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium text-muted hover:bg-accent-soft hover:text-accent disabled:opacity-50"
                  >
                    <FileCog size={13} /> {generatingPdfId === b.id ? 'Generating…' : 'Generate PDF'}
                  </button>
                )}
                <button
                  onClick={() => setReceipt(billToReceipt(b))}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium text-accent hover:bg-accent-soft"
                >
                  <ReceiptIcon size={13} /> View
                </button>
                {canManageInventory && (
                  <button
                    onClick={() => handleDeleteBill(b)}
                    disabled={deletingId === b.id}
                    title="Permanently delete this bill"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
      {showImport && (
        <ImportBillsModal onClose={() => setShowImport(false)} onDone={() => fetchBillLogs()} />
      )}
    </div>
  )
}
