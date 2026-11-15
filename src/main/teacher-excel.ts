import ExcelJS from 'exceljs'
import { detectTeacherColumnMapping } from '../shared/teacher-columns'
import type { TeacherWorkbookFile } from '../shared/types'

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if ('text' in value && typeof value.text === 'string') return value.text
  if ('richText' in value) {
    return value.richText.map((item) => item.text).join('')
  }
  if ('result' in value) return cellText(value.result)
  return ''
}

export async function parseTeacherWorkbook(
  data: Buffer,
): Promise<TeacherWorkbookFile> {
  const workbook = new ExcelJS.Workbook()
  const contents = new Uint8Array(data.byteLength)
  contents.set(data)
  await workbook.xlsx.load(contents.buffer)
  const sheets = workbook.worksheets.map((worksheet) => {
    let headerRow = 0
    let headerScore = 0
    let firstNonEmptyRow = 0
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      if (!row.hasValues) continue
      if (!firstNonEmptyRow) firstNonEmptyRow = rowNumber
      const headers = Array.from({ length: row.cellCount }, (_, index) =>
        cellText(row.getCell(index + 1).value).trim(),
      )
      const score = Object.keys(detectTeacherColumnMapping(headers)).length
      if (score > headerScore) {
        headerScore = score
        headerRow = rowNumber
      }
    }

    headerRow = headerRow || firstNonEmptyRow
    const header = worksheet.getRow(headerRow)
    const headers = headerRow
      ? Array.from({ length: header.cellCount }, (_, index) =>
          cellText(header.getCell(index + 1).value).trim(),
        )
      : []
    const rows: string[][] = []
    for (
      let rowNumber = headerRow + 1;
      rowNumber <= worksheet.rowCount;
      rowNumber += 1
    ) {
      const row = headers.map((_, index) =>
        cellText(worksheet.getRow(rowNumber).getCell(index + 1).value).trim(),
      )
      if (row.some(Boolean)) rows.push(row)
    }

    return {
      sheetName: worksheet.name,
      firstDataRowNumber: headerRow + 1,
      headers,
      rows,
    }
  })

  if (!sheets.length)
    throw new Error('The workbook does not contain any sheets')
  return { sheets }
}

export { detectTeacherColumnMapping }
