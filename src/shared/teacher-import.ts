import type { TeacherDuplicateStrategy, TeacherImportBundle } from './types'

export type TeacherImportAction =
  | { kind: 'insert'; incomingIndex: number }
  | { kind: 'skip'; incomingIndex: number }
  | {
      kind: 'update' | 'addAssignments'
      incomingIndex: number
      targetTeacherId: number
    }

export function normalizeCin(cin: string): string {
  return cin.trim().normalize('NFKC').toLocaleUpperCase()
}

export function normalizeTeacherName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function teacherIdentityKey(teacher: {
  cin: string
  fullName: string
}): string {
  const cin = normalizeCin(teacher.cin)
  return cin ? `cin:${cin}` : `name:${normalizeTeacherName(teacher.fullName)}`
}

export function planTeacherImport(
  existingTeachers: { id: number; cin: string; fullName: string }[],
  incomingTeachers: TeacherImportBundle[],
  strategy: TeacherDuplicateStrategy,
): TeacherImportAction[] {
  const existingByCin = new Map<string, number>()
  const existingByName = new Map<string, number>()
  const existingWithoutCinByName = new Map<string, number>()
  for (const teacher of existingTeachers) {
    const cin = normalizeCin(teacher.cin)
    if (cin && !existingByCin.has(cin)) {
      existingByCin.set(cin, teacher.id)
    }
    const name = normalizeTeacherName(teacher.fullName)
    if (name && !existingByName.has(name)) {
      existingByName.set(name, teacher.id)
      if (!cin) existingWithoutCinByName.set(name, teacher.id)
    }
  }

  return incomingTeachers.map((bundle, incomingIndex) => {
    const teacher = bundle.teacher
    const cin = normalizeCin(teacher.cin)
    const name = normalizeTeacherName(teacher.fullName)
    const targetTeacherId = cin
      ? (existingByCin.get(cin) ?? existingWithoutCinByName.get(name))
      : existingByName.get(name)
    if (targetTeacherId === undefined) {
      return { kind: 'insert', incomingIndex }
    }
    if (strategy === 'skip') return { kind: 'skip', incomingIndex }
    return {
      kind: strategy === 'update' ? 'update' : 'addAssignments',
      incomingIndex,
      targetTeacherId,
    }
  })
}
