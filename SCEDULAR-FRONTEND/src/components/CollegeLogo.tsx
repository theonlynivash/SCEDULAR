export default function CollegeLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/pec-logo.png"
      alt="Panimalar Engineering College crest"
      className={`block object-contain aspect-square ${className}`}
    />
  )
}
