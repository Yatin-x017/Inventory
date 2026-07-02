import { useEffect, useState, Fragment } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Plus, Trash2, MapPin, Package, X, Check, Pencil } from 'lucide-react'
import { useStore } from '../store/useStore'
import AddItemModal from '../components/AddItemModal'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'

const LOCATION_TYPES = ['shelf', 'counter', 'box', 'custom']

export default function ManageInventory() {
  const {
    items,
    fetchAll,
    deleteItem,
    addLocationToItem,
    setItemLocation,
    removeItemLocation,
    addTagToItem,
    removeTagFromItem,
    loading,
  } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [locationDraftFor, setLocationDraftFor] = useState(null)
  const [draft, setDraft] = useState({ type: 'shelf', label: '', quantity: 1 })
  const [openRow, setOpenRow] = useState(null)
  const [qtyEdit, setQtyEdit] = useState(null) // { itemId, locationId, value }
  const [tagDraftFor, setTagDraftFor] = useState(null)
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

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
            {items.length} item{items.length === 1 ? '' : 's'} on record
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={15} /> Add item
        </Button>
      </div>

      {loading && <p className="text-[13px] text-muted">Loading…</p>}

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

      {editingItem && (
        <AddItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onAdded={() => toast.success('Item updated')}
        />
      )}
    </div>
  )
}
