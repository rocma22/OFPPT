export function getAcademicYearMonths(
  startDate: string,
  endDate: string,
): string[] {
  const firstMonth = startDate.slice(0, 7)
  const lastMonth = endDate.slice(0, 7)
  const firstMonthNumber = Number(firstMonth.slice(5, 7))
  const lastMonthNumber = Number(lastMonth.slice(5, 7))
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    firstMonthNumber < 1 ||
    firstMonthNumber > 12 ||
    lastMonthNumber < 1 ||
    lastMonthNumber > 12 ||
    firstMonth > lastMonth
  ) {
    throw new Error('Academic year dates are invalid')
  }

  const months: string[] = []
  let year = Number(firstMonth.slice(0, 4))
  let month = Number(firstMonth.slice(5, 7))
  const endYear = Number(lastMonth.slice(0, 4))
  const endMonth = Number(lastMonth.slice(5, 7))
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) {
      year += 1
      month = 1
    }
  }
  return months
}

export function getInternshipPeriodDates(
  startMonth: string,
  durationMonths: number,
): { startDate: string; endDate: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) {
    throw new Error('Internship start month is invalid')
  }
  if (
    !Number.isSafeInteger(durationMonths) ||
    durationMonths < 1 ||
    durationMonths > 1200
  ) {
    throw new Error('Internship duration must be at least one month')
  }

  const [year, month] = startMonth.split('-').map(Number)
  const end = new Date(Date.UTC(year, month - 1 + durationMonths, 0))
  const endDate = [
    end.getUTCFullYear(),
    String(end.getUTCMonth() + 1).padStart(2, '0'),
    String(end.getUTCDate()).padStart(2, '0'),
  ].join('-')
  return { startDate: `${startMonth}-01`, endDate }
}

export function isInternshipPeriodWithinAcademicYear(
  months: string[],
  startMonth: string,
  durationMonths: number,
): boolean {
  const startIndex = months.indexOf(startMonth)
  if (
    startIndex < 0 ||
    !Number.isInteger(durationMonths) ||
    durationMonths < 1 ||
    startIndex + durationMonths > months.length
  ) {
    return false
  }
  return true
}
