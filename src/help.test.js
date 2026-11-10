import { describe, expect, it } from 'vitest'
import { HELP_SECTIONS } from './help'

const allTerms = HELP_SECTIONS.flatMap(section => section.items.map(item => item.term))

describe('help content', () => {
  it('has unique section ids and titles', () => {
    const ids = HELP_SECTIONS.map(section => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const section of HELP_SECTIONS) {
      expect(section.id).toMatch(/^[a-z]+$/)
      expect(section.title.trim()).not.toBe('')
    }
  })

  it('every item has a term and a non-empty explanation', () => {
    for (const section of HELP_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0)
      for (const item of section.items) {
        expect(item.term.trim()).not.toBe('')
        expect(item.text.trim().length).toBeGreaterThan(20)
      }
    }
  })

  it('explains the results and models shown on screen', () => {
    for (const term of ['CET (custo efetivo total)', 'Prova real', 'Piso de juros', 'SACRE', 'Price × SAC', 'Total pago']) {
      expect(allTerms.some(name => name.includes(term))).toBe(true)
    }
  })

  it('does not explain the removed "amortizar ou investir" panel', () => {
    const text = JSON.stringify(HELP_SECTIONS).toLowerCase()
    expect(text).not.toContain('amortizar ou investir')
  })
})
