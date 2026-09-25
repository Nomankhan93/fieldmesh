import { avatarInitials, avatarTone } from './messengerUi'

export function MessengerAvatar({
  label,
  group = false,
  size = 'md',
}: {
  label: string
  group?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-11 w-11 text-sm'

  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone(label)} ${sizeClass} font-black tracking-wide text-white shadow-sm`} aria-hidden="true">
      {avatarInitials(label)}
      {group ? <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[8px] font-black text-white">G</span> : null}
    </span>
  )
}
