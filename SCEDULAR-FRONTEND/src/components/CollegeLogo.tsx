export default function CollegeLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}PEC_LOGO.png`}
      alt="Panimalar Engineering College crest"
      className={`block object-contain ${className}`}
    />
  )
}
