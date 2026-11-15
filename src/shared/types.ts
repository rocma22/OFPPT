export interface AcademicYear {
  id: number
  label: string
  startDate: string
  endDate: string
  createdAt: string
}

export interface DashboardStats {
  teachers: number
  groups: number
  totalHours: number
}

export interface CreateAcademicYearInput {
  label: string
  startDate: string
  endDate: string
  copyTeachersFromYearId?: number
}

export interface InternshipPeriod {
  id: number
  academicYearId: number
  teacherId: number
  startDate: string
  endDate: string
}

export interface SaveInternshipPeriodInput {
  academicYearId: number
  teacherId: number
  startMonth: string
  durationMonths: number
}

export interface TeacherInput {
  fullName: string
  cin: string
  specialty: string
  phone: string
  email: string
  matricule: string
}

export interface TeacherAssignmentInput {
  groupCode: string
  module: string
  mhp: number | null
  mhd: number | null
  mhg: number | null
  codeFiliere?: string
  filiere?: string
  mode?: string
  codeModule?: string
  regional?: string
}

export interface TeacherAssignment extends TeacherAssignmentInput {
  id: number
  teacherId: number
}

export interface Teacher extends TeacherInput {
  id: number
  academicYearId: number
  createdAt: string
  assignments: TeacherAssignment[]
  groupCount: number
  totalHours: number
}

export interface TeacherUpdate {
  id: number
  changes: Partial<TeacherInput>
}

export type TeacherImportField =
  | 'fullName'
  | 'cin'
  | 'specialty'
  | 'codeFiliere'
  | 'filiere'
  | 'groupe'
  | 'mode'
  | 'codeModule'
  | 'module'
  | 'regional'
  | 'mhp'
  | 'mhd'
  | 'mhg'

export type TeacherDuplicateStrategy = 'skip' | 'update' | 'addAssignments'

export interface TeacherImportBundle {
  teacher: TeacherInput
  assignments: TeacherAssignmentInput[]
  sourceRows: number[]
}

export interface TeacherImportWarning {
  type: 'cinNameConflict' | 'duplicateAssignment'
  name: string
  detail: string
}

export interface ParsedTeacherWorkbook {
  sheetName: string
  firstDataRowNumber: number
  headers: string[]
  rows: string[][]
}

export interface TeacherWorkbookFile {
  sheets: ParsedTeacherWorkbook[]
}

export interface TeacherImportSummary {
  inserted: number
  updated: number
  skipped: number
}

export interface TeacherMigrationSummary {
  teachersCreated: number
  assignmentsCreated: number
}

export type AppLanguage = 'fr' | 'en' | 'ar'

export interface DesktopApi {
  getAcademicYears: () => Promise<AcademicYear[]>
  createAcademicYear: (input: CreateAcademicYearInput) => Promise<AcademicYear>
  deleteAcademicYear: (academicYearId: number) => Promise<void>
  getInternshipPeriods: (academicYearId: number) => Promise<InternshipPeriod[]>
  saveInternshipPeriod: (
    input: SaveInternshipPeriodInput,
  ) => Promise<InternshipPeriod>
  deleteInternshipPeriod: (
    academicYearId: number,
    teacherId: number,
  ) => Promise<void>
  getDashboardStats: (academicYearId: number) => Promise<DashboardStats>
  getTeachers: (academicYearId: number) => Promise<Teacher[]>
  createTeacher: (
    academicYearId: number,
    teacher: TeacherInput,
  ) => Promise<Teacher>
  updateTeachers: (
    academicYearId: number,
    updates: TeacherUpdate[],
  ) => Promise<void>
  deleteTeacher: (academicYearId: number, teacherId: number) => Promise<void>
  deleteAllTeachers: (academicYearId: number) => Promise<number>
  createTeacherAssignment: (
    academicYearId: number,
    teacherId: number,
    assignment: TeacherAssignmentInput,
  ) => Promise<TeacherAssignment>
  updateTeacherAssignment: (
    academicYearId: number,
    teacherId: number,
    assignmentId: number,
    changes: Partial<TeacherAssignmentInput>,
  ) => Promise<void>
  deleteTeacherAssignment: (
    academicYearId: number,
    teacherId: number,
    assignmentId: number,
  ) => Promise<void>
  selectTeacherWorkbook: (
    language: AppLanguage,
  ) => Promise<TeacherWorkbookFile | null>
  importTeachers: (
    academicYearId: number,
    teachers: TeacherImportBundle[],
    strategy: TeacherDuplicateStrategy,
  ) => Promise<TeacherImportSummary>
}
