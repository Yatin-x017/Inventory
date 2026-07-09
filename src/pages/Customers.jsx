import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet,
  UserPlus,
  Search,
  Users as UsersIcon,
  TrendingUp,
  ArrowUpRight,
  Receipt,
  X,
  UserCog,
  Phone,
  Upload,
  Download,
} from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import AddCustomerModal from '../components/AddCustomerModal'
import ImportCustomersModal from '../components/ImportCustomersModal'
import { exportCustomersToExcel } from '../lib/customersExcel'

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

function formatDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Customers() {
  const {
    customers,
    loading,
    fetchCustomers,
    marketingMembers,
    fetchMarketingMembers,
    todaySummary,
    fetchTodaySummary,
    rangeSummary,
    rangeSummaryLoading,
    fetchRangeSummary,
  } = useCustomerStore()
  const { isTopTierCustomers } = useAuth()
  const [query, setQuery] = useState('')
  const [memberFilter, setMemberFilter] = useState('all') // 'all' | 'unassigned' | profile id
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchCustomers()
    fetchTodaySummary().catch(() => {})
    if (isTopTierCustomers) fetchMarketingMembers().catch(() => {})
  }, [isTopTierCustomers])

  // Once a "last activity" date filter is applied, pull real transaction
  // totals for that exact date range (and member, if scoped) so the page
  // can show a "Selected period" summary bar instead of nothing.
  useEffect(() => {
    if (!dateFrom && !dateTo) return
    fetchRangeSummary(dateFrom || null, dateTo || null, memberFilter).catch(() => {})
  }, [dateFrom, dateTo, memberFilter])

  const manualCustomers = useMemo(() => customers.filter((c) => c.source !== 'billing'), [customers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return manualCustomers.filter((c) => {
      if (q && !(c.name.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q))) return false
      if (memberFilter === 'unassigned' && c.assigned_to) return false
      if (memberFilter !== 'all' && memberFilter !== 'unassigned' && c.assigned_to !== memberFilter) return false
      if (dateFrom && (!c.last_transaction_date || c.last_transaction_date < dateFrom)) return false
      if (dateTo && (!c.last_transaction_date || c.last_transaction_date > dateTo)) return false
      return true
    })
  }, [manualCustomers, query, memberFilter, dateFrom, dateTo])

  const totals = useMemo(() => {
    const outstanding = manualCustomers.reduce((sum, c) => sum + Math.max(c.balance, 0), 0)
    const withDues = manualCustomers.filter((c) => c.balance > 0).length
    const collected = manualCustomers.reduce((sum, c) => sum + c.total_payment, 0)
    const youOwe = manualCustomers.reduce((sum, c) => sum + Math.max(-c.balance, 0), 0)
    const owedTo = manualCustomers.filter((c) => c.balance < 0).length
    return { outstanding, withDues, collected, youOwe, owedTo }
  }, [manualCustomers])

  const hasFilters = query || memberFilter !== 'all' || dateFrom || dateTo

  function handleExport() {
    exportCustomersToExcel(filtered)
  }

  function clearFilters() {
    setQuery('')
    setMemberFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Retailers</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {isTopTierCustomers
              ? 'Udhar ledger across every marketing member\u2019s book.'
              : 'Udhar ledger for your assigned retailers.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Import
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={filtered.length === 0}>
            <Download size={15} /> Export
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus size={15} /> Add retailer
          </Button>
        </div>
      </div>

      {/* Today's activity — the "today's billings" summary */}
      <div>
        <h2 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">Today</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Receipt}
            label="Today's Billings"
            value={formatMoney(todaySummary.udharGiven)}
            hint="Udhar given out today"
            tone="danger"
          />
          <StatCard
            icon={Wallet}
            label="Collected Today"
            value={formatMoney(todaySummary.paymentsCollected)}
            hint="Payments received today"
            tone="success"
          />
          <StatCard
            icon={Wallet}
            label="You Paid Today"
            value={formatMoney(todaySummary.youPaid)}
            hint={todaySummary.youOwed > 0 ? `+ ${formatMoney(todaySummary.youOwed)} newly owed` : 'Paid out to retailers today'}
            tone="warning"
          />
          <StatCard
            icon={TrendingUp}
            label="Entries Today"
            value={todaySummary.count}
            hint="Ledger entries recorded today"
            tone="accent"
          />
        </div>
      </div>

      {/* All-time overview */}
      <div>
        <h2 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">All time</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={UsersIcon} label="Total Retailers" value={manualCustomers.length} hint="Accounts on file" tone="accent" />
          <StatCard
            icon={Wallet}
            label="Outstanding Udhar"
            value={formatMoney(totals.outstanding)}
            hint={`${totals.withDues} retailer${totals.withDues === 1 ? '' : 's'} with dues`}
            tone="danger"
          />
          <StatCard
            icon={Wallet}
            label="You Owe"
            value={formatMoney(totals.youOwe)}
            hint={`${totals.owedTo} retailer${totals.owedTo === 1 ? '' : 's'} owed`}
            tone="warning"
          />
          <StatCard icon={TrendingUp} label="Total Collected" value={formatMoney(totals.collected)} hint="All-time payments received" tone="success" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              placeholder="Search by name or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
          </div>

          {isTopTierCustomers && (
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-accent"
            >
              <option value="all">All marketing members</option>
              <option value="unassigned">Unassigned</option>
              {marketingMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Last activity from"
            className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-accent"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Last activity to"
            className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-accent"
          />

          {hasFilters && (
            <Button variant="ghost" size="md" onClick={clearFilters}>
              <X size={14} /> Clear
            </Button>
          )}
        </div>
        {(dateFrom || dateTo) && (
          <p className="text-[12px] text-muted">Filtering by last transaction date{isTopTierCustomers ? ' and marketing member' : ''}.</p>
        )}
      </div>

      {/* Selected period — real transaction totals for the applied date filter */}
      {(dateFrom || dateTo) && (
        <div>
          <h2 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
            Selected period{dateFrom && dateTo ? ` \u2022 ${formatDate(dateFrom)} \u2013 ${formatDate(dateTo)}` : ''}
          </h2>
          {rangeSummaryLoading && !rangeSummary ? (
            <p className="text-[13px] text-muted">Loading period totals…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={Receipt}
                label="Billings"
                value={formatMoney(rangeSummary?.udharGiven)}
                hint="Udhar given out in range"
                tone="danger"
              />
              <StatCard
                icon={Wallet}
                label="Collected"
                value={formatMoney(rangeSummary?.paymentsCollected)}
                hint="Payments received in range"
                tone="success"
              />
              <StatCard
                icon={Wallet}
                label="You Paid"
                value={formatMoney(rangeSummary?.youPaid)}
                hint={
                  rangeSummary?.youOwed > 0 ? `+ ${formatMoney(rangeSummary.youOwed)} newly owed` : 'Paid out to retailers in range'
                }
                tone="warning"
              />
              <StatCard
                icon={TrendingUp}
                label="Entries"
                value={rangeSummary?.count ?? 0}
                hint="Ledger entries recorded in range"
                tone="accent"
              />
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-[13px] text-muted">Loading retailers…</p>}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title={manualCustomers.length === 0 ? 'No retailers yet' : 'No matches'}
          description={
            manualCustomers.length === 0
              ? 'Add your first retailer to start tracking udhar and payments.'
              : 'Try a different name, phone number, or filter.'
          }
          action={
            manualCustomers.length === 0 ? (
              <Button onClick={() => setShowAdd(true)}>
                <UserPlus size={15} /> Add retailer
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
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {c.phone}
                      </span>
                    )}
                    {isTopTierCustomers && (
                      <span className="flex items-center gap-1">
                        <UserCog size={11} /> {c.assigned_profile?.full_name ?? 'Unassigned'}
                      </span>
                    )}
                    {formatDate(c.last_transaction_date) && (
                      <span>Last activity {formatDate(c.last_transaction_date)}</span>
                    )}
                    {!c.phone && !formatDate(c.last_transaction_date) && 'No activity yet'}
                  </div>
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
      {showImport && (
        <ImportCustomersModal onClose={() => setShowImport(false)} onDone={() => fetchCustomers()} />
      )}
    </div>
  )
}
