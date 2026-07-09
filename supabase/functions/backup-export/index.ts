// Exports every table in the app to one JSON snapshot and uploads it to
// the private `backups` storage bucket (path: weekly/backup-<date>-<ts>.json).
//
// Called two ways:
// 1. Weekly, by a pg_cron job (see supabase/migrations/20260705_backup_system.sql)
//    that hits this function over HTTP with the project's service role key
//    as the Authorization header — treated as a trusted system call.
// 2. On demand, by the "Backup now" button in the app (src/pages/Backups.jsx),
//    which calls `supabase.functions.invoke('backup-export')` with the
//    signed-in user's own access token — only owner/builder may trigger this.
//
// Keeps the most recent KEEP_BACKUPS snapshots and prunes older ones so the
// bucket doesn't grow forever.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Order doesn't matter for export (unlike restore), just completeness.
const TABLES = [
  'locations',
  'items',
  'tags',
  'item_locations',
  'item_tags',
  'products',
  'inventory_units',
  'device_identifiers',
  'customers',
  'customer_transactions',
  'bills',
  'bill_items',
  'repairs',
]

const KEEP_BACKUPS = 12 // roughly a quarter's worth of weekly snapshots

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const isSystemCall = token === serviceKey
    if (!isSystemCall) {
      // Manual call from the app — only owner/builder may trigger a backup.
      const callerClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await callerClient.auth.getUser()
      if (userError || !userData?.user) return json({ error: 'Unauthorized.' }, 401)

      const { data: profile } = await callerClient
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single()

      if (!profile || !['owner', 'builder'].includes(profile.role)) {
        return json({ error: 'Only owner/builder can run a backup.' }, 403)
      }
    }

    const admin = createClient(url, serviceKey)

    const tables: Record<string, unknown[]> = {}
    for (const table of TABLES) {
      const { data, error } = await admin.from(table).select('*')
      if (error) throw new Error(`Failed to export "${table}": ${error.message}`)
      tables[table] = data ?? []
    }

    const backup = {
      version: 1,
      generated_at: new Date().toISOString(),
      tables,
    }

    const filename = `backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`
    const path = `weekly/${filename}`

    const { error: uploadError } = await admin.storage
      .from('backups')
      .upload(path, new TextEncoder().encode(JSON.stringify(backup)), {
        contentType: 'application/json',
        upsert: false,
      })
    if (uploadError) throw new Error(`Failed to upload backup: ${uploadError.message}`)

    // Prune anything beyond the most recent KEEP_BACKUPS snapshots.
    const { data: existing } = await admin.storage.from('backups').list('weekly', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'asc' },
    })
    if (existing && existing.length > KEEP_BACKUPS) {
      const toDelete = existing
        .slice(0, existing.length - KEEP_BACKUPS)
        .map((f) => `weekly/${f.name}`)
      if (toDelete.length) await admin.storage.from('backups').remove(toDelete)
    }

    const rowCounts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]))

    return json({ ok: true, path, rowCounts, generatedAt: backup.generated_at })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
