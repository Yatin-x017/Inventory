import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Search, Package, Plus, Minus, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from './ui/Button'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function bestLocation(item) {
  const locs = item.item_locations ?? []
  return locs.reduce((best, l) => (!best || (l.quantity || 0) > (best.quantity || 0) ? l : best), null)
}

function stockFor(item) {
  return (item.item_locations ?? []).reduce((s, l) => s + (l.quantity || 0), 0)
}

const inputClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

export default function CreateBillModal({ onClose, onCreated }) {
  const { items, completeSale } = useStore()
  const [step, setStep] = useState('select') // 'select' | 'review'
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          item.brand?.toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [items, query])

  function pickItem(item) {
    const loc = bestLocation(item)
    const stock = stockFor(item)
    if (!loc || stock <= 0) {
      setError(`${item.name} is out of stock.`)
      return
    }
    setError('')
    setSelected({
      item_id: item.id,
      item_name: item.name,
      item_sku: item.sku || '',
      location_id: loc.locations?.id,
      location_label: loc.locations?.label,
      maxQty: loc.quantity,
    })
    setQuantity(1)
    setUnitPrice(Number(item.price) || 0)
    setStep('review')
  }

  function adjustQty(delta) {
    setQuantity((q) => Math.max(1, Math.min(q + delta, selected?.maxQty ?? 1)))
  }

  function backToSelect() {
    setStep('select')
    setSelected(null)
    setError('')
  }

  const total = unitPrice * quantity

  async function handleComplete() {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const billId = await completeSale({
        customerName,
        customerEmail: '',
        customerPhone,
        notes,
        cartLines: [
          {
            item_id: selected.item_id,
            item_name: selected.item_name,
            item_sku: selected.item_sku,
            unit_price: unitPrice,
            quantity,
            location_id: selected.location_id,
            location_label: selected.location_label,
          },
        ],
      })
      onCreated?.({
        id: billId,
        lines: [{ ...selected, unit_price: unitPrice, quantity }],
        total,
        customerName,
        customerPhone,
        created_at: new Date().toISOString(),
      })
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
          <div className="flex items-center gap-2">
            {step === 'review' && (
              <button
                type="button"
                onClick={backToSelect}
                className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="text-[15px] font-semibold">
              {step === 'select' ? 'Create a Bill' : 'Bill details'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        {step === 'select' && (
          <div className="flex flex-col gap-3 px-5 py-5">
            <p className="text-[13px] text-muted">Search for the product you're billing.</p>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                placeholder="Search items by name, SKU, or brand…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>

            {query.trim() ? (
              <div className="flex flex-col gap-2">
                {results.length === 0 && (
                  <p className="px-1 text-[13px] text-muted">No items match "{query}".</p>
                )}
                {results.map((item) => {
                  const stock = stockFor(item)
                  return (
                    <button
                      key={item.id}
                      onClick={() => pickItem(item)}
                      disabled={stock <= 0}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                          <Package size={16} />
                        </span>
                        <div>
                          <div className="text-[13.5px] font-medium">{item.name}</div>
                          <div className="text-[12px] text-muted">
                            {item.brand ? `${item.brand} · ` : ''}
                            {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold">{formatMoney(item.price)}</span>
                        <Plus size={15} className="text-accent" />
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center text-[13px] text-muted">
                Start typing to find a product.
              </div>
            )}

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        )}

        {step === 'review' && selected && (
          <div className="flex flex-col gap-5 px-5 py-5">
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">{selected.item_name}</div>
                  <div className="text-[12px] text-muted">{selected.location_label}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => adjustQty(-1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:text-text"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-7 text-center text-[13.5px] font-medium">{quantity}</span>
                  <button
                    onClick={() => adjustQty(1)}
                    disabled={quantity >= selected.maxQty}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[12px] text-muted">₹</span>
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
                    className="w-20 rounded-md border border-border bg-bg px-1.5 py-1 text-right text-[13px] outline-none focus:border-accent"
                  />
                </div>
                <span className="text-[13.5px] font-semibold">{formatMoney(unitPrice * quantity)}</span>
              </div>
            </div>

            <section className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Customer</label>
              <input
                placeholder="Customer name (optional)"
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
              <input
                placeholder="Note (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
              />
            </section>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-[13.5px] font-medium text-muted">Total</span>
              <span className="text-[19px] font-semibold">{formatMoney(total)}</span>
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        )}

        {step === 'review' && (
          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={backToSelect}>Back</Button>
            <Button onClick={handleComplete} disabled={saving}>
              {saving ? 'Completing…' : (
                <>
                  <CheckCircle2 size={15} /> Complete Sale
                </>
              )}
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  )
}
