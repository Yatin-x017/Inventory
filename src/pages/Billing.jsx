import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  Package,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import ReceiptModal from '../components/ReceiptModal'
import { generateAndStoreInvoicePdf } from '../lib/invoicePdf'

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
  const { items, bills, loading, billsLoading, fetchAll, fetchBills, completeSale, voidBill, resendBillEmail, searchCatalog, openQuickBill } = useStore()
  const { canManageInventory } = useAuth()
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [emiCompany, setEmiCompany] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
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
    if (!query.trim()) return []
    return searchCatalog(query).slice(0, 12)
  }, [searchCatalog, query])

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

  // ─── Add a serialized unit to the cart ───
  function addSerializedToCart(product, units) {
    if (!Array.isArray(units) || units.length === 0) {
      setError('No units available for this product.')
      return
    }
    const available = units.filter((u) => !u.sold_at && !u.reserved_at)
    const unit = available[0]
    if (!unit) {
      setError(`${product?.brand || ''} ${product?.model || ''} is out of stock.`.trim())
      return
    }
    setError('')
    const label = `${product?.brand || ''} ${product?.model || ''} ${product?.color || ''}`.trim()
    setCart((prev) => {
      const existing = prev.find((l) => l.item_id === unit.id)
      if (existing) return prev // serialized = qty 1, ignore duplicates
      return [
        ...prev,
        {
          item_id: unit.id,
          item_name: label,
          item_sku: product?.sku ?? '',
          unit_price: Number(product?.price) || 0,
          quantity: 1,
          location_id: unit.location_id,
          location_label: unit.location_label,
          maxQty: 1,
          serial: unit.serial,
          imei1: unit.imei1,
          imei2: unit.imei2,
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

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0)
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal)
  const total = subtotal - discountValue
  const paidAmountValue = Math.min(Math.max(Number(paidAmount) || 0, 0), total)
  const dueAmount = Math.max(total - paidAmountValue, 0)

  useEffect(() => {
    if (!paidAmountTouched) setPaidAmount(total > 0 ? String(total) : '0')
  }, [total, paidAmountTouched])

  async function handleCheckout() {
    if (cart.length === 0) return
    if (!customerName.trim()) {
      setError('Customer name is required.')
      return
    }
    if (!customerPhone.trim()) {
      setError('Customer phone number is required.')
      return
    }
    if (!paymentMethod) {
      setError('Select a payment method.')
      return
    }
    if (paymentMethod === 'emi' && !emiCompany.trim()) {
      setError('Enter the EMI company/provider.')
      return
    }
    if (discount.trim() === '' || Number.isNaN(Number(discount))) {
      setError('Enter a discount amount (0 if none).')
      return
    }
    if (paidAmount.trim() === '' || Number.isNaN(Number(paidAmount))) {
      setError('Enter a paid amount (0 if fully pay-later).')
      return
    }
    if (!purchaseDate) {
      setError('Select a date of purchase.')
      return
    }
    setCheckingOut(true)
    setError('')
    try {
      const sale = await completeSale({
        customerName,
        customerEmail,
        customerPhone,
        notes,
        cartLines: cart.map(({ maxQty, serial, imei1, imei2, ...line }) => line),
        discount: discountValue,
        paymentMethod,
        emiCompany,
        paidAmount: paidAmountValue,
        saleDate: purchaseDate,
      })
      const receiptForInvoice = {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        lines: sale.lines ?? cart,
        subtotal: sale.subtotal ?? subtotal,
        discount: sale.discount ?? discountValue,
        paymentMethod: sale.paymentMethod ?? paymentMethod,
        emiCompany: sale.emiCompany ?? (paymentMethod === 'emi' ? emiCompany : null),
        total: sale.total ?? total,
        paidAmount: sale.paidAmount ?? paidAmountValue,
        dueAmount: sale.dueAmount ?? dueAmount,
        customerName,
        customerPhone,
        created_at: sale.createdAt || new Date().toISOString(),
        saleDate: sale.saleDate || purchaseDate,
      }
      setReceipt(receiptForInvoice)
      generateAndStoreInvoicePdf(receiptForInvoice)
      setCart([])
      setCustomerName('')
      setCustomerEmail('')
      setCustomerPhone('')
      setDiscount('0')
      setPaymentMethod('')
      setEmiCompany('')
      setPaidAmount('')
      setPaidAmountTouched(false)
      setNotes('')
      setPurchaseDate(new Date().toISOString().slice(0, 10))
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
    <>
    <div className="flex flex-col gap-6 print:hidden">
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
              {results.map((result) => {
                if (result.kind === 'serialized') {
                  const { product, units } = result
                  const available = units?.filter?.((u) => !u.sold_at && !u.reserved_at) ?? []
                  const stock = available.length
                  const label = `${product?.brand || ''} ${product?.model || ''} ${product?.color || ''}`.trim()
                  const outOfStock = stock <= 0
                  return (
                    <div
                      key={`serialized-${product?.id}`}
                      className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-card ${
                        outOfStock ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                          <Package size={16} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium">{label}</div>
                          <div className="text-[12px] text-muted">
                            {stock > 0 ? `${stock} in stock · IMEI/serial` : 'Out of stock'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[13.5px] font-semibold">{formatMoney(product?.price)}</span>
                        <button
                          onClick={() => addSerializedToCart(product, units)}
                          disabled={outOfStock}
                          className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Add to cart"
                        >
                          <ShoppingCart size={13} />
                          Add
                        </button>
                        <button
                          onClick={() => openQuickBill(query)}
                          disabled={outOfStock}
                          className="flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                          title="Quick bill (single item)"
                        >
                          <Zap size={13} />
                          Buy Now
                        </button>
                      </div>
                    </div>
                  )
                }

                const item = result.item
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
                        {b.payment_method ? ` · ${b.payment_method.toUpperCase()}` : ''}
                        {b.created_at ? ` · ${new Date(b.created_at).toLocaleString('en-IN')}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {isVoid ? (
                        <Badge tone="neutral">Voided</Badge>
                      ) : (
                        <span className="text-[13.5px] font-semibold">{formatMoney(b.total ?? lineTotal)}</span>
                      )}
                      {!isVoid && b.due_amount > 0 && (
                        <Badge tone="warning">{formatMoney(b.due_amount)} due</Badge>
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
                      {(l.imei1 || l.serial) && (
                        <div className="mt-0.5 text-[11px] font-mono text-muted">
                          {l.imei1 ? `IMEI: ${l.imei1}` : `S/N: ${l.serial}`}
                        </div>
                      )}
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
                  placeholder="Customer name *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
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
                  placeholder="Phone *"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                />
                <div>
                  <label className="mb-1 block px-0.5 text-[11.5px] font-medium text-muted">
                    Date of purchase
                  </label>
                  <input
                    type="date"
                    value={purchaseDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-accent">
                    <span className="text-[12px] text-muted">₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Discount *"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      required
                      className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
                    />
                  </div>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    required
                    className={`flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent ${
                      paymentMethod ? 'text-text' : 'text-muted'
                    }`}
                  >
                    <option value="" disabled>Payment method *</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="netbanking">NetBanking</option>
                    <option value="emi">EMI</option>
                  </select>
                </div>
                {paymentMethod === 'emi' && (
                  <input
                    placeholder="EMI company / provider *"
                    value={emiCompany}
                    onChange={(e) => setEmiCompany(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                  />
                )}
                <div>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-accent">
                    <span className="text-[12px] text-muted">₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Paid amount *"
                      value={paidAmount}
                      onChange={(e) => { setPaidAmountTouched(true); setPaidAmount(e.target.value) }}
                      required
                      className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
                    />
                  </div>
                  <p className="mt-1 px-0.5 text-[11.5px] text-muted">
                    {dueAmount > 0
                      ? `₹${dueAmount.toLocaleString('en-IN')} left unpaid — customer will be added to Pay Later Customers.`
                      : 'Full amount collected now.'}
                  </p>
                </div>
                <input
                  placeholder="Note (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-muted">Subtotal</span>
                  <span className="text-[13px]">{formatMoney(subtotal)}</span>
                </div>
                {discountValue > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-muted">Discount</span>
                    <span className="text-[13px] text-danger">-{formatMoney(discountValue)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-medium text-muted">Total</span>
                  <span className="text-[19px] font-semibold">{formatMoney(total)}</span>
                </div>
                {dueAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-warning">Due (pay later)</span>
                    <span className="text-[13px] font-medium text-warning">{formatMoney(dueAmount)}</span>
                  </div>
                )}
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
    </div>

    {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}
