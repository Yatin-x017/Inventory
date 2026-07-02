import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import Button from './ui/Button'

export default function AddTransactionModal({ customerId, defaultType = 'udhar', onClose, onSaved }) {
  const { addTransaction } = useCustomerStore()
  const [type, setType] = useState(defaultType)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addTransaction({
        customerId,
        type,
        amount: numericAmount,
        description,
        transactionDate: date,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[440px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold">Record transaction</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 px-5 py-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">They owe you</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('udhar')}
                  className={`rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    type === 'udhar'
                      ? 'border-danger bg-danger-soft text-danger'
                      : 'border-border text-muted hover:text-text'
                  }`}
                >
                  Udhar given
                </button>
                <button
                  type="button"
                  onClick={() => setType('payment')}
                  className={`rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    type === 'payment'
                      ? 'border-success bg-success-soft text-success'
                      : 'border-border text-muted hover:text-text'
                  }`}
                >
                  Payment received
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">You owe them</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('owed')}
                  className={`rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    type === 'owed'
                      ? 'border-warning bg-warning-soft text-warning'
                      : 'border-border text-muted hover:text-text'
                  }`}
                >
                  You owe them
                </button>
                <button
                  type="button"
                  onClick={() => setType('paid_out')}
                  className={`rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    type === 'paid_out'
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-muted hover:text-text'
                  }`}
                >
                  You paid them
                </button>
              </div>
            </div>

            <input
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
              placeholder="₹ Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
