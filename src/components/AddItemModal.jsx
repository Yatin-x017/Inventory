import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, ScanLine } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from './ui/Button'
import PhoneImagePicker from './PhoneImagePicker'

const LOCATION_TYPES = ['shelf', 'counter', 'box', 'custom']

const CATEGORIES = [
  { value: 'phone', label: 'Phone', serialized: true },
  { value: 'headphone', label: 'Headphone', serialized: true },
  { value: 'true_wireless_earphone', label: 'True Wireless Earphones', serialized: true },
  { value: 'repair_part', label: 'Repair Part', serialized: false },
  { value: 'accessory', label: 'Accessory', serialized: false },
  { value: 'other', label: 'Other', serialized: false },
]

function emptyUnit() {
  return { imei1: '', imei2: '', serial: '', barcode: '' }
}

function isCategorySerialized(category) {
  return CATEGORIES.find((c) => c.value === category)?.serialized ?? false
}

const inputClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

export default function AddItemModal({ item, onClose, onAdded }) {
  const { locations, tags, createItemWithDetails, updateItem, createSerializedProduct } = useStore()
  const isEdit = Boolean(item)

  const [category, setCategory] = useState('other')
  const serialized = !isEdit && isCategorySerialized(category)

  // ── Shared fields ──
  const [name, setName] = useState(item?.name ?? '')
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [sku, setSku] = useState(item?.sku ?? '')
  const [price, setPrice] = useState(item?.price ?? '')
  const [hsnCode, setHsnCode] = useState(item?.hsn_code ?? '85171300')
  const [gstRate, setGstRate] = useState(item?.gst_rate ?? 18)
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '')
  const [locationType, setLocationType] = useState('shelf')
  const [locationLabel, setLocationLabel] = useState('')

  // ── Legacy (non-serialized) only ──
  const [quantity, setQuantity] = useState(1)
  const [tagInput, setTagInput] = useState('')

  // ── Serialized only ──
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
  const [specRam, setSpecRam] = useState('')
  const [specStorage, setSpecStorage] = useState('')
  const [units, setUnits] = useState([emptyUnit()])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateUnit(index, field, value) {
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, [field]: value } : u)))
  }

  function addUnitRow() {
    setUnits((prev) => [...prev, emptyUnit()])
  }

  function removeUnitRow(index) {
    setUnits((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  // Barcode-scanner-friendly: Enter jumps to the next field in the row, or
  // to the next row's first field, or adds a new row if it's the last one.
  function handleScanKeyDown(e, rowIndex, fieldOrder, fieldIndex) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const nextField = fieldOrder[fieldIndex + 1]
    if (nextField) {
      document.getElementById(`unit-${rowIndex}-${nextField}`)?.focus()
      return
    }
    if (rowIndex === units.length - 1) {
      addUnitRow()
      setTimeout(() => document.getElementById(`unit-${rowIndex + 1}-${fieldOrder[0]}`)?.focus(), 0)
    } else {
      document.getElementById(`unit-${rowIndex + 1}-${fieldOrder[0]}`)?.focus()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (serialized) {
      if (!brand.trim() || !model.trim()) {
        setError('Brand and model are required.')
        return
      }
      const requiresImei = category === 'phone'
      const cleanUnits = units.filter(
        (u) => u.imei1.trim() || u.imei2.trim() || u.serial.trim() || u.barcode.trim()
      )
      if (cleanUnits.length === 0) {
        setError(requiresImei ? 'Scan at least one IMEI.' : 'Scan at least one serial number.')
        return
      }
      if (requiresImei && cleanUnits.some((u) => !u.imei1.trim())) {
        setError('IMEI 1 is required for every unit.')
        return
      }
      setSaving(true)
      try {
        await createSerializedProduct({
          category,
          brand,
          model,
          color,
          sku,
          price,
          costPrice,
          warrantyMonths,
          specs: { ram: specRam || undefined, storage: specStorage || undefined },
          config: {},
          hsnCode,
          gstRate,
          imageUrl,
          locationType,
          locationLabel,
          units: cleanUnits,
        })
        onAdded?.()
        onClose()
      } catch (err) {
        setError(err.message)
        setSaving(false)
      }
      return
    }

    if (!name.trim()) {
      setError('Item name is required.')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await updateItem(item.id, {
          name: name.trim(),
          sku: sku.trim() || null,
          brand: brand.trim() || null,
          price: Number(price) || 0,
          hsn_code: hsnCode.trim() || null,
          gst_rate: Number(gstRate) || 0,
          image_url: imageUrl.trim() || null,
        })
        onAdded?.()
      } else {
        await createItemWithDetails({
          name: name.trim(),
          sku,
          brand,
          price: Number(price) || 0,
          hsnCode,
          gstRate,
          image_url: imageUrl.trim() || null,
          locationType,
          locationLabel,
          quantity: Number(quantity) || 1,
          tagNames: tagInput.split(',').map((t) => t.trim()).filter(Boolean),
        })
        onAdded?.()
      }
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
          <h2 className="text-[15px] font-semibold">{isEdit ? 'Edit item' : 'Add item'}</h2>
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

            {/* ── Category ── */}
            {!isEdit && (
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
                {serialized && (
                  <p className="text-[12px] text-muted">
                    This category is IMEI/serial tracked — one entry will be created per unit scanned below.
                  </p>
                )}
              </section>
            )}

            {/* ── Details ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Details</label>
              {serialized ? (
                <>
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
                    <input
                      placeholder="Color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className={`${inputClass} max-w-[120px]`}
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
                      placeholder="RAM, e.g. 8GB"
                      value={specRam}
                      onChange={(e) => setSpecRam(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      placeholder="Storage, e.g. 128GB"
                      value={specStorage}
                      onChange={(e) => setSpecStorage(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="number" min="0"
                      placeholder="Warranty (months)"
                      value={warrantyMonths}
                      onChange={(e) => setWarrantyMonths(e.target.value)}
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
                  </div>
                </>
              ) : (
                <>
                  <input
                    autoFocus
                    placeholder="Item name, e.g. iPhone 16 Pro"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <input
                      placeholder="Brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      placeholder="SKU"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="₹ Price"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className={`${inputClass} max-w-[110px]`}
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
                  </div>
                </>
              )}
            </section>

            {/* ── Unit scan (serialized only) ── */}
            {serialized && (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                    Scan units ({units.length})
                  </label>
                  <span className="flex items-center gap-1 text-[11.5px] text-muted">
                    <ScanLine size={13} /> Enter jumps to next field
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {units.map((unit, i) => {
                    const fieldOrder = category === 'phone'
                      ? ['imei1', 'imei2', 'serial']
                      : ['serial', 'barcode']
                    return (
                      <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border p-2">
                        <span className="w-5 shrink-0 text-center text-[11.5px] text-muted">{i + 1}</span>
                        <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {category === 'phone' && (
                            <>
                              <input
                                id={`unit-${i}-imei1`}
                                placeholder="IMEI 1"
                                value={unit.imei1}
                                onChange={(e) => updateUnit(i, 'imei1', e.target.value)}
                                onKeyDown={(e) => handleScanKeyDown(e, i, fieldOrder, 0)}
                                className={`${inputClass} px-2 py-1.5`}
                              />
                              <input
                                id={`unit-${i}-imei2`}
                                placeholder="IMEI 2 (optional)"
                                value={unit.imei2}
                                onChange={(e) => updateUnit(i, 'imei2', e.target.value)}
                                onKeyDown={(e) => handleScanKeyDown(e, i, fieldOrder, 1)}
                                className={`${inputClass} px-2 py-1.5`}
                              />
                              <input
                                id={`unit-${i}-serial`}
                                placeholder="Serial (optional)"
                                value={unit.serial}
                                onChange={(e) => updateUnit(i, 'serial', e.target.value)}
                                onKeyDown={(e) => handleScanKeyDown(e, i, fieldOrder, 2)}
                                className={`${inputClass} px-2 py-1.5`}
                              />
                            </>
                          )}
                          {category !== 'phone' && (
                            <>
                              <input
                                id={`unit-${i}-serial`}
                                placeholder="Serial number"
                                value={unit.serial}
                                onChange={(e) => updateUnit(i, 'serial', e.target.value)}
                                onKeyDown={(e) => handleScanKeyDown(e, i, fieldOrder, 0)}
                                className={`${inputClass} px-2 py-1.5`}
                              />
                              <input
                                id={`unit-${i}-barcode`}
                                placeholder="Barcode (optional)"
                                value={unit.barcode}
                                onChange={(e) => updateUnit(i, 'barcode', e.target.value)}
                                onKeyDown={(e) => handleScanKeyDown(e, i, fieldOrder, 1)}
                                className={`${inputClass} px-2 py-1.5`}
                              />
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeUnitRow(i)}
                          disabled={units.length === 1}
                          className="shrink-0 rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={addUnitRow}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[12.5px] font-medium text-muted hover:border-accent/40 hover:text-accent"
                >
                  <Plus size={14} /> Add another unit
                </button>
              </section>
            )}

            {/* ── Product Image ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                {serialized ? 'Product Image' : 'Phone Image'}
              </label>
              <PhoneImagePicker
                value={imageUrl}
                onChange={setImageUrl}
                prefillQuery={serialized ? `${brand} ${model}` : name}
              />
            </section>

            {/* ── Location & Tags (add only) ── */}
            {isEdit ? (
              <p className="text-[12.5px] text-muted">
                Locations and tags are edited directly from the table below.
              </p>
            ) : (
              <>
                <section className="flex flex-col gap-2">
                  <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                    {serialized ? 'Location (applies to every unit above)' : 'Location'}
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
                      list="location-suggestions"
                      placeholder="Label, e.g. Rack 16, Drawer 3"
                      value={locationLabel}
                      onChange={(e) => setLocationLabel(e.target.value)}
                      className={inputClass}
                    />
                    {!serialized && (
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className={`${inputClass} max-w-[72px]`}
                      />
                    )}
                  </div>
                  <datalist id="location-suggestions">
                    {locations.map((l) => (
                      <option key={l.id} value={l.label} />
                    ))}
                  </datalist>
                  <p className="text-[12px] text-muted">Leave label blank to add later.</p>
                </section>

                {!serialized && (
                  <section className="flex flex-col gap-2">
                    <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Tags</label>
                    <input
                      list="tag-suggestions"
                      placeholder="e.g. iPhone, Samsung, Android — comma separated"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      className={inputClass}
                    />
                    <datalist id="tag-suggestions">
                      {tags.map((t) => (
                        <option key={t.id} value={t.name} />
                      ))}
                    </datalist>
                  </section>
                )}
              </>
            )}

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : serialized ? `Add ${units.length} unit${units.length > 1 ? 's' : ''}` : 'Add item'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
