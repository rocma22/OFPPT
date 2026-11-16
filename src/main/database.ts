import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import type {
  AcademicYear,
  CreateAcademicYearInput,
  DashboardStats,
  HoursPlanningData,
  InternshipPeriod,
  SaveInternshipPeriodInput,
  Teacher,
  TeacherAssignment,
  TeacherAssignmentInput,
  TeacherDuplicateStrategy,
  TeacherImportBundle,
  TeacherImportSummary,
  TeacherInput,
  TeacherUpdate,
} from '../shared/types'
import { normalizeCin, planTeacherImport } from '../shared/teacher-import'
import {
  getAcademicYearMonths,
  getInternshipPeriodDates,
} from '../shared/internship-periods'
import {
  hasTeacherSessionConflict,
  isAllowedPlanningTime,
  PLANNING_WEEKDAYS,
} from '../shared/hours-planning'
import {
  migrateLegacyTeacherRows,
  type LegacyTeacherRow,
} from '../shared/teacher-migration'

let database: Database.Database | undefined

const migrations = [
  {
    version: 1,
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE academic_years (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL UNIQUE,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (start_date < end_date)
        );

        CREATE TABLE teachers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE modules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          hours REAL NOT NULL DEFAULT 0 CHECK (hours >= 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE internship_periods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (start_date <= end_date)
        );

        CREATE INDEX teachers_academic_year_idx ON teachers(academic_year_id);
        CREATE INDEX groups_academic_year_idx ON groups(academic_year_id);
        CREATE INDEX modules_academic_year_idx ON modules(academic_year_id);
        CREATE INDEX internship_periods_academic_year_idx ON internship_periods(academic_year_id);
      `)
    },
  },
  {
    version: 2,
    up: (db: Database.Database) => {
      db.exec(`
        ALTER TABLE teachers ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN cin TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN specialty TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN modules TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN volume_hours REAL;
        ALTER TABLE teachers ADD COLUMN mhp REAL;
        ALTER TABLE teachers ADD COLUMN mhd REAL;
        ALTER TABLE teachers ADD COLUMN mhg REAL;
        ALTER TABLE teachers ADD COLUMN phone TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN email TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN matricule TEXT NOT NULL DEFAULT '';
        UPDATE teachers
        SET full_name = trim(first_name || ' ' || last_name)
        WHERE full_name = '';
        CREATE INDEX teachers_year_cin_idx
          ON teachers(academic_year_id, cin COLLATE NOCASE);
      `)
    },
  },
  {
    version: 3,
    up: (db: Database.Database) => {
      db.exec(`
        ALTER TABLE teachers ADD COLUMN code_filiere TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN filiere TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN groupe TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN training_mode TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN code_module TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN module TEXT NOT NULL DEFAULT '';
        ALTER TABLE teachers ADD COLUMN regional TEXT NOT NULL DEFAULT '';
      `)
    },
  },
  {
    version: 4,
    up: (db: Database.Database) => {
      const legacyRows = db
        .prepare('SELECT * FROM teachers ORDER BY academic_year_id, id')
        .all() as LegacyTeacherRow[]
      const groups = migrateLegacyTeacherRows(legacyRows)

      db.exec(`
        CREATE TABLE teachers_v4 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          full_name TEXT NOT NULL,
          cin TEXT NOT NULL DEFAULT '',
          specialty TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          matricule TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE teacher_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          teacher_id INTEGER NOT NULL REFERENCES teachers_v4(id) ON DELETE CASCADE,
          group_code TEXT NOT NULL DEFAULT '',
          module TEXT NOT NULL DEFAULT '',
          mhp REAL CHECK (mhp IS NULL OR mhp >= 0),
          mhd REAL CHECK (mhd IS NULL OR mhd >= 0),
          mhg REAL CHECK (mhg IS NULL OR mhg >= 0),
          code_filiere TEXT NOT NULL DEFAULT '',
          filiere TEXT NOT NULL DEFAULT '',
          training_mode TEXT NOT NULL DEFAULT '',
          code_module TEXT NOT NULL DEFAULT '',
          regional TEXT NOT NULL DEFAULT '',
          legacy_teacher_id INTEGER,
          legacy_full_name TEXT NOT NULL DEFAULT '',
          legacy_first_name TEXT NOT NULL DEFAULT '',
          legacy_last_name TEXT NOT NULL DEFAULT '',
          legacy_cin TEXT NOT NULL DEFAULT '',
          legacy_specialty TEXT NOT NULL DEFAULT '',
          legacy_modules TEXT NOT NULL DEFAULT '',
          legacy_volume_hours REAL,
          legacy_phone TEXT NOT NULL DEFAULT '',
          legacy_email TEXT NOT NULL DEFAULT '',
          legacy_matricule TEXT NOT NULL DEFAULT '',
          legacy_created_at TEXT NOT NULL DEFAULT ''
        );
      `)
      const insertTeacherStatement = db.prepare(`
        INSERT INTO teachers_v4 (
          academic_year_id, full_name, cin, specialty, phone, email, matricule,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertAssignmentStatement = db.prepare(`
        INSERT INTO teacher_assignments (
          teacher_id, group_code, module, mhp, mhd, mhg, code_filiere,
          filiere, training_mode, code_module, regional, legacy_teacher_id,
          legacy_full_name, legacy_first_name, legacy_last_name, legacy_cin,
          legacy_specialty, legacy_modules, legacy_volume_hours, legacy_phone,
          legacy_email, legacy_matricule, legacy_created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const transaction = db.transaction(() => {
        for (const group of groups) {
          const teacherResult = insertTeacherStatement.run(
            group.academicYearId,
            group.teacher.fullName,
            group.teacher.cin,
            group.teacher.specialty,
            group.teacher.phone,
            group.teacher.email,
            group.teacher.matricule,
            group.createdAt,
          )
          for (const assignment of group.assignments) {
            insertAssignmentStatement.run(
              teacherResult.lastInsertRowid,
              assignment.groupCode,
              assignment.module,
              assignment.mhp,
              assignment.mhd,
              assignment.mhg,
              assignment.codeFiliere ?? '',
              assignment.filiere ?? '',
              assignment.mode ?? '',
              assignment.codeModule ?? '',
              assignment.regional ?? '',
              assignment.legacyTeacherId,
              assignment.legacyFullName,
              assignment.legacyFirstName,
              assignment.legacyLastName,
              assignment.legacyCin,
              assignment.legacySpecialty,
              assignment.legacyModules,
              assignment.legacyVolumeHours,
              assignment.legacyPhone,
              assignment.legacyEmail,
              assignment.legacyMatricule,
              assignment.legacyCreatedAt,
            )
          }
        }
        db.exec(`
          DROP TABLE teachers;
          ALTER TABLE teachers_v4 RENAME TO teachers;
          CREATE INDEX teachers_academic_year_idx ON teachers(academic_year_id);
          CREATE UNIQUE INDEX teachers_year_cin_unique
            ON teachers(academic_year_id, cin COLLATE NOCASE)
            WHERE trim(cin) <> '';
          CREATE INDEX teacher_assignments_teacher_idx
            ON teacher_assignments(teacher_id);
        `)
      })
      transaction()
    },
  },
  {
    version: 5,
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE teacher_internship_periods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (start_date <= end_date),
          UNIQUE (academic_year_id, teacher_id)
        );
        CREATE INDEX teacher_internship_periods_year_start_idx
          ON teacher_internship_periods(academic_year_id, start_date);
      `)
    },
  },
  {
    version: 6,
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE group_internship_periods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
          group_code TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (start_date <= end_date),
          UNIQUE (academic_year_id, group_code)
        );
        CREATE INDEX group_internship_periods_year_start_idx
          ON group_internship_periods(academic_year_id, start_date);
      `)
    },
  },
  {
    version: 7,
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE hours_planning_data (
          academic_year_id INTEGER PRIMARY KEY REFERENCES academic_years(id) ON DELETE CASCADE,
          data_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
]

type TeacherRow = {
  id: number
  academic_year_id: number
  full_name: string
  cin: string
  specialty: string
  phone: string
  email: string
  matricule: string
  created_at: string
}

type AssignmentRow = {
  id: number
  teacher_id: number
  group_code: string
  module: string
  mhp: number | null
  mhd: number | null
  mhg: number | null
  code_filiere: string
  filiere: string
  training_mode: string
  code_module: string
  regional: string
}

function toAssignment(row: AssignmentRow): TeacherAssignment {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    groupCode: row.group_code,
    module: row.module,
    mhp: row.mhp,
    mhd: row.mhd,
    mhg: row.mhg,
    codeFiliere: row.code_filiere,
    filiere: row.filiere,
    mode: row.training_mode,
    codeModule: row.code_module,
    regional: row.regional,
  }
}

function toTeacher(row: TeacherRow, assignments: TeacherAssignment[]): Teacher {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    fullName: row.full_name,
    cin: row.cin,
    specialty: row.specialty,
    phone: row.phone,
    email: row.email,
    matricule: row.matricule,
    createdAt: row.created_at,
    assignments,
    groupCount: new Set(
      assignments
        .map((assignment) => assignment.groupCode.trim().toLocaleUpperCase())
        .filter(Boolean),
    ).size,
    totalHours: assignments.reduce(
      (total, assignment) =>
        total +
        (assignment.mhp ?? 0) +
        (assignment.mhd ?? 0) +
        (assignment.mhg ?? 0),
      0,
    ),
  }
}

function normalizeTeacherInput(input: TeacherInput): TeacherInput {
  const teacher = {
    fullName: input.fullName.trim(),
    cin: normalizeCin(input.cin),
    specialty: input.specialty.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    matricule: input.matricule.trim(),
  }
  if (!teacher.fullName) throw new Error('Teacher full name is required')
  if (teacher.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teacher.email)) {
    throw new Error('Teacher email is invalid')
  }
  return teacher
}

function normalizeAssignmentInput(
  input: TeacherAssignmentInput,
): TeacherAssignmentInput {
  const assignment = {
    groupCode: input.groupCode.trim(),
    module: input.module.trim(),
    mhp: input.mhp,
    mhd: input.mhd,
    mhg: input.mhg,
    codeFiliere: input.codeFiliere?.trim() ?? '',
    filiere: input.filiere?.trim() ?? '',
    mode: input.mode?.trim() ?? '',
    codeModule: input.codeModule?.trim() ?? '',
    regional: input.regional?.trim() ?? '',
  }
  for (const hours of [assignment.mhp, assignment.mhd, assignment.mhg]) {
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      throw new Error('Assignment hour values must be non-negative numbers')
    }
  }
  return assignment
}

function assertAcademicYearExists(
  db: Database.Database,
  academicYearId: number,
): void {
  if (
    !db.prepare('SELECT 1 FROM academic_years WHERE id = ?').get(academicYearId)
  ) {
    throw new Error('Academic year was not found')
  }
}

function assertCinAvailable(
  db: Database.Database,
  academicYearId: number,
  cin: string,
  exceptTeacherIds: number[] = [],
): void {
  const duplicate = db
    .prepare(
      `SELECT id FROM teachers
       WHERE academic_year_id = ? AND cin <> '' AND cin = ? COLLATE NOCASE`,
    )
    .all(academicYearId, normalizeCin(cin)) as { id: number }[]
  if (duplicate.some(({ id }) => !exceptTeacherIds.includes(id))) {
    throw new Error(
      'A teacher with this CIN already exists in the academic year',
    )
  }
}

function insertTeacher(
  db: Database.Database,
  academicYearId: number,
  input: TeacherInput,
): number {
  const teacher = normalizeTeacherInput(input)
  assertCinAvailable(db, academicYearId, teacher.cin)
  const result = db
    .prepare(
      `INSERT INTO teachers (
        academic_year_id, full_name, cin, specialty, phone, email, matricule
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      academicYearId,
      teacher.fullName,
      teacher.cin,
      teacher.specialty,
      teacher.phone,
      teacher.email,
      teacher.matricule,
    )
  return Number(result.lastInsertRowid)
}

function insertAssignment(
  db: Database.Database,
  teacherId: number,
  input: TeacherAssignmentInput,
): number {
  const assignment = normalizeAssignmentInput(input)
  const result = db
    .prepare(
      `INSERT INTO teacher_assignments (
        teacher_id, group_code, module, mhp, mhd, mhg, code_filiere,
        filiere, training_mode, code_module, regional
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      teacherId,
      assignment.groupCode,
      assignment.module,
      assignment.mhp,
      assignment.mhd,
      assignment.mhg,
      assignment.codeFiliere,
      assignment.filiere,
      assignment.mode,
      assignment.codeModule,
      assignment.regional,
    )
  return Number(result.lastInsertRowid)
}

function getAssignments(db: Database.Database, teacherId: number) {
  return db
    .prepare(
      `SELECT id, teacher_id, group_code, module, mhp, mhd, mhg,
        code_filiere, filiere, training_mode, code_module, regional
       FROM teacher_assignments WHERE teacher_id = ? ORDER BY id`,
    )
    .all(teacherId)
    .map((row) => toAssignment(row as AssignmentRow))
}

function getTeacherById(
  db: Database.Database,
  academicYearId: number,
  teacherId: number,
): Teacher {
  const row = db
    .prepare('SELECT * FROM teachers WHERE id = ? AND academic_year_id = ?')
    .get(teacherId, academicYearId) as TeacherRow | undefined
  if (!row) throw new Error('Teacher was not found in the academic year')
  return toTeacher(row, getAssignments(db, teacherId))
}

function getDefaultAcademicYear(): CreateAcademicYearInput {
  const now = new Date()
  const startYear =
    now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  const endYear = startYear + 1
  return {
    label: `${startYear}-${endYear}`,
    startDate: `${startYear}-09-01`,
    endDate: `${endYear}-06-30`,
  }
}

function toAcademicYear(row: {
  id: number
  label: string
  start_date: string
  end_date: string
  created_at: string
}): AcademicYear {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  }
}

export function initializeDatabase(): void {
  if (database) return

  const db = new Database(
    join(app.getPath('userData'), 'planning-ofppt.sqlite'),
  )
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  for (const migration of migrations) {
    const applied = db
      .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
      .get(migration.version)
    if (!applied) {
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(
          migration.version,
        )
      })()
      if (migration.version === 4) {
        const teachersCreated = db
          .prepare('SELECT COUNT(*) AS count FROM teachers')
          .get() as { count: number }
        const assignmentsCreated = db
          .prepare('SELECT COUNT(*) AS count FROM teacher_assignments')
          .get() as { count: number }
        console.info(
          `Teacher migration v4 complete: ${teachersCreated.count} teachers, ${assignmentsCreated.count} assignments`,
        )
      }
    }
  }

  const yearCount = db
    .prepare('SELECT COUNT(*) AS count FROM academic_years')
    .get() as { count: number }
  if (yearCount.count === 0) {
    const year = getDefaultAcademicYear()
    db.prepare(
      'INSERT INTO academic_years (label, start_date, end_date) VALUES (?, ?, ?)',
    ).run(year.label, year.startDate, year.endDate)
  }

  database = db
}

function getDatabase(): Database.Database {
  if (!database) throw new Error('Database has not been initialized')
  return database
}

export function getAcademicYears(): AcademicYear[] {
  return getDatabase()
    .prepare(
      `SELECT id, label, start_date, end_date, created_at
       FROM academic_years ORDER BY start_date DESC`,
    )
    .all()
    .map((row) =>
      toAcademicYear(
        row as {
          id: number
          label: string
          start_date: string
          end_date: string
          created_at: string
        },
      ),
    )
}

export function createAcademicYear(
  input: CreateAcademicYearInput,
): AcademicYear {
  const label = input.label.trim()
  const startDate = input.startDate.trim()
  const endDate = input.endDate.trim()
  if (!label || !/^\d{4}-\d{4}$/.test(label)) {
    throw new Error('Academic year must use the YYYY-YYYY format')
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    startDate >= endDate
  ) {
    throw new Error('Academic year dates are invalid')
  }
  const db = getDatabase()
  const result = db.transaction(() => {
    const inserted = db
      .prepare(
        'INSERT INTO academic_years (label, start_date, end_date) VALUES (?, ?, ?)',
      )
      .run(label, startDate, endDate)
    if (input.copyTeachersFromYearId !== undefined) {
      assertAcademicYearExists(db, input.copyTeachersFromYearId)
      const sourceTeachers = db
        .prepare(
          'SELECT * FROM teachers WHERE academic_year_id = ? ORDER BY id',
        )
        .all(input.copyTeachersFromYearId) as TeacherRow[]
      for (const source of sourceTeachers) {
        const newTeacherId = insertTeacher(
          db,
          Number(inserted.lastInsertRowid),
          {
            fullName: source.full_name,
            cin: source.cin,
            specialty: source.specialty,
            phone: source.phone,
            email: source.email,
            matricule: source.matricule,
          },
        )
        for (const assignment of getAssignments(db, source.id)) {
          insertAssignment(db, newTeacherId, assignment)
        }
      }
    }
    return inserted
  })()
  const row = db
    .prepare(
      `SELECT id, label, start_date, end_date, created_at
       FROM academic_years WHERE id = ?`,
    )
    .get(result.lastInsertRowid) as {
    id: number
    label: string
    start_date: string
    end_date: string
    created_at: string
  }
  return toAcademicYear(row)
}

function toInternshipPeriod(row: {
  id: number
  academic_year_id: number
  group_code: string
  start_date: string
  end_date: string
}): InternshipPeriod {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    groupCode: row.group_code,
    startDate: row.start_date,
    endDate: row.end_date,
  }
}

export function getInternshipGroups(academicYearId: number): string[] {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  return (
    db
      .prepare(
        `SELECT DISTINCT trim(a.group_code) AS group_code
         FROM teacher_assignments a
         JOIN teachers t ON t.id = a.teacher_id
         WHERE t.academic_year_id = ? AND trim(a.group_code) <> ''
         ORDER BY group_code COLLATE NOCASE`,
      )
      .all(academicYearId) as { group_code: string }[]
  ).map(({ group_code }) => group_code)
}

export function getInternshipPeriods(
  academicYearId: number,
): InternshipPeriod[] {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  return db
    .prepare(
      `SELECT id, academic_year_id, group_code, start_date, end_date
       FROM group_internship_periods
       WHERE academic_year_id = ?
       ORDER BY start_date, group_code COLLATE NOCASE`,
    )
    .all(academicYearId)
    .map((row) =>
      toInternshipPeriod(
        row as {
          id: number
          academic_year_id: number
          group_code: string
          start_date: string
          end_date: string
        },
      ),
    )
}

export function saveInternshipPeriod(
  input: SaveInternshipPeriodInput,
): InternshipPeriod {
  const db = getDatabase()
  return db.transaction(() => {
    assertAcademicYearExists(db, input.academicYearId)
    const groupCode = input.groupCode.trim()
    if (
      !groupCode ||
      !db
        .prepare(
          `SELECT 1 FROM teacher_assignments a
           JOIN teachers t ON t.id = a.teacher_id
           WHERE t.academic_year_id = ? AND trim(a.group_code) = ?
           LIMIT 1`,
        )
        .get(input.academicYearId, groupCode)
    ) {
      throw new Error('Group was not found in the academic year')
    }
    const academicYear = db
      .prepare('SELECT start_date, end_date FROM academic_years WHERE id = ?')
      .get(input.academicYearId) as
      { start_date: string; end_date: string } | undefined
    if (!academicYear) throw new Error('Academic year was not found')

    const months = getAcademicYearMonths(
      academicYear.start_date,
      academicYear.end_date,
    )
    if (
      !Number.isSafeInteger(input.durationMonths) ||
      input.durationMonths < 1 ||
      input.durationMonths > months.length
    ) {
      throw new Error('Internship duration is outside the academic year')
    }
    const { startDate, endDate } = getInternshipPeriodDates(
      input.startMonth,
      input.durationMonths,
    )
    if (
      !months.includes(input.startMonth) ||
      !months.includes(endDate.slice(0, 7))
    ) {
      throw new Error('Internship period is outside the academic year')
    }

    db.prepare(
      `INSERT INTO group_internship_periods (
        academic_year_id, group_code, start_date, end_date
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(academic_year_id, group_code)
      DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date`,
    ).run(input.academicYearId, groupCode, startDate, endDate)

    const row = db
      .prepare(
        `SELECT id, academic_year_id, group_code, start_date, end_date
         FROM group_internship_periods
         WHERE academic_year_id = ? AND group_code = ?`,
      )
      .get(input.academicYearId, groupCode)
    if (!row) throw new Error('Unable to save internship period')
    return toInternshipPeriod(
      row as {
        id: number
        academic_year_id: number
        group_code: string
        start_date: string
        end_date: string
      },
    )
  })()
}

export function deleteInternshipPeriod(
  academicYearId: number,
  groupCode: string,
): void {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  db.prepare(
    `DELETE FROM group_internship_periods
     WHERE academic_year_id = ? AND group_code = ?`,
  ).run(academicYearId, groupCode)
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

function isHoursPlanningData(value: unknown): value is HoursPlanningData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<HoursPlanningData>
  return (
    Array.isArray(data.holidays) &&
    data.holidays.every(
      (holiday) =>
        holiday &&
        typeof holiday.id === 'string' &&
        typeof holiday.groupCode === 'string' &&
        typeof holiday.label === 'string' &&
        typeof holiday.startDate === 'string' &&
        typeof holiday.endDate === 'string',
    ) &&
    !!data.overrides &&
    typeof data.overrides === 'object' &&
    !Array.isArray(data.overrides) &&
    Object.entries(data.overrides).every(
      ([weekStart, sessions]) =>
        isValidDate(weekStart) &&
        Array.isArray(sessions) &&
        sessions.every(
          (session) =>
            session &&
            typeof session.id === 'string' &&
            typeof session.weekStart === 'string' &&
            typeof session.groupCode === 'string' &&
            Number.isSafeInteger(session.teacherId) &&
            Number.isInteger(session.weekday) &&
            typeof session.startTime === 'string' &&
            typeof session.endTime === 'string',
        ),
    )
  )
}

function validateHoursPlanningData(
  db: Database.Database,
  academicYearId: number,
  data: HoursPlanningData,
): void {
  const academicYear = db
    .prepare('SELECT start_date, end_date FROM academic_years WHERE id = ?')
    .get(academicYearId) as
    | { start_date: string; end_date: string }
    | undefined
  if (!academicYear) throw new Error('Academic year was not found')

  const groupExists = db.prepare(
    `SELECT 1 FROM teacher_assignments a
     JOIN teachers t ON t.id = a.teacher_id
     WHERE t.academic_year_id = ? AND upper(trim(a.group_code)) = upper(?)
     LIMIT 1`,
  )
  const holidayIds = new Set<string>()
  for (const holiday of data.holidays) {
    if (
      !holiday.id.trim() ||
      holidayIds.has(holiday.id) ||
      !holiday.groupCode.trim() ||
      !holiday.label.trim() ||
      !isValidDate(holiday.startDate) ||
      !isValidDate(holiday.endDate) ||
      holiday.startDate > holiday.endDate ||
      holiday.startDate < academicYear.start_date ||
      holiday.endDate > academicYear.end_date ||
      !groupExists.get(academicYearId, holiday.groupCode)
    ) {
      throw new Error('Holiday details are invalid')
    }
    holidayIds.add(holiday.id)
  }

  const sessionIds = new Set<string>()
  const assignedTeacherGroup = db.prepare(
    `SELECT 1 FROM teacher_assignments a
     JOIN teachers t ON t.id = a.teacher_id
     WHERE t.academic_year_id = ? AND a.teacher_id = ?
       AND upper(trim(a.group_code)) = upper(?)
     LIMIT 1`,
  )
  for (const [weekStart, sessions] of Object.entries(data.overrides)) {
    const weekStartDate = new Date(`${weekStart}T00:00:00.000Z`)
    if (
      !isValidDate(weekStart) ||
      weekStartDate.getUTCDay() !== 1 ||
      weekStart < addIsoDays(academicYear.start_date, -6) ||
      weekStart > academicYear.end_date
    ) {
      throw new Error('Weekly schedule date is invalid')
    }
    for (const session of sessions) {
      if (
        !session.id.trim() ||
        sessionIds.has(session.id) ||
        session.weekStart !== weekStart ||
        !session.groupCode.trim() ||
        !PLANNING_WEEKDAYS.includes(
          session.weekday as (typeof PLANNING_WEEKDAYS)[number],
        ) ||
        !isAllowedPlanningTime(session.startTime, session.endTime) ||
        !assignedTeacherGroup.get(
          academicYearId,
          session.teacherId,
          session.groupCode,
        )
      ) {
        throw new Error('Weekly schedule details are invalid')
      }
      const sessionDate = addIsoDays(weekStart, session.weekday - 1)
      if (
        sessionDate < academicYear.start_date ||
        sessionDate > academicYear.end_date
      ) {
        throw new Error('Weekly schedule is outside the academic year')
      }
      sessionIds.add(session.id)
    }
    if (hasTeacherSessionConflict(sessions)) {
      throw new Error('Teacher schedule contains a time conflict')
    }
  }
}

function addIsoDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function getHoursPlanningData(
  academicYearId: number,
): HoursPlanningData {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  const row = db
    .prepare(
      'SELECT data_json FROM hours_planning_data WHERE academic_year_id = ?',
    )
    .get(academicYearId) as { data_json: string } | undefined
  if (!row) return { holidays: [], overrides: {} }
  const parsed: unknown = JSON.parse(row.data_json)
  if (!isHoursPlanningData(parsed)) {
    throw new Error('Saved hours planning data is invalid')
  }
  return parsed
}

export function saveHoursPlanningData(
  academicYearId: number,
  data: HoursPlanningData,
): void {
  if (!isHoursPlanningData(data)) {
    throw new Error('Hours planning data is invalid')
  }
  const db = getDatabase()
  validateHoursPlanningData(db, academicYearId, data)
  db.prepare(
    `INSERT INTO hours_planning_data (academic_year_id, data_json)
     VALUES (?, ?)
     ON CONFLICT(academic_year_id)
     DO UPDATE SET data_json = excluded.data_json,
       updated_at = datetime('now')`,
  ).run(academicYearId, JSON.stringify(data))
}

export function deleteAcademicYear(academicYearId: number): void {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  db.prepare('DELETE FROM academic_years WHERE id = ?').run(academicYearId)
}

export function getDashboardStats(academicYearId: number): DashboardStats {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  const teachers = db
    .prepare(
      'SELECT COUNT(*) AS count FROM teachers WHERE academic_year_id = ?',
    )
    .get(academicYearId) as { count: number }
  const groups = db
    .prepare(
      'SELECT COUNT(DISTINCT group_code) AS count FROM teacher_assignments a JOIN teachers t ON t.id = a.teacher_id WHERE t.academic_year_id = ?',
    )
    .get(academicYearId) as { count: number }
  const totalHours = db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(a.mhp, 0) + COALESCE(a.mhd, 0) + COALESCE(a.mhg, 0)), 0) AS total
       FROM teacher_assignments a JOIN teachers t ON t.id = a.teacher_id
       WHERE t.academic_year_id = ?`,
    )
    .get(academicYearId) as { total: number }
  return {
    teachers: teachers.count,
    groups: groups.count,
    totalHours: totalHours.total,
  }
}

export function getTeachers(academicYearId: number): Teacher[] {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  return (
    db
      .prepare(
        'SELECT * FROM teachers WHERE academic_year_id = ? ORDER BY full_name COLLATE NOCASE, id',
      )
      .all(academicYearId) as TeacherRow[]
  ).map((row) => toTeacher(row, getAssignments(db, row.id)))
}

export function createTeacher(
  academicYearId: number,
  input: TeacherInput,
): Teacher {
  const db = getDatabase()
  const teacher = normalizeTeacherInput(input)
  if (!teacher.cin) throw new Error('Teacher CIN is required')
  assertAcademicYearExists(db, academicYearId)
  const id = insertTeacher(db, academicYearId, teacher)
  return getTeacherById(db, academicYearId, id)
}

export function updateTeachers(
  academicYearId: number,
  updates: TeacherUpdate[],
): void {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  db.transaction(() => {
    const ids = updates.map(({ id }) => id)
    if (new Set(ids).size !== ids.length) {
      throw new Error('A teacher can only be updated once per save')
    }
    for (const { id, changes } of updates) {
      const current = db
        .prepare('SELECT * FROM teachers WHERE id = ? AND academic_year_id = ?')
        .get(id, academicYearId) as TeacherRow | undefined
      if (!current)
        throw new Error('Teacher was not found in the academic year')
      const teacher = normalizeTeacherInput({
        fullName: current.full_name,
        cin: current.cin,
        specialty: current.specialty,
        phone: current.phone,
        email: current.email,
        matricule: current.matricule,
        ...changes,
      })
      assertCinAvailable(db, academicYearId, teacher.cin, [id])
      db.prepare(
        `UPDATE teachers SET full_name = ?, cin = ?, specialty = ?,
          phone = ?, email = ?, matricule = ? WHERE id = ?`,
      ).run(
        teacher.fullName,
        teacher.cin,
        teacher.specialty,
        teacher.phone,
        teacher.email,
        teacher.matricule,
        id,
      )
    }
  })()
}

export function deleteTeacher(academicYearId: number, teacherId: number): void {
  const result = getDatabase()
    .prepare('DELETE FROM teachers WHERE id = ? AND academic_year_id = ?')
    .run(teacherId, academicYearId)
  if (!result.changes)
    throw new Error('Teacher was not found in the academic year')
}

export function deleteAllTeachers(academicYearId: number): number {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  return db
    .prepare('DELETE FROM teachers WHERE academic_year_id = ?')
    .run(academicYearId).changes
}

function assertTeacherInYear(
  db: Database.Database,
  academicYearId: number,
  teacherId: number,
): void {
  if (
    !db
      .prepare('SELECT 1 FROM teachers WHERE id = ? AND academic_year_id = ?')
      .get(teacherId, academicYearId)
  ) {
    throw new Error('Teacher was not found in the academic year')
  }
}

export function createTeacherAssignment(
  academicYearId: number,
  teacherId: number,
  assignment: TeacherAssignmentInput,
): TeacherAssignment {
  const db = getDatabase()
  assertTeacherInYear(db, academicYearId, teacherId)
  const id = insertAssignment(db, teacherId, assignment)
  return toAssignment(
    db
      .prepare('SELECT * FROM teacher_assignments WHERE id = ?')
      .get(id) as AssignmentRow,
  )
}

export function updateTeacherAssignment(
  academicYearId: number,
  teacherId: number,
  assignmentId: number,
  changes: Partial<TeacherAssignmentInput>,
): void {
  const db = getDatabase()
  assertTeacherInYear(db, academicYearId, teacherId)
  const row = db
    .prepare(
      'SELECT * FROM teacher_assignments WHERE id = ? AND teacher_id = ?',
    )
    .get(assignmentId, teacherId) as AssignmentRow | undefined
  if (!row) throw new Error('Teacher assignment was not found')
  const assignment = normalizeAssignmentInput({
    ...toAssignment(row),
    ...changes,
  })
  db.prepare(
    `UPDATE teacher_assignments SET group_code = ?, module = ?, mhp = ?,
      mhd = ?, mhg = ? WHERE id = ? AND teacher_id = ?`,
  ).run(
    assignment.groupCode,
    assignment.module,
    assignment.mhp,
    assignment.mhd,
    assignment.mhg,
    assignmentId,
    teacherId,
  )
}

export function deleteTeacherAssignment(
  academicYearId: number,
  teacherId: number,
  assignmentId: number,
): void {
  const db = getDatabase()
  assertTeacherInYear(db, academicYearId, teacherId)
  const result = db
    .prepare('DELETE FROM teacher_assignments WHERE id = ? AND teacher_id = ?')
    .run(assignmentId, teacherId)
  if (!result.changes) throw new Error('Teacher assignment was not found')
}

export function importTeachers(
  academicYearId: number,
  bundles: TeacherImportBundle[],
  strategy: TeacherDuplicateStrategy,
): TeacherImportSummary {
  const db = getDatabase()
  assertAcademicYearExists(db, academicYearId)
  const normalized = bundles.map((bundle) => ({
    ...bundle,
    teacher: normalizeTeacherInput(bundle.teacher),
    assignments: bundle.assignments.map(normalizeAssignmentInput),
  }))
  return db.transaction(() => {
    const existing = db
      .prepare(
        'SELECT id, cin, full_name AS fullName FROM teachers WHERE academic_year_id = ? ORDER BY id',
      )
      .all(academicYearId) as { id: number; cin: string; fullName: string }[]
    const actions = planTeacherImport(existing, normalized, strategy)
    const summary: TeacherImportSummary = {
      inserted: 0,
      updated: 0,
      skipped: 0,
    }
    for (const action of actions) {
      const bundle = normalized[action.incomingIndex]
      if (!bundle) throw new Error('Invalid imported teacher')
      if (action.kind === 'skip') {
        summary.skipped += 1
        continue
      }
      if (action.kind === 'insert') {
        const id = insertTeacher(db, academicYearId, bundle.teacher)
        for (const assignment of bundle.assignments) {
          insertAssignment(db, id, assignment)
        }
        summary.inserted += 1
        continue
      }
      const id = action.targetTeacherId
      if (action.kind === 'update') {
        const current = db
          .prepare(
            'SELECT * FROM teachers WHERE id = ? AND academic_year_id = ?',
          )
          .get(id, academicYearId) as TeacherRow | undefined
        if (!current)
          throw new Error('Teacher was not found in the academic year')
        const incoming = bundle.teacher
        const merged = normalizeTeacherInput({
          ...current,
          fullName: incoming.fullName,
          specialty: incoming.specialty || current.specialty,
          cin: incoming.cin || current.cin,
        })
        assertCinAvailable(db, academicYearId, merged.cin, [id])
        db.prepare(
          `UPDATE teachers SET full_name = ?, cin = ?, specialty = ?
           WHERE id = ?`,
        ).run(merged.fullName, merged.cin, merged.specialty, id)
        db.prepare('DELETE FROM teacher_assignments WHERE teacher_id = ?').run(
          id,
        )
      }
      for (const assignment of bundle.assignments) {
        insertAssignment(db, id, assignment)
      }
      summary.updated += 1
    }
    return summary
  })()
}
