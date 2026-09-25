import { describe, expect, it } from 'vitest'
import {
  buildContactDeepLink,
  buildContactShareText,
  formatFieldMeshCode,
  isValidContactInput,
  normalizeContactInput,
} from './contactCode'

const ID = '76fa5d97-3a53-4124-8ae2-97a8e2108f92'

describe('FieldMesh contact codes', () => {
  it('formats a stable short code from the FieldMesh user ID', () => {
    expect(formatFieldMeshCode(ID)).toBe('FM-97A8E2108F92')
  })

  it('normalizes typed codes and FieldMesh contact deep links', () => {
    expect(normalizeContactInput(' fm-97a8e2108f92 ')).toBe('FM-97A8E2108F92')
    expect(normalizeContactInput('FM97a8e2108f92')).toBe('FM-97A8E2108F92')
    expect(normalizeContactInput('fieldmesh://contact/FM-97A8E2108F92')).toBe('FM-97A8E2108F92')
  })

  it('accepts a contact code or technical UUID but rejects arbitrary text', () => {
    expect(isValidContactInput('FM-97A8E2108F92')).toBe(true)
    expect(isValidContactInput(ID)).toBe(true)
    expect(isValidContactInput('Noman')).toBe(false)
  })

  it('creates a share payload without exposing extra profile data', () => {
    expect(buildContactDeepLink(ID)).toBe('fieldmesh://contact/FM-97A8E2108F92')
    expect(buildContactShareText({ displayName: 'Noman', fieldMeshUserId: ID })).toContain('Code: FM-97A8E2108F92')
  })
})
