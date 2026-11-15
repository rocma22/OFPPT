import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseTeacherWorkbook } from '../src/main/teacher-excel'
import { detectTeacherColumnMapping } from '../src/shared/teacher-columns'
import { planTeacherImport } from '../src/shared/teacher-import'
import {
  getTeacherMigrationSummary,
  migrateLegacyTeacherRows,
  type LegacyTeacherRow,
} from '../src/shared/teacher-migration'
import {
  groupTeacherWorkbookRows,
  mapTeacherWorkbookRows,
} from '../src/renderer/lib/teacher-workbook'
import type { TeacherImportBundle } from '../src/shared/types'

const row = (values: string[]) => values

describe('teacher workbook parsing', () => {
  it('reads all worksheets and finds recognizable header rows', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Other').addRow(['Should not be imported'])
    const worksheet = workbook.addWorksheet('AFFECTATION VF')
    worksheet.addRow(['Exported allocation data'])
    worksheet.addRow([
      'Code Filière',
      'Filière',
      'Groupe',
      'Mode',
      'Code Module',
      'Module',
      'Régional',
      'Formateur Affecté Présentiel Actif',
    ])
    worksheet.addRow([
      'DD-101',
      'Développement digital',
      'G1',
      'Présentiel',
      'M101',
      'Algorithmique',
      'Casablanca',
      'Élodie Martin',
    ])
    const parsed = await parseTeacherWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    )
    expect(parsed.sheets.map((sheet) => sheet.sheetName)).toEqual([
      'Other',
      'AFFECTATION VF',
    ])
    expect(parsed.sheets[1]).toMatchObject({
      sheetName: 'AFFECTATION VF',
      firstDataRowNumber: 3,
      rows: [
        [
          'DD-101',
          'Développement digital',
          'G1',
          'Présentiel',
          'M101',
          'Algorithmique',
          'Casablanca',
          'Élodie Martin',
        ],
      ],
    })
  })

  it('uses the first populated row as headers when names are not recognized', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Formateurs')
    worksheet.addRow(['Trainer', 'Team'])
    worksheet.addRow(['Amina', 'G1'])
    const parsed = await parseTeacherWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    )
    expect(parsed.sheets[0]).toMatchObject({
      sheetName: 'Formateurs',
      headers: ['Trainer', 'Team'],
      rows: [['Amina', 'G1']],
    })
  })

  it('detects French/English headers and available hours/CIN', () => {
    expect(
      detectTeacherColumnMapping([
        'Code Filière',
        'Program',
        'Groupe',
        'Training Mode',
        'Code Module',
        'Module',
        'Regional Office',
        'Assigned Active In-Person Trainer',
        'CIN',
        'MHP',
        'MHD',
        'MHG',
      ]),
    ).toEqual({
      codeFiliere: 0,
      filiere: 1,
      groupe: 2,
      mode: 3,
      codeModule: 4,
      module: 5,
      regional: 6,
      fullName: 7,
      cin: 8,
      mhp: 9,
      mhd: 10,
      mhg: 11,
    })
  })

  it('maps CIN and assignment hour columns when available', () => {
    const mapped = mapTeacherWorkbookRows(
      {
        sheetName: 'AFFECTATION VF',
        firstDataRowNumber: 2,
        headers: [],
        rows: [row(['DD101', 'Amina O.', 'CIN1', 'G1', 'M1', '5', '2', '1'])],
      },
      {
        codeFiliere: 0,
        fullName: 1,
        cin: 2,
        groupe: 3,
        module: 4,
        mhp: 5,
        mhd: 6,
        mhg: 7,
      },
    )
    expect(mapped[0]).toMatchObject({
      teacher: { fullName: 'Amina O.', cin: 'CIN1', phone: '', email: '' },
      assignment: { groupCode: 'G1', module: 'M1', mhp: 5, mhd: 2, mhg: 1 },
    })
  })

  it('merges same CIN and preserves separate modules for the same group', () => {
    const workbook = {
      sheetName: 'AFFECTATION VF',
      firstDataRowNumber: 2,
      headers: [],
      rows: [
        ['Amina O.', 'AA1', 'EM101', 'M1'],
        ['Amina O.', 'AA1', 'EM101', 'M2'],
        ['Amina O.', 'AA1', 'EM201', 'M3'],
      ],
    }
    const mapped = mapTeacherWorkbookRows(workbook, {
      fullName: 0,
      cin: 1,
      groupe: 2,
      module: 3,
    })
    const result = groupTeacherWorkbookRows(mapped)
    expect(result.teachers).toHaveLength(1)
    expect(result.teachers[0]?.assignments).toHaveLength(3)
    expect(result.teachers[0]?.assignments.map((item) => item.module)).toEqual([
      'M1',
      'M2',
      'M3',
    ])
  })

  it('falls back to accent-insensitive normalized full names when CIN is empty', () => {
    const workbook = {
      sheetName: 'AFFECTATION VF',
      firstDataRowNumber: 2,
      headers: [],
      rows: [
        ['Élodie Martin', 'G1', 'M1'],
        ['elodie   martin', 'G2', 'M2'],
      ],
    }
    const result = groupTeacherWorkbookRows(
      mapTeacherWorkbookRows(workbook, {
        fullName: 0,
        groupe: 1,
        module: 2,
      }),
    )
    expect(result.teachers).toHaveLength(1)
    expect(result.teachers[0]?.assignments).toHaveLength(2)
  })

  it('reports conflicting names for a CIN and duplicate group-module pairs', () => {
    const workbook = {
      sheetName: 'AFFECTATION VF',
      firstDataRowNumber: 2,
      headers: [],
      rows: [
        ['Amina', 'AA1', 'G1', 'M1'],
        ['Different Name', 'AA1', 'G1', 'M1'],
      ],
    }
    const result = groupTeacherWorkbookRows(
      mapTeacherWorkbookRows(workbook, {
        fullName: 0,
        cin: 1,
        groupe: 2,
        module: 3,
      }),
    )
    expect(result.warnings.map((warning) => warning.type)).toEqual([
      'duplicateAssignment',
      'cinNameConflict',
    ])
  })
})

describe('existing teacher duplicate policy', () => {
  const bundle = (fullName: string, cin: string): TeacherImportBundle => ({
    teacher: {
      fullName,
      cin,
      specialty: '',
      phone: '',
      email: '',
      matricule: '',
    },
    assignments: [],
    sourceRows: [],
  })

  it('applies skip, update, and add-assignment policies by CIN/name identity', () => {
    const existing = [{ id: 8, cin: 'AB123456', fullName: 'First name' }]
    expect(
      planTeacherImport(existing, [bundle('Another name', 'ab123456')], 'skip'),
    ).toEqual([{ kind: 'skip', incomingIndex: 0 }])
    expect(
      planTeacherImport(
        existing,
        [bundle('Another name', 'ab123456')],
        'update',
      ),
    ).toEqual([{ kind: 'update', incomingIndex: 0, targetTeacherId: 8 }])
    expect(
      planTeacherImport(
        existing,
        [bundle('Another name', 'ab123456')],
        'addAssignments',
      ),
    ).toEqual([
      { kind: 'addAssignments', incomingIndex: 0, targetTeacherId: 8 },
    ])
  })

  it('uses the normalized name fallback when the import CIN is blank', () => {
    expect(
      planTeacherImport(
        [{ id: 8, cin: 'AB123456', fullName: 'Élodie Martin' }],
        [bundle('elodie martin', '')],
        'skip',
      ),
    ).toEqual([{ kind: 'skip', incomingIndex: 0 }])
  })
})

const legacyTeacher = (
  id: number,
  fullName: string,
  cin: string,
  group: string,
  module: string,
): LegacyTeacherRow => ({
  id,
  academic_year_id: 4,
  full_name: fullName,
  first_name: '',
  last_name: '',
  cin,
  specialty: 'Specialty',
  modules: 'old module value',
  volume_hours: 8,
  mhp: 2,
  mhd: 3,
  mhg: 4,
  phone: '0612345678',
  email: 'teacher@example.test',
  matricule: 'M-1',
  code_filiere: 'P1',
  filiere: 'Program',
  groupe: group,
  training_mode: 'In-person',
  code_module: `CODE-${module}`,
  module,
  regional: 'Rabat',
  created_at: '2025-01-01',
})

describe('legacy teacher migration', () => {
  it('groups rows by CIN or normalized name and preserves every assignment and legacy field', () => {
    const groups = migrateLegacyTeacherRows([
      legacyTeacher(11, 'Amina', 'AA1', 'EM101', 'M1'),
      legacyTeacher(12, 'Amina O.', 'aa1', 'EM101', 'M2'),
      legacyTeacher(13, 'Élodie Martin', '', 'EM201', 'M3'),
      legacyTeacher(14, 'elodie martin', '', 'EM202', 'M4'),
    ])
    expect(getTeacherMigrationSummary(groups)).toEqual({
      teachersCreated: 2,
      assignmentsCreated: 4,
    })
    expect(
      groups[0]?.assignments.map((assignment) => assignment.module),
    ).toEqual(['M1', 'M2'])
    expect(groups[0]?.assignments[0]).toMatchObject({
      legacyTeacherId: 11,
      legacyEmail: 'teacher@example.test',
      legacyCreatedAt: '2025-01-01',
      codeFiliere: 'P1',
      mhp: 2,
      mhd: 3,
      mhg: 4,
    })
    expect(groups[0]?.createdAt).toBe('2025-01-01')
    expect(groups[1]?.assignments).toHaveLength(2)
  })
})
