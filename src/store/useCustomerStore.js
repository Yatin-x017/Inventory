import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useCustomerStore = create((set, get) => ({
  customers: [],
  loading: false,

  transactions: [],
  transactionsLoading: false,

  fetchCustomers: async () => {
    set({ loading: true })
    const [{ data: customers, error: customersError }, { data: balances, error: balancesError }] =
      await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('customer_balances').select('*'),
      ])
    if (customersError) {
      set({ loading: false })
      throw customersError
    }
    if (balancesError) {
      set({ loading: false })
      throw balancesError
    }
    const balanceMap = new Map((balances ?? []).map((b) => [b.customer_id, b]))
    const merged = (customers ?? []).map((c) => ({
      ...c,
      balance: Number(balanceMap.get(c.id)?.balance ?? 0),
      total_udhar: Number(balanceMap.get(c.id)?.total_udhar ?? 0),
      total_payment: Number(balanceMap.get(c.id)?.total_payment ?? 0),
      total_owed: Number(balanceMap.get(c.id)?.total_owed ?? 0),
      total_paid_out: Number(balanceMap.get(c.id)?.total_paid_out ?? 0),
      last_transaction_date: balanceMap.get(c.id)?.last_transaction_date ?? null,
    }))
    set({ customers: merged, loading: false })
  },

  addCustomer: async ({ name, phone, address, notes }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: name.trim(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        created_by: user?.id,
      })
      .select()
      .single()
    if (error) throw error
    await get().fetchCustomers()
    return data
  },

  updateCustomer: async (id, { name, phone, address, notes }) => {
    const { error } = await supabase
      .from('customers')
      .update({
        name: name.trim(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      })
      .eq('id', id)
    if (error) throw error
    await get().fetchCustomers()
  },

  deleteCustomer: async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) throw error
    await get().fetchCustomers()
  },

  fetchTransactions: async (customerId) => {
    set({ transactionsLoading: true })
    const { data, error } = await supabase
      .from('customer_transactions')
      .select('*, profiles(full_name)')
      .eq('customer_id', customerId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) {
      set({ transactionsLoading: false })
      throw error
    }
    set({ transactions: data ?? [], transactionsLoading: false })
  },

  addTransaction: async ({ customerId, type, amount, description, transactionDate }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('customer_transactions').insert({
      customer_id: customerId,
      type,
      amount: Number(amount),
      description: description?.trim() || null,
      transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
      created_by: user?.id,
    })
    if (error) throw error
    await Promise.all([get().fetchTransactions(customerId), get().fetchCustomers()])
  },

  deleteTransaction: async (id, customerId) => {
    const { error } = await supabase.from('customer_transactions').delete().eq('id', id)
    if (error) throw error
    await Promise.all([get().fetchTransactions(customerId), get().fetchCustomers()])
  },
}))
