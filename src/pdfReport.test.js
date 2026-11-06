import { describe, expect, it } from 'vitest'
import { buildPdf, buildReportPdf, toPdfText } from './pdfReport'

const bytesToString = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('')

function xrefOffsets(text) {
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1])
  const section = text.slice(startxref)
  const count = Number(section.match(/xref\n0 (\d+)\n/)[1])
  const entries = [...section.matchAll(/(\d{10}) 00000 n /g)].map(m => Number(m[1]))
  return { startxref, count, entries }
}

describe('toPdfText', () => {
  it('maps accents to WinAnsi and escapes delimiters', () => {
    expect(toPdfText('ção')).toBe('\u00e7\u00e3o')
    expect(toPdfText('a (b) \\ c')).toBe('a \\(b\\) \\\\ c')
    expect(toPdfText('—')).toBe('\u0097')
    expect(toPdfText('R$ 1\u00a0000,00')).toBe('R$ 1\u00a0000,00')
  })

  it('replaces characters that WinAnsi cannot encode', () => {
    expect(toPdfText('→')).toBe('?')
    expect(toPdfText('😀')).toBe('?')
  })
})

describe('buildPdf', () => {
  it('writes a valid cross-reference table that points at every object', () => {
    const bytes = buildPdf(['BT ET', 'BT ET', 'BT ET'])
    const text = bytesToString(bytes)
    const { startxref, count, entries } = xrefOffsets(text)

    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    expect(count).toBe(entries.length + 1)
    for (let id = 1; id < count; id++) {
      expect(text.slice(entries[id - 1], entries[id - 1] + `${id} 0 obj`.length)).toBe(`${id} 0 obj`)
    }
  })

  it('gives every text colour an explicit colour operator', () => {
    const text = bytesToString(buildReportPdf({ title: 'T', subtitle: 'S', table: { headers: ['A'], rows: [] } }))
    const colours = [...text.matchAll(/ Tf ([^\n]*?) -?[\d.]+ -?[\d.]+ Td/g)].map(m => m[1])
    expect(colours.length).toBeGreaterThan(0)
    for (const colour of colours) expect(colour).toMatch(/ (g|rg)$/)
  })

  it('declares one page per content stream', () => {
    const text = bytesToString(buildPdf(['BT ET', 'BT ET']))
    expect(text).toContain('/Count 2')
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2)
  })
})

describe('buildReportPdf', () => {
  it('paginates long tables and numbers the pages', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ cells: [String(i + 1), 'R$ 1.000,00'] }))
    const bytes = buildReportPdf({
      title: 'Teste',
      summary: [['A', '1'], ['B', '2']],
      table: { headers: ['Mês', 'Valor'], rows },
      footerNote: 'rodapé'
    })
    const text = bytesToString(bytes)
    const pages = Number(text.match(/\/Count (\d+)/)[1])
    expect(pages).toBeGreaterThan(3)
    expect(text).toContain(`/ ${pages})`)
    expect(text).toContain('(200)')
  })

  it('marks total rows and keeps the xref valid', () => {
    const bytes = buildReportPdf({
      title: 'Totais',
      table: {
        headers: ['Indicador', 'Price', 'SAC'],
        rows: [{ cells: ['Juros', 'R$ 1,00', 'R$ 2,00'] }, { cells: ['Total', 'R$ 3,00', 'R$ 4,00'], isTotal: true }]
      }
    })
    const { startxref, entries } = xrefOffsets(bytesToString(bytes))
    expect(startxref).toBeGreaterThan(0)
    expect(entries.length).toBeGreaterThan(0)
  })
})
