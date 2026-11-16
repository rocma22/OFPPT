import {
  ArrowRight,
  CalendarDays,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  AcademicYear,
  HoursPlanHoliday,
  HoursPlanningData,
  HoursPlanSession,
  InternshipPeriod,
  Teacher,
} from '@shared/types'
import {
  buildHoursPlanning,
  createEmptyHoursPlanningData,
  getHoursPlanSessionHours,
  hasTeacherSessionConflict,
  isAllowedPlanningTime,
  isPlanningDateBlocked,
  PLANNING_TIME_WINDOWS,
  PLANNING_WEEKDAYS,
  timeToMinutes,
} from '@shared/hours-planning'
import { getAcademicYearMonths } from '@shared/internship-periods'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface HoursPlanningContext {
  academicYearId: number | null
  academicYear: AcademicYear | null
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void
}

interface GroupTeacherOption {
  groupCode: string
  teacherId: number
  teacherName: string
}

const weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function sessionDate(session: HoursPlanSession): string {
  return addDays(session.weekStart, session.weekday - 1)
}

function formatHours(hours: number, language: string): string {
  return new Intl.NumberFormat(language, {
    maximumFractionDigits: 2,
  }).format(hours)
}

function emptyPlanningData(): HoursPlanningData {
  return createEmptyHoursPlanningData()
}

function sessionKey(
  session: Pick<HoursPlanSession, 'teacherId' | 'groupCode'>,
) {
  return `${session.teacherId}\u0000${session.groupCode
    .trim()
    .toLocaleUpperCase()}`
}

function toStoredSession(session: HoursPlanSession): HoursPlanSession {
  return {
    id: session.id,
    weekStart: session.weekStart,
    groupCode: session.groupCode,
    teacherId: session.teacherId,
    weekday: session.weekday,
    startTime: session.startTime,
    endTime: session.endTime,
  }
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`
}

function findMoveSlot(
  weekStart: string,
  groupCode: string,
  teacherId: number,
  durationMinutes: number,
  sessions: HoursPlanSession[],
  academicYear: AcademicYear,
  periods: InternshipPeriod[],
  holidays: HoursPlanHoliday[],
): Pick<HoursPlanSession, 'weekday' | 'startTime' | 'endTime'> | undefined {
  for (const weekday of PLANNING_WEEKDAYS) {
    const date = addDays(weekStart, weekday - 1)
    if (
      date < academicYear.startDate ||
      date > academicYear.endDate ||
      isPlanningDateBlocked(date, groupCode, periods, holidays)
    ) {
      continue
    }

    const occupied = sessions
      .filter(
        (session) =>
          session.teacherId === teacherId && session.weekday === weekday,
      )
      .map((session) => ({
        start: timeToMinutes(session.startTime),
        end: timeToMinutes(session.endTime),
      }))
      .sort((left, right) => left.start - right.start)
    for (const window of PLANNING_TIME_WINDOWS) {
      let cursor = window.start
      for (const session of occupied) {
        if (session.end <= window.start || session.start >= window.end) continue
        if (session.start - cursor >= durationMinutes) {
          return {
            weekday,
            startTime: formatTime(cursor),
            endTime: formatTime(cursor + durationMinutes),
          }
        }
        cursor = Math.max(cursor, session.end)
      }
      if (window.end - cursor >= durationMinutes) {
        return {
          weekday,
          startTime: formatTime(cursor),
          endTime: formatTime(cursor + durationMinutes),
        }
      }
    }
  }
}

export function HoursPlanningPage() {
  const { t, i18n } = useTranslation()
  const { academicYearId, academicYear, setHasUnsavedChanges } =
    useOutletContext<HoursPlanningContext>()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [periods, setPeriods] = useState<InternshipPeriod[]>([])
  const [data, setData] = useState<HoursPlanningData>(emptyPlanningData)
  const [selectedWeekStart, setSelectedWeekStart] = useState('')
  const [weekDraft, setWeekDraft] = useState<HoursPlanSession[]>([])
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({})
  const [holidayGroup, setHolidayGroup] = useState('')
  const [holidayLabel, setHolidayLabel] = useState('')
  const [holidayStartDate, setHolidayStartDate] = useState('')
  const [holidayEndDate, setHolidayEndDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [pageError, setPageError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [hasUnsavedWeekChanges, setHasUnsavedWeekChanges] = useState(false)
  const language = i18n.resolvedLanguage ?? 'en'

  useEffect(() => {
    let active = true
    setTeachers([])
    setPeriods([])
    setData(emptyPlanningData())
    setSelectedWeekStart('')
    setWeekDraft([])
    setMoveTargets({})
    setHasLoadError(false)
    setPageError('')
    setSavedMessage('')

    if (academicYearId === null || academicYear === null) {
      setIsLoading(false)
      return () => {
        active = false
      }
    }

    setIsLoading(true)
    Promise.all([
      window.desktopApi.getTeachers(academicYearId),
      window.desktopApi.getInternshipPeriods(academicYearId),
      window.desktopApi.getHoursPlanningData(academicYearId),
    ])
      .then(([loadedTeachers, loadedPeriods, loadedData]) => {
        if (!active) return
        const validPairs = new Set(
          loadedTeachers.flatMap((teacher) =>
            teacher.assignments.map(
              (assignment) =>
                `${teacher.id}\u0000${assignment.groupCode
                  .trim()
                  .toLocaleUpperCase()}`,
            ),
          ),
        )
        const validGroups = new Set(
          loadedTeachers.flatMap((teacher) =>
            teacher.assignments.map((assignment) =>
              assignment.groupCode.trim().toLocaleUpperCase(),
            ),
          ),
        )
        const sanitizedData: HoursPlanningData = {
          holidays: loadedData.holidays.filter((holiday) =>
            validGroups.has(holiday.groupCode.trim().toLocaleUpperCase()),
          ),
          overrides: Object.fromEntries(
            Object.entries(loadedData.overrides).map(
              ([weekStart, sessions]) => [
                weekStart,
                sessions.filter((session) =>
                  validPairs.has(sessionKey(session)),
                ),
              ],
            ),
          ),
        }
        setTeachers(loadedTeachers)
        setPeriods(loadedPeriods)
        setData(sanitizedData)
      })
      .catch((error: unknown) => {
        console.error('Unable to load hours planning', error)
        if (active) setHasLoadError(true)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [academicYear, academicYearId])

  const plan = useMemo(
    () =>
      academicYear
        ? buildHoursPlanning(academicYear, teachers, periods, data)
        : { weeks: [], groups: [] },
    [academicYear, data, periods, teachers],
  )
  const selectedWeek = useMemo(
    () => plan.weeks.find((week) => week.weekStart === selectedWeekStart),
    [plan.weeks, selectedWeekStart],
  )
  const options = useMemo<GroupTeacherOption[]>(
    () =>
      plan.groups.flatMap((group) =>
        group.teachers.map((teacher) => ({
          groupCode: group.groupCode,
          teacherId: teacher.teacherId,
          teacherName: teacher.teacherName,
        })),
      ),
    [plan.groups],
  )
  const activeMonths = useMemo(
    () =>
      academicYear
        ? getAcademicYearMonths(academicYear.startDate, academicYear.endDate)
        : [],
    [academicYear],
  )

  useEffect(() => {
    if (!plan.weeks.length) {
      setSelectedWeekStart('')
      return
    }
    setSelectedWeekStart((current) =>
      plan.weeks.some((week) => week.weekStart === current)
        ? current
        : (plan.weeks.find((week) => week.sessions.length)?.weekStart ??
          plan.weeks[0].weekStart),
    )
  }, [plan.weeks])

  useEffect(() => {
    setWeekDraft(selectedWeek?.sessions.map(toStoredSession) ?? [])
    setHasUnsavedWeekChanges(false)
  }, [selectedWeek])

  const holidayFormDirty = Boolean(
    holidayGroup || holidayLabel || holidayStartDate || holidayEndDate,
  )
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedWeekChanges || holidayFormDirty)
    return () => setHasUnsavedChanges(false)
  }, [hasUnsavedWeekChanges, holidayFormDirty, setHasUnsavedChanges])

  const weekDraftHasConflict = useMemo(() => {
    try {
      return hasTeacherSessionConflict(weekDraft)
    } catch {
      return true
    }
  }, [weekDraft])
  const weekDraftHasInvalidSlot = useMemo(
    () =>
      weekDraft.some(
        (session) =>
          !PLANNING_WEEKDAYS.includes(
            session.weekday as (typeof PLANNING_WEEKDAYS)[number],
          ) || !isAllowedTime(session.startTime, session.endTime),
      ),
    [weekDraft],
  )

  function isAllowedTime(startTime: string, endTime: string): boolean {
    try {
      return isAllowedPlanningTime(startTime, endTime)
    } catch {
      return false
    }
  }

  function draftHoursFor(key: string): number {
    return weekDraft
      .filter((session) => sessionKey(session) === key)
      .reduce(
        (total, session) =>
          total +
          (isAllowedTime(session.startTime, session.endTime)
            ? getHoursPlanSessionHours(session)
            : 0),
        0,
      )
  }

  const draftTotalsByKey = new Map(
    options.map((option) => [
      sessionKey({ teacherId: option.teacherId, groupCode: option.groupCode }),
      draftHoursFor(
        sessionKey({
          teacherId: option.teacherId,
          groupCode: option.groupCode,
        }),
      ),
    ]),
  )

  async function persistPlanningData(
    updated: HoursPlanningData,
  ): Promise<boolean> {
    if (academicYearId === null) return false
    setIsSaving(true)
    setPageError('')
    setSavedMessage('')
    try {
      await window.desktopApi.saveHoursPlanningData(academicYearId, updated)
      setData(updated)
      setSavedMessage(t('hoursPlanning.saved'))
      return true
    } catch (error) {
      console.error('Unable to save hours planning', error)
      setPageError(t('hoursPlanning.saveError'))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  function updateWeekSession(
    id: string,
    changes: Partial<HoursPlanSession>,
  ): void {
    setWeekDraft((current) =>
      current.map((session) =>
        session.id === id ? { ...session, ...changes } : session,
      ),
    )
    setHasUnsavedWeekChanges(true)
    setPageError('')
    setSavedMessage('')
  }

  function addWeekSession(): void {
    if (!selectedWeekStart || !options.length) return
    const option = options[0]
    setWeekDraft((current) => [
      ...current,
      {
        id: `manual-${crypto.randomUUID()}`,
        weekStart: selectedWeekStart,
        groupCode: option.groupCode,
        teacherId: option.teacherId,
        weekday: 1,
        startTime: '08:00',
        endTime: '09:00',
      },
    ])
    setHasUnsavedWeekChanges(true)
    setPageError('')
    setSavedMessage('')
  }

  async function saveWeek(): Promise<void> {
    if (!selectedWeek || !academicYear) return
    if (weekDraftHasInvalidSlot) {
      setPageError(t('hoursPlanning.invalidSlot'))
      return
    }
    if (weekDraftHasConflict) {
      setPageError(t('hoursPlanning.conflictError'))
      return
    }
    if (
      weekDraft.some((session) => {
        const date = sessionDate(session)
        return date < academicYear.startDate || date > academicYear.endDate
      })
    ) {
      setPageError(t('hoursPlanning.invalidSlot'))
      return
    }
    const assignedPairs = new Set(options.map(sessionKey))
    if (
      weekDraft.some(
        (session) =>
          session.weekStart !== selectedWeekStart ||
          !assignedPairs.has(sessionKey(session)) ||
          isPlanningDateBlocked(
            sessionDate(session),
            session.groupCode,
            periods,
            data.holidays,
          ),
      )
    ) {
      setPageError(t('hoursPlanning.blockedDateError'))
      return
    }

    const saved = await persistPlanningData({
      ...data,
      overrides: {
        ...data.overrides,
        [selectedWeekStart]: weekDraft.map(toStoredSession),
      },
    })
    if (saved) setHasUnsavedWeekChanges(false)
  }

  async function resetWeek(): Promise<void> {
    if (!selectedWeekStart || !data.overrides[selectedWeekStart]) return
    const overrides = { ...data.overrides }
    delete overrides[selectedWeekStart]
    if (await persistPlanningData({ ...data, overrides })) {
      setHasUnsavedWeekChanges(false)
    }
  }

  async function moveSessionToWeek(session: HoursPlanSession): Promise<void> {
    const targetWeekStart = moveTargets[session.id]
    if (!targetWeekStart || !academicYear || !selectedWeek) return
    if (weekDraftHasConflict || weekDraftHasInvalidSlot) {
      setPageError(
        weekDraftHasConflict
          ? t('hoursPlanning.conflictError')
          : t('hoursPlanning.invalidSlot'),
      )
      return
    }
    const sourceDate = sessionDate(session)
    if (
      sourceDate < academicYear.startDate ||
      sourceDate > academicYear.endDate ||
      isPlanningDateBlocked(
        sourceDate,
        session.groupCode,
        periods,
        data.holidays,
      )
    ) {
      setPageError(t('hoursPlanning.blockedDateError'))
      return
    }
    const destinationWeek = plan.weeks.find(
      (week) => week.weekStart === targetWeekStart,
    )
    if (!destinationWeek) return
    const durationMinutes = Math.round(getHoursPlanSessionHours(session) * 60)
    const destinationSessions = destinationWeek.sessions.map(toStoredSession)
    const slot = findMoveSlot(
      targetWeekStart,
      session.groupCode,
      session.teacherId,
      durationMinutes,
      destinationSessions,
      academicYear,
      periods,
      data.holidays,
    )
    if (!slot) {
      setPageError(t('hoursPlanning.noMoveSlot'))
      return
    }

    const movedSession: HoursPlanSession = {
      ...session,
      id: `manual-${crypto.randomUUID()}`,
      weekStart: targetWeekStart,
      ...slot,
    }
    const updatedOverrides = {
      ...data.overrides,
      [selectedWeekStart]: weekDraft
        .filter((entry) => entry.id !== session.id)
        .map(toStoredSession),
      [targetWeekStart]: [...destinationSessions, movedSession],
    }
    if (await persistPlanningData({ ...data, overrides: updatedOverrides })) {
      setHasUnsavedWeekChanges(false)
      setMoveTargets((current) => {
        const next = { ...current }
        delete next[session.id]
        return next
      })
    }
  }

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      hasUnsavedWeekChanges &&
      !window.confirm(t('hoursPlanning.discardChanges'))
    ) {
      return
    }
    if (
      !academicYear ||
      !holidayGroup ||
      !holidayLabel.trim() ||
      !holidayStartDate ||
      !holidayEndDate ||
      holidayStartDate > holidayEndDate ||
      holidayStartDate < academicYear.startDate ||
      holidayEndDate > academicYear.endDate
    ) {
      setPageError(t('hoursPlanning.invalidHoliday'))
      return
    }
    const holiday: HoursPlanHoliday = {
      id: `holiday-${crypto.randomUUID()}`,
      groupCode: holidayGroup,
      label: holidayLabel.trim(),
      startDate: holidayStartDate,
      endDate: holidayEndDate,
    }
    const saved = await persistPlanningData({
      ...data,
      holidays: [...data.holidays, holiday],
    })
    if (saved) {
      setHasUnsavedWeekChanges(false)
      setHolidayGroup('')
      setHolidayLabel('')
      setHolidayStartDate('')
      setHolidayEndDate('')
    }
  }

  async function removeHoliday(holiday: HoursPlanHoliday): Promise<void> {
    if (
      hasUnsavedWeekChanges &&
      !window.confirm(t('hoursPlanning.discardChanges'))
    ) {
      return
    }
    if (
      !window.confirm(
        t('hoursPlanning.confirmRemoveHoliday', {
          group: holiday.groupCode,
          name: holiday.label,
        }),
      )
    ) {
      return
    }
    const saved = await persistPlanningData({
      ...data,
      holidays: data.holidays.filter((entry) => entry.id !== holiday.id),
    })
    if (saved) setHasUnsavedWeekChanges(false)
  }

  const selectedWeekHours = useMemo(() => {
    if (!selectedWeek) return 0
    return weekDraft.reduce(
      (total, session) =>
        total +
        (isAllowedTime(session.startTime, session.endTime)
          ? getHoursPlanSessionHours(session)
          : 0),
      0,
    )
  }, [selectedWeek, weekDraft])

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8">
        <div className="mb-2 text-xs font-bold tracking-[0.16em] text-brand">
          {t('app.name')}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          {t('navigation.hoursPlanning')}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('hoursPlanning.description')}
          {academicYear && (
            <span className="ms-1 font-medium text-slate-600">
              {t('hoursPlanning.academicYear', { year: academicYear.label })}
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {t('hoursPlanning.scheduleHours')}
        </p>
      </div>

      {hasLoadError && (
        <div
          className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {t('hoursPlanning.loadError')}
        </div>
      )}
      {pageError && (
        <div
          className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {pageError}
        </div>
      )}

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          {t('common.loading')}
        </Card>
      ) : !academicYear ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {t('hoursPlanning.noAcademicYear')}
        </Card>
      ) : plan.groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {t('hoursPlanning.noGroups')}
        </Card>
      ) : (
        <>
          <section aria-labelledby="hours-monthly-title">
            <h2
              className="mb-3 text-lg font-semibold text-ink"
              id="hours-monthly-title"
            >
              {t('hoursPlanning.monthlyDistribution')}
            </h2>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {activeMonths.map((month) => {
                const monthGroups = plan.groups
                  .map((group) => ({
                    groupCode: group.groupCode,
                    hours: group.monthlyHours[month] ?? 0,
                  }))
                  .filter((group) => group.hours > 0)
                return (
                  <Card
                    className={`min-w-0 p-4 ${
                      monthGroups.length
                        ? 'border-brand/20 bg-brand-light/50'
                        : 'bg-white'
                    }`}
                    key={month}
                  >
                    <h3 className="font-semibold text-ink">{month}</h3>
                    {monthGroups.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {monthGroups.map((group) => (
                          <li
                            className="flex items-center justify-between gap-2 text-sm"
                            key={group.groupCode}
                          >
                            <span className="min-w-0 break-words font-medium text-brand">
                              {group.groupCode}
                            </span>
                            <span className="shrink-0 text-slate-600">
                              {formatHours(group.hours, language)}{' '}
                              {t('hoursPlanning.hoursShort')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">
                        {t('hoursPlanning.noScheduledHours')}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="hours-groups-title" className="mb-8">
            <h2
              className="mb-3 text-lg font-semibold text-ink"
              id="hours-groups-title"
            >
              {t('hoursPlanning.groupTotals')}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {plan.groups.map((group) => (
                <Card className="p-4" key={group.groupCode}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-ink">
                      {group.groupCode}
                    </h3>
                    <span className="text-sm font-bold text-brand">
                      {formatHours(group.totalHours, language)}{' '}
                      {t('hoursPlanning.hoursShort')}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                    {group.teachers.map((teacher) => (
                      <li
                        className="flex justify-between gap-3 text-sm"
                        key={teacher.teacherId}
                      >
                        <span className="text-slate-600">
                          {teacher.teacherName}
                        </span>
                        <span className="shrink-0 text-slate-500">
                          {formatHours(teacher.totalHours, language)}{' '}
                          {t('hoursPlanning.hoursShort')}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {Math.abs(group.plannedHours - group.totalHours) > 0.02 && (
                    <p className="mt-3 text-xs text-amber-700">
                      {t('hoursPlanning.balance', {
                        planned: formatHours(group.plannedHours, language),
                        total: formatHours(group.totalHours, language),
                      })}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="hours-weekly-title" className="mb-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  className="text-lg font-semibold text-ink"
                  id="hours-weekly-title"
                >
                  {t('hoursPlanning.weeklySchedule')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('hoursPlanning.weeklyDescription')}
                </p>
              </div>
              <label className="block text-sm font-medium text-slate-600">
                {t('hoursPlanning.chooseWeek')}
                <select
                  className="mt-1 block h-10 min-w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink"
                  onChange={(event) => {
                    if (hasUnsavedWeekChanges) {
                      if (!window.confirm(t('hoursPlanning.discardChanges'))) {
                        event.currentTarget.value = selectedWeekStart
                        return
                      }
                      setHasUnsavedWeekChanges(false)
                    }
                    setMoveTargets({})
                    setSelectedWeekStart(event.target.value)
                    setPageError('')
                    setSavedMessage('')
                  }}
                  value={selectedWeekStart}
                >
                  {plan.weeks.map((week) => (
                    <option key={week.weekStart} value={week.weekStart}>
                      {week.weekStart} – {addDays(week.weekStart, 6)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedWeek && (
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <CalendarDays aria-hidden="true" size={17} />
                    {selectedWeek.weekStart} –{' '}
                    {addDays(selectedWeek.weekStart, 6)}
                  </div>
                  <div className="text-sm text-slate-500">
                    {t('hoursPlanning.scheduledThisWeek', {
                      hours: formatHours(selectedWeekHours, language),
                    })}
                  </div>
                </div>

                {selectedWeek.unscheduledHours.length > 0 && (
                  <div
                    className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    role="status"
                  >
                    {t('hoursPlanning.capacityWarning', {
                      hours: formatHours(
                        selectedWeek.unscheduledHours.reduce(
                          (sum, entry) => sum + entry.hours,
                          0,
                        ),
                        language,
                      ),
                    })}
                  </div>
                )}
                {weekDraftHasConflict && (
                  <p
                    className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {t('hoursPlanning.conflictError')}
                  </p>
                )}
                {weekDraftHasInvalidSlot && (
                  <p
                    className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800"
                    role="alert"
                  >
                    {t('hoursPlanning.invalidSlot')}
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-start text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-start">
                          {t('hoursPlanning.group')}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {t('hoursPlanning.teacher')}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {t('hoursPlanning.day')}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {t('hoursPlanning.start')}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {t('hoursPlanning.end')}
                        </th>
                        <th className="px-4 py-3 text-start">
                          {t('hoursPlanning.duration')}
                        </th>
                        <th className="px-4 py-3 text-end">
                          {t('hoursPlanning.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {weekDraft.map((session) => (
                        <tr
                          className={
                            weekDraftHasConflict ? 'bg-red-50/60' : 'bg-white'
                          }
                          key={session.id}
                        >
                          <td className="px-4 py-2">
                            <select
                              aria-label={t('hoursPlanning.group')}
                              className="h-9 max-w-48 rounded-lg border border-slate-200 bg-white px-2"
                              onChange={(event) => {
                                const option =
                                  options[Number(event.target.value)]
                                if (option) {
                                  updateWeekSession(session.id, {
                                    groupCode: option.groupCode,
                                    teacherId: option.teacherId,
                                  })
                                }
                              }}
                              value={Math.max(
                                0,
                                options.findIndex(
                                  (option) =>
                                    option.groupCode === session.groupCode &&
                                    option.teacherId === session.teacherId,
                                ),
                              )}
                            >
                              {options.map((option, index) => (
                                <option key={sessionKey(option)} value={index}>
                                  {option.groupCode} · {option.teacherName}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-slate-600">
                            {options.find(
                              (option) =>
                                option.groupCode === session.groupCode &&
                                option.teacherId === session.teacherId,
                            )?.teacherName ?? t('hoursPlanning.unknownTeacher')}
                          </td>
                          <td className="px-4 py-2">
                            <select
                              aria-label={t('hoursPlanning.day')}
                              className="h-9 rounded-lg border border-slate-200 bg-white px-2"
                              onChange={(event) =>
                                updateWeekSession(session.id, {
                                  weekday: Number(event.target.value),
                                })
                              }
                              value={session.weekday}
                            >
                              {PLANNING_WEEKDAYS.map((day) => (
                                <option key={day} value={day}>
                                  {t(`hoursPlanning.days.${weekdayNames[day]}`)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              aria-label={t('hoursPlanning.start')}
                              className="h-9 rounded-lg border border-slate-200 px-2"
                              onChange={(event) =>
                                updateWeekSession(session.id, {
                                  startTime: event.target.value,
                                })
                              }
                              step="60"
                              type="time"
                              value={session.startTime}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              aria-label={t('hoursPlanning.end')}
                              className="h-9 rounded-lg border border-slate-200 px-2"
                              onChange={(event) =>
                                updateWeekSession(session.id, {
                                  endTime: event.target.value,
                                })
                              }
                              step="60"
                              type="time"
                              value={session.endTime}
                            />
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-700">
                            {isAllowedTime(session.startTime, session.endTime)
                              ? `${formatHours(
                                  getHoursPlanSessionHours(session),
                                  language,
                                )} ${t('hoursPlanning.hoursShort')}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-end">
                            <div className="flex items-center justify-end gap-1">
                              <select
                                aria-label={t('hoursPlanning.moveToWeek')}
                                className="h-9 max-w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                                disabled={isSaving}
                                onChange={(event) =>
                                  setMoveTargets((current) => ({
                                    ...current,
                                    [session.id]: event.target.value,
                                  }))
                                }
                                value={moveTargets[session.id] ?? ''}
                              >
                                <option value="">
                                  {t('hoursPlanning.moveToWeek')}
                                </option>
                                {plan.weeks
                                  .filter(
                                    (week) =>
                                      week.weekStart !== selectedWeekStart,
                                  )
                                  .map((week) => (
                                    <option
                                      key={week.weekStart}
                                      value={week.weekStart}
                                    >
                                      {week.weekStart}
                                    </option>
                                  ))}
                              </select>
                              <Button
                                aria-label={t('hoursPlanning.moveSession')}
                                disabled={isSaving || !moveTargets[session.id]}
                                onClick={() => void moveSessionToWeek(session)}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <ArrowRight aria-hidden="true" size={15} />
                              </Button>
                              <Button
                                aria-label={t('hoursPlanning.removeSession')}
                                className="text-red-600"
                                onClick={() => {
                                  setWeekDraft((current) =>
                                    current.filter(
                                      (entry) => entry.id !== session.id,
                                    ),
                                  )
                                  setHasUnsavedWeekChanges(true)
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 aria-hidden="true" size={16} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {weekDraft.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-sm text-slate-400"
                            colSpan={7}
                          >
                            {t('hoursPlanning.noSessions')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={addWeekSession}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus aria-hidden="true" size={15} />
                      {t('hoursPlanning.addSession')}
                    </Button>
                    {data.overrides[selectedWeek.weekStart] && (
                      <Button
                        onClick={() => void resetWeek()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        {t('hoursPlanning.resetWeek')}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {savedMessage && (
                      <span className="text-sm font-medium text-emerald-700">
                        {savedMessage}
                      </span>
                    )}
                    <Button
                      disabled={
                        isSaving ||
                        weekDraftHasConflict ||
                        weekDraftHasInvalidSlot
                      }
                      onClick={() => void saveWeek()}
                      type="button"
                    >
                      <Save aria-hidden="true" size={16} />
                      {isSaving
                        ? t('hoursPlanning.saving')
                        : t('hoursPlanning.saveWeek')}
                    </Button>
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    {t('hoursPlanning.weeklyTargets')}
                  </h3>
                  <ul className="grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedWeek.targets.map((target) => {
                      const key = sessionKey(target)
                      const actualHours = draftTotalsByKey.get(key) ?? 0
                      return (
                        <li className="flex justify-between gap-2" key={key}>
                          <span>
                            {target.groupCode} · {target.teacherName}
                          </span>
                          <span className="shrink-0">
                            {formatHours(actualHours, language)} /{' '}
                            {formatHours(target.hours, language)}{' '}
                            {t('hoursPlanning.hoursShort')}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </Card>
            )}
          </section>

          <section aria-labelledby="hours-holidays-title">
            <h2
              className="mb-3 text-lg font-semibold text-ink"
              id="hours-holidays-title"
            >
              {t('hoursPlanning.holidays')}
            </h2>
            <Card className="p-4">
              <form
                className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1fr_1fr_auto]"
                onSubmit={(event) => void addHoliday(event)}
              >
                <label className="block text-sm font-medium text-slate-600">
                  {t('hoursPlanning.group')}
                  <select
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    onChange={(event) => setHolidayGroup(event.target.value)}
                    required
                    value={holidayGroup}
                  >
                    <option value="">{t('hoursPlanning.chooseGroup')}</option>
                    {plan.groups.map((group) => (
                      <option key={group.groupCode} value={group.groupCode}>
                        {group.groupCode}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-600">
                  {t('hoursPlanning.holidayName')}
                  <input
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    onChange={(event) => setHolidayLabel(event.target.value)}
                    required
                    value={holidayLabel}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-600">
                  {t('hoursPlanning.startDate')}
                  <input
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    max={academicYear.endDate}
                    min={academicYear.startDate}
                    onChange={(event) =>
                      setHolidayStartDate(event.target.value)
                    }
                    required
                    type="date"
                    value={holidayStartDate}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-600">
                  {t('hoursPlanning.endDate')}
                  <input
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                    max={academicYear.endDate}
                    min={holidayStartDate || academicYear.startDate}
                    onChange={(event) => setHolidayEndDate(event.target.value)}
                    required
                    type="date"
                    value={holidayEndDate}
                  />
                </label>
                <Button disabled={isSaving} type="submit">
                  <Plus aria-hidden="true" size={16} />
                  {t('hoursPlanning.addHoliday')}
                </Button>
              </form>

              {data.holidays.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  {data.holidays.map((holiday) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                      key={holiday.id}
                    >
                      <span className="font-medium text-ink">
                        {holiday.groupCode} · {holiday.label}
                      </span>
                      <span className="text-slate-500">
                        {holiday.startDate} – {holiday.endDate}
                      </span>
                      <Button
                        className="text-red-600"
                        disabled={isSaving}
                        onClick={() => void removeHoliday(holiday)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                        {t('hoursPlanning.removeHoliday')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
