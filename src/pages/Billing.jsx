import { useEffect, useMemo, useState } from 'react'
import {
  Receipt,
  Search,
  Package,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Printer,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'

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

export default function Billing() {
  const { items, bills, loading, billsLoading, fetchAll, fetchBills, completeSale, voidBill, resendBillEmail } = useStore()
  const { canManageInventory } = useAuth()
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [resendingId, setResendingId] = useState(null)
  const [notes, setNotes] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    fetchAll()
    fetchBills()
  }, [])

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

  function addToCart(item) {
    const loc = bestLocation(item)
    const available = stockFor(item)
    if (!loc || available <= 0) {
      setError(`${item.name} is out of stock.`)
      return
    }
    setError('')
    setCart((prev) => {
      const existing = prev.find((l) => l.item_id === item.id)
      if (existing) {
        if (existing.quantity >= loc.quantity) return prev
        return prev.map((l) => (l.item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [
        ...prev,
        {
          item_id: item.id,
          item_name: item.name,
          item_sku: item.sku || '',
          unit_price: Number(item.price) || 0,
          quantity: 1,
          location_id: loc.locations?.id,
          location_label: loc.locations?.label,
          maxQty: loc.quantity,
        },
      ]
    })
  }

  function updateQty(itemId, qty) {
    setCart((prev) =>
      prev.map((l) =>
        l.item_id === itemId ? { ...l, quantity: Math.max(1, Math.min(qty, l.maxQty)) } : l
      )
    )
  }

  function updatePrice(itemId, price) {
    setCart((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, unit_price: Math.max(0, price) } : l)))
  }

  function removeLine(itemId) {
    setCart((prev) => prev.filter((l) => l.item_id !== itemId))
  }

  const total = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0)

  async function handleCheckout() {
    if (cart.length === 0) return
    setCheckingOut(true)
    setError('')
    try {
      const billId = await completeSale({
        customerName,
        customerEmail,
        customerPhone,
        notes,
        cartLines: cart.map(({ maxQty, ...line }) => line),
      })
      setReceipt({
        id: billId,
        lines: cart,
        total,
        customerName,
        customerPhone,
        created_at: new Date().toISOString(),
      })
      setCart([])
      setCustomerName('')
      setCustomerEmail('')
      setCustomerPhone('')
      setNotes('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckingOut(false)
    }
  }

  async function handleVoid(billId) {
    if (!confirm('Void this sale? Stock will be restored.')) return
    try {
      await voidBill(billId)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResendEmail(bill) {
    setResendingId(bill.id)
    try {
      await resendBillEmail(bill)
    } catch (err) {
      setError(err.message)
    } finally {
      setResendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-[13.5px] text-muted">Ring up a sale and print a receipt.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Item search + results */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              placeholder="Search items by name, SKU, or brand…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
          </div>

          {query.trim() && (
            <div className="flex flex-col gap-2">
              {results.length === 0 && (
                <p className="px-1 text-[13px] text-muted">No items match "{query}".</p>
              )}
              {results.map((item) => {
                const stock = stockFor(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
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
          )}

          {!query.trim() && (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center text-[13px] text-muted">
              Start typing to find an item and add it to the cart.
            </div>
          )}

          {/* Recent sales */}
          <div className="mt-2">
            <h2 className="mb-2 text-[13.5px] font-semibold">Recent Sales</h2>
            {billsLoading && <p className="text-[13px] text-muted">Loading…</p>}
            {!billsLoading && bills.length === 0 && (
              <p className="text-[13px] text-muted">No sales recorded yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {bills.slice(0, 10).map((b) => {
                const lineTotal = (b.bill_items ?? []).reduce(
                  (s, li) => s + (li.unit_price || 0) * (li.quantity || 0),
                  0
                )
                const isVoid = b.status === 'void' || b.voided
                return (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-card ${
                      isVoid ? 'opacity-50' : ''
                    }`}
                  >
                    <div>
                      <div className="text-[13px] font-medium">
                        {b.customer_name?.trim() || 'Walk-in customer'}
                      </div>
                      <div className="text-[12px] text-muted">
                        {(b.bill_items ?? []).length} item
                        {(b.bill_items ?? []).length === 1 ? '' : 's'}
                        {b.created_at ? ` · ${new Date(b.created_at).toLocaleString('en-IN')}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {isVoid ? (
                        <Badge tone="neutral">Voided</Badge>
                      ) : (
                        <span className="text-[13.5px] font-semibold">{formatMoney(b.total ?? lineTotal)}</span>
                      )}
                      {!isVoid && b.email_status === 'sent' && <Badge tone="success">Emailed</Badge>}
                      {!isVoid && b.email_status === 'pending' && <Badge tone="warning">Sending…</Badge>}
                      {!isVoid && b.email_status === 'failed' && (
                        <>
                          <Badge tone="danger">Email failed</Badge>
                          {canManageInventory && (
                            <button
                              onClick={() => handleResendEmail(b)}
                              disabled={resendingId === b.id}
                              className="rounded-md px-2 py-1 text-[11.5px] font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
                            >
                              {resendingId === b.id ? 'Sending…' : 'Send Again'}
                            </button>
                          )}
                        </>
                      )}
                      {!isVoid && canManageInventory && (
                        <button
                          onClick={() => handleVoid(b.id)}
                          className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                          aria-label="Void sale"
                        >
                          <XCircle size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Cart */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card lg:sticky lg:top-4 lg:h-fit">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-accent" />
            <h2 className="text-[14.5px] font-semibold">Cart</h2>
            {cart.length > 0 && <Badge tone="accent">{cart.length}</Badge>}
          </div>

          {cart.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Cart is empty" description="Search an item on the left to add it here." />
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((l) => (
                <div key={l.item_id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{l.item_name}</div>
                      <div className="text-[11.5px] text-muted">{l.location_label}</div>
                    </div>
                    <button
                      onClick={() => removeLine(l.item_id)}
                      className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      aria-label="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQty(l.item_id, l.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted hover:text-text"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-[13px] font-medium">{l.quantity}</span>
                      <button
                        onClick={() => updateQty(l.item_id, l.quantity + 1)}
                        disabled={l.quantity >= l.maxQty}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] text-muted">₹</span>
                      <input
                        type="number"
                        value={l.unit_price}
                        onChange={(e) => updatePrice(l.item_id, Number(e.target.value))}
                        className="w-16 rounded-md border border-border bg-bg px-1.5 py-1 text-right text-[13px] outline-none focus:border-accent"
                      />
                    </div>
                    <span className="text-[13px] font-semibold">{formatMoney(l.unit_price * l.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <>
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <input
                  placeholder="Customer name (optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                />
                <input
                  type="email"
                  placeholder="Email (optional, sends invoice)"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                />
                <input
                  placeholder="Phone (optional)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                />
                <input
                  placeholder="Note (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-[13.5px] font-medium text-muted">Total</span>
                <span className="text-[19px] font-semibold">{formatMoney(total)}</span>
              </div>

              {error && <p className="text-[13px] text-danger">{error}</p>}

              <Button onClick={handleCheckout} disabled={checkingOut} className="w-full justify-center">
                {checkingOut ? 'Completing…' : (
                  <>
                    <CheckCircle2 size={15} /> Complete Sale
                  </>
                )}
              </Button>
            </>
          )}
          {cart.length === 0 && error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      </div>

      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function ReceiptModal({ receipt, onClose }) {
  return (
    <div
      onMouseDown={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm print:static print:bg-transparent print:p-0"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-2xl border border-border bg-surface shadow-card-hover print:w-full print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-accent" />
            <h2 className="text-[15px] font-semibold">Sale complete</h2>
          </div>
          <button onClick={onClose} className="text-[13px] text-muted hover:text-text">
            Close
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="text-center text-[13px] text-muted">
            {new Date(receipt.created_at).toLocaleString('en-IN')}
          </div>
          {receipt.customerName && (
            <div className="mt-1 text-center text-[13.5px] font-medium">{receipt.customerName}</div>
          )}

          <div className="mt-4 flex flex-col gap-2 border-y border-dashed border-border py-3">
            {receipt.lines.map((l) => (
              <div key={l.item_id} className="flex items-center justify-between text-[13px]">
                <span className="min-w-0 truncate pr-2">
                  {l.item_name} × {l.quantity}
                </span>
                <span className="shrink-0 font-medium">{formatMoney(l.unit_price * l.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[14px] font-semibold">Total</span>
            <span className="text-[18px] font-semibold">{formatMoney(receipt.total)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4 print:hidden">
          <Button variant="secondary" onClick={onClose}>Done</Button>
          <Button onClick={() => window.print()}>
            <Printer size={15} /> Print
          </Button>
        </div>
      </div>
    </div>
  )
}
