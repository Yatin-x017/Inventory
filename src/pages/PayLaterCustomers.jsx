import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Search, ArrowUpRight, Wallet, Users as UsersIcon } from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'

function Initials({ name }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">
      {initials}
    </div>
  )
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

// Every EMI / "pay later" sale on the Billing page writes a udhar entry
// against the customer it was billed to (see recordPayLaterDue in
// useStore.js). This page is just the customer ledger filtered down to
// people who still owe something — a dedicated view for chasing pending
// collections, separate from the full Customers/udhar list.
export default function PayLaterCustomers() {
  const { customers, loading, fetchCustomers } = useCustomerStore()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchCustomers()
  }, [])

  const dueCustomers = useMemo(
    () => customers.filter((c) => c.source === 'billing' && c.balance > 0).sort((a, b) => b.balance - a.balance),
    [customers]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return dueCustomers
    return dueCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q)
    )
  }, [dueCustomers, query])

  const totals = useMemo(() => {
    const outstanding = dueCustomers.reduce((sum, c) => sum + c.balance, 0)
    const oldest = dueCustomers.reduce((min, c) => {
      if (!c.last_transaction_date) return min
      return !min || c.last_transaction_date < min ? c.last_transaction_date : min
    }, null)
    return { outstanding, count: dueCustomers.length, oldest }
  }, [dueCustomers])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Pay Later Customers</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Everyone with an EMI / pay-later balance still outstanding from a sale.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={UsersIcon} label="Customers Owing" value={totals.count} hint="With a pending balance" tone="accent" />
        <StatCard icon={Wallet} label="Total Outstanding" value={formatMoney(totals.outstanding)} hint="Yet to be collected" tone="danger" />
        <StatCard
          icon={Clock}
          label="Oldest Balance"
          value={totals.oldest ? new Date(totals.oldest).toLocaleDateString('en-IN') : '—'}
          hint="Longest-pending customer"
          tone="warning"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search by name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      {loading && <p className="text-[13px] text-muted">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={Clock}
          title={dueCustomers.length === 0 ? 'Nobody owes anything right now' : 'No matches'}
          description={
            dueCustomers.length === 0
              ? 'Pay-later balances from Billing (paid amount less than the total) will show up here automatically.'
              : 'Try a different name or phone number.'
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onClick={() => navigate(`/customers/${c.id}`)}
              className="group flex animate-pop-in items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Initials name={c.name} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{c.name}</div>
                  <div className="truncate text-[12.5px] text-muted">
                    {c.phone || 'No phone on file'}
                    {c.last_transaction_date && ` · since ${new Date(c.last_transaction_date).toLocaleDateString('en-IN')}`}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone="danger">{formatMoney(c.balance)} due</Badge>
                <span className="flex items-center gap-1 text-[11.5px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                  Record payment <ArrowUpRight size={12} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
