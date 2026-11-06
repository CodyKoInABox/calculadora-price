// Minimal PDF 1.4 writer: Helvetica (WinAnsi) text, filled rectangles, rules, multi-page tables.
// No dependencies. Coordinates are PDF points on an A4 page (595 x 842), origin bottom-left.

const PAGE_H = 842
const PRIMARY = '0.322 0.310 0.627 rg'
const LIGHT = '0.955 0.955 0.975 rg'
const WHITE = '1 1 1 rg'
const MUTED = '0.42 0.44 0.52'

const WIN_ANSI_EXTRA = {
  0x20ac: 0x80,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2026: 0x85
}

/** Maps text to single-byte WinAnsi chars and escapes PDF string delimiters. */
export function toPdfText(value) {
  let out = ''
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0)
    if (WIN_ANSI_EXTRA[code] !== undefined) out += String.fromCharCode(WIN_ANSI_EXTRA[code])
    else if (code <= 0xff && (code < 0x7f || code > 0x9f)) out += ch
    else out += '?'
  }
  return out.replace(/[\\()]/g, m => `\\${m}`)
}

function approxWidth(str, size, bold) {
  return str.length * size * (bold ? 0.58 : 0.52)
}

class Page {
  constructor() {
    this.ops = []
  }

  text(x, y, value, { size = 9, bold = false, align = 'left', color = '0 g' } = {}) {
    const str = toPdfText(value)
    const width = approxWidth(str, size, bold)
    const tx = align === 'right' ? x - width : x
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} ${tx.toFixed(2)} ${y.toFixed(2)} Td (${str}) Tj ET`)
  }

  rect(x, y, w, h, fill) {
    this.ops.push(`${fill} ${x} ${y} ${w} ${h} re f 0 g`)
  }

  rule(x1, y1, x2, y2) {
    this.ops.push(`0.85 0.86 0.9 RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`)
  }

  content() {
    return this.ops.join('\n')
  }
}

/** Builds a PDF file (Uint8Array) from one content stream per page. */
export function buildPdf(pageStreams) {
  const count = pageStreams.length
  const objects = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageStreams.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${count} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  pageStreams.forEach((stream, i) => {
    const pageId = 5 + 2 * i
    const contentId = pageId + 1
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })

  let out = '%PDF-1.4\n'
  const offsets = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const size = objects.length
  const xrefAt = out.length
  out += `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let id = 1; id < size; id++) {
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  out += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Uint8Array.from(out, ch => ch.charCodeAt(0))
}

/**
 * @param {{ title: string, subtitle?: string, summary?: Array<[string, string]>, table: { title?: string, headers: string[], rows: string[][] }, footerNote?: string }} report
 */
export function buildReportPdf({ title, subtitle = '', summary = [], table, footerNote = '' }) {
  const pages = []
  const cols = table.headers.length
  const colX = i => (i === 0 ? { x: 44, align: 'left' } : { x: 100 + (i * 455) / (cols - 1), align: 'right' })
  let page
  let y

  const drawTableHeader = () => {
    page.rect(40, y - 5, 515, 16, LIGHT)
    table.headers.forEach((h, i) => {
      const c = colX(i)
      page.text(c.x, y, h, { size: 7.5, bold: true, align: c.align })
    })
    y -= 16
  }

  const newPage = first => {
    page = new Page()
    pages.push(page)
    if (first) {
      page.rect(0, PAGE_H - 60, 595, 60, PRIMARY)
      page.text(40, PAGE_H - 28, title, { size: 17, bold: true, color: WHITE })
      if (subtitle) page.text(40, PAGE_H - 46, subtitle, { size: 8.5, color: '0.92 0.92 0.97 rg' })
      y = PAGE_H - 92
      summary.forEach(([label, value], i) => {
        const x = i % 2 === 0 ? 40 : 310
        const top = y - Math.floor(i / 2) * 34
        page.text(x, top, label, { size: 7.5, color: `${MUTED} rg` })
        page.text(x, top - 14, value, { size: 10.5, bold: true })
      })
      y -= Math.ceil(summary.length / 2) * 34 + 10
    } else {
      y = PAGE_H - 50
    }
    if (table.title) {
      page.text(40, y, table.title, { size: 11, bold: true })
      y -= 18
    }
    drawTableHeader()
  }

  newPage(true)
  for (const row of table.rows) {
    if (y < 46) newPage(false)
    if (pages.length && row.isTotal) page.rule(40, y + 9, 555, y + 9)
    row.cells.forEach((cell, i) => {
      const c = colX(i)
      page.text(c.x, y, cell, { size: 7.5, bold: Boolean(row.isTotal), align: c.align })
    })
    y -= 12
  }

  pages.forEach((p, i) => {
    p.rule(40, 34, 555, 34)
    p.text(40, 22, footerNote, { size: 7, color: `${MUTED} rg` })
    p.text(555, 22, `${i + 1} / ${pages.length}`, { size: 7, align: 'right', color: `${MUTED} rg` })
  })

  return buildPdf(pages.map(p => p.content()))
}
