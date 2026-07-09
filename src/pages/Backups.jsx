import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DatabaseBackup, Download, RefreshCw, Trash2, Upload, ShieldAlert } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Blocks the actual restore behind a typed confirmation — this wipes and
// replaces every table in the app, so a stray double-click must not be
// enough to trigger it.
function RestoreConfirmModal({ summary, onCancel, onConfirm, restoring }) {
  const [text, setText] = useState('')
  const canConfirm = text.trim().toUpperCase() === 'RESTORE'

  return (
    <div
      onMouseDown={onCancel}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl border border-border bg-surface p-5 shadow-card-hover"
      >
        <div className="flex items-center gap-2 text-danger">
          <ShieldAlert size={18} />
          <h2 className="text-[15px] font-semibold">Restore this backup?</h2>
        </div>
        <p className="mt-2.5 text-[13px] text-muted">
          This replaces <strong>every</strong> item, product, IMEI, bill, and customer record
          currently in the app with what's in this backup ({formatDate(summary?.generated_at)}).
          Anything created or sold after that snapshot will be gone. This cannot be undone.
        </p>
        <p className="mt-3 text-[12.5px] text-muted">
          Type <strong>RESTORE</strong> to confirm.
        </p>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="RESTORE"
          className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none focus:border-danger"
        />
        <div className="mt-4 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onCancel} disabled={restoring}>Cancel</Button>
          <Button
            variant="danger"
            className="!border-danger/40 !text-danger hover:!bg-danger-soft"
            disabled={!canConfirm || restoring}
            onClick={onConfirm}
          >
            {restoring ? 'Restoring…' : 'Restore & overwrite'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Backups() {
  const { backups, backupsLoading, fetchBackupsList, triggerBackupNow, downloadBackup, deleteBackup, restoreFromBackup } =
    useStore()

  const [runningBackup, setRunningBackup] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(null) // { source: 'list'|'file', name, json }
  const [restoring, setRestoring] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchBackupsList().catch((err) => toast.error(err.message))
  }, [])

  async function handleBackupNow() {
    setRunningBackup(true)
    try {
      const result = await triggerBackupNow()
      const total = Object.values(result?.rowCounts ?? {}).reduce((s, n) => s + n, 0)
      toast.success(`Backup created — ${total} rows across ${Object.keys(result?.rowCounts ?? {}).length} tables.`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRunningBackup(false)
    }
  }

  async function handleDownload(file) {
    try {
      const blob = await downloadBackup(file.name)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDelete(file) {
    try {
      await deleteBackup(file.name)
      toast.success('Backup deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleRestoreFromList(file) {
    try {
      const blob = await downloadBackup(file.name)
      const text = await blob.text()
      const json = JSON.parse(text)
      setPendingRestore({ source: 'list', name: file.name, json })
    } catch (err) {
      toast.error(`Couldn't read that backup: ${err.message}`)
    }
  }

  function handleFilePicked(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result)
        if (!json?.tables) throw new Error('This file doesn\u2019t look like a valid backup export.')
        setPendingRestore({ source: 'file', name: file.name, json })
      } catch (err) {
        toast.error(err.message)
      }
    }
    reader.readAsText(file)
  }

  async function confirmRestore() {
    if (!pendingRestore) return
    setRestoring(true)
    try {
      const result = await restoreFromBackup(pendingRestore.json)
      const total = Object.values(result?.rowCounts ?? {}).reduce((s, n) => s + Number(n || 0), 0)
      toast.success(`Restored — ${total} rows loaded back in.`)
      setPendingRestore(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Backups</h1>
          <p className="mt-1 max-w-[520px] text-[13px] text-muted">
            A full snapshot of every item, product, bill, customer, and repair ticket runs
            automatically every week. You can also back up on demand, download a copy, or restore
            from any snapshot below (or a file exported from here previously).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Upload} onClick={() => fileInputRef.current?.click()}>
            Import backup
          </Button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFilePicked} />
          <Button icon={DatabaseBackup} onClick={handleBackupNow} disabled={runningBackup}>
            {runningBackup ? 'Backing up…' : 'Backup now'}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Weekly snapshots</h2>
        <button
          onClick={() => fetchBackupsList().catch((err) => toast.error(err.message))}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-accent-soft hover:text-accent"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {backupsLoading && <p className="mt-4 text-[13px] text-muted">Loading…</p>}

      {!backupsLoading && backups.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={DatabaseBackup}
            title="No backups yet"
            description="Hit “Backup now”, or wait for Sunday \u2014 the weekly job will create one automatically."
          />
        </div>
      )}

      {!backupsLoading && backups.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {backups.map((file) => (
            <div
              key={file.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-card"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium">{file.name}</div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {formatDate(file.created_at)} · {formatBytes(file.metadata?.size)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="secondary" icon={Download} onClick={() => handleDownload(file)}>
                  Download
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleRestoreFromList(file)}>
                  Restore
                </Button>
                <button
                  onClick={() => handleDelete(file)}
                  className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                  title="Delete backup"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingRestore && (
        <RestoreConfirmModal
          summary={pendingRestore.json}
          restoring={restoring}
          onCancel={() => !restoring && setPendingRestore(null)}
          onConfirm={confirmRestore}
        />
      )}
    </div>
  )
}
