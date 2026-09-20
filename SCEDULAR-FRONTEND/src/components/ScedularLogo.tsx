export default function ScedularLogo({ className = '' }: { className?: string }) {
  return <img src="/SCEDULAR_LOGO.png" alt="SCEDULAR timetable system" className={className ? `block object-contain ${className}` : 'block w-full max-w-[360px] h-auto'} />
}
