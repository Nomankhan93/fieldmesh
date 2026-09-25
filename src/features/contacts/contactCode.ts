const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTACT_CODE_PATTERN = /^FM-[0-9A-F]{12}$/

export function formatFieldMeshCode(fieldMeshUserId: string): string {
  const compact = fieldMeshUserId.replace(/-/g, '').toUpperCase()
  return `FM-${compact.slice(-12)}`
}

export function normalizeContactInput(input: string): string {
  const value = input.trim()
  if (!value) return ''

  const deepLinkMatch = value.match(/^fieldmesh:\/\/contact\/(FM-[0-9A-F]{12})$/i)
  if (deepLinkMatch) return deepLinkMatch[1].toUpperCase()

  const upper = value.toUpperCase()
  if (/^FM[0-9A-F]{12}$/.test(upper)) return `FM-${upper.slice(2)}`
  if (CONTACT_CODE_PATTERN.test(upper)) return upper
  if (UUID_PATTERN.test(value)) return value.toLowerCase()
  return value
}

export function isValidContactInput(input: string): boolean {
  const value = normalizeContactInput(input)
  return CONTACT_CODE_PATTERN.test(value) || UUID_PATTERN.test(value)
}

export function buildContactDeepLink(fieldMeshUserId: string): string {
  return `fieldmesh://contact/${formatFieldMeshCode(fieldMeshUserId)}`
}

export function buildContactShareText(args: { displayName: string; fieldMeshUserId: string }): string {
  const code = formatFieldMeshCode(args.fieldMeshUserId)
  return `${args.displayName} on FieldMesh\nCode: ${code}\n${buildContactDeepLink(args.fieldMeshUserId)}`
}
