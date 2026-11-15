import { describe, expect, it } from 'vitest'
import type { Teacher } from '../src/shared/types'
import { buildGroupOverview } from '../src/renderer/lib/group-overview'

const teacher = (
  fullName: string,
  assignments: Teacher['assignments'],
): Teacher => ({
  id: fullName.length,
  academicYearId: 1,
  fullName,
  cin: '',
  specialty: '',
  phone: '',
  email: '',
  matricule: '',
  createdAt: '',
  assignments,
  groupCount: 0,
  totalHours: 0,
})

describe('group overview', () => {
  it('groups assignments by group and includes module and teacher details', () => {
    const groups = buildGroupOverview([
      teacher('Amina', [
        {
          id: 1,
          teacherId: 1,
          groupCode: 'G1',
          module: 'Databases',
          codeModule: 'DB101',
          codeFiliere: 'DEV',
          filiere: 'Development',
          mode: 'In person',
          regional: 'Rabat',
          mhp: 3,
          mhd: 2,
          mhg: 1,
        },
        {
          id: 2,
          teacherId: 1,
          groupCode: '  ',
          module: 'Ignored',
          mhp: null,
          mhd: null,
          mhg: null,
        },
      ]),
      teacher('Youssef', [
        {
          id: 3,
          teacherId: 2,
          groupCode: 'g1',
          module: 'Algorithms',
          codeFiliere: 'DEV',
          filiere: 'Development',
          mode: 'In person',
          regional: 'Rabat',
          mhp: 4,
          mhd: null,
          mhg: 1,
        },
      ]),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      groupCode: 'G1',
      programs: ['DEV - Development'],
      modes: ['In person'],
      regionalOffices: ['Rabat'],
      assignments: [
        { module: 'Algorithms', teacherName: 'Youssef' },
        {
          module: 'Databases',
          moduleCode: 'DB101',
          teacherName: 'Amina',
          mhp: 3,
          mhd: 2,
          mhg: 1,
        },
      ],
    })
  })
})
