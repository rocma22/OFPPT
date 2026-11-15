import { describe, expect, it } from 'vitest'
import type { InternshipPeriod } from '../src/shared/types'
import {
  canAssignInternshipPeriod,
  getAcademicYearMonths,
  getInternshipPeriodDates,
} from '../src/shared/internship-periods'

describe('internship periods', () => {
  const months = getAcademicYearMonths('2026-09-01', '2027-08-31')

  it('lists every month in the academic year, including both endpoints', () => {
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-09')
    expect(months[11]).toBe('2027-08')
  })

  it('converts a start month and duration to inclusive calendar dates', () => {
    expect(getInternshipPeriodDates('2026-09', 2)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-10-31',
    })
  })

  it('does not allow a period to extend past the academic year', () => {
    expect(canAssignInternshipPeriod(months, [], 1, '2027-08', 2)).toBe(false)
  })

  it('prevents assigning an already occupied month to another teacher', () => {
    const assigned: InternshipPeriod[] = [
      {
        id: 1,
        academicYearId: 1,
        teacherId: 2,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
    ]

    expect(canAssignInternshipPeriod(months, assigned, 1, '2026-09', 2)).toBe(
      false,
    )
    expect(canAssignInternshipPeriod(months, assigned, 1, '2026-09', 1)).toBe(
      true,
    )
    expect(canAssignInternshipPeriod(months, assigned, 2, '2026-10', 1)).toBe(
      true,
    )
  })
})
