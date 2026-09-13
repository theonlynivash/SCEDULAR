export default function CollegeLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/PEC-Logo-Updated-July-12-2024-218x150.png"
      alt="Panimalar Engineering College crest"
      className={`block object-contain aspect-square ${className}`}
    />
  )
}
