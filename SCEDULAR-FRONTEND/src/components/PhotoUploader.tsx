import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { api } from '../api'
import Avatar, { photoChanged } from './Avatar'

/** Centre-crop any picture to a 256 x 256 JPEG (about 20 KB) in the browser before it is uploaded. */
export async function resizeToDataUrl(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Picture of a teacher with "Change photo" / "Remove". Used on the profile page (own picture) and by the HOD. */
export default function PhotoUploader({ facultyId, name, photoAt, size = 64, onChanged }: { facultyId: string; name: string; photoAt?: string | null; size?: number; onChanged?: (photoAt: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function choose(file?: File) {
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
      const r = await api.photo.set(facultyId, await resizeToDataUrl(file))
      photoChanged(facultyId); onChanged?.(r.photoAt); setMsg({ ok: true, text: 'Photo saved.' })
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save the photo.' }) }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function remove() {
    setBusy(true); setMsg(null)
    try { await api.photo.remove(facultyId); photoChanged(facultyId); onChanged?.(null) }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not remove it.' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Avatar id={facultyId} name={name} photoAt={photoAt} size={size} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} title="Change photo" className="absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-white border border-slate-200 shadow text-slate-600 hover:text-[color:var(--c-600)] disabled:opacity-50"><Camera className="w-3.5 h-3.5" /></button>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => choose(e.target.files?.[0])} />
      <div className="text-xs">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="font-700 text-[color:var(--c-600)] hover:underline disabled:opacity-50">{busy ? 'Saving…' : photoAt ? 'Change photo' : 'Add a photo'}</button>
        {photoAt && <button type="button" disabled={busy} onClick={remove} className="ml-3 text-slate-500 hover:text-rose-600 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Remove</button>}
        {msg && <p className={`mt-0.5 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
