import { unzipSync, strFromU8 } from 'fflate'

/* ==========================================================================
 * A SMALL EXCEL READER
 *
 * Reads the first sheet of an .xlsx file into rows of text. Survey files are
 * small tables of numbers and names, so this reads cell values only: shared
 * and inline text, numbers and true/false. Formulas are read as the value
 * Excel last saved for them. Runs in the browser, with no server involved.
 * ========================================================================== */

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function readXlsx(buf: ArrayBuffer): string[][] {
  const files = unzipSync(new Uint8Array(buf))
  const text = (name: string) => files[name] ? strFromU8(files[name]) : ''
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')

  // Which file is the first sheet: the workbook names it, its relationships say where it is.
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const wb = text('xl/workbook.xml'), rels = text('xl/_rels/workbook.xml.rels')
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0]
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const rel = Array.from(xml(rels).getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === rid)
    const target = rel?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  const sheet = text(sheetPath)
  if (!sheet) throw new Error('The spreadsheet has no sheet that can be read.')

  const shared = Array.from(xml(text('xl/sharedStrings.xml') || '<sst/>').getElementsByTagName('si'))
    .map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '').join(''))

  const rows: string[][] = []
  Array.from(xml(sheet).getElementsByTagName('row')).forEach(row => {
    const out: string[] = []
    Array.from(row.getElementsByTagName('c')).forEach(c => {
      const ref = c.getAttribute('r')
      const i = ref ? colIndex(ref) : out.length
      const type = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let value = v
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = Array.from(c.getElementsByTagName('t')).map(t => t.textContent ?? '').join('')
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
      while (out.length < i) out.push('')
      out[i] = value.trim()
    })
    if (out.some(x => x !== '')) rows.push(out)
  })
  return rows
}
