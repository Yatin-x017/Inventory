import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// Repair job tickets — see supabase/migrations/20260705c_repairs.sql.
// Included in the app-wide backup/restore system (backup-export edge
// function + restore_from_backup RPC), same as every other table here.
export const useRepairStore = create((set, get) => ({
  repairs: [],
  loading: false,

  fetchRepairs: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('repairs')
      .select('*')
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) {
      set({ loading: false })
      throw error
    }
    set({ repairs: data ?? [], loading: false })
  },

  createRepair: async ({
    customerId,
    customerName,
    customerPhone,
    deviceBrand,
    deviceModel,
    deviceImei,
    issueDescription,
    status,
    estimatedCost,
    partsUsed,
    technicianNotes,
    receivedDate,
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('repairs')
      .insert({
        customer_id: customerId || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone?.trim() || null,
        device_brand: deviceBrand?.trim() || null,
        device_model: deviceModel?.trim() || null,
        device_imei: deviceImei?.trim() || null,
        issue_description: issueDescription.trim(),
        status: status || 'received',
        estimated_cost: estimatedCost === '' || estimatedCost == null ? null : Number(estimatedCost),
        parts_used: partsUsed ?? [],
        technician_notes: technicianNotes?.trim() || null,
        received_date: receivedDate || new Date().toISOString().slice(0, 10),
        created_by: user?.id,
      })
      .select()
      .single()
    if (error) throw error
    await get().fetchRepairs()
    return data
  },

  updateRepair: async (id, {
    customerId,
    customerName,
    customerPhone,
    deviceBrand,
    deviceModel,
    deviceImei,
    issueDescription,
    status,
    estimatedCost,
    finalCost,
    partsUsed,
    technicianNotes,
    receivedDate,
    completedDate,
  }) => {
    const { error } = await supabase
      .from('repairs')
      .update({
        customer_id: customerId || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone?.trim() || null,
        device_brand: deviceBrand?.trim() || null,
        device_model: deviceModel?.trim() || null,
        device_imei: deviceImei?.trim() || null,
        issue_description: issueDescription.trim(),
        status,
        estimated_cost: estimatedCost === '' || estimatedCost == null ? null : Number(estimatedCost),
        final_cost: finalCost === '' || finalCost == null ? null : Number(finalCost),
        parts_used: partsUsed ?? [],
        technician_notes: technicianNotes?.trim() || null,
        received_date: receivedDate,
        completed_date: completedDate || null,
      })
      .eq('id', id)
    if (error) throw error
    await get().fetchRepairs()
  },

  // Quick status change from the list view (no full edit modal needed).
  // Auto-stamps completed_date the first time a ticket moves to
  // completed/delivered, so nobody has to remember to set it by hand.
  setRepairStatus: async (id, status) => {
    const repair = get().repairs.find((r) => r.id === id)
    const patch = { status }
    if (['completed', 'delivered'].includes(status) && !repair?.completed_date) {
      patch.completed_date = new Date().toISOString().slice(0, 10)
    }
    const { error } = await supabase.from('repairs').update(patch).eq('id', id)
    if (error) throw error
    await get().fetchRepairs()
  },

  deleteRepair: async (id) => {
    const { error } = await supabase.from('repairs').delete().eq('id', id)
    if (error) throw error
    await get().fetchRepairs()
  },
}))
