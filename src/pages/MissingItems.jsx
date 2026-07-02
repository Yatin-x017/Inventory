import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardList, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'

const STATUS_TONE = {
  pending: 'warning',
  sourced: 'accent',
  fulfilled: 'success',
  dropped: 'danger',
}

export default function MissingItems() {
  const { profile, canManageInventory } = useAuth()
  const [entries, setEntries] = useState([])
  const [itemName, setItemName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchEntries() {
    const { data } = await supabase
      .from('missing_items')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!itemName.trim()) return
    const { error } = await supabase.from('missing_items').insert({
      item_name: itemName,
      notes,
      logged_by: profile.id,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Logged it')
    setItemName('')
    setNotes('')
    fetchEntries()
  }

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from('missing_items')
      .update({ status, resolved_at: status === 'pending' ? null : new Date().toISOString() })
      .eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Status updated')
    fetchEntries()
  }

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight">Missing Items</h1>
      <p className="mt-1 text-[13px] text-muted">Log items customers asked for that weren't in stock.</p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row">
        <input
          type="text"
          placeholder="Item name"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none placeholder:text-muted focus:border-accent"
        />
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none placeholder:text-muted focus:border-accent"
        />
        <Button type="submit">
          <Send size={14} /> Log it
        </Button>
      </form>

      {loading && <p className="mt-6 text-[13px] text-muted">Loading…</p>}

      {!loading && entries.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={ClipboardList} title="No missing items logged" description="Nice — nothing outstanding right now." />
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium">Logged by</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canManageInventory && <th className="px-4 py-3 font-medium">Update</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-border/70 transition-colors hover:bg-accent-soft/40 ${idx % 2 === 1 ? 'bg-bg/40' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">{entry.item_name}</td>
                    <td className="px-4 py-3 text-muted">{entry.notes || '—'}</td>
                    <td className="px-4 py-3 text-muted">{entry.profiles?.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[entry.status] || 'neutral'}>{entry.status}</Badge>
                    </td>
                    {canManageInventory && (
                      <td className="px-4 py-3">
                        <select
                          value={entry.status}
                          onChange={(e) => updateStatus(entry.id, e.target.value)}
                          className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[12.5px]"
                        >
                          <option value="pending">Pending</option>
                          <option value="sourced">Sourced</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="dropped">Dropped</option>
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
