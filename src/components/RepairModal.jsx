import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Plus, Trash2 } from 'lucide-react'
import { useRepairStore } from '../store/useRepairStore'
import Button from './ui/Button'

export const STATUSES = [
  { value: 'received', label: 'Received' },
  { value: 'diagnosing', label: 'Diagnosing' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_for_parts', label: 'Waiting for parts' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const inputClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

function emptyPart() {
  return { name: '', cost: '' }
}

export default function RepairModal({ repair, onClose, onSaved }) {
  const { createRepair, updateRepair } = useRepairStore()
  const isEdit = Boolean(repair)

  const [customerName, setCustomerName] = useState(repair?.customer_name ?? '')
  const [customerPhone, setCustomerPhone] = useState(repair?.customer_phone ?? '')
  const [deviceBrand, setDeviceBrand] = useState(repair?.device_brand ?? '')
  const [deviceModel, setDeviceModel] = useState(repair?.device_model ?? '')
  const [deviceImei, setDeviceImei] = useState(repair?.device_imei ?? '')
  const [issueDescription, setIssueDescription] = useState(repair?.issue_description ?? '')
  const [status, setStatus] = useState(repair?.status ?? 'received')
  const [estimatedCost, setEstimatedCost] = useState(repair?.estimated_cost ?? '')
  const [finalCost, setFinalCost] = useState(repair?.final_cost ?? '')
  const [technicianNotes, setTechnicianNotes] = useState(repair?.technician_notes ?? '')
  const [receivedDate, setReceivedDate] = useState(
    repair?.received_date ?? new Date().toISOString().slice(0, 10)
  )
  const [completedDate, setCompletedDate] = useState(repair?.completed_date ?? '')
  const [parts, setParts] = useState(
    repair?.parts_used?.length ? repair.parts_used.map((p) => ({ name: p.name ?? '', cost: p.cost ?? '' })) : [emptyPart()]
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updatePart(index, field, value) {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function addPartRow() {
    setParts((prev) => [...prev, emptyPart()])
  }

  function removePartRow(index) {
    setParts((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const partsTotal = parts.reduce((sum, p) => sum + (Number(p.cost) || 0), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!customerName.trim()) {
      setError('Customer name is required.')
      return
    }
    if (!issueDescription.trim()) {
      setError('Describe the issue.')
      return
    }

    const cleanParts = parts
      .filter((p) => p.name.trim())
      .map((p) => ({ name: p.name.trim(), cost: Number(p.cost) || 0 }))

    setSaving(true)
    try {
      const payload = {
        customerName,
        customerPhone,
        deviceBrand,
        deviceModel,
        deviceImei,
        issueDescription,
        status,
        estimatedCost,
        finalCost,
        partsUsed: cleanParts,
        technicianNotes,
        receivedDate,
        completedDate,
      }
      if (isEdit) {
        await updateRepair(repair.id, payload)
      } else {
        await createRepair(payload)
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[560px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold">{isEdit ? 'Edit repair ticket' : 'New repair ticket'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-5 px-5 py-5">
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Customer</label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  placeholder="Customer name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Phone (optional)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Device</label>
              <div className="flex gap-2">
                <input
                  placeholder="Brand, e.g. Samsung"
                  value={deviceBrand}
                  onChange={(e) => setDeviceBrand(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Model, e.g. Galaxy M14"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  className={inputClass}
                />
              </div>
              <input
                placeholder="IMEI / serial (optional)"
                value={deviceImei}
                onChange={(e) => setDeviceImei(e.target.value)}
                className={inputClass}
              />
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Issue</label>
              <textarea
                placeholder="What's wrong with the device?"
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Status</label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      status === s.value
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Dates</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <span className="mb-1 block text-[11px] text-muted">Received</span>
                  <input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <span className="mb-1 block text-[11px] text-muted">Completed</span>
                  <input
                    type="date"
                    value={completedDate}
                    onChange={(e) => setCompletedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                  Parts used {partsTotal > 0 && `(₹${partsTotal.toLocaleString('en-IN')})`}
                </label>
              </div>
              <div className="flex flex-col gap-2">
                {parts.map((part, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      placeholder="Part name, e.g. Display"
                      value={part.name}
                      onChange={(e) => updatePart(i, 'name', e.target.value)}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="number" min="0" step="0.01"
                      placeholder="Cost"
                      value={part.cost}
                      onChange={(e) => updatePart(i, 'cost', e.target.value)}
                      className={`${inputClass} max-w-[110px]`}
                    />
                    <button
                      type="button"
                      onClick={() => removePartRow(i)}
                      disabled={parts.length === 1}
                      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPartRow}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[12.5px] font-medium text-muted hover:border-accent/40 hover:text-accent"
              >
                <Plus size={14} /> Add another part
              </button>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Cost</label>
              <div className="flex gap-2">
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Estimated cost"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Final cost"
                  value={finalCost}
                  onChange={(e) => setFinalCost(e.target.value)}
                  className={inputClass}
                />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Technician notes</label>
              <textarea
                placeholder="Internal notes — diagnosis, parts ordered, anything worth remembering"
                value={technicianNotes}
                onChange={(e) => setTechnicianNotes(e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </section>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create ticket'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
