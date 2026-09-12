import { useState } from 'react'

// Renders the real Panimalar Engineering College crest from
// /public/pec-logo.png. Falls back to a simple monogram mark if that
// file hasn't been added yet, so the app never shows a broken image.
export default function CollegeLogo({ className = '' }: { className?: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <svg viewBox="0 0 36 36" className={className} fill="none">
        <path d="M8 24L18 10L28 24" stroke="#0e254f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 20H24" stroke="#0e254f" strokeWidth="2" strokeLinecap="round" />
        <circle cx="18" cy="26" r="2" fill="#f3c326" />
      </svg>
    )
  }

  return (
    <img
      src="/pec-logo.png"
      alt="Panimalar Engineering College crest"
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
