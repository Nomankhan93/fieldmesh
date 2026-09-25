import type { FieldMeshNavIcon } from './navigation'

export function NavIcon({ name, className = 'h-5 w-5' }: { name: FieldMeshNavIcon; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (name === 'home') return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></svg>
  if (name === 'chats') return <svg {...common}><path d="M4 5.5h16v10H9l-5 4v-14Z" /><path d="M8 9h8M8 12h5" /></svg>
  if (name === 'sos') return <svg {...common}><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 16.5h.01" /></svg>
  if (name === 'network') return <svg {...common}><path d="M4.9 8.7a10 10 0 0 1 14.2 0M7.8 11.6a6 6 0 0 1 8.4 0M10.6 14.5a2 2 0 0 1 2.8 0" /><circle cx="12" cy="18" r="1" /></svg>
  if (name === 'profile') return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6" /></svg>
  if (name === 'developer') return <svg {...common}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>
  if (name === 'mesh') return <svg {...common}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M6.8 7.2 10.5 16M17.2 7.2 13.5 16M7 6h10" /></svg>
  if (name === 'security') return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9.5 12 1.7 1.7 3.6-4" /></svg>
  return <svg {...common}><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /></svg>
}
