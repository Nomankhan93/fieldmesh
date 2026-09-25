export type CompactConnectionRow = {
  id: 'internet' | 'radio' | 'gateway'
  label: string
  value: string
  detail: string
  tone: 'good' | 'warn' | 'neutral'
}

export function connectionRows(args: { internet: boolean; radio: boolean; gateway: boolean }): CompactConnectionRow[] {
  return [
    {
      id: 'internet',
      label: 'Internet',
      value: args.internet ? 'Connected' : 'Offline',
      detail: args.internet ? 'Chats can synchronize now.' : 'Internet messages will wait locally.',
      tone: args.internet ? 'good' : 'warn',
    },
    {
      id: 'radio',
      label: 'Radio',
      value: args.radio ? 'Connected' : 'Not connected',
      detail: args.radio ? 'Local radio communication is available.' : 'No compatible radio is paired yet.',
      tone: args.radio ? 'good' : 'neutral',
    },
    {
      id: 'gateway',
      label: 'Gateway',
      value: args.gateway ? 'Available' : 'Not available',
      detail: args.gateway ? 'Hybrid radio-to-Internet messaging is available.' : 'Gateway availability appears after radio integration.',
      tone: args.gateway ? 'good' : 'neutral',
    },
  ]
}

export function compactPwaStatus(args: { standalone: boolean; offlineReady: boolean; updateAvailable: boolean }) {
  return {
    installed: args.standalone ? 'Installed' : 'Browser mode',
    offline: args.offlineReady ? 'Ready' : 'Preparing',
    updates: args.updateAvailable ? 'Update available' : 'Up to date',
  }
}
