import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Plus, Search, Wallet, Receipt, TrendingUp } from 'lucide-react'
import { useSupplierStore } from '../store/useSupplierStore'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import AddSupplierModal from '../components/AddSupplierModal'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function formatDate(d) {
  if (!d) return 'No activity yet'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Suppliers() {
  const { suppliers, loading, fetchSuppliers } = useSupplierStore()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)
    )
  }, [suppliers, query])

  const totals = useMemo(() => {
    const totalAmount = suppliers.reduce((sum, s) => sum + s.total_net_amount, 0)
    const totalTxns = suppliers.reduce((sum, s) => sum + s.txn_count, 0)
    return { totalAmount, totalTxns }
  }, [suppliers])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Suppliers</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Per-supplier ledgers — import daily transaction reports and track totals.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add supplier
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={Truck} label="Total Suppliers" value={suppliers.length} hint="Accounts on file" tone="accent" />
        <StatCard
          icon={Wallet}
          label="Total Net Amount"
          value={formatMoney(totals.totalAmount)}
          hint="After 3% commission, rounded to nearest 10"
          tone="warning"
        />
        <StatCard icon={Receipt} label="Total Transactions" value={totals.totalTxns} hint="Imported + manual entries" tone="success" />
      </div>

      <div className="relative min-w-[220px] flex-1">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search by supplier name or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      {loading && <p className="text-[13px] text-muted">Loading suppliers…</p>}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={Truck}
          title={suppliers.length === 0 ? 'No suppliers yet' : 'No matches'}
          description={
            suppliers.length === 0
              ? 'Add JIO, VIVO, OPPO, or any other supplier to start tracking their ledger.'
              : 'Try a different name or category.'
          }
          action={
            suppliers.length === 0 ? (
              <Button onClick={() => setShowAdd(true)}>
                <Plus size={15} /> Add supplier
              </Button>
            ) : undefined
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s, i) => (
            <button
              key={s.id}
              onClick={() => navigate(`/suppliers/${s.id}`)}
              className="group flex animate-pop-in flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Truck size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{s.name}</div>
                    {s.category && <div className="truncate text-[11.5px] text-muted">{s.category}</div>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-[12.5px]">
                <span className="text-muted">{s.txn_count} txns</span>
                <span className="flex items-center gap-1 font-semibold">
                  <TrendingUp size={13} className="text-accent" /> {formatMoney(s.total_net_amount)}
                </span>
              </div>
              <div className="text-[11.5px] text-muted">Last activity: {formatDate(s.last_txn_date)}</div>
            </button>
          ))}
        </div>
      )}

      {showAdd && <AddSupplierModal onClose={() => setShowAdd(false)} onSaved={fetchSuppliers} />}
    </div>
  )
}
