// Standalone SCEDULAR wordmark -- deliberately not the Panimalar crest
// (CollegeLogo). Used only on the About page: a navy accent bar over the
// leading letters, a mirrored "E" boxed like a flipped calendar cell (the
// schedule-grid pun in the original mark), and a red accent bar trailing
// the last letters.
export default function ScedularLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex flex-col items-stretch ${className}`}>
      <div className="h-2.5 w-[42%] rounded-sm mb-1.5" style={{ background: '#1a12d1' }} />
      <div className="flex items-center gap-[2px] font-display font-800 tracking-tight text-slate-900 leading-none" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}>
        <span>S</span>
        <span>C</span>
        <span className="inline-flex items-center justify-center rounded px-1.5 mx-0.5" style={{ background: '#c3ccd9' }}>
          <span className="inline-block" style={{ transform: 'scaleX(-1)' }}>E</span>
        </span>
        <span>D</span>
        <span>U</span>
        <span>L</span>
        <span>A</span>
        <span>R</span>
      </div>
      <div className="h-2.5 w-[42%] self-end rounded-sm mt-1.5" style={{ background: '#ff3b30' }} />
    </div>
  )
}
