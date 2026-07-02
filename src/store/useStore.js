import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { sendInvoiceEmail } from '../services/emailService'

export const useStore = create((set, get) => ({
  items: [],
  locations: [],
  tags: [],
  bills: [],
  loading: false,
  billsLoading: false,

  fetchAll: async () => {
    set({ loading: true })
    const [{ data: items }, { data: locations }, { data: tags }] = await Promise.all([
      supabase
        .from('items')
        .select('*, item_locations(quantity, locations(*)), item_tags(tags(*))')
        .order('name'),
      supabase.from('locations').select('*').order('label'),
      supabase.from('tags').select('*').order('name'),
    ])
    set({ items: items ?? [], locations: locations ?? [], tags: tags ?? [], loading: false })
  },

  searchItems: (query, tagFilter) => {
    const items = get().items
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q)
      const matchesTag =
        !tagFilter || item.item_tags?.some((it) => it.tags?.id === tagFilter)
      return matchesQuery && matchesTag
    })
  },

  addItem: async (item) => {
    const { data, error } = await supabase.from('items').insert(item).select().single()
    if (error) throw error
    await get().fetchAll()
    return data
  },

  // One-shot creation: item + its first location + its tags, resolving
  // existing locations/tags by name so duplicates aren't created.
  createItemWithDetails: async ({ name, sku, brand, price, image_url, locationType, locationLabel, quantity, tagNames }) => {
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({ name, sku: sku || null, brand: brand || null, price: Number(price) || 0, image_url: image_url || null })
      .select()
      .single()
    if (itemError) throw itemError

    if (locationLabel?.trim()) {
      const existing = get().locations.find(
        (l) => l.type === locationType && l.label.toLowerCase() === locationLabel.trim().toLowerCase()
      )
      let locationId = existing?.id
      if (!locationId) {
        const { data: newLoc, error: locError } = await supabase
          .from('locations')
          .insert({ type: locationType, label: locationLabel.trim() })
          .select()
          .single()
        if (locError) throw locError
        locationId = newLoc.id
      }
      const { error: linkError } = await supabase
        .from('item_locations')
        .upsert({ item_id: item.id, location_id: locationId, quantity: quantity || 1 })
      if (linkError) throw linkError
    }

    const cleanTags = [...new Set((tagNames || []).map((t) => t.trim()).filter(Boolean))]
    for (const tagName of cleanTags) {
      const existingTag = get().tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
      let tagId = existingTag?.id
      if (!tagId) {
        const { data: newTag, error: tagError } = await supabase
          .from('tags')
          .insert({ name: tagName })
          .select()
          .single()
        if (tagError) throw tagError
        tagId = newTag.id
      }
      await supabase.from('item_tags').insert({ item_id: item.id, tag_id: tagId })
    }

    await get().fetchAll()
    return item
  },

  addLocationToItem: async (itemId, locationType, locationLabel, quantity) => {
    const existing = get().locations.find(
      (l) => l.type === locationType && l.label.toLowerCase() === locationLabel.trim().toLowerCase()
    )
    let locationId = existing?.id
    if (!locationId) {
      const { data: newLoc, error: locError } = await supabase
        .from('locations')
        .insert({ type: locationType, label: locationLabel.trim() })
        .select()
        .single()
      if (locError) throw locError
      locationId = newLoc.id
    }
    const { error } = await supabase
      .from('item_locations')
      .upsert({ item_id: itemId, location_id: locationId, quantity: quantity || 1 })
    if (error) throw error
    await get().fetchAll()
  },

  updateItem: async (id, updates) => {
    const { error } = await supabase.from('items').update(updates).eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  deleteItem: async (id) => {
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  setItemLocation: async (itemId, locationId, quantity) => {
    const { error } = await supabase
      .from('item_locations')
      .upsert({ item_id: itemId, location_id: locationId, quantity })
    if (error) throw error
    await get().fetchAll()
  },

  removeItemLocation: async (itemId, locationId) => {
    const { error } = await supabase
      .from('item_locations')
      .delete()
      .eq('item_id', itemId)
      .eq('location_id', locationId)
    if (error) throw error
    await get().fetchAll()
  },

  addTagToItem: async (itemId, tagName) => {
    const clean = tagName.trim()
    if (!clean) return
    const existingTag = get().tags.find((t) => t.name.toLowerCase() === clean.toLowerCase())
    let tagId = existingTag?.id
    if (!tagId) {
      const { data: newTag, error: tagError } = await supabase
        .from('tags')
        .insert({ name: clean })
        .select()
        .single()
      if (tagError) throw tagError
      tagId = newTag.id
    }
    const { error } = await supabase.from('item_tags').upsert({ item_id: itemId, tag_id: tagId })
    if (error) throw error
    await get().fetchAll()
  },

  removeTagFromItem: async (itemId, tagId) => {
    const { error } = await supabase
      .from('item_tags')
      .delete()
      .eq('item_id', itemId)
      .eq('tag_id', tagId)
    if (error) throw error
    await get().fetchAll()
  },

  addLocation: async (location) => {
    const { error } = await supabase.from('locations').insert(location)
    if (error) throw error
    await get().fetchAll()
  },

  addTag: async (name) => {
    const { error } = await supabase.from('tags').insert({ name })
    if (error) throw error
    await get().fetchAll()
  },

  // --- Billing ---

  fetchBills: async () => {
    set({ billsLoading: true })
    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      set({ billsLoading: false })
      throw error
    }
    set({ bills: data ?? [], billsLoading: false })
  },

  // cartLines: [{ item_id, item_name, item_sku, unit_price, quantity, location_id, location_label }]
  completeSale: async ({ customerName, customerEmail, customerPhone, notes, cartLines }) => {
    const { data, error } = await supabase.rpc('complete_sale', {
      p_customer_name: customerName || '',
      p_customer_email: customerEmail || '',
      p_customer_phone: customerPhone || '',
      p_notes: notes || '',
      p_items: cartLines,
    })
    if (error) throw error
    const billId = data

    if (customerEmail) {
      const total = cartLines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
      await get().sendBillEmail({
        billId,
        customerName,
        customerEmail,
        items: cartLines,
        total,
        date: new Date().toLocaleDateString('en-IN'),
      })
    }

    await Promise.all([get().fetchAll(), get().fetchBills()])
    return billId
  },

  sendBillEmail: async ({ billId, customerName, customerEmail, items, total, date }) => {
    await supabase.from('bills').update({ email_status: 'pending' }).eq('id', billId)
    const invoiceNumber = `INV-${billId.slice(0, 8).toUpperCase()}`
    try {
      await sendInvoiceEmail({
        customerName: customerName || 'Customer',
        customerEmail,
        invoiceNumber,
        items,
        total,
        date,
      })
      await supabase.from('bills').update({ email_status: 'sent' }).eq('id', billId)
    } catch (err) {
      await supabase.from('bills').update({ email_status: 'failed' }).eq('id', billId)
    }
  },

  resendBillEmail: async (bill) => {
    const items = bill.bill_items ?? []
    const total = items.reduce((s, li) => s + (li.unit_price || 0) * (li.quantity || 0), 0)
    await get().sendBillEmail({
      billId: bill.id,
      customerName: bill.customer_name,
      customerEmail: bill.customer_email,
      items,
      total,
      date: new Date(bill.created_at).toLocaleDateString('en-IN'),
    })
    await get().fetchBills()
  },

  voidBill: async (billId) => {
    const { error } = await supabase.rpc('void_bill', { p_bill_id: billId })
    if (error) throw error
    await get().fetchBills()
  },
}))
