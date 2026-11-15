import { teacherIdentityKey, normalizeCin } from './teacher-import'
import type {
  TeacherAssignmentInput,
  TeacherInput,
  TeacherMigrationSummary,
} from './types'

export interface LegacyTeacherRow {
  id: number
  academic_year_id: number
  full_name: string
  first_name: string
  last_name: string
  cin: string
  specialty: string
  modules: string
  volume_hours: number | null
  mhp: number | null
  mhd: number | null
  mhg: number | null
  phone: string
  email: string
  matricule: string
  code_filiere: string
  filiere: string
  groupe: string
  training_mode: string
  code_module: string
  module: string
  regional: string
  created_at: string
}

export interface LegacyAssignment extends TeacherAssignmentInput {
  legacyTeacherId: number
  legacyFullName: string
  legacyFirstName: string
  legacyLastName: string
  legacyCin: string
  legacySpecialty: string
  legacyModules: string
  legacyVolumeHours: number | null
  legacyPhone: string
  legacyEmail: string
  legacyMatricule: string
  legacyCreatedAt: string
}

export interface MigratedTeacherGroup {
  academicYearId: number
  createdAt: string
  teacher: TeacherInput
  assignments: LegacyAssignment[]
}

export function migrateLegacyTeacherRows(
  rows: LegacyTeacherRow[],
): MigratedTeacherGroup[] {
  const grouped = new Map<string, MigratedTeacherGroup>()
  for (const row of rows) {
    const fullName =
      row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ')
    const teacher = {
      fullName,
      cin: normalizeCin(row.cin),
      specialty: row.specialty,
      phone: row.phone,
      email: row.email,
      matricule: row.matricule,
    }
    const key = `${row.academic_year_id}:${teacherIdentityKey(teacher)}`
    let group = grouped.get(key)
    if (!group) {
      group = {
        academicYearId: row.academic_year_id,
        createdAt: row.created_at,
        teacher,
        assignments: [],
      }
      grouped.set(key, group)
    } else {
      group.teacher.specialty ||= row.specialty
      group.teacher.phone ||= row.phone
      group.teacher.email ||= row.email
      group.teacher.matricule ||= row.matricule
      group.teacher.fullName ||= fullName
    }
    group.assignments.push({
      groupCode: row.groupe,
      module: row.module,
      mhp: row.mhp,
      mhd: row.mhd,
      mhg: row.mhg ?? row.volume_hours,
      codeFiliere: row.code_filiere,
      filiere: row.filiere,
      mode: row.training_mode,
      codeModule: row.code_module,
      regional: row.regional,
      legacyTeacherId: row.id,
      legacyFullName: fullName,
      legacyFirstName: row.first_name,
      legacyLastName: row.last_name,
      legacyCin: row.cin,
      legacySpecialty: row.specialty,
      legacyModules: row.modules,
      legacyVolumeHours: row.volume_hours,
      legacyPhone: row.phone,
      legacyEmail: row.email,
      legacyMatricule: row.matricule,
      legacyCreatedAt: row.created_at,
    })
  }
  return [...grouped.values()]
}

export function getTeacherMigrationSummary(
  groups: MigratedTeacherGroup[],
): TeacherMigrationSummary {
  return {
    teachersCreated: groups.length,
    assignmentsCreated: groups.reduce(
      (total, group) => total + group.assignments.length,
      0,
    ),
  }
}
