import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, ScanLine, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from './ui/Button'
import PhoneImagePicker from './PhoneImagePicker'

const LOCATION_TYPES = ['shelf', 'counter', 'box', 'custom']

// Only serialized categories make sense here — legacy/bulk items don't
// have per-unit identifiers to fan out over.
const CATEGORIES = [
  { value: 'phone', label: 'Phone' },
  { value: 'headphone', label: 'Headphone' },
  { value: 'true_wireless_earphone', label: 'True Wireless Earphones' },
]

function emptyRow(prev) {
  // Carry the previous row's color/config forward — in practice a whole
  // carton is usually the same variant, so the cashier only has to touch
  // color/RAM/storage when it actually changes, and can otherwise just
  // keep scanning IMEIs/serials straight through.
  return {
    color: prev?.color ?? '',
    ram: prev?.ram ?? '',
    storage: prev?.storage ?? '',
    price: prev?.price ?? '',
    imei1: '',
    imei2: '',
    serial: '',
    barcode: '',
  }
}

const inputClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

export default function BulkAddItemModal({ onClose, onAdded }) {
  const { locations, bulkAddSerializedUnits } = useStore()

  const [category, setCategory] = useState('phone')

  // ── Shared "base model" fields (apply to every variant created) ──
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [costPriceEdited, setCostPriceEdited] = useState(false)

  // Cost price defaults to 94% of the selling price. Keeps auto-filling
  // as the user types the selling price, until they manually edit the
  // cost price themselves.
  function handlePriceChange(value) {
    setPrice(value)
    if (costPriceEdited) return
    const sp = parseFloat(value)
    if (!value || Number.isNaN(sp)) {
      setCostPrice('')
      return
    }
    const suggested = sp * 0.94
    setCostPrice(suggested.toFixed(2))
  }

  function handleCostPriceChange(value) {
    setCostPriceEdited(true)
    setCostPrice(value)
  }
  const [warrantyMonths, setWarrantyMonths] = useState('')
  const [hsnCode, setHsnCode] = useState('85171300')
  const [gstRate, setGstRate] = useState(18)
  const [imageUrl, setImageUrl] = useState('')
  const [locationType, setLocationType] = useState('shelf')
  const [locationLabel, setLocationLabel] = useState('')

  // ── Per-unit rows ──
  const [rows, setRows] = useState([emptyRow()])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const requiresImei = category === 'phone'
  const fieldOrder = requiresImei ? ['imei1', 'imei2', 'serial'] : ['serial', 'barcode']

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(prev[prev.length - 1])])
  }

  function removeRow(index) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  // Enter jumps across the identifier fields of a row, then into the next
  // row's first identifier field — adding a fresh row (pre-filled with the
  // same color/config) if this was the last one. Same scanner-gun-friendly
  // pattern as the single-item modal, scoped to just the ID fields since
  // color/RAM/storage are usually left untouched between units.
  function handleScanKeyDown(e, rowIndex, fieldIndex) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const nextField = fieldOrder[fieldIndex + 1]
    if (nextField) {
      document.getElementById(`brow-${rowIndex}-${nextField}`)?.focus()
      return
    }
    if (rowIndex === rows.length - 1) {
      addRow()
      setTimeout(() => document.getElementById(`brow-${rowIndex + 1}-${fieldOrder[0]}`)?.focus(), 0)
    } else {
      document.getElementById(`brow-${rowIndex + 1}-${fieldOrder[0]}`)?.focus()
    }
  }

  // Live preview of how the rows will be grouped into products, so the
  // cashier can spot a typo'd color/config before submitting.
  const variantGroups = (() => {
    const map = new Map()
    for (const row of rows) {
      const hasIdentifier = row.imei1.trim() || row.imei2.trim() || row.serial.trim() || row.barcode.trim()
      if (!hasIdentifier) continue
      const color = row.color.trim()
      const ram = row.ram.trim()
      const storage = row.storage.trim()
      const key = [color.toLowerCase(), ram.toLowerCase(), storage.toLowerCase()].join('|')
      if (!map.has(key)) map.set(key, { color, ram, storage, price: '', count: 0 })
      const group = map.get(key)
      group.count += 1
      if (!group.price && row.price != null && String(row.price).trim() !== '') {
        group.price = row.price
      }
    }
    return [...map.values()]
  })()

  const totalUnits = variantGroups.reduce((s, g) => s + g.count, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!brand.trim() || !model.trim()) {
      setError('Brand and model are required.')
      return
    }
    const cleanRows = rows.filter(
      (r) => r.imei1.trim() || r.imei2.trim() || r.serial.trim() || r.barcode.trim()
    )
    if (cleanRows.length === 0) {
      setError(requiresImei ? 'Scan at least one IMEI.' : 'Scan at least one serial number.')
      return
    }
    if (requiresImei && cleanRows.some((r) => !r.imei1.trim())) {
      setError('IMEI 1 is required for every unit.')
      return
    }

    setSaving(true)
    try {
      const result = await bulkAddSerializedUnits({
        category, brand, model, sku, price, costPrice, warrantyMonths,
        hsnCode, gstRate, imageUrl, locationType, locationLabel, rows: cleanRows,
      })
      onAdded?.(result)
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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[680px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-accent" />
            <h2 className="text-[15px] font-semibold">Bulk add units</h2>
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
            <p className="rounded-lg bg-accent-soft/50 px-3 py-2 text-[12.5px] text-muted">
              Set the model once below. Then for each unit, only change color / RAM / storage when
              it's different from the row above — everything else carries forward automatically.
            </p>

            {/* ── Category ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      category === c.value
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ── Base model details ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                Model (shared across every variant below)
              </label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  placeholder="Brand, e.g. OPPO"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Model, e.g. Reno 11"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="SKU / Model No. (optional)"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="number" min="0" step="0.01"
                  placeholder="₹ Selling price"
                  value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="number" min="0" step="0.01"
                  placeholder="₹ Cost price"
                  value={costPrice}
                  onChange={(e) => handleCostPriceChange(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="HSN code, e.g. 8517"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="number" min="0" max="100" step="0.01"
                  placeholder="GST %"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  className={`${inputClass} max-w-[110px]`}
                />
                <input
                  type="number" min="0"
                  placeholder="Warranty (months)"
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
                  className={inputClass}
                />
              </div>
              <p className="text-[12px] text-muted">
                Cost, HSN, GST and warranty apply to every variant created in this batch. Selling
                price above is just the default — set a price per unit below to override it for a
                specific color/variant (e.g. a gold variant priced higher).
              </p>
            </section>

            {/* ── Rows: per-unit color/config + identifiers ── */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                  Units ({rows.length})
                </label>
                <span className="flex items-center gap-1 text-[11.5px] text-muted">
                  <ScanLine size={13} /> Enter jumps to next field
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 shrink-0 text-center text-[11.5px] text-muted">{i + 1}</span>
                      <input
                        placeholder="Color"
                        value={row.color}
                        onChange={(e) => updateRow(i, 'color', e.target.value)}
                        className={`${inputClass} px-2 py-1.5`}
                      />
                      <input
                        placeholder="RAM"
                        value={row.ram}
                        onChange={(e) => updateRow(i, 'ram', e.target.value)}
                        className={`${inputClass} max-w-[90px] px-2 py-1.5`}
                      />
                      <input
                        placeholder="Storage"
                        value={row.storage}
                        onChange={(e) => updateRow(i, 'storage', e.target.value)}
                        className={`${inputClass} max-w-[90px] px-2 py-1.5`}
                      />
                      <input
                        type="number" min="0" step="0.01"
                        placeholder="₹ Price"
                        value={row.price}
                        onChange={(e) => updateRow(i, 'price', e.target.value)}
                        className={`${inputClass} max-w-[110px] px-2 py-1.5`}
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={rows.length === 1}
                        className="shrink-0 rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pl-[26px] sm:grid-cols-3">
                      {requiresImei ? (
                        <>
                          <input
                            id={`brow-${i}-imei1`}
                            placeholder="IMEI 1"
                            value={row.imei1}
                            onChange={(e) => updateRow(i, 'imei1', e.target.value)}
                            onKeyDown={(e) => handleScanKeyDown(e, i, 0)}
                            className={`${inputClass} px-2 py-1.5`}
                          />
                          <input
                            id={`brow-${i}-imei2`}
                            placeholder="IMEI 2 (optional)"
                            value={row.imei2}
                            onChange={(e) => updateRow(i, 'imei2', e.target.value)}
                            onKeyDown={(e) => handleScanKeyDown(e, i, 1)}
                            className={`${inputClass} px-2 py-1.5`}
                          />
                          <input
                            id={`brow-${i}-serial`}
                            placeholder="Serial (optional)"
                            value={row.serial}
                            onChange={(e) => updateRow(i, 'serial', e.target.value)}
                            onKeyDown={(e) => handleScanKeyDown(e, i, 2)}
                            className={`${inputClass} px-2 py-1.5`}
                          />
                        </>
                      ) : (
                        <>
                          <input
                            id={`brow-${i}-serial`}
                            placeholder="Serial number"
                            value={row.serial}
                            onChange={(e) => updateRow(i, 'serial', e.target.value)}
                            onKeyDown={(e) => handleScanKeyDown(e, i, 0)}
                            className={`${inputClass} px-2 py-1.5`}
                          />
                          <input
                            id={`brow-${i}-barcode`}
                            placeholder="Barcode (optional)"
                            value={row.barcode}
                            onChange={(e) => updateRow(i, 'barcode', e.target.value)}
                            onKeyDown={(e) => handleScanKeyDown(e, i, 1)}
                            className={`${inputClass} px-2 py-1.5`}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[12.5px] font-medium text-muted hover:border-accent/40 hover:text-accent"
              >
                <Plus size={14} /> Add another unit
              </button>
            </section>

            {/* ── Variant preview ── */}
            {variantGroups.length > 0 && (
              <section className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg/60 p-3">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                  Will create {variantGroups.length} variant{variantGroups.length > 1 ? 's' : ''} · {totalUnits} unit{totalUnits > 1 ? 's' : ''} total
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {variantGroups.map((g, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-muted"
                    >
                      {[g.color, g.ram, g.storage].filter(Boolean).join(' · ') || 'Base variant'}
                      {g.price ? ` · ₹${g.price}` : ''} — {g.count}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ── Shared image ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                Product image (shared across every variant)
              </label>
              <PhoneImagePicker value={imageUrl} onChange={setImageUrl} />
            </section>

            {/* ── Location ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                Location (applies to every unit above)
              </label>
              <div className="flex gap-2">
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value)}
                  className={`${inputClass} max-w-[120px]`}
                >
                  {LOCATION_TYPES.map((t) => (
                    <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
                <input
                  list="bulk-location-suggestions"
                  placeholder="Label, e.g. Rack 16, Drawer 3"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  className={inputClass}
                />
              </div>
              <datalist id="bulk-location-suggestions">
                {locations.map((l) => (
                  <option key={l.id} value={l.label} />
                ))}
              </datalist>
              <p className="text-[12px] text-muted">Leave label blank to add later.</p>
            </section>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : `Add ${totalUnits || rows.length} unit${(totalUnits || rows.length) > 1 ? 's' : ''}`}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
