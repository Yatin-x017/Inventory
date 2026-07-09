import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users as UsersIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EmptyState from '../components/ui/EmptyState'

function Initials({ name }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">
      {initials}
    </div>
  )
}

export default function Users() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function updateRole(id, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Role updated')
    fetchProfiles()
  }

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight">Staff</h1>
      <p className="mt-1 text-[13px] text-muted">
        New staff: create their login in the Supabase Auth dashboard first, then assign a role here.
      </p>

      {loading && <p className="mt-6 text-[13px] text-muted">Loading…</p>}

      {!loading && profiles.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={UsersIcon} title="No staff accounts yet" />
        </div>
      )}

      {profiles.length > 0 && (
        <div className="mt-6 flex flex-col gap-2.5">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-card"
            >
              <div className="flex items-center gap-3">
                <Initials name={p.full_name} />
                <span className="text-[13.5px] font-medium">{p.full_name}</span>
              </div>
              <select
                value={p.role}
                onChange={(e) => updateRole(p.id, e.target.value)}
                className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[12.5px] capitalize"
              >
                <option value="owner">Owner</option>
                <option value="builder">Builder</option>
                <option value="marketing_member">Marketing Member</option>
                <option value="salesman">Salesman</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
