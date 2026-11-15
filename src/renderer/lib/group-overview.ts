import type { Teacher } from '../../shared/types'

export interface GroupAssignmentOverview {
  module: string
  moduleCode: string
  teacherName: string
  mhp: number | null
  mhd: number | null
  mhg: number | null
}

export interface GroupOverview {
  groupCode: string
  programs: string[]
  modes: string[]
  regionalOffices: string[]
  assignments: GroupAssignmentOverview[]
}

function uniqueValues(values: string[]): string[] {
  const result = new Map<string, string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed && !result.has(trimmed.toLocaleLowerCase())) {
      result.set(trimmed.toLocaleLowerCase(), trimmed)
    }
  }
  return [...result.values()]
}

export function buildGroupOverview(teachers: Teacher[]): GroupOverview[] {
  const groups = new Map<string, GroupOverview>()
  for (const teacher of teachers) {
    for (const assignment of teacher.assignments) {
      const groupCode = assignment.groupCode.trim()
      if (!groupCode) continue

      const key = groupCode.toLocaleUpperCase()
      let group = groups.get(key)
      if (!group) {
        group = {
          groupCode,
          programs: [],
          modes: [],
          regionalOffices: [],
          assignments: [],
        }
        groups.set(key, group)
      }

      const program = [assignment.codeFiliere, assignment.filiere]
        .map((value) => value?.trim() ?? '')
        .filter(Boolean)
        .join(' - ')
      group.programs = uniqueValues([...group.programs, program])
      group.modes = uniqueValues([...group.modes, assignment.mode ?? ''])
      group.regionalOffices = uniqueValues([
        ...group.regionalOffices,
        assignment.regional ?? '',
      ])
      group.assignments.push({
        module: assignment.module,
        moduleCode: assignment.codeModule ?? '',
        teacherName: teacher.fullName,
        mhp: assignment.mhp,
        mhd: assignment.mhd,
        mhg: assignment.mhg,
      })
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      assignments: [...group.assignments].sort(
        (left, right) =>
          left.module.localeCompare(right.module) ||
          left.teacherName.localeCompare(right.teacherName),
      ),
    }))
    .sort((left, right) => left.groupCode.localeCompare(right.groupCode))
}
