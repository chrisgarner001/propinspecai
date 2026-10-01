'use client'

import { useRef, useState } from 'react'

// Longest side after resize. 1600px is plenty for a room or a meter dial and
// keeps each upload ~300-800KB -- under the Server Action body limit
// (next.config.ts) on a cellular connection in a vacant house.
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

// Re-encodes in the browser: shrinks the photo AND converts the iPad's
// native HEIC to JPEG (Safari decodes HEIC into an <img> natively), so the
// server only ever stores JPEG (lib/fieldPhotos.ts checks the bytes).
async function resizeToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that photo.'))
      el.src = url
    })
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that photo.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', JPEG_QUALITY),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function PhotoCapture({
  upload,
  hasPhoto,
  label = 'Take photo',
}: {
  upload: (formData: FormData) => Promise<{ error?: string }>
  hasPhoto: boolean
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'uploading'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after a failure
    if (!file) return
    setError(null)
    setStatus('uploading')
    try {
      const jpeg = await resizeToJpeg(file)
      const formData = new FormData()
      formData.append('photo', jpeg, 'photo.jpg')
      const result = await upload(formData)
      if (result.error) setError(result.error)
    } catch (err) {
      setError((err as Error).message || 'Upload failed. Check the connection and try again.')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div>
      {/* capture="environment" opens the rear camera directly on iPad/iPhone; desktop browsers fall back to a file picker. */}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'uploading'}
        className="min-h-11 bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-4 text-[15px] font-semibold disabled:opacity-50"
      >
        {status === 'uploading' ? 'Uploading…' : hasPhoto ? 'Retake photo' : label}
      </button>
      {error && <div className="text-[13px] text-error mt-1">{error}</div>}
    </div>
  )
}
