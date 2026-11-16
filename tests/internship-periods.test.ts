import { describe, expect, it } from 'vitest'
import {
  getAcademicYearMonths,
  getInternshipPeriodDates,
  isInternshipPeriodWithinAcademicYear,
} from '../src/shared/internship-periods'

describe('internship periods', () => {
  const months = getAcademicYearMonths('2026-09-01', '2027-08-31')

  it('lists every month in the academic year, including both endpoints', () => {
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-09')
    expect(months[11]).toBe('2027-08')
  })

  it('uses the selected September-to-June academic-year boundaries', () => {
    const firstYear = getAcademicYearMonths('2026-09-01', '2027-06-30')
    const nextYear = getAcademicYearMonths('2027-09-01', '2028-06-30')

    expect(firstYear).toHaveLength(10)
    expect(firstYear[0]).toBe('2026-09')
    expect(firstYear[9]).toBe('2027-06')
    expect(nextYear).toHaveLength(10)
    expect(nextYear[0]).toBe('2027-09')
    expect(nextYear[9]).toBe('2028-06')
  })

  it('converts a start month and duration to inclusive calendar dates', () => {
    expect(getInternshipPeriodDates('2026-09', 2)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-10-31',
    })
  })

  it('does not allow a period to extend past the academic year', () => {
    expect(isInternshipPeriodWithinAcademicYear(months, '2027-08', 2)).toBe(
      false,
    )
  })

  it('allows an in-year period regardless of the period assigned to another group', () => {
    expect(isInternshipPeriodWithinAcademicYear(months, '2026-10', 1)).toBe(
      true,
    )
  })
})
