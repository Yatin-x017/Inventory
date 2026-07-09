import { create } from 'zustand'
import { supabase } from '../lib/supabase'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export const useCustomerStore = create((set, get) => ({
  customers: [],
  loading: false,

  transactions: [],
  transactionsLoading: false,

  // Marketing members a retailer can be assigned to (owner/builder use
  // this to staff the "book"; a marketing_member's own customers are
  // already scoped by RLS so they don't need this list to see their
  // work, only to know who else exists when handing a retailer off).
  marketingMembers: [],
  marketingMembersLoading: false,

  // Today's ledger activity across every retailer this signed-in user can
  // see (owner/builder: everyone; marketing_member: their own book only —
  // enforced by RLS, not client-side filtering).
  todaySummary: { udharGiven: 0, paymentsCollected: 0, youOwed: 0, youPaid: 0, count: 0 },
  todaySummaryLoading: false,

  // Aggregate stats for an arbitrary date range (and optional marketing
  // member), used by the Customers page "filtered period" summary bar.
  rangeSummary: null,
  rangeSummaryLoading: false,

  fetchCustomers: async () => {
    set({ loading: true })
    const [{ data: customers, error: customersError }, { data: balances, error: balancesError }] =
      await Promise.all([
        supabase
          .from('customers')
          .select('*, assigned_profile:profiles!customers_assigned_to_fkey(id, full_name)')
          .order('name'),
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

  // Populates the "assign to" dropdown. Only marketing_member accounts
  // are meaningful assignees — owner/builder retailers are usually left
  // unassigned (house account).
  fetchMarketingMembers: async () => {
    set({ marketingMembersLoading: true })
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'marketing_member')
      .order('full_name')
    if (error) {
      set({ marketingMembersLoading: false })
      throw error
    }
    set({ marketingMembers: data ?? [], marketingMembersLoading: false })
  },

  addCustomer: async ({ name, phone, address, notes, assignedTo }) => {
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
        source: 'manual',
        assigned_to: assignedTo || null,
      })
      .select()
      .single()
    if (error) throw error
    await get().fetchCustomers()
    return data
  },

  updateCustomer: async (id, { name, phone, address, notes, assignedTo }) => {
    const payload = {
      name: name.trim(),
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      notes: notes?.trim() || null,
    }
    // Only touch assigned_to when the caller actually passed the field —
    // a marketing_member's edit form never sends it, and their RLS update
    // policy would reject a row that tried to change it anyway.
    if (assignedTo !== undefined) payload.assigned_to = assignedTo || null
    const { error } = await supabase.from('customers').update(payload).eq('id', id)
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

  // Aggregate "today" stats for the Customers overview page. RLS already
  // scopes this to whatever the signed-in user is allowed to see (owner/
  // builder: every retailer; marketing_member: their own book), so no
  // extra filtering is needed here beyond the date.
  fetchTodaySummary: async () => {
    set({ todaySummaryLoading: true })
    const { data, error } = await supabase
      .from('customer_transactions')
      .select('type, amount')
      .eq('transaction_date', todayStr())
    if (error) {
      set({ todaySummaryLoading: false })
      throw error
    }
    const summary = (data ?? []).reduce(
      (acc, t) => {
        const amt = Number(t.amount) || 0
        if (t.type === 'udhar') acc.udharGiven += amt
        else if (t.type === 'payment') acc.paymentsCollected += amt
        else if (t.type === 'owed') acc.youOwed += amt
        else if (t.type === 'paid_out') acc.youPaid += amt
        acc.count += 1
        return acc
      },
      { udharGiven: 0, paymentsCollected: 0, youOwed: 0, youPaid: 0, count: 0 }
    )
    set({ todaySummary: summary, todaySummaryLoading: false })
  },

  // Same shape as fetchTodaySummary, but for an arbitrary [from, to] date
  // range and (optionally) scoped to one marketing member's book — powers
  // the "filtered period" summary bar that appears once a date filter is
  // applied on the Customers page. RLS still scopes visibility for
  // marketing_member accounts; memberId is only used for the owner/builder
  // "view one member's book" filter.
  fetchRangeSummary: async (from, to, memberId) => {
    set({ rangeSummaryLoading: true })
    let query = supabase
      .from('customer_transactions')
      .select('type, amount, customers!inner(assigned_to)')
    if (from) query = query.gte('transaction_date', from)
    if (to) query = query.lte('transaction_date', to)
    if (memberId === 'unassigned') query = query.is('customers.assigned_to', null)
    else if (memberId && memberId !== 'all') query = query.eq('customers.assigned_to', memberId)
    const { data, error } = await query
    if (error) {
      set({ rangeSummaryLoading: false })
      throw error
    }
    const summary = (data ?? []).reduce(
      (acc, t) => {
        const amt = Number(t.amount) || 0
        if (t.type === 'udhar') acc.udharGiven += amt
        else if (t.type === 'payment') acc.paymentsCollected += amt
        else if (t.type === 'owed') acc.youOwed += amt
        else if (t.type === 'paid_out') acc.youPaid += amt
        acc.count += 1
        return acc
      },
      { udharGiven: 0, paymentsCollected: 0, youOwed: 0, youPaid: 0, count: 0 }
    )
    set({ rangeSummary: summary, rangeSummaryLoading: false })
  },

  // Full, ascending-order transaction history for one customer, split
  // into an opening balance (everything strictly before `from`) and the
  // in-range rows — used by the statement/PDF generator.
  fetchStatementData: async (customerId, from, to) => {
    const { data, error } = await supabase
      .from('customer_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    const all = data ?? []
    const signed = (t) => (t.type === 'udhar' || t.type === 'paid_out' ? 1 : -1) * Number(t.amount)
    const before = all.filter((t) => t.transaction_date < from)
    const inRange = all.filter((t) => t.transaction_date >= from && t.transaction_date <= to)
    const openingBalance = before.reduce((sum, t) => sum + signed(t), 0)
    const closingBalance = inRange.reduce((sum, t) => sum + signed(t), openingBalance)
    return { transactions: inRange, openingBalance, closingBalance }
  },
}))
