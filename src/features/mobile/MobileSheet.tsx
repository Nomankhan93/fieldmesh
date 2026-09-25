import { useEffect, type PropsWithChildren, type ReactNode } from 'react'

type MobileSheetProps = PropsWithChildren<{
  open: boolean
  title: string
  description?: string
  onClose: () => void
  tone?: 'default' | 'danger'
  footer?: ReactNode
}>

export function MobileSheet({
  open,
  title,
  description,
  onClose,
  tone = 'default',
  footer,
  children,
}: MobileSheetProps) {
  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 1023px)').matches) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] lg:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close sheet"
        className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto rounded-t-[1.75rem] border border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className={`text-xl font-bold ${tone === 'danger' ? 'text-rose-950' : 'text-slate-950'}`}>{title}</h2>
            {description ? <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="connectx-touch shrink-0 rounded-full bg-slate-100 px-3 text-sm font-bold text-slate-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-5">{footer}</div> : null}
      </section>
    </div>
  )
}
