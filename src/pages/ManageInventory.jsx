import { useEffect, useState, Fragment } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Plus, Trash2, MapPin, Package, Smartphone, X, Check, Pencil, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import AddItemModal from '../components/AddItemModal'
import BulkAddItemModal from '../components/BulkAddItemModal'
import EditUnitModal from '../components/EditUnitModal'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'

const LOCATION_TYPES = ['shelf', 'counter', 'box', 'custom']

const STATUS_STYLES = {
  in_stock: 'bg-success-soft text-success',
  reserved: 'bg-accent-soft text-accent',
  sold: 'bg-bg text-muted',
  returned: 'bg-accent-soft text-accent',
  defective: 'bg-danger-soft text-danger',
}

function identifiersOf(unit) {
  const byType = {}
  for (const d of unit.device_identifiers ?? []) byType[d.identifier_type] = d.identifier_value
  return { imei1: byType.IMEI_1, imei2: byType.IMEI_2, serial: byType.SERIAL_NUMBER, barcode: byType.BARCODE }
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

export default function ManageInventory() {
  const {
    items,
    products,
    inventoryUnits,
    fetchAll,
    deleteItem,
    deleteProduct,
    deleteInventoryUnit,
    addLocationToItem,
    setItemLocation,
    removeItemLocation,
    addTagToItem,
    removeTagFromItem,
    loading,
  } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingUnit, setEditingUnit] = useState(null) // { unit, product }
  const [locationDraftFor, setLocationDraftFor] = useState(null)
  const [draft, setDraft] = useState({ type: 'shelf', label: '', quantity: 1 })
  const [openRow, setOpenRow] = useState(null)
  const [qtyEdit, setQtyEdit] = useState(null) // { itemId, locationId, value }
  const [tagDraftFor, setTagDraftFor] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [expandedProduct, setExpandedProduct] = useState(null)

  useEffect(() => {
    fetchAll()
  }, [])

  const productGroups = products.map((product) => {
    const units = inventoryUnits.filter((u) => u.product_id === product.id)
    return {
      product,
      units,
      inStock: units.filter((u) => u.status === 'in_stock').length,
      sold: units.filter((u) => u.status === 'sold').length,
    }
  })

  async function handleDeleteProduct(group) {
    // Sold units are allowed to be deleted too — their bill_items rows
    // already snapshot item_name/unit_price at sale time (see SCHEMA.md),
    // so past invoices keep rendering fine; only the live back-reference
    // gets cleared. Just warn louder since it also removes sale history
    // from this product's own unit list.
    const warning = group.sold > 0
      ? `Delete "${group.product.brand} ${group.product.model}" and its ${group.units.length} unit(s)? ${group.sold} of these were already sold — past invoices are unaffected, but this product will no longer show up in its sales history here. This can't be undone.`
      : `Delete "${group.product.brand} ${group.product.model}" and its ${group.units.length} unit(s)? This can't be undone.`
    if (!confirm(warning)) return
    try {
      await deleteProduct(group.product.id)
      toast.success('Product deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDeleteUnit(unit) {
    // Sold/returned/defective units can be removed too, not just
    // in-stock ones. bill_items.unit_id is a soft (ON DELETE SET NULL)
    // back-reference, so deleting a sold unit doesn't touch past bills —
    // it just stops showing up in inventory.
    const ids = identifiersOf(unit)
    const label = ids.imei1 || ids.serial || unit.id.slice(0, 8)
    const warning = unit.status === 'sold'
      ? `Remove sold unit ${label}? This won't affect any past invoice, but this unit will disappear from inventory records. This can't be undone.`
      : `Remove unit ${label}? This can't be undone.`
    if (!confirm(warning)) return
    try {
      await deleteInventoryUnit(unit.id)
      toast.success('Unit removed')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleAddLocation(itemId) {
    if (!draft.label.trim()) return
    try {
      await addLocationToItem(itemId, draft.type, draft.label, Number(draft.quantity) || 1)
      toast.success('Location added')
      setLocationDraftFor(null)
      setDraft({ type: 'shelf', label: '', quantity: 1 })
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return
    try {
      await deleteItem(item.id)
      toast.success(`${item.name} deleted`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleSaveQty() {
    if (!qtyEdit) return
    const value = Number(qtyEdit.value)
    if (!value || value < 1) {
      toast.error('Quantity must be at least 1.')
      return
    }
    try {
      await setItemLocation(qtyEdit.itemId, qtyEdit.locationId, value)
      setQtyEdit(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleRemoveLocation(itemId, locationId) {
    try {
      await removeItemLocation(itemId, locationId)
      toast.success('Location removed')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleAddTag(itemId) {
    const names = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    if (names.length === 0) return
    try {
      for (const name of names) {
        await addTagToItem(itemId, name)
      }
      setTagInput('')
      setTagDraftFor(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleRemoveTag(itemId, tagId) {
    try {
      await removeTagFromItem(itemId, tagId)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Manage inventory</h1>
          <p className="mt-1 text-[13px] text-muted">
            {productGroups.reduce((s, g) => s + g.inStock, 0)} serialized unit{productGroups.reduce((s, g) => s + g.inStock, 0) === 1 ? '' : 's'} in stock ·{' '}
            {items.length} other item{items.length === 1 ? '' : 's'} on record
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowBulkModal(true)}>
            <Layers size={15} /> Bulk add
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={15} /> Add item
          </Button>
        </div>
      </div>

      {loading && <p className="text-[13px] text-muted">Loading…</p>}

      {!loading && productGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-[13.5px] font-semibold text-muted">Serialized products (IMEI / Serial tracked)</h2>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:block">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium" />
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">In stock</th>
                  <th className="px-4 py-3 font-medium">Sold</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {productGroups.map((group, idx) => {
                  const { product, units, inStock, sold } = group
                  const isOpen = expandedProduct === product.id
                  return (
                    <Fragment key={product.id}>
                      <tr
                        className={`cursor-pointer border-b border-border/70 transition-colors hover:bg-accent-soft/40 ${idx % 2 === 1 ? 'bg-bg/40' : ''}`}
                        onClick={() => setExpandedProduct(isOpen ? null : product.id)}
                      >
                        <td className="px-4 py-3 text-muted">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {product.brand} {product.model} {product.color && <span className="text-muted">· {product.color}</span>}
                        </td>
                        <td className="px-4 py-3 text-muted capitalize">{product.category.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3">{formatMoney(product.price)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-medium ${STATUS_STYLES.in_stock}`}>{inStock}</span>
                        </td>
                        <td className="px-4 py-3 text-muted">{sold}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteProduct(group)}
                            className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                            title="Delete product"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border/70 bg-bg/40">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              {units.length === 0 && <p className="text-[12.5px] text-muted">No units yet.</p>}
                              {units.map((unit) => {
                                const ids = identifiersOf(unit)
                                return (
                                  <div
                                    key={unit.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                                  >
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12.5px]">
                                      {ids.imei1 && <span>IMEI 1: <span className="font-medium">{ids.imei1}</span></span>}
                                      {ids.imei2 && <span className="text-muted">IMEI 2: {ids.imei2}</span>}
                                      {ids.serial && <span className="text-muted">Serial: {ids.serial}</span>}
                                      {unit.locations?.label && (
                                        <span className="flex items-center gap-1 text-muted">
                                          <MapPin size={11} /> {unit.locations.label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[unit.status] ?? 'bg-bg text-muted'}`}>
                                        {unit.status}
                                      </span>
                                      <button
                                        onClick={() => setEditingUnit({ unit, product })}
                                        className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-accent"
                                        title="Edit details"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteUnit(unit)}
                                        className="rounded-md p-1 text-muted hover:bg-danger-soft hover:text-danger"
                                        title="Remove unit"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {productGroups.map((group) => {
              const { product, units, inStock, sold } = group
              const isOpen = expandedProduct === product.id
              return (
                <div key={product.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                  <button
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() => setExpandedProduct(isOpen ? null : product.id)}
                  >
                    <div className="flex items-start gap-2">
                      <Smartphone size={16} className="mt-0.5 shrink-0 text-accent" />
                      <div>
                        <div className="text-[14px] font-semibold">
                          {product.brand} {product.model} {product.color}
                        </div>
                        <div className="text-[12.5px] text-muted">
                          {formatMoney(product.price)} · {inStock} in stock · {sold} sold
                        </div>
                      </div>
                    </div>
                    {isOpen ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                  </button>
                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                      {units.map((unit) => {
                        const ids = identifiersOf(unit)
                        return (
                          <div key={unit.id} className="rounded-lg border border-border p-2">
                            <div className="flex items-center justify-between">
                              <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium capitalize ${STATUS_STYLES[unit.status] ?? 'bg-bg text-muted'}`}>
                                {unit.status}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEditingUnit({ unit, product })}
                                  className="text-muted hover:text-accent"
                                >
                                  <Pencil size={13} />
                                </button>
                                {unit.status === 'in_stock' && (
                                  <button onClick={() => handleDeleteUnit(unit)} className="text-muted hover:text-danger">
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="mt-1 flex flex-col gap-0.5 text-[12px] text-muted">
                              {ids.imei1 && <span>IMEI 1: {ids.imei1}</span>}
                              {ids.imei2 && <span>IMEI 2: {ids.imei2}</span>}
                              {ids.serial && <span>Serial: {ids.serial}</span>}
                            </div>
                          </div>
                        )
                      })}
                      <button
                        onClick={() => handleDeleteProduct(group)}
                        className="mt-1 self-start text-[12px] font-medium text-danger"
                      >
                        Delete product
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-[13.5px] font-semibold text-muted">Other items</h2>

      {!loading && items.length === 0 && (
        <EmptyState
          icon={Package}
          title="Nothing here yet"
          description="Add your first inventory item to start tracking locations."
          action={
            <Button onClick={() => setShowModal(true)}>
              <Plus size={15} /> Add item
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:block">
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Brand</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Locations</th>
                    <th className="px-4 py-3 font-medium">Tags</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <Fragment key={item.id}>
                      <tr
                        className={`border-b border-border/70 transition-colors hover:bg-accent-soft/40 ${
                          idx % 2 === 1 ? 'bg-bg/40' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-muted">{item.brand || '—'}</td>
                        <td className="px-4 py-3 text-muted">{item.sku || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {(item.item_locations ?? []).length === 0 && (
                              <span className="text-muted">none</span>
                            )}
                            {(item.item_locations ?? []).map((l, i) => {
                              const locId = l.locations?.id
                              const isEditing =
                                qtyEdit?.itemId === item.id && qtyEdit?.locationId === locId
                              if (isEditing) {
                                return (
                                  <span
                                    key={i}
                                    className="flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-1.5 py-0.5"
                                  >
                                    <MapPin size={10} className="text-accent" />
                                    <span className="text-[11.5px] font-medium text-accent">
                                      {l.locations?.label}
                                    </span>
                                    <input
                                      type="number"
                                      min="1"
                                      autoFocus
                                      value={qtyEdit.value}
                                      onChange={(e) => setQtyEdit({ ...qtyEdit, value: e.target.value })}
                                      onKeyDown={(e) => e.key === 'Enter' && handleSaveQty()}
                                      className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-[11.5px]"
                                    />
                                    <button
                                      onClick={handleSaveQty}
                                      className="rounded p-0.5 text-success hover:bg-success-soft"
                                      title="Save"
                                    >
                                      <Check size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleRemoveLocation(item.id, locId)}
                                      className="rounded p-0.5 text-danger hover:bg-danger-soft"
                                      title="Remove location"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                    <button
                                      onClick={() => setQtyEdit(null)}
                                      className="rounded p-0.5 text-muted hover:bg-accent-soft"
                                      title="Cancel"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                )
                              }
                              return (
                                <button
                                  key={i}
                                  onClick={() =>
                                    setQtyEdit({ itemId: item.id, locationId: locId, value: l.quantity })
                                  }
                                  className="group flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent hover:text-white"
                                  title="Click to edit quantity"
                                >
                                  <MapPin size={10} />
                                  {l.locations?.label} ×{l.quantity}
                                  <Pencil size={9} className="opacity-0 transition-opacity group-hover:opacity-70" />
                                </button>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(item.item_tags ?? []).map((t, i) => (
                              <span
                                key={i}
                                className="group flex items-center gap-1 rounded-md bg-bg px-2 py-0.5 text-[12px] font-medium text-text"
                              >
                                {t.tags?.name}
                                <button
                                  onClick={() => handleRemoveTag(item.id, t.tags?.id)}
                                  className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                                  title="Remove tag"
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                            {tagDraftFor === item.id ? (
                              <input
                                autoFocus
                                placeholder="tag, tag2…"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddTag(item.id)}
                                onBlur={() => handleAddTag(item.id)}
                                className="w-28 rounded-md border border-accent bg-surface px-2 py-0.5 text-[12px] outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  setTagDraftFor(item.id)
                                  setTagInput('')
                                }}
                                className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-accent"
                                title="Add tag"
                              >
                                <Plus size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative flex justify-end">
                            <button
                              onClick={() => setOpenRow(openRow === item.id ? null : item.id)}
                              className="rounded-md p-1.5 text-muted hover:bg-accent-soft hover:text-text"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {openRow === item.id && (
                              <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card-hover animate-pop-in">
                                <button
                                  onClick={() => {
                                    setEditingItem(item)
                                    setOpenRow(null)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent-soft hover:text-accent"
                                >
                                  <Pencil size={14} /> Edit details
                                </button>
                                <button
                                  onClick={() => {
                                    setLocationDraftFor(locationDraftFor === item.id ? null : item.id)
                                    setOpenRow(null)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent-soft hover:text-accent"
                                >
                                  <MapPin size={14} /> Add location
                                </button>
                                <button
                                  onClick={() => {
                                    handleDelete(item)
                                    setOpenRow(null)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger hover:bg-danger-soft"
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {locationDraftFor === item.id && (
                        <tr className="border-b border-border/70 bg-accent-soft/40">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={draft.type}
                                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px]"
                              >
                                {LOCATION_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t[0].toUpperCase() + t.slice(1)}
                                  </option>
                                ))}
                              </select>
                              <input
                                placeholder="Label, e.g. Rack 16"
                                value={draft.label}
                                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px]"
                              />
                              <input
                                type="number"
                                min="1"
                                value={draft.quantity}
                                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                                className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px]"
                              />
                              <Button onClick={() => handleAddLocation(item.id)}>Save</Button>
                              <Button variant="secondary" onClick={() => setLocationDraftFor(null)}>
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold">{item.name}</div>
                    <div className="text-[12.5px] text-muted">{item.brand || '—'} {item.sku && `· ${item.sku}`}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="rounded-md p-1.5 text-muted hover:bg-accent-soft hover:text-accent"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(item.item_locations ?? []).map((l, i) => {
                    const locId = l.locations?.id
                    const isEditing = qtyEdit?.itemId === item.id && qtyEdit?.locationId === locId
                    if (isEditing) {
                      return (
                        <span
                          key={i}
                          className="flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-1.5 py-0.5"
                        >
                          <input
                            type="number"
                            min="1"
                            autoFocus
                            value={qtyEdit.value}
                            onChange={(e) => setQtyEdit({ ...qtyEdit, value: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveQty()}
                            className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-[11.5px]"
                          />
                          <button onClick={handleSaveQty} className="rounded p-0.5 text-success">
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => handleRemoveLocation(item.id, locId)}
                            className="rounded p-0.5 text-danger"
                          >
                            <Trash2 size={12} />
                          </button>
                          <button onClick={() => setQtyEdit(null)} className="rounded p-0.5 text-muted">
                            <X size={12} />
                          </button>
                        </span>
                      )
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => setQtyEdit({ itemId: item.id, locationId: locId, value: l.quantity })}
                        className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent"
                      >
                        <MapPin size={10} />
                        {l.locations?.label} ×{l.quantity}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(item.item_tags ?? []).map((t, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-md bg-bg px-2 py-0.5 text-[12px] font-medium text-text"
                    >
                      {t.tags?.name}
                      <button onClick={() => handleRemoveTag(item.id, t.tags?.id)} className="text-muted">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  {tagDraftFor === item.id ? (
                    <input
                      autoFocus
                      placeholder="tag, tag2…"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag(item.id)}
                      onBlur={() => handleAddTag(item.id)}
                      className="w-24 rounded-md border border-accent bg-surface px-2 py-0.5 text-[12px] outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setTagDraftFor(item.id)
                        setTagInput('')
                      }}
                      className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-accent"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setLocationDraftFor(locationDraftFor === item.id ? null : item.id)}
                  className="mt-3 text-[12.5px] font-medium text-accent"
                >
                  + Add location
                </button>
                {locationDraftFor === item.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={draft.type}
                      onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                      className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px]"
                    >
                      {LOCATION_TYPES.map((t) => (
                        <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Label"
                      value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px]"
                    />
                    <input
                      type="number"
                      min="1"
                      value={draft.quantity}
                      onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                      className="w-16 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px]"
                    />
                    <Button className="w-full" onClick={() => handleAddLocation(item.id)}>Save location</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showModal && (
        <AddItemModal
          onClose={() => setShowModal(false)}
          onAdded={() => toast.success('Item added')}
        />
      )}

      {showBulkModal && (
        <BulkAddItemModal
          onClose={() => setShowBulkModal(false)}
          onAdded={(result) => {
            const variants = result?.variantCount ?? 1
            const units = result?.unitsAdded ?? 0
            toast.success(
              `Added ${units} unit${units === 1 ? '' : 's'} across ${variants} variant${variants === 1 ? '' : 's'}`
            )
          }}
        />
      )}

      {editingItem && (
        <AddItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onAdded={() => toast.success('Item updated')}
        />
      )}

      {editingUnit && (
        <EditUnitModal
          unit={editingUnit.unit}
          product={editingUnit.product}
          onClose={() => setEditingUnit(null)}
          onSaved={() => toast.success('Unit details updated')}
        />
      )}
    </div>
  )
}
