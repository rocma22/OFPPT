import type {
  AcademicYear,
  HoursPlanHoliday,
  HoursPlanningData,
  HoursPlanSession,
  InternshipPeriod,
  Teacher,
} from './types'

export const PLANNING_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const
export const PLANNING_TIME_WINDOWS = [
  { start: 8 * 60, end: 12 * 60 },
  { start: 13 * 60, end: 18 * 60 },
] as const

export interface PlannedSession extends HoursPlanSession {
  date: string
  teacherName: string
  hours: number
}

export interface WeeklyHoursTarget {
  teacherId: number
  teacherName: string
  groupCode: string
  hours: number
}

export interface PlanningWeek {
  weekStart: string
  sessions: PlannedSession[]
  targets: WeeklyHoursTarget[]
  unscheduledHours: WeeklyHoursTarget[]
}

export interface PlanningGroupTeacher {
  teacherId: number
  teacherName: string
  totalHours: number
  plannedHours: number
}

export interface PlanningGroup {
  groupCode: string
  totalHours: number
  plannedHours: number
  teachers: PlanningGroupTeacher[]
  monthlyHours: Record<string, number>
}

export interface HoursPlanningResult {
  weeks: PlanningWeek[]
  groups: PlanningGroup[]
}

interface GroupTeacherHours extends PlanningGroupTeacher {
  key: string
  workingDaysByWeek: Map<string, string[]>
  totalWorkingDays: number
}

interface WeekBase {
  weekStart: string
  days: Array<{ weekday: number; date: string }>
}

function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid planning date: ${date}`)
  }
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== date) {
    throw new Error(`Invalid planning date: ${date}`)
  }
  return parsed
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function addDays(date: Date, count: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + count)
  return result
}

function getWeeks(academicYear: AcademicYear): WeekBase[] {
  const start = parseDate(academicYear.startDate)
  const end = parseDate(academicYear.endDate)
  if (start > end) throw new Error('Academic year dates are invalid')

  const startWeekdayOffset = (start.getUTCDay() + 6) % 7
  let monday = addDays(start, -startWeekdayOffset)
  const weeks: WeekBase[] = []
  while (monday <= end) {
    const days: WeekBase['days'] = []
    for (const weekday of PLANNING_WEEKDAYS) {
      const date = formatDate(addDays(monday, weekday - 1))
      if (date >= academicYear.startDate && date <= academicYear.endDate) {
        days.push({ weekday, date })
      }
    }
    weeks.push({ weekStart: formatDate(monday), days })
    monday = addDays(monday, 7)
  }
  return weeks
}

function pairKey(teacherId: number, groupCode: string): string {
  return `${teacherId}\u0000${groupCode.trim().toLocaleUpperCase()}`
}

export function isPlanningDateBlocked(
  date: string,
  groupCode: string,
  periods: InternshipPeriod[],
  holidays: HoursPlanHoliday[],
): boolean {
  return (
    periods.some(
      (period) =>
        period.groupCode.trim().toLocaleUpperCase() ===
          groupCode.trim().toLocaleUpperCase() &&
        date >= period.startDate &&
        date <= period.endDate,
    ) ||
    holidays.some(
      (holiday) =>
        holiday.groupCode.trim().toLocaleUpperCase() ===
          groupCode.trim().toLocaleUpperCase() &&
        date >= holiday.startDate &&
        date <= holiday.endDate,
    )
  )
}

export function timeToMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) throw new Error(`Invalid planning time: ${value}`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function isAllowedPlanningTime(
  startTime: string,
  endTime: string,
): boolean {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  return (
    start < end &&
    PLANNING_TIME_WINDOWS.some(
      (window) => start >= window.start && end <= window.end,
    )
  )
}

export function getHoursPlanSessionHours(session: HoursPlanSession): number {
  return (
    (timeToMinutes(session.endTime) - timeToMinutes(session.startTime)) / 60
  )
}

export function hasTeacherSessionConflict(
  sessions: HoursPlanSession[],
): boolean {
  const byTeacherAndDay = new Map<string, HoursPlanSession[]>()
  for (const session of sessions) {
    const key = `${session.weekStart}\u0000${session.teacherId}\u0000${session.weekday}`
    byTeacherAndDay.set(key, [...(byTeacherAndDay.get(key) ?? []), session])
  }
  for (const daySessions of byTeacherAndDay.values()) {
    const sorted = [...daySessions].sort(
      (left, right) =>
        timeToMinutes(left.startTime) - timeToMinutes(right.startTime),
    )
    for (let index = 1; index < sorted.length; index += 1) {
      if (
        timeToMinutes(sorted[index].startTime) <
        timeToMinutes(sorted[index - 1].endTime)
      ) {
        return true
      }
    }
  }
  return false
}

function getGroupTeacherHours(teachers: Teacher[]): GroupTeacherHours[] {
  const pairs = new Map<string, GroupTeacherHours>()
  for (const teacher of teachers) {
    for (const assignment of teacher.assignments) {
      const groupCode = assignment.groupCode.trim()
      if (!groupCode) continue
      const key = pairKey(teacher.id, groupCode)
      const pair = pairs.get(key) ?? {
        key,
        groupCode,
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        totalHours: 0,
        plannedHours: 0,
        workingDaysByWeek: new Map<string, string[]>(),
        totalWorkingDays: 0,
      }
      pair.totalHours +=
        (assignment.mhp ?? 0) + (assignment.mhd ?? 0) + (assignment.mhg ?? 0)
      pairs.set(key, pair)
    }
  }
  return [...pairs.values()].sort(
    (left, right) =>
      left.teacherName.localeCompare(right.teacherName) ||
      left.groupCode.localeCompare(right.groupCode),
  )
}

function createSession(
  id: string,
  weekStart: string,
  weekday: number,
  group: GroupTeacherHours,
  startMinutes: number,
  durationMinutes: number,
): PlannedSession {
  const date = formatDate(addDays(parseDate(weekStart), weekday - 1))
  const endMinutes = startMinutes + durationMinutes
  const time = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
      minutes % 60,
    ).padStart(2, '0')}`
  return {
    id,
    weekStart,
    weekday,
    date,
    groupCode: group.groupCode,
    teacherId: group.teacherId,
    teacherName: group.teacherName,
    startTime: time(startMinutes),
    endTime: time(endMinutes),
    hours: durationMinutes / 60,
  }
}

function allocateWeeklyHours(
  week: WeekBase,
  group: GroupTeacherHours,
  targetMinutes: number,
  busy: Map<string, PlannedSession[]>,
  sequence: { value: number },
): { sessions: PlannedSession[]; unscheduledMinutes: number } {
  let remaining = targetMinutes
  const sessions: PlannedSession[] = []
  const eligibleDates = new Set(
    group.workingDaysByWeek.get(week.weekStart) ?? [],
  )
  const eligibleDays = week.days.filter((day) => eligibleDates.has(day.date))

  for (let dayIndex = 0; dayIndex < eligibleDays.length; dayIndex += 1) {
    if (remaining <= 0) break
    const day = eligibleDays[dayIndex]
    const daysLeft = eligibleDays.length - dayIndex
    const dayTarget =
      daysLeft === 1 ? remaining : Math.ceil(remaining / daysLeft)
    let remainingToday = dayTarget
    const dayKey = `${group.teacherId}\u0000${day.weekday}`
    for (const window of PLANNING_TIME_WINDOWS) {
      if (remainingToday <= 0) break
      let cursor = window.start
      const occupied = [...(busy.get(dayKey) ?? [])]
        .map((session) => ({
          start: timeToMinutes(session.startTime),
          end: timeToMinutes(session.endTime),
        }))
        .filter((slot) => slot.end > window.start && slot.start < window.end)
        .sort((left, right) => left.start - right.start)

      for (const slot of occupied) {
        if (slot.start > cursor && remainingToday > 0) {
          const duration = Math.min(remainingToday, slot.start - cursor)
          const session = createSession(
            `auto-${sequence.value++}`,
            week.weekStart,
            day.weekday,
            group,
            cursor,
            duration,
          )
          sessions.push(session)
          busy.set(dayKey, [...(busy.get(dayKey) ?? []), session])
          remainingToday -= duration
        }
        cursor = Math.max(cursor, slot.end)
        if (remainingToday <= 0) break
      }
      if (remainingToday > 0 && cursor < window.end) {
        const duration = Math.min(remainingToday, window.end - cursor)
        const session = createSession(
          `auto-${sequence.value++}`,
          week.weekStart,
          day.weekday,
          group,
          cursor,
          duration,
        )
        sessions.push(session)
        busy.set(dayKey, [...(busy.get(dayKey) ?? []), session])
        remainingToday -= duration
      }
    }
    remaining -= dayTarget - remainingToday
  }
  return { sessions, unscheduledMinutes: remaining }
}

function toPlannedSession(
  session: HoursPlanSession,
  group: GroupTeacherHours,
): PlannedSession {
  return {
    ...session,
    date: formatDate(
      addDays(parseDate(session.weekStart), session.weekday - 1),
    ),
    teacherName: group.teacherName,
    hours: getHoursPlanSessionHours(session),
  }
}

export function buildHoursPlanning(
  academicYear: AcademicYear,
  teachers: Teacher[],
  periods: InternshipPeriod[],
  data: HoursPlanningData,
): HoursPlanningResult {
  const weeks = getWeeks(academicYear)
  const pairs = getGroupTeacherHours(teachers)
  const pairByKey = new Map(pairs.map((pair) => [pair.key, pair]))

  for (const pair of pairs) {
    for (const week of weeks) {
      const activeDates = week.days
        .map((day) => day.date)
        .filter(
          (date) =>
            !isPlanningDateBlocked(
              date,
              pair.groupCode,
              periods,
              data.holidays,
            ),
        )
      if (activeDates.length > 0) {
        pair.workingDaysByWeek.set(week.weekStart, activeDates)
        pair.totalWorkingDays += activeDates.length
      }
    }
  }

  const targetMinutes = new Map<string, Map<string, number>>()
  for (const pair of pairs) {
    const targets = new Map<string, number>()
    const totalMinutes = Math.max(0, Math.round(pair.totalHours * 60))
    let activeDays = 0
    let allocatedMinutes = 0
    for (const week of weeks) {
      const dayCount = pair.workingDaysByWeek.get(week.weekStart)?.length ?? 0
      if (!dayCount || !pair.totalWorkingDays) continue
      activeDays += dayCount
      const cumulativeMinutes =
        activeDays === pair.totalWorkingDays
          ? totalMinutes
          : Math.round((totalMinutes * activeDays) / pair.totalWorkingDays)
      targets.set(week.weekStart, cumulativeMinutes - allocatedMinutes)
      allocatedMinutes = cumulativeMinutes
    }
    targetMinutes.set(pair.key, targets)
  }

  let sequence = 0
  const resultWeeks: PlanningWeek[] = []
  for (const week of weeks) {
    const busy = new Map<string, PlannedSession[]>()
    const weekTargets: WeeklyHoursTarget[] = []
    const unscheduledHours: WeeklyHoursTarget[] = []
    const autoSessions: PlannedSession[] = []
    const jobs = pairs
      .map((pair) => ({
        pair,
        minutes: targetMinutes.get(pair.key)?.get(week.weekStart) ?? 0,
      }))
      .filter(({ minutes }) => minutes > 0)
      .sort(
        (left, right) =>
          left.pair.teacherId - right.pair.teacherId ||
          left.pair.groupCode.localeCompare(right.pair.groupCode),
      )

    for (const { pair, minutes } of jobs) {
      weekTargets.push({
        teacherId: pair.teacherId,
        teacherName: pair.teacherName,
        groupCode: pair.groupCode,
        hours: minutes / 60,
      })
      const allocation = allocateWeeklyHours(week, pair, minutes, busy, {
        value: sequence,
      })
      sequence += allocation.sessions.length
      autoSessions.push(...allocation.sessions)
      if (allocation.unscheduledMinutes > 0) {
        unscheduledHours.push({
          teacherId: pair.teacherId,
          teacherName: pair.teacherName,
          groupCode: pair.groupCode,
          hours: allocation.unscheduledMinutes / 60,
        })
      }
    }

    const savedOverride = data.overrides[week.weekStart]
    const sessions = savedOverride
      ? savedOverride
          .filter((session) => {
            const pair = pairByKey.get(
              pairKey(session.teacherId, session.groupCode),
            )
            if (!pair || session.weekStart !== week.weekStart) return false
            const sessionDate = formatDate(
              addDays(parseDate(session.weekStart), session.weekday - 1),
            )
            return (
              week.days.some((day) => day.date === sessionDate) &&
              !isPlanningDateBlocked(
                sessionDate,
                session.groupCode,
                periods,
                data.holidays,
              )
            )
          })
          .map((session) =>
            toPlannedSession(
              session,
              pairByKey.get(pairKey(session.teacherId, session.groupCode))!,
            ),
          )
      : autoSessions

    resultWeeks.push({
      weekStart: week.weekStart,
      sessions,
      targets: weekTargets,
      unscheduledHours,
    })
  }

  const groupMap = new Map<string, PlanningGroup>()
  for (const pair of pairs) {
    const groupKey = pair.groupCode.trim().toLocaleUpperCase()
    const group = groupMap.get(groupKey) ?? {
      groupCode: pair.groupCode,
      totalHours: 0,
      plannedHours: 0,
      teachers: [],
      monthlyHours: {},
    }
    group.totalHours += pair.totalHours
    const pairPlannedMinutes = resultWeeks
      .flatMap((week) => week.sessions)
      .filter(
        (session) => pairKey(session.teacherId, session.groupCode) === pair.key,
      )
      .reduce((sum, session) => sum + Math.round(session.hours * 60), 0)
    const pairPlannedHours = pairPlannedMinutes / 60
    group.plannedHours += pairPlannedHours
    group.teachers.push({
      teacherId: pair.teacherId,
      teacherName: pair.teacherName,
      totalHours: pair.totalHours,
      plannedHours: pairPlannedHours,
    })
    groupMap.set(groupKey, group)
  }

  for (const week of resultWeeks) {
    for (const session of week.sessions) {
      const group = groupMap.get(session.groupCode.trim().toLocaleUpperCase())
      if (!group) continue
      const month = session.date.slice(0, 7)
      group.monthlyHours[month] =
        Math.round(((group.monthlyHours[month] ?? 0) + session.hours) * 60) / 60
    }
  }

  for (const group of groupMap.values()) {
    group.plannedHours = Math.round(group.plannedHours * 60) / 60
  }

  return {
    weeks: resultWeeks,
    groups: [...groupMap.values()].sort((left, right) =>
      left.groupCode.localeCompare(right.groupCode),
    ),
  }
}

export function createEmptyHoursPlanningData(): HoursPlanningData {
  return { holidays: [], overrides: {} }
}
