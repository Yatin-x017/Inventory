import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Package, MapPin, Tag as TagIcon, Pencil } from 'lucide-react'

function pluralize(name) {
  return /s$/i.test(name) ? name : `${name}s`
}

export default function ItemDetailModal({ item, onClose, onEdit }) {
  if (!item) return null

  const locations = item.item_locations ?? []
  const tags = item.item_tags?.map((t) => t.tags?.name).filter(Boolean) ?? []
  const totalQty = locations.reduce((s, l) => s + (l.quantity || 0), 0)

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
        className="glass max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-border pb-[env(safe-area-inset-bottom)] shadow-card-hover sm:max-w-[460px] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Package size={20} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold leading-tight">{item.name}</h2>
              <p className="mt-0.5 truncate text-[12.5px] text-muted">
                {item.brand || 'No brand'} {item.sku && `· SKU ${item.sku}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <section>
            <div className="mb-1.5 flex items-center justify-between text-[12px] text-muted">
              <span>Total stock</span>
              <span className="font-medium text-text">{totalQty} available</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, totalQty * 8)}%` }} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              <MapPin size={12} /> Where it lives
            </h3>
            {locations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[13px] text-muted">
                No location on record yet — add one from the Inventory page.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {locations.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg/60 px-3 py-2.5"
                  >
                    <span className="text-[13px] text-text">
                      <span className="font-semibold text-accent">{l.quantity}</span>{' '}
                      {l.quantity === 1 ? item.name : pluralize(item.name)} at{' '}
                      <span className="font-medium">{l.locations?.label || 'unlabeled'}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium capitalize text-accent">
                      {l.locations?.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tags.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <TagIcon size={12} /> Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-bg px-2.5 py-1 text-[12px] font-medium text-text">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {onEdit && (
          <div className="flex justify-end border-t border-border px-5 py-4">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Pencil size={14} /> Edit details
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  )
}
