export default function ScedularLogo({ className = '' }: { className?: string }) {
  return <img src="/SCEDULAR_LOGO_1.png" alt="SCEDULAR" className={className ? `block object-contain ${className}` : 'block w-full max-w-[360px] h-auto'} />
}
