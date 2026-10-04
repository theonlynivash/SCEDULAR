import { useEffect, useState } from 'react'
import { fetchPhotoUrl } from '../api'

const cache = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()

/** Call after a picture was set or removed so every Avatar on screen reloads it. */
export function photoChanged(facultyId: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(`${facultyId}|`)) cache.delete(k)
  listeners.forEach(l => l())
}

export const initialsOf = (name: string) => {
  const w = name.replace(/^(dr|mr|mrs|ms|prof)\.?\s*/i, '').split(/[\s.]+/).filter(Boolean)
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '?'
}

/**
 * A teacher's round picture, or their initials when they have none.
 * `photoAt`: when the picture was last set (null = none, so nothing is fetched; undefined = unknown, try once).
 */
export default function Avatar({ id, name, photoAt, size = 32, className = '' }: { id: string; name: string; photoAt?: string | null; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { const l = () => setTick(t => t + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  useEffect(() => {
    let live = true
    if (photoAt === null) { setSrc(null); return }
    const key = `${id}|${photoAt ?? ''}`
    if (!cache.has(key)) cache.set(key, fetchPhotoUrl(id).catch(() => null))
    cache.get(key)!.then(u => { if (live) setSrc(u) })
    return () => { live = false }
  }, [id, photoAt, tick])

  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }
  return src
    ? <img src={src} alt={name} style={style} className={`rounded-full object-cover shrink-0 ring-1 ring-white/30 ${className}`} />
    : <span style={style} className={`rounded-full grid place-items-center font-700 shrink-0 text-[#c9a24a] bg-gradient-to-br from-[#17403d] to-[#0f2f2d] ring-1 ring-[#c9a24a]/50 ${className}`} title={name}>{initialsOf(name)}</span>
}
