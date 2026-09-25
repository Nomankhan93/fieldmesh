import { describe, expect, it } from 'vitest'
import {
  buildContactDeepLink,
  buildContactShareText,
  formatFieldMeshCode,
  isValidContactInput,
  normalizeContactInput,
} from './contactCode'

const ID = '76fa5d97-3a53-4124-8ae2-97a8e2108f92'

describe('ConnectX contact-code compatibility', () => {
  it('formats a stable short compatibility code from the canonical user ID', () => {
    expect(formatFieldMeshCode(ID)).toBe('FM-97A8E2108F92')
  })

  it('normalizes typed codes and legacy contact deep links', () => {
    expect(normalizeContactInput(' fm-97a8e2108f92 ')).toBe('FM-97A8E2108F92')
    expect(normalizeContactInput('FM97a8e2108f92')).toBe('FM-97A8E2108F92')
    expect(normalizeContactInput('fieldmesh://contact/FM-97A8E2108F92')).toBe('FM-97A8E2108F92')
  })

  it('accepts a contact code or technical UUID but rejects arbitrary text', () => {
    expect(isValidContactInput('FM-97A8E2108F92')).toBe(true)
    expect(isValidContactInput(ID)).toBe(true)
    expect(isValidContactInput('Noman')).toBe(false)
  })

  it('creates a ConnectX share payload without exposing extra profile data', () => {
    expect(buildContactDeepLink(ID)).toBe('fieldmesh://contact/FM-97A8E2108F92')
    const shareText = buildContactShareText({ displayName: 'Noman', fieldMeshUserId: ID })
    expect(shareText).toContain('Noman on ConnectX')
    expect(shareText).toContain('Code: FM-97A8E2108F92')
  })
})
