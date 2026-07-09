import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from './ui/Button'

const inputClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

function identifiersOf(unit) {
  const byType = {}
  for (const d of unit.device_identifiers ?? []) byType[d.identifier_type] = d.identifier_value
  return {
    imei1: byType.IMEI_1 || '',
    imei2: byType.IMEI_2 || '',
    serial: byType.SERIAL_NUMBER || '',
    barcode: byType.BARCODE || '',
  }
}

// "Edit details" on a single IMEI/serial-tracked unit from Manage
// Inventory — identifiers, warranty window, purchase price, and location.
// Product-level fields (brand/model/price/etc) still go through
// AddItemModal; this is unit-specific (per physical device).
export default function EditUnitModal({ unit, product, onClose, onSaved }) {
  const { locations, updateInventoryUnitDetails } = useStore()
  const ids = identifiersOf(unit)

  const [imei1, setImei1] = useState(ids.imei1)
  const [imei2, setImei2] = useState(ids.imei2)
  const [serial, setSerial] = useState(ids.serial)
  const [barcode, setBarcode] = useState(ids.barcode)
  const [purchasePrice, setPurchasePrice] = useState(unit.purchase_price ?? '')
  const [locationId, setLocationId] = useState(unit.location_id ?? unit.locations?.id ?? '')
  const [warrantyStartDate, setWarrantyStartDate] = useState(unit.warranty_start_date ?? '')
  const [warrantyEndDate, setWarrantyEndDate] = useState(unit.warranty_end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!imei1.trim() && !serial.trim()) {
      setError('At least an IMEI or serial number is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateInventoryUnitDetails(unit.id, {
        purchasePrice: purchasePrice === '' ? null : Number(purchasePrice),
        locationId: locationId || null,
        warrantyStartDate: warrantyStartDate || null,
        warrantyEndDate: warrantyEndDate || null,
        imei1,
        imei2,
        serial,
        barcode,
      })
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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[480px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Edit unit details</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {product?.brand} {product?.model} {product?.color || ''}
            </p>
          </div>
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
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                IMEI / Serial
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  autoFocus
                  placeholder="IMEI 1"
                  value={imei1}
                  onChange={(e) => setImei1(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="IMEI 2 (optional)"
                  value={imei2}
                  onChange={(e) => setImei2(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Serial (optional)"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Barcode (optional)"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className={inputClass}
                />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                Location
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} ({l.type})
                  </option>
                ))}
              </select>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                Purchase price
              </label>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2.5 focus-within:border-accent">
                <span className="text-[12px] text-muted">₹</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted"
                />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                Warranty window
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block px-0.5 text-[11px] text-muted">Start</label>
                  <input
                    type="date"
                    value={warrantyStartDate}
                    onChange={(e) => setWarrantyStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block px-0.5 text-[11px] text-muted">End</label>
                  <input
                    type="date"
                    value={warrantyEndDate}
                    onChange={(e) => setWarrantyEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
