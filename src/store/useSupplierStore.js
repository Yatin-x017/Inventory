import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useSupplierStore = create((set, get) => ({
  suppliers: [],
  loading: false,

  transactions: [],
  transactionsLoading: false,

  fetchSuppliers: async () => {
    set({ loading: true })
    const [{ data: suppliers, error: suppliersError }, { data: balances, error: balancesError }] =
      await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('supplier_balances').select('*'),
      ])
    if (suppliersError) {
      set({ loading: false })
      throw suppliersError
    }
    if (balancesError) {
      set({ loading: false })
      throw balancesError
    }
    const balanceMap = new Map((balances ?? []).map((b) => [b.supplier_id, b]))
    const merged = (suppliers ?? []).map((s) => ({
      ...s,
      txn_count: Number(balanceMap.get(s.id)?.txn_count ?? 0),
      total_amount: Number(balanceMap.get(s.id)?.total_amount ?? 0),
      total_net_amount: Number(balanceMap.get(s.id)?.total_net_amount ?? 0),
      last_txn_date: balanceMap.get(s.id)?.last_txn_date ?? null,
    }))
    set({ suppliers: merged, loading: false })
  },

  addSupplier: async ({ name, category, notes }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name, category: category || null, notes: notes || null, created_by: user?.id })
      .select()
      .single()
    if (error) throw error
    set({ suppliers: [...get().suppliers, { ...data, txn_count: 0, total_amount: 0, total_net_amount: 0, last_txn_date: null }] })
    return data
  },

  deleteSupplier: async (id) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) throw error
    set({ suppliers: get().suppliers.filter((s) => s.id !== id) })
  },

  fetchTransactions: async (supplierId) => {
    set({ transactionsLoading: true })
    const { data, error } = await supabase
      .from('supplier_transactions')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) {
      set({ transactionsLoading: false })
      throw error
    }
    set({ transactions: data ?? [], transactionsLoading: false })
  },

  // Bulk-inserts parsed import rows. Chunked to stay well under
  // PostgREST's payload/row limits for large monthly reports.
  importTransactions: async (rows) => {
    const CHUNK_SIZE = 500
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase.from('supplier_transactions').insert(chunk)
      if (error) throw error
    }
  },

  addTransaction: async ({ supplierId, txnDate, amount, referenceNo, description }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        txn_date: txnDate,
        amount,
        reference_no: referenceNo || null,
        description: description || null,
        raw: {},
        columns: [],
        created_by: user?.id,
      })
      .select()
      .single()
    if (error) throw error
    set({ transactions: [data, ...get().transactions] })
    return data
  },

  deleteTransaction: async (id) => {
    const { error } = await supabase.from('supplier_transactions').delete().eq('id', id)
    if (error) throw error
    set({ transactions: get().transactions.filter((t) => t.id !== id) })
  },
}))
