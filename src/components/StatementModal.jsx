import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerStore } from '../store/useCustomerStore'
import { useAuth } from '../context/AuthContext'
import { downloadStatementPdf } from '../lib/statementPdf'
import Button from './ui/Button'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// The okCredit-style "send statement" feature: pick a period, preview the
// opening/closing balance and transaction count, then download a PDF of
// every transaction between DR Telecommunication and this retailer in
// that window.
export default function StatementModal({ customer, onClose }) {
  const { fetchStatementData } = useCustomerStore()
  const { profile } = useAuth()
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [preview, setPreview] = useState(null) // { transactions, openingBalance, closingBalance }
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function loadPreview() {
    if (!from || !to || from > to) {
      setError('Pick a valid start and end date.')
      return
    }
    setError('')
    setLoadingPreview(true)
    try {
      const result = await fetchStatementData(customer.id, from, to)
      setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleDownload() {
    setGenerating(true)
    setError('')
    try {
      let data = preview
      if (!data) data = await fetchStatementData(customer.id, from, to)
      const ok = await downloadStatementPdf({
        customer,
        transactions: data.transactions,
        openingBalance: data.openingBalance,
        closingBalance: data.closingBalance,
        from,
        to,
        generatedByName: profile?.full_name,
      })
      if (ok) {
        toast.success('Statement downloaded')
        onClose()
      } else {
        setError('Could not generate the PDF. Try again.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors focus:border-accent'

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[460px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Send statement</h2>
            <p className="mt-0.5 text-[12px] text-muted">{customer?.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">From</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPreview(null)
                }}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">To</span>
              <input
                type="date"
                value={to}
                min={from}
                max={today()}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPreview(null)
                }}
                className={inputClass}
              />
            </div>
          </div>

          {!preview && (
            <Button variant="secondary" onClick={loadPreview} disabled={loadingPreview}>
              {loadingPreview ? 'Loading…' : 'Preview'}
            </Button>
          )}

          {preview && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3.5 text-[13px]">
              <div className="flex justify-between text-muted">
                <span>Opening balance</span>
                <span className="font-medium text-text">
                  {preview.openingBalance >= 0
                    ? `${formatMoney(preview.openingBalance)} due`
                    : `You owe ${formatMoney(Math.abs(preview.openingBalance))}`}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Transactions in period</span>
                <span className="font-medium text-text">{preview.transactions.length}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-muted">
                <span>Closing balance</span>
                <span className="font-semibold text-text">
                  {preview.closingBalance >= 0
                    ? `${formatMoney(preview.closingBalance)} due`
                    : `You owe ${formatMoney(Math.abs(preview.closingBalance))}`}
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={generating}>
            <FileDown size={15} /> {generating ? 'Generating…' : 'Download PDF'}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
