import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, UserPlus, Search, Users as UsersIcon, TrendingUp, ArrowUpRight } from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import AddCustomerModal from '../components/AddCustomerModal'

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

export default function Customers() {
  const { customers, loading, fetchCustomers } = useCustomerStore()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchCustomers()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q)
    )
  }, [customers, query])

  const totals = useMemo(() => {
    const outstanding = customers.reduce((sum, c) => sum + Math.max(c.balance, 0), 0)
    const withDues = customers.filter((c) => c.balance > 0).length
    const collected = customers.reduce((sum, c) => sum + c.total_payment, 0)
    const youOwe = customers.reduce((sum, c) => sum + Math.max(-c.balance, 0), 0)
    const owedTo = customers.filter((c) => c.balance < 0).length
    return { outstanding, withDues, collected, youOwe, owedTo }
  }, [customers])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-[13.5px] text-muted">Udhar ledger &amp; payment history for your customers.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <UserPlus size={15} /> Add customer
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={UsersIcon} label="Total Customers" value={customers.length} hint="Accounts on file" tone="accent" />
        <StatCard
          icon={Wallet}
          label="Outstanding Udhar"
          value={formatMoney(totals.outstanding)}
          hint={`${totals.withDues} customer${totals.withDues === 1 ? '' : 's'} with dues`}
          tone="danger"
        />
        <StatCard
          icon={Wallet}
          label="You Owe"
          value={formatMoney(totals.youOwe)}
          hint={`${totals.owedTo} customer${totals.owedTo === 1 ? '' : 's'} owed`}
          tone="warning"
        />
        <StatCard icon={TrendingUp} label="Total Collected" value={formatMoney(totals.collected)} hint="All-time payments received" tone="success" />
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

      {loading && <p className="text-[13px] text-muted">Loading customers…</p>}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title={customers.length === 0 ? 'No customers yet' : 'No matches'}
          description={
            customers.length === 0
              ? 'Add your first customer to start tracking udhar and payments.'
              : 'Try a different name or phone number.'
          }
          action={
            customers.length === 0 ? (
              <Button onClick={() => setShowAdd(true)}>
                <UserPlus size={15} /> Add customer
              </Button>
            ) : undefined
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
                  <div className="truncate text-[12.5px] text-muted">{c.phone || 'No phone on file'}</div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.balance > 0 ? (
                  <Badge tone="danger">{formatMoney(c.balance)} due</Badge>
                ) : c.balance < 0 ? (
                  <Badge tone="warning">You owe {formatMoney(Math.abs(c.balance))}</Badge>
                ) : (
                  <Badge tone="neutral">Settled</Badge>
                )}
                <span className="flex items-center gap-1 text-[11.5px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                  View ledger <ArrowUpRight size={12} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && <AddCustomerModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
