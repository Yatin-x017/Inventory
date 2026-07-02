import { useRef, useState } from 'react'
import { ImageOff, X, Upload, Loader, Link as LinkIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BUCKET = 'item-images'
const MAX_FILE_SIZE_MB = 5

export default function PhoneImagePicker({ value, onChange }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_FILE_SIZE_MB}MB.`)
      return
    }

    setError('')
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err) {
      if (err.message?.includes('Bucket not found')) {
        setError(`Storage bucket "${BUCKET}" doesn't exist yet — create it in Supabase (Storage → New bucket, public).`)
      } else {
        setError(err.message || 'Upload failed.')
      }
    } finally {
      setUploading(false)
    }
  }

  const inputClass =
    'rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent w-full'

  return (
    <div className="flex flex-col gap-2">
      {/* Current image preview */}
      {value ? (
        <div className="relative flex items-center gap-3 rounded-xl border border-border bg-bg p-2">
          <img
            src={value}
            alt="Item"
            className="h-16 w-12 shrink-0 rounded-lg object-contain"
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <p className="min-w-0 flex-1 truncate text-[12px] text-muted">{value}</p>
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-danger-soft hover:text-danger"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-bg px-3 py-3 text-[12.5px] text-muted">
          <ImageOff size={14} className="shrink-0" />
          <span>No image selected</span>
        </div>
      )}

      {/* Upload from device */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2.5 text-[13px] font-medium text-text transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
      >
        {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
        {uploading ? 'Uploading…' : 'Upload image'}
      </button>

      <div className="flex items-center gap-2 text-[11px] text-muted">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Manual URL paste */}
      <div className="relative">
        <LinkIcon size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="url"
          placeholder="Paste an image URL"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pl-8`}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-warning-soft/30 px-3 py-2 text-[12.5px] font-medium text-warning">
          {error}
        </p>
      )}
    </div>
  )
}
