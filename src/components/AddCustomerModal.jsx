import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import { useAuth } from '../context/AuthContext'
import Button from './ui/Button'

export default function AddCustomerModal({ customer, onClose, onSaved }) {
  const { addCustomer, updateCustomer, marketingMembers, fetchMarketingMembers } = useCustomerStore()
  const { profile, isTopTierCustomers, isMarketingMember } = useAuth()
  const isEdit = Boolean(customer)
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [address, setAddress] = useState(customer?.address ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [assignedTo, setAssignedTo] = useState(customer?.assigned_to ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Only owner/builder pick who a retailer belongs to; a marketing_member
  // creating a retailer always assigns it to themselves (their RLS insert
  // policy requires it), so they never see this dropdown.
  useEffect(() => {
    if (isTopTierCustomers) fetchMarketingMembers().catch(() => {})
  }, [isTopTierCustomers])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Customer name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const effectiveAssignedTo = isTopTierCustomers ? assignedTo : profile?.id
      if (isEdit) {
        await updateCustomer(customer.id, {
          name,
          phone,
          address,
          notes,
          assignedTo: isTopTierCustomers ? assignedTo : undefined,
        })
      } else {
        await addCustomer({ name, phone, address, notes, assignedTo: effectiveAssignedTo })
      }
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
          <h2 className="text-[15px] font-semibold">{isEdit ? 'Edit retailer' : 'Add retailer'}</h2>
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
            <input
              autoFocus
              placeholder="Retailer / shop name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="Address (optional)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />

            {isTopTierCustomers && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">
                  Marketing member
                </span>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={`${inputClass} capitalize`}
                >
                  <option value="">Unassigned (house account)</option>
                  {marketingMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isMarketingMember && !isEdit && (
              <p className="text-[12px] text-muted">This retailer will be added to your book.</p>
            )}

            <textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add retailer'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
