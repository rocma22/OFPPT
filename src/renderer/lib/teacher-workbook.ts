import type {
  ParsedTeacherWorkbook,
  TeacherAssignmentInput,
  TeacherImportBundle,
  TeacherImportField,
  TeacherImportWarning,
  TeacherInput,
} from '../../shared/types'
import {
  normalizeTeacherName,
  teacherIdentityKey,
} from '../../shared/teacher-import'

export interface MappedTeacherRow {
  rowNumber: number
  teacher: TeacherInput
  assignment: TeacherAssignmentInput
  errors: TeacherImportField[]
}

export interface GroupedTeacherWorkbook {
  teachers: TeacherImportBundle[]
  warnings: TeacherImportWarning[]
}

export const importFields: TeacherImportField[] = [
  'fullName',
  'cin',
  'specialty',
  'codeFiliere',
  'filiere',
  'groupe',
  'mode',
  'codeModule',
  'module',
  'regional',
  'mhp',
  'mhd',
  'mhg',
]

function readMappedValue(
  row: string[],
  mapping: Partial<Record<TeacherImportField, number | null>>,
  field: TeacherImportField,
): string {
  const index = mapping[field]
  return index === undefined || index === null ? '' : (row[index] ?? '').trim()
}

function parseHours(value: string): number | null {
  if (!value) return null
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function mapTeacherWorkbookRows(
  workbook: ParsedTeacherWorkbook,
  mapping: Partial<Record<TeacherImportField, number | null>>,
): MappedTeacherRow[] {
  return workbook.rows.map((row, index) => {
    const mapped = Object.fromEntries(
      importFields.map((field) => [
        field,
        readMappedValue(row, mapping, field),
      ]),
    ) as Record<TeacherImportField, string>
    const teacher: TeacherInput = {
      fullName: mapped.fullName,
      cin: mapped.cin,
      specialty: mapped.specialty,
      phone: '',
      email: '',
      matricule: '',
    }
    const assignment: TeacherAssignmentInput = {
      groupCode: mapped.groupe,
      module: mapped.module,
      codeFiliere: mapped.codeFiliere,
      filiere: mapped.filiere,
      mode: mapped.mode,
      codeModule: mapped.codeModule,
      regional: mapped.regional,
      mhp: parseHours(mapped.mhp),
      mhd: parseHours(mapped.mhd),
      mhg: parseHours(mapped.mhg),
    }
    const errors: TeacherImportField[] = []
    if (!teacher.fullName) errors.push('fullName')
    for (const field of ['mhp', 'mhd', 'mhg'] as const) {
      if (mapped[field] && parseHours(mapped[field]) === null) {
        errors.push(field)
      }
    }
    return {
      rowNumber: workbook.firstDataRowNumber + index,
      teacher,
      assignment,
      errors,
    }
  })
}

export function groupTeacherWorkbookRows(
  rows: MappedTeacherRow[],
): GroupedTeacherWorkbook {
  const groups = new Map<string, TeacherImportBundle>()
  const namesByCin = new Map<string, Set<string>>()
  const warnings: TeacherImportWarning[] = []
  const duplicateAssignments = new Set<string>()
  for (const row of rows) {
    if (row.errors.length) continue
    const key = teacherIdentityKey(row.teacher)
    const existing = groups.get(key)
    if (existing) {
      existing.assignments.push(row.assignment)
      existing.sourceRows.push(row.rowNumber)
    } else {
      groups.set(key, {
        teacher: { ...row.teacher },
        assignments: [row.assignment],
        sourceRows: [row.rowNumber],
      })
    }
    const cin = row.teacher.cin.trim().toLocaleUpperCase()
    if (cin) {
      const names = namesByCin.get(cin) ?? new Set<string>()
      names.add(row.teacher.fullName.trim())
      namesByCin.set(cin, names)
    }
    const assignmentKey = `${key}\u0000${normalizeTeacherName(row.assignment.groupCode)}\u0000${normalizeTeacherName(row.assignment.module)}`
    if (duplicateAssignments.has(assignmentKey)) {
      warnings.push({
        type: 'duplicateAssignment',
        name: row.teacher.fullName,
        detail: `${row.assignment.groupCode} / ${row.assignment.module}`,
      })
    } else {
      duplicateAssignments.add(assignmentKey)
    }
  }
  for (const [cin, names] of namesByCin) {
    if (new Set([...names].map(normalizeTeacherName)).size > 1) {
      warnings.push({
        type: 'cinNameConflict',
        name: cin,
        detail: [...names].join(' / '),
      })
    }
  }
  return { teachers: [...groups.values()], warnings }
}
