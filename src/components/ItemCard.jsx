import { memo } from 'react'
import { Package, MapPin, Smartphone } from 'lucide-react'
import Badge from './ui/Badge'

const STATUS_TONE = {
  in_stock: 'success',
  reserved: 'accent',
  sold: 'neutral',
  returned: 'accent',
  defective: 'danger',
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

// Renders a card for either:
//  - a legacy `items` row:            <ItemCard item={item} onClick={...} />
//  - a serialized product + units:    <ItemCard product={product} units={units} onClick={...} />
function ItemCard({ item, product, units, onClick }) {
  if (product) return <SerializedProductCard product={product} units={units ?? []} onClick={onClick} />
  return <LegacyItemCard item={item} onClick={onClick} />
}

function CardShell({ onClick, children }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="group glass cursor-pointer rounded-2xl border border-border shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover active:translate-y-0 overflow-hidden"
    >
      {children}
    </div>
  )
}

function LegacyItemCard({ item, onClick }) {
  const locations = item.item_locations ?? []
  const tags = item.item_tags?.map((t) => t.tags?.name).filter(Boolean) ?? []
  const totalQty = locations.reduce((s, l) => s + (l.quantity || 0), 0)
  const hasImage = Boolean(item.image_url)
  const hasPrice = item.price != null && item.price > 0

  return (
    <CardShell onClick={onClick}>
      {/* Image strip */}
      {hasImage ? (
        <div className="flex h-36 items-center justify-center bg-surface border-b border-border">
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-contain p-3"
            onError={(e) => {
              e.target.parentElement.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center bg-accent-soft/30 border-b border-border">
          <Package size={28} className="text-accent/50" strokeWidth={1.5} />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14.5px] font-semibold leading-tight">{item.name}</h3>
            {item.brand && <div className="mt-0.5 truncate text-[12.5px] text-muted">{item.brand}</div>}
          </div>
          {hasPrice && (
            <span className="shrink-0 rounded-lg bg-success-soft px-2 py-0.5 text-[13px] font-semibold text-success">
              ₹{Number(item.price).toLocaleString('en-IN')}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {locations.length === 0 && <span className="text-[12px] text-muted">No location set</span>}
          {locations.map((loc, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent"
            >
              <MapPin size={11} />
              {loc.locations?.label} · {loc.quantity}
            </span>
          ))}
        </div>

        {totalQty > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>Stock</span>
              <span className="font-medium text-text">{totalQty} available</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, totalQty * 10)}%` }} />
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <Badge key={i} tone="neutral">{t}</Badge>
            ))}
          </div>
        )}
      </div>
    </CardShell>
  )
}

// Serialized product (phone / headphone / TWS): quantity is derived from
// how many inventory_units exist per status, not a single number, since
// each unit carries its own IMEI/serial and can be sold independently.
function SerializedProductCard({ product, units, onClick }) {
  const inStock = units.filter((u) => u.status === 'in_stock').length
  const sold = units.filter((u) => u.status === 'sold').length
  const hasImage = Boolean(product.image_url)
  const label = [product.brand, product.model].filter(Boolean).join(' ')
  const stockCapForBar = 10 // same visual scale as legacy card's 10-per-bar

  return (
    <CardShell onClick={onClick}>
      {hasImage ? (
        <div className="flex h-36 items-center justify-center bg-surface border-b border-border">
          <img
            src={product.image_url}
            alt={label}
            className="h-full w-full object-contain p-3"
            onError={(e) => {
              e.target.parentElement.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center bg-accent-soft/30 border-b border-border">
          <Smartphone size={26} className="text-accent/50" strokeWidth={1.5} />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14.5px] font-semibold leading-tight">{label}</h3>
            <div className="mt-0.5 truncate text-[12.5px] text-muted">
              {product.color ? `${product.color} · ` : ''}
              {product.category?.replace(/_/g, ' ')}
            </div>
          </div>
          {product.price > 0 && (
            <span className="shrink-0 rounded-lg bg-success-soft px-2 py-0.5 text-[13px] font-semibold text-success">
              {formatMoney(product.price)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone={inStock > 0 ? STATUS_TONE.in_stock : 'neutral'}>
            {inStock} in stock
          </Badge>
          {sold > 0 && <Badge tone="neutral">{sold} sold</Badge>}
          <Badge tone="accent">IMEI tracked</Badge>
        </div>

        {inStock > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>Stock</span>
              <span className="font-medium text-text">{inStock} available</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, inStock * stockCapForBar)}%` }} />
            </div>
          </div>
        )}
      </div>
    </CardShell>
  )
}

export default memo(ItemCard)
