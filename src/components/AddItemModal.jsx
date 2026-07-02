import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from './ui/Button'
import PhoneImagePicker from './PhoneImagePicker'

const LOCATION_TYPES = ['shelf', 'counter', 'box', 'custom']

export default function AddItemModal({ item, onClose, onAdded }) {
  const { locations, tags, createItemWithDetails, updateItem } = useStore()
  const isEdit = Boolean(item)
  const [name, setName] = useState(item?.name ?? '')
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [sku, setSku] = useState(item?.sku ?? '')
  const [price, setPrice] = useState(item?.price ?? '')
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '')
  const [locationType, setLocationType] = useState('shelf')
  const [locationLabel, setLocationLabel] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Item name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await updateItem(item.id, {
          name: name.trim(),
          sku: sku.trim() || null,
          brand: brand.trim() || null,
          price: Number(price) || 0,
          image_url: imageUrl.trim() || null,
        })
        onAdded?.()
      } else {
        await createItemWithDetails({
          name: name.trim(),
          sku,
          brand,
          price: Number(price) || 0,
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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[520px] sm:rounded-2xl"
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

            {/* ── Details ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Details</label>
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
            </section>

            {/* ── Phone Image ── */}
            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Phone Image</label>
              <PhoneImagePicker
                value={imageUrl}
                onChange={setImageUrl}
                prefillQuery={name}
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
                  <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Location</label>
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
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className={`${inputClass} max-w-[72px]`}
                    />
                  </div>
                  <datalist id="location-suggestions">
                    {locations.map((l) => (
                      <option key={l.id} value={l.label} />
                    ))}
                  </datalist>
                  <p className="text-[12px] text-muted">Leave label blank to add later.</p>
                </section>

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
              </>
            )}

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
