import { describe, expect, it } from 'vitest'
import type {
  AcademicYear,
  HoursPlanningData,
  InternshipPeriod,
  Teacher,
} from '../src/shared/types'
import {
  buildHoursPlanning,
  hasTeacherSessionConflict,
} from '../src/shared/hours-planning'

describe('hours planning', () => {
  const academicYear: AcademicYear = {
    id: 1,
    label: '2026-2027',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    createdAt: '',
  }
  const teachers: Teacher[] = [
    {
      id: 1,
      academicYearId: 1,
      fullName: 'Teacher One',
      cin: '',
      specialty: '',
      phone: '',
      email: '',
      matricule: '',
      createdAt: '',
      groupCount: 2,
      totalHours: 0,
      assignments: [
        {
          id: 1,
          teacherId: 1,
          groupCode: 'G1',
          module: 'Module A',
          mhp: 2,
          mhd: 1,
          mhg: 3,
        },
        {
          id: 2,
          teacherId: 1,
          groupCode: 'G2',
          module: 'Module B',
          mhp: 1,
          mhd: 0,
          mhg: 2,
        },
      ],
    },
    {
      id: 2,
      academicYearId: 1,
      fullName: 'Teacher Two',
      cin: '',
      specialty: '',
      phone: '',
      email: '',
      matricule: '',
      createdAt: '',
      groupCount: 1,
      totalHours: 0,
      assignments: [
        {
          id: 3,
          teacherId: 2,
          groupCode: 'G1',
          module: 'Module C',
          mhp: 0,
          mhd: 0,
          mhg: 3,
        },
      ],
    },
  ]
  const periods: InternshipPeriod[] = [
    {
      id: 1,
      academicYearId: 1,
      groupCode: 'G1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    },
  ]
  const data: HoursPlanningData = {
    holidays: [
      {
        id: 'h1',
        groupCode: 'G2',
        label: 'Holiday',
        startDate: '2026-09-14',
        endDate: '2026-09-19',
      },
    ],
    overrides: {},
  }

  it('distributes all imported hours outside group internships and holidays', () => {
    const plan = buildHoursPlanning(academicYear, teachers, periods, data)
    const groupOne = plan.groups.find((group) => group.groupCode === 'G1')
    const groupTwo = plan.groups.find((group) => group.groupCode === 'G2')
    const allSessions = plan.weeks.flatMap((week) => week.sessions)

    expect(groupOne?.totalHours).toBe(9)
    expect(groupOne?.plannedHours).toBe(9)
    expect(groupTwo?.totalHours).toBe(3)
    expect(groupTwo?.plannedHours).toBe(3)
    expect(
      allSessions.some(
        (session) =>
          session.groupCode === 'G1' &&
          session.date >= '2026-10-01' &&
          session.date <= '2026-10-31',
      ),
    ).toBe(false)
    expect(
      allSessions.some(
        (session) =>
          session.groupCode === 'G2' &&
          session.date >= '2026-09-14' &&
          session.date <= '2026-09-19',
      ),
    ).toBe(false)
    expect(hasTeacherSessionConflict(allSessions)).toBe(false)
  })

  it('detects overlapping time slots for the same teacher', () => {
    const first = {
      id: 'first',
      weekStart: '2026-08-31',
      groupCode: 'G1',
      teacherId: 1,
      weekday: 1,
      startTime: '08:00',
      endTime: '10:00',
    }

    expect(
      hasTeacherSessionConflict([
        first,
        { ...first, id: 'second', groupCode: 'G2', startTime: '09:30' },
      ]),
    ).toBe(true)
    expect(
      hasTeacherSessionConflict([
        first,
        { ...first, id: 'second', groupCode: 'G2', startTime: '10:00' },
      ]),
    ).toBe(false)
  })
})
