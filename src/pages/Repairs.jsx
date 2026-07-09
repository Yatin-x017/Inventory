import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wrench, Plus, Search, CheckCircle2, IndianRupee, Trash2, Pencil } from 'lucide-react'
import { useRepairStore } from '../store/useRepairStore'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'
import RepairModal, { STATUSES } from '../components/RepairModal'

const STATUS_TONE = {
  received: 'neutral',
  diagnosing: 'accent',
  in_progress: 'accent',
  waiting_for_parts: 'warning',
  completed: 'success',
  delivered: 'success',
  cancelled: 'danger',
}

const OPEN_STATUSES = ['received', 'diagnosing', 'in_progress', 'waiting_for_parts']

function statusLabel(value) {
  return STATUSES.find((s) => s.value === value)?.label ?? value
}

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Repairs() {
  const { repairs, loading, fetchRepairs, setRepairStatus, deleteRepair } = useRepairStore()
  const { canManageInventory } = useAuth()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalRepair, setModalRepair] = useState(null) // null = closed, {} = new, {...} = edit
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    fetchRepairs().catch((err) => toast.error(err.message))
  }, [])

  const totals = useMemo(() => {
    const open = repairs.filter((r) => OPEN_STATUSES.includes(r.status)).length
    const now = new Date()
    const completedThisMonth = repairs.filter(
      (r) =>
        ['completed', 'delivered'].includes(r.status) &&
        r.completed_date &&
        new Date(r.completed_date).getMonth() === now.getMonth() &&
        new Date(r.completed_date).getFullYear() === now.getFullYear()
    )
    const revenueThisMonth = completedThisMonth.reduce(
      (sum, r) => sum + Number(r.final_cost ?? r.estimated_cost ?? 0),
      0
    )
    return { open, completedThisMonth: completedThisMonth.length, revenueThisMonth }
  }, [repairs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return repairs.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      return (
        r.customer_name?.toLowerCase().includes(q) ||
        r.customer_phone?.toLowerCase().includes(q) ||
        r.device_brand?.toLowerCase().includes(q) ||
        r.device_model?.toLowerCase().includes(q) ||
        r.device_imei?.toLowerCase().includes(q) ||
        r.issue_description?.toLowerCase().includes(q)
      )
    })
  }, [repairs, query, statusFilter])

  async function handleStatusChange(id, status) {
    try {
      await setRepairStatus(id, status)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await deleteRepair(id)
      toast.success('Repair ticket deleted')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Repairs</h1>
          <p className="mt-1 max-w-[520px] text-[13.5px] text-muted">
            Track every device that comes in for repair — status, parts, and cost, from intake to
            pickup.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModalRepair({})}>
          New ticket
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={Wrench} label="Open tickets" value={totals.open} hint="In progress right now" tone="accent" />
        <StatCard
          icon={CheckCircle2}
          label="Completed this month"
          value={totals.completedThisMonth}
          hint="Finished or delivered"
          tone="success"
        />
        <StatCard
          icon={IndianRupee}
          label="Revenue this month"
          value={formatMoney(totals.revenueThisMonth)}
          hint="From completed repairs"
          tone="warning"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search by customer, phone, device, IMEI…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              statusFilter === 'all' ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-text'
            }`}
          >
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                statusFilter === s.value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-[13px] text-muted">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={Wrench}
          title={repairs.length === 0 ? 'No repair tickets yet' : 'No matches'}
          description={
            repairs.length === 0
              ? 'Log a device that comes in for repair with "New ticket" above.'
              : 'Try a different search or status filter.'
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r, i) => (
            <div
              key={r.id}
              className="flex animate-pop-in flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-150 hover:shadow-card-hover sm:flex-row sm:items-center sm:justify-between"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{r.customer_name}</span>
                  <Badge tone={STATUS_TONE[r.status]} dot>{statusLabel(r.status)}</Badge>
                </div>
                <div className="mt-1 truncate text-[12.5px] text-muted">
                  {[r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Device not specified'}
                  {r.device_imei && ` · ${r.device_imei}`}
                </div>
                <div className="mt-1 truncate text-[12.5px] text-text/80">{r.issue_description}</div>
                <div className="mt-1.5 text-[11.5px] text-muted">
                  Received {formatDate(r.received_date)}
                  {r.completed_date && ` · Completed ${formatDate(r.completed_date)}`}
                  {(r.final_cost ?? r.estimated_cost) != null &&
                    ` · ${formatMoney(r.final_cost ?? r.estimated_cost)}${r.final_cost == null ? ' (est.)' : ''}`}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <select
                  value={r.status}
                  onChange={(e) => handleStatusChange(r.id, e.target.value)}
                  className="rounded-lg border border-border bg-bg px-2.5 py-2 text-[12.5px] outline-none focus:border-accent"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setModalRepair(r)}
                  className="rounded-lg p-2 text-muted hover:bg-accent-soft hover:text-accent"
                  title="Edit ticket"
                >
                  <Pencil size={15} />
                </button>
                {canManageInventory && (
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    title="Delete ticket"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalRepair && (
        <RepairModal
          repair={modalRepair.id ? modalRepair : null}
          onClose={() => setModalRepair(null)}
          onSaved={() => toast.success(modalRepair.id ? 'Ticket updated' : 'Repair ticket created')}
        />
      )}
    </div>
  )
}
