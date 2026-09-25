self.addEventListener('notificationclick', (event) => {
  const data = event.notification && event.notification.data ? event.notification.data : {}
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : ''
  event.notification.close()

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      client.postMessage({ type: 'CONNECTX_OPEN_CONVERSATION', conversationId })
      if ('focus' in client) return client.focus()
    }
    const url = new URL('/messages', self.location.origin)
    if (conversationId) url.searchParams.set('conversation', conversationId)
    return self.clients.openWindow(url.href)
  })())
})
