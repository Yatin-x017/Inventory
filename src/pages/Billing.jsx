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

  // ─── NEW: Add a serialized unit to the cart ───
  function addSerializedToCart(product, units) {
    const available = units.filter((u) => !u.sold_at && !u.reserved_at)
    const unit = available[0]
    if (!unit) {
      setError(`${product.brand} ${product.model} is out of stock.`)
      return
    }
    setError('')
    const label = `${product.brand} ${product.model} ${product.color || ''}`.trim()
    setCart((prev) => {
      const existing = prev.find((l) => l.item_id === unit.id)
      if (existing) {
        // Serialized items are always qty 1; ignore duplicate clicks
        return prev
      }
      return [
        ...prev,
        {
          item_id: unit.id,                 // unique inventory unit id
          item_name: label,
          item_sku: product.sku ?? '',
          unit_price: Number(product.price) || 0,
          quantity: 1,
          location_id: unit.location_id,
          location_label: unit.location_label,
          maxQty: 1,                        // serialized = always 1
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
        cartLines: cart.map(({ maxQty, ...line }) => line),
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
                  const available = units.filter((u) => !u.sold_at && !u.reserved_at)
                  const stock = available.length
                  const label = `${product.brand} ${product.model} ${product.color || ''}`.trim()
                  const outOfStock = stock <= 0
                  return (
                    <div
                      key={`serialized-${product.id}`}
                      className={`flex items
