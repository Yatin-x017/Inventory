import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Search, Package, Smartphone, Plus, Minus, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useScanKeyHandler } from '../hooks/useScanListener'
import { generateAndStoreInvoicePdf } from '../lib/invoicePdf'
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

function identifiersOf(unit) {
  const byType = {}
  for (const d of unit.device_identifiers ?? []) byType[d.identifier_type] = d.identifier_value
  return {
    imei1: byType.IMEI_1,
    imei2: byType.IMEI_2,
    serial: byType.SERIAL_NUMBER,
    barcode: byType.BARCODE,
  }
}

const inputClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

export default function CreateBillModal({ onClose, onCreated, initialQuery = '' }) {
  const { searchCatalog, completeSale, completeSerializedSale } = useStore()
  // 'select' -> pick a product/item
  // 'unit'   -> (serialized only, when >1 unit in stock) pick the exact IMEI/serial
  // 'review' -> confirm price + customer + complete
  const [step, setStep] = useState('select')
  const [query, setQuery] = useState(initialQuery)
  const [saleType, setSaleType] = useState(null) // 'legacy' | 'serialized'
  const [selected, setSelected] = useState(null) // legacy: {item_id, item_name, item_sku, location_id, location_label, maxQty}
  const [serializedProduct, setSerializedProduct] = useState(null)
  const [serializedUnit, setSerializedUnit] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [emiCompany, setEmiCompany] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // A scan (either the one that opened this modal, or one typed into the
  // search box below while it's already open) should jump straight to the
  // result instead of waiting for a click — but only when it resolves to
  // exactly one match. Ordinary manual typing never sets this flag, so it
  // never hijacks a click-driven search.
  const [pendingAutoSelect, setPendingAutoSelect] = useState(Boolean(initialQuery.trim()))

  const results = useMemo(() => {
    if (!query.trim()) return []
    return searchCatalog(query)
  }, [query, searchCatalog])

  const handleScanInSearch = useScanKeyHandler((code) => {
    setQuery(code)
    setPendingAutoSelect(true)
  })

  // Resolve a pending scan the moment its results are known. Runs once per
  // scan (pendingAutoSelect is cleared immediately) so it never re-fires
  // off the back of subsequent manual edits to the query.
  useEffect(() => {
    if (!pendingAutoSelect) return
    setPendingAutoSelect(false)
    if (step !== 'select' || results.length !== 1) return

    const result = results[0]
    if (result.kind === 'legacy') {
      pickLegacyItem(result.item)
      return
    }

    const { product, units } = result
    const scanned = query.trim().toLowerCase()
    const exactUnit = units.find((u) =>
      (u.device_identifiers ?? []).some((d) => d.identifier_value?.toLowerCase() === scanned)
    )
    pickSerializedProduct(product, units)
    // The scan matched one specific unit's IMEI/serial/barcode exactly, so
    // skip the "which unit" step too — there's no real ambiguity left.
    if (exactUnit) pickUnit(exactUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoSelect, results])

  function pickLegacyItem(item) {
    const loc = bestLocation(item)
    const stock = stockFor(item)
    if (!loc || stock <= 0) {
      setError(`${item.name} is out of stock.`)
      return
    }
    setError('')
    setSaleType('legacy')
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

  function pickSerializedProduct(product, units) {
    if (!units || units.length === 0) {
      setError(`${product.brand} ${product.model} has no units in stock.`)
      return
    }
    setError('')
    setSaleType('serialized')
    setSerializedProduct(product)
    setUnitPrice(Number(product.price) || 0)
    if (units.length === 1) {
      setSerializedUnit(units[0])
      setStep('review')
    } else {
      setStep('unit')
    }
  }

  function pickUnit(unit) {
    setSerializedUnit(unit)
    setStep('review')
  }

  function adjustQty(delta) {
    setQuantity((q) => Math.max(1, Math.min(q + delta, selected?.maxQty ?? 1)))
  }

  function backToSelect() {
    setStep('select')
    setSelected(null)
    setSerializedProduct(null)
    setSerializedUnit(null)
    setSaleType(null)
    setError('')
  }

  function backToUnitOrSelect() {
    if (saleType === 'serialized' && serializedProduct) {
      setSerializedUnit(null)
      setStep('unit')
    } else {
      backToSelect()
    }
  }

  const subtotal = saleType === 'serialized' ? unitPrice : unitPrice * quantity
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal)
  const total = subtotal - discountValue
  const paidAmountValue = Math.min(Math.max(Number(paidAmount) || 0, 0), total)
  const dueAmount = Math.max(total - paidAmountValue, 0)

  // Paid Amount defaults to "fully paid" and follows the total as the price/
  // discount are edited, right up until the cashier actually types into the
  // field themselves — after that it's their call.
  useEffect(() => {
    if (!paidAmountTouched) setPaidAmount(total > 0 ? String(total) : '0')
  }, [total, paidAmountTouched])

  async function handleComplete() {
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
    setSaving(true)
    setError('')
    try {
      if (saleType === 'legacy') {
        const sale = await completeSale({
          customerName,
          customerEmail,
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
          discount: discountValue,
          paymentMethod,
          emiCompany,
          paidAmount: paidAmountValue,
          saleDate: purchaseDate,
        })
        const receiptForInvoice = {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          lines: sale.lines ?? [{ ...selected, unit_price: unitPrice, quantity }],
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
        onCreated?.(receiptForInvoice)
        // Fire-and-forget, see src/lib/invoicePdf.js — never blocks the
        // already-saved sale above.
        generateAndStoreInvoicePdf(receiptForInvoice)
      } else {
        const ids = identifiersOf(serializedUnit)
        const sale = await completeSerializedSale({
          customerName,
          customerEmail,
          customerPhone,
          notes,
          unitId: serializedUnit.id,
          unitPrice,
          discount: discountValue,
          paymentMethod,
          emiCompany,
          paidAmount: paidAmountValue,
          saleDate: purchaseDate,
        })
        const receiptForInvoice = {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          lines: [
            {
              item_id: serializedUnit.id,
              item_name: `${serializedProduct.brand} ${serializedProduct.model} ${serializedProduct.color || ''}`.trim(),
              item_sku: serializedProduct.sku,
              unit_price: unitPrice,
              quantity: 1,
              location_label: serializedUnit.locations?.label,
              imei1: ids.imei1,
              imei2: ids.imei2,
              serial: ids.serial,
              hsn_code: sale.hsnCode ?? serializedProduct.hsn_code,
              gst_rate: sale.gstRate ?? serializedProduct.gst_rate ?? 18,
              config: sale.config ?? { ...(serializedProduct.specs || {}), color: serializedProduct.color || undefined },
            },
          ],
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
        onCreated?.(receiptForInvoice)
        // Fire-and-forget, see src/lib/invoicePdf.js — never blocks the
        // already-saved sale above.
        generateAndStoreInvoicePdf(receiptForInvoice)
      }
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const headerTitle =
    step === 'select' ? 'Create a Bill' : step === 'unit' ? 'Select unit to sell' : 'Bill details'

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
            {step !== 'select' && (
              <button
                type="button"
                onClick={step === 'review' ? backToUnitOrSelect : backToSelect}
                className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="text-[15px] font-semibold">{headerTitle}</h2>
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
            <p className="text-[13px] text-muted">Search by name, SKU, brand — or scan/type an IMEI or serial.</p>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                placeholder="Search items or scan IMEI…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleScanInSearch}
                className={`${inputClass} pl-10`}
              />
            </div>

            {query.trim() ? (
              <div className="flex flex-col gap-2">
                {results.length === 0 && (
                  <p className="px-1 text-[13px] text-muted">No matches for "{query}".</p>
                )}
                {results.map((result) => {
                  if (result.kind === 'legacy') {
                    const item = result.item
                    const stock = stockFor(item)
                    return (
                      <button
                        key={`legacy-${item.id}`}
                        onClick={() => pickLegacyItem(item)}
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
                  }
                  const { product, units } = result
                  const label = `${product.brand} ${product.model} ${product.color || ''}`.trim()
                  return (
                    <button
                      key={`product-${product.id}`}
                      onClick={() => pickSerializedProduct(product, units)}
                      disabled={units.length === 0}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                          <Smartphone size={16} />
                        </span>
                        <div>
                          <div className="text-[13.5px] font-medium">{label}</div>
                          <div className="text-[12px] text-muted">
                            {units.length > 0 ? `${units.length} in stock · IMEI tracked` : 'Out of stock'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold">{formatMoney(product.price)}</span>
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

        {step === 'unit' && serializedProduct && (
          <div className="flex flex-col gap-2 px-5 py-5">
            <p className="text-[13px] text-muted">
              Multiple {serializedProduct.brand} {serializedProduct.model} units in stock — pick the exact one being sold.
            </p>
            {(useStore.getState().inventoryUnits.filter((u) => u.product_id === serializedProduct.id && u.status === 'in_stock')).map((unit) => {
              const ids = identifiersOf(unit)
              return (
                <button
                  key={unit.id}
                  onClick={() => pickUnit(unit)}
                  className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover"
                >
                  {ids.imei1 && <div className="text-[13px] font-medium">IMEI 1: {ids.imei1}</div>}
                  {ids.imei2 && <div className="text-[12px] text-muted">IMEI 2: {ids.imei2}</div>}
                  {ids.serial && <div className="text-[12px] text-muted">Serial: {ids.serial}</div>}
                  {unit.locations?.label && (
                    <div className="mt-1 text-[11.5px] text-muted">📍 {unit.locations.label}</div>
                  )}
                </button>
              )
            })}
            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        )}

        {step === 'review' && saleType === 'legacy' && selected && (
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

            <CustomerFields
              customerName={customerName} setCustomerName={setCustomerName}
              customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
              customerEmail={customerEmail} setCustomerEmail={setCustomerEmail}
              discount={discount} setDiscount={setDiscount}
              paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
              emiCompany={emiCompany} setEmiCompany={setEmiCompany}
              paidAmount={paidAmount}
              setPaidAmount={(v) => { setPaidAmountTouched(true); setPaidAmount(v) }}
              total={total}
              notes={notes} setNotes={setNotes}
              purchaseDate={purchaseDate} setPurchaseDate={setPurchaseDate}
            />

            <div className="flex flex-col gap-1 border-t border-border pt-3">
              {discountValue > 0 && (
                <>
                  <div className="flex items-center justify-between text-[12.5px] text-muted">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] text-danger">
                    <span>Discount</span>
                    <span>-{formatMoney(discountValue)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-medium text-muted">Total</span>
                <span className="text-[19px] font-semibold">{formatMoney(total)}</span>
              </div>
              {dueAmount > 0 && (
                <div className="flex items-center justify-between text-[12.5px] text-warning">
                  <span>Due (pay later)</span>
                  <span className="font-medium">{formatMoney(dueAmount)}</span>
                </div>
              )}
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        )}

        {step === 'review' && saleType === 'serialized' && serializedProduct && serializedUnit && (
          <div className="flex flex-col gap-5 px-5 py-5">
            <div className="rounded-xl border border-border p-3">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium">
                  {serializedProduct.brand} {serializedProduct.model} {serializedProduct.color || ''}
                </div>
                <div className="mt-1 flex flex-col gap-0.5 text-[12px] text-muted">
                  {(() => {
                    const ids = identifiersOf(serializedUnit)
                    return (
                      <>
                        {ids.imei1 && <span>IMEI 1: {ids.imei1}</span>}
                        {ids.imei2 && <span>IMEI 2: {ids.imei2}</span>}
                        {ids.serial && <span>Serial: {ids.serial}</span>}
                      </>
                    )
                  })()}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-muted">Sale price</span>
                <div className="flex items-center gap-1">
                  <span className="text-[12px] text-muted">₹</span>
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
                    className="w-24 rounded-md border border-border bg-bg px-1.5 py-1 text-right text-[13px] outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>

            <CustomerFields
              customerName={customerName} setCustomerName={setCustomerName}
              customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
              customerEmail={customerEmail} setCustomerEmail={setCustomerEmail}
              discount={discount} setDiscount={setDiscount}
              paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
              emiCompany={emiCompany} setEmiCompany={setEmiCompany}
              paidAmount={paidAmount}
              setPaidAmount={(v) => { setPaidAmountTouched(true); setPaidAmount(v) }}
              total={total}
              notes={notes} setNotes={setNotes}
              purchaseDate={purchaseDate} setPurchaseDate={setPurchaseDate}
            />

            <div className="flex flex-col gap-1 border-t border-border pt-3">
              {discountValue > 0 && (
                <>
                  <div className="flex items-center justify-between text-[12.5px] text-muted">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] text-danger">
                    <span>Discount</span>
                    <span>-{formatMoney(discountValue)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-medium text-muted">Total</span>
                <span className="text-[19px] font-semibold">{formatMoney(total)}</span>
              </div>
              {dueAmount > 0 && (
                <div className="flex items-center justify-between text-[12.5px] text-warning">
                  <span>Due (pay later)</span>
                  <span className="font-medium">{formatMoney(dueAmount)}</span>
                </div>
              )}
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        )}

        {step === 'review' && (
          <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={backToUnitOrSelect}>Back</Button>
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

function CustomerFields({
  customerName, setCustomerName,
  customerPhone, setCustomerPhone,
  customerEmail, setCustomerEmail,
  discount, setDiscount,
  paymentMethod, setPaymentMethod,
  emiCompany, setEmiCompany,
  paidAmount, setPaidAmount, total = 0,
  notes, setNotes,
  purchaseDate, setPurchaseDate,
}) {
  const dueAmount = Math.max(total - (Number(paidAmount) || 0), 0)
  return (
    <section className="flex flex-col gap-2">
      <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Customer</label>
      <input
        placeholder="Customer name *"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
        required
        className={inputClass}
      />
      <div className="flex gap-2">
        <input
          placeholder="Phone *"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
          className={inputClass}
        />
        <input
          placeholder="Email (optional, for e-invoice)"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      {setPurchaseDate && (
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
            className={inputClass}
          />
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2.5 focus-within:border-accent">
          <span className="text-[12px] text-muted">₹</span>
          <input
            type="number"
            min="0"
            placeholder="Discount *"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            required
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted"
          />
        </div>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          required
          className={`${inputClass} flex-1 ${paymentMethod ? '' : 'text-muted'}`}
        >
          <option value="" disabled>Payment method *</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="netbanking">NetBanking</option>
          <option value="emi">EMI</option>
        </select>
      </div>
      {paymentMethod === 'emi' && setEmiCompany && (
        <input
          placeholder="EMI company / provider *"
          value={emiCompany}
          onChange={(e) => setEmiCompany(e.target.value)}
          required
          className={inputClass}
        />
      )}
      {setPaidAmount && (
        <div>
          <div className="flex flex-1 items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2.5 focus-within:border-accent">
            <span className="text-[12px] text-muted">₹</span>
            <input
              type="number"
              min="0"
              placeholder="Paid amount *"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              required
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted"
            />
          </div>
          <p className="mt-1 px-0.5 text-[11.5px] text-muted">
            {dueAmount > 0
              ? `₹${dueAmount.toLocaleString('en-IN')} left unpaid — customer will be added to Pay Later Customers.`
              : 'Full amount collected now.'}
          </p>
        </div>
      )}
      <input
        placeholder="Note (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={inputClass}
      />
    </section>
  )
}
