export default function CollegeLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/PEC_LOGO.png"
      alt="Panimalar Engineering College crest"
      className={`block object-contain ${className}`}
    />
  )
}
