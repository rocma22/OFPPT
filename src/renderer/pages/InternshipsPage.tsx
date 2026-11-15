import { CalendarDays, Save, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  AcademicYear,
  InternshipPeriod,
  SaveInternshipPeriodInput,
  Teacher,
} from '@shared/types'
import {
  canAssignInternshipPeriod,
  getAcademicYearMonths,
} from '@shared/internship-periods'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface InternshipsContext {
  academicYearId: number | null
  academicYear: AcademicYear | null
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void
}

interface InternshipDraft {
  startMonth: string
  durationMonths: number
}

function formatMonth(month: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`))
}

function availableDurations(
  months: string[],
  periods: InternshipPeriod[],
  teacherId: number,
  startMonth: string,
): number[] {
  return months
    .map((_, index) => index + 1)
    .filter((durationMonths) =>
      canAssignInternshipPeriod(
        months,
        periods,
        teacherId,
        startMonth,
        durationMonths,
      ),
    )
}

function firstAvailableDraft(
  months: string[],
  periods: InternshipPeriod[],
  teacherId: number,
  preferredDuration: number,
): InternshipDraft | undefined {
  for (const startMonth of months) {
    const durations = availableDurations(months, periods, teacherId, startMonth)
    if (durations.length > 0) {
      return {
        startMonth,
        durationMonths: durations.includes(preferredDuration)
          ? preferredDuration
          : durations[0],
      }
    }
  }
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

export function InternshipsPage() {
  const { i18n, t } = useTranslation()
  const { academicYearId, academicYear, setHasUnsavedChanges } =
    useOutletContext<InternshipsContext>()
  const months = useMemo(
    () =>
      academicYear
        ? getAcademicYearMonths(academicYear.startDate, academicYear.endDate)
        : [],
    [academicYear],
  )
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [periods, setPeriods] = useState<InternshipPeriod[]>([])
  const [drafts, setDrafts] = useState<Record<number, InternshipDraft>>({})
  const [dirtyTeacherIds, setDirtyTeacherIds] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [pageError, setPageError] = useState('')
  const [savingTeacherId, setSavingTeacherId] = useState<number | null>(null)
  const [removingTeacherId, setRemovingTeacherId] = useState<number | null>(
    null,
  )
  const [savedTeacherId, setSavedTeacherId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    setTeachers([])
    setPeriods([])
    setDrafts({})
    setDirtyTeacherIds([])
    setSearch('')
    setPageError('')
    setHasLoadError(false)

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
    ])
      .then(([loadedTeachers, loadedPeriods]) => {
        if (!active) return
        setTeachers(loadedTeachers)
        setPeriods(loadedPeriods)
        setDrafts(
          Object.fromEntries(
            loadedTeachers.map((teacher) => {
              const savedPeriod = loadedPeriods.find(
                (period) => period.teacherId === teacher.id,
              )
              const startMonth =
                savedPeriod?.startDate.slice(0, 7) ??
                months.find((month) =>
                  canAssignInternshipPeriod(
                    months,
                    loadedPeriods,
                    teacher.id,
                    month,
                    1,
                  ),
                ) ??
                ''
              const startIndex = months.indexOf(startMonth)
              const endIndex = savedPeriod
                ? months.indexOf(savedPeriod.endDate.slice(0, 7))
                : startIndex
              return [
                teacher.id,
                {
                  startMonth,
                  durationMonths: Math.max(1, endIndex - startIndex + 1),
                },
              ]
            }),
          ),
        )
      })
      .catch((error: unknown) => {
        console.error('Unable to load internships', error)
        if (active) setHasLoadError(true)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [academicYear, academicYearId, months])

  const periodByTeacher = useMemo(
    () => new Map(periods.map((period) => [period.teacherId, period])),
    [periods],
  )
  const teacherById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  )
  const teacherByMonth = useMemo(() => {
    const assignments = new Map<string, string>()
    for (const period of periods) {
      for (const month of months) {
        if (
          month >= period.startDate.slice(0, 7) &&
          month <= period.endDate.slice(0, 7)
        ) {
          assignments.set(
            month,
            teacherById.get(period.teacherId)?.fullName ?? '',
          )
        }
      }
    }
    return assignments
  }, [months, periods, teacherById])
  const filteredTeachers = useMemo(() => {
    const term = normalizeSearch(search)
    if (!term) return teachers
    return teachers.filter((teacher) =>
      [teacher.fullName, teacher.cin, teacher.matricule].some((value) =>
        normalizeSearch(value).includes(term),
      ),
    )
  }, [search, teachers])
  useEffect(() => {
    setHasUnsavedChanges(dirtyTeacherIds.length > 0)
    return () => setHasUnsavedChanges(false)
  }, [dirtyTeacherIds.length, setHasUnsavedChanges])

  const savePeriod = useCallback(
    async (teacherId: number, draft: InternshipDraft) => {
      if (academicYearId === null) return
      if (
        !canAssignInternshipPeriod(
          months,
          periods,
          teacherId,
          draft.startMonth,
          draft.durationMonths,
        )
      ) {
        setPageError(t('internships.overlapError'))
        return
      }

      const input: SaveInternshipPeriodInput = {
        academicYearId,
        teacherId,
        startMonth: draft.startMonth,
        durationMonths: draft.durationMonths,
      }
      setSavingTeacherId(teacherId)
      setSavedTeacherId(null)
      setPageError('')
      try {
        const savedPeriod = await window.desktopApi.saveInternshipPeriod(input)
        const updatedPeriods = [
          ...periods.filter((period) => period.teacherId !== teacherId),
          savedPeriod,
        ]
        setPeriods(updatedPeriods)
        setDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts }
          for (const teacher of teachers) {
            if (
              teacher.id === teacherId ||
              periodByTeacher.has(teacher.id) ||
              dirtyTeacherIds.includes(teacher.id)
            ) {
              continue
            }
            const draft = currentDrafts[teacher.id]
            if (
              !draft ||
              canAssignInternshipPeriod(
                months,
                updatedPeriods,
                teacher.id,
                draft.startMonth,
                draft.durationMonths,
              )
            ) {
              continue
            }
            const nextDraft = firstAvailableDraft(
              months,
              updatedPeriods,
              teacher.id,
              draft.durationMonths,
            )
            if (nextDraft) nextDrafts[teacher.id] = nextDraft
          }
          return nextDrafts
        })
        setDirtyTeacherIds((current) =>
          current.filter((id) => id !== teacherId),
        )
        setSavedTeacherId(teacherId)
      } catch (error) {
        console.error('Unable to save internship period', error)
        setPageError(t('internships.saveError'))
      } finally {
        setSavingTeacherId(null)
      }
    },
    [
      academicYearId,
      dirtyTeacherIds,
      months,
      periodByTeacher,
      periods,
      teachers,
      t,
    ],
  )

  const removePeriod = useCallback(
    async (teacher: Teacher) => {
      if (
        academicYearId === null ||
        !periodByTeacher.has(teacher.id) ||
        removingTeacherId !== null ||
        savingTeacherId !== null
      ) {
        return
      }
      if (
        !window.confirm(
          t('internships.confirmRemove', { name: teacher.fullName }),
        )
      ) {
        return
      }

      setRemovingTeacherId(teacher.id)
      setPageError('')
      setSavedTeacherId(null)
      try {
        await window.desktopApi.deleteInternshipPeriod(
          academicYearId,
          teacher.id,
        )
        const updatedPeriods = periods.filter(
          (period) => period.teacherId !== teacher.id,
        )
        setPeriods(updatedPeriods)
        setDirtyTeacherIds((current) =>
          current.filter((id) => id !== teacher.id),
        )
        const nextDraft = firstAvailableDraft(
          months,
          updatedPeriods,
          teacher.id,
          drafts[teacher.id]?.durationMonths ?? 1,
        )
        if (nextDraft) {
          setDrafts((current) => ({ ...current, [teacher.id]: nextDraft }))
        }
      } catch (error) {
        console.error('Unable to remove internship period', error)
        setPageError(t('internships.removeError'))
      } finally {
        setRemovingTeacherId(null)
      }
    },
    [
      academicYearId,
      drafts,
      months,
      periodByTeacher,
      periods,
      removingTeacherId,
      savingTeacherId,
      t,
    ],
  )

  function updateDraft(teacherId: number, changes: Partial<InternshipDraft>) {
    const updatedDraft = { ...drafts[teacherId], ...changes }
    const savedPeriod = periodByTeacher.get(teacherId)
    const savedDuration = savedPeriod
      ? months.indexOf(savedPeriod.endDate.slice(0, 7)) -
        months.indexOf(savedPeriod.startDate.slice(0, 7)) +
        1
      : 0
    const matchesSavedPeriod =
      savedPeriod?.startDate.slice(0, 7) === updatedDraft.startMonth &&
      savedDuration === updatedDraft.durationMonths
    setDrafts((current) => ({
      ...current,
      [teacherId]: updatedDraft,
    }))
    setDirtyTeacherIds((current) =>
      matchesSavedPeriod
        ? current.filter((id) => id !== teacherId)
        : current.includes(teacherId)
          ? current
          : [...current, teacherId],
    )
    setPageError('')
    setSavedTeacherId(null)
  }

  const language = i18n.resolvedLanguage ?? 'fr'

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8">
        <div className="mb-2 text-xs font-bold tracking-[0.16em] text-brand">
          {t('app.name')}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          {t('navigation.internships')}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('internships.description')}
          {academicYear && (
            <span className="ms-1 font-medium text-slate-600">
              {t('internships.academicYear', { year: academicYear.label })}
            </span>
          )}
        </p>
      </div>

      {hasLoadError && (
        <div
          className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {t('internships.loadError')}
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

      <Card className="mb-6 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
            <CalendarDays aria-hidden="true" size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-ink">
              {t('internships.monthlySchedule')}
            </h2>
            <p className="text-sm text-slate-500">
              {t('internships.monthsDescription')}
            </p>
          </div>
        </div>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">
            {t('common.loading')}
          </div>
        ) : months.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            {t('internships.noAcademicYear')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-12">
            {months.map((month) => {
              const teacherName = teacherByMonth.get(month)
              return (
                <div
                  className={`min-w-0 rounded-xl border p-3 ${
                    teacherName
                      ? 'border-red-100 bg-red-50'
                      : 'border-emerald-100 bg-emerald-50'
                  }`}
                  key={month}
                >
                  <div className="text-xs font-bold text-ink">{month}</div>
                  <div className="mt-1 truncate text-xs capitalize text-slate-500">
                    {formatMonth(month, language)}
                  </div>
                  <div
                    className={`mt-3 truncate text-xs font-medium ${
                      teacherName ? 'text-red-700' : 'text-emerald-700'
                    }`}
                    title={teacherName || t('internships.available')}
                  >
                    {teacherName || t('internships.available')}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <section aria-labelledby="internship-teachers-title">
        <h2
          className="mb-3 text-lg font-semibold text-ink"
          id="internship-teachers-title"
        >
          {t('internships.teachers')}
        </h2>
        {isLoading ? (
          <Card className="p-6 text-center text-sm text-slate-400">
            {t('common.loading')}
          </Card>
        ) : teachers.length === 0 ? (
          <Card className="border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            {t('internships.noTeachers')}
          </Card>
        ) : (
          <>
            <label className="mb-4 flex h-11 w-full max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-400 focus-within:ring-2 focus-within:ring-brand/20">
              <Search aria-hidden="true" size={18} />
              <input
                aria-label={t('internships.search')}
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('internships.search')}
                type="search"
                value={search}
              />
            </label>
            {filteredTeachers.length === 0 ? (
              <Card className="border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                {t('internships.noSearchResults')}
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredTeachers.map((teacher) => {
                  const draft = drafts[teacher.id]
                  if (!draft) return null
                  const currentPeriod = periodByTeacher.get(teacher.id)
                  const durations = availableDurations(
                    months,
                    periods,
                    teacher.id,
                    draft.startMonth,
                  )
                  const isAvailable = canAssignInternshipPeriod(
                    months,
                    periods,
                    teacher.id,
                    draft.startMonth,
                    draft.durationMonths,
                  )
                  const hasAvailableMonth = months.some((month) =>
                    canAssignInternshipPeriod(
                      months,
                      periods,
                      teacher.id,
                      month,
                      1,
                    ),
                  )
                  const startIndex = months.indexOf(draft.startMonth)
                  const endMonth =
                    months[startIndex + draft.durationMonths - 1] ?? ''
                  const currentDuration = currentPeriod
                    ? months.indexOf(currentPeriod.endDate.slice(0, 7)) -
                      months.indexOf(currentPeriod.startDate.slice(0, 7)) +
                      1
                    : 0
                  const isUnchanged =
                    currentPeriod?.startDate.slice(0, 7) === draft.startMonth &&
                    currentDuration === draft.durationMonths

                  return (
                    <Card
                      className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(13rem,1fr)_minmax(9rem,0.7fr)_auto]"
                      key={teacher.id}
                    >
                      <div className="min-w-0 self-center">
                        <div className="truncate font-semibold text-ink">
                          {teacher.fullName}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {currentPeriod
                            ? t('internships.assignedPeriod', {
                                start: currentPeriod.startDate.slice(0, 7),
                                end: currentPeriod.endDate.slice(0, 7),
                              })
                            : t('internships.notAssigned')}
                        </div>
                        {!hasAvailableMonth && (
                          <div className="mt-1 text-xs text-amber-700">
                            {t('internships.noAvailableMonths')}
                          </div>
                        )}
                      </div>

                      <label className="block text-sm font-medium text-slate-600">
                        {t('internships.startMonth')}
                        <select
                          aria-label={t('internships.startMonthFor', {
                            name: teacher.fullName,
                          })}
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          disabled={
                            !hasAvailableMonth ||
                            savingTeacherId !== null ||
                            removingTeacherId !== null
                          }
                          onChange={(event) => {
                            const startMonth = event.target.value
                            const validDurations = availableDurations(
                              months,
                              periods,
                              teacher.id,
                              startMonth,
                            )
                            updateDraft(teacher.id, {
                              startMonth,
                              durationMonths: validDurations.includes(
                                draft.durationMonths,
                              )
                                ? draft.durationMonths
                                : (validDurations[0] ?? 1),
                            })
                          }}
                          value={draft.startMonth}
                        >
                          {months.map((month) => (
                            <option
                              disabled={
                                availableDurations(
                                  months,
                                  periods,
                                  teacher.id,
                                  month,
                                ).length === 0
                              }
                              key={month}
                              value={month}
                            >
                              {month}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-slate-600">
                        {t('internships.duration')}
                        <select
                          aria-label={t('internships.durationFor', {
                            name: teacher.fullName,
                          })}
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          disabled={
                            !hasAvailableMonth ||
                            savingTeacherId !== null ||
                            removingTeacherId !== null
                          }
                          onChange={(event) =>
                            updateDraft(teacher.id, {
                              durationMonths: Number(event.target.value),
                            })
                          }
                          value={draft.durationMonths}
                        >
                          {months.map((_, index) => {
                            const durationMonths = index + 1
                            return (
                              <option
                                disabled={!durations.includes(durationMonths)}
                                key={durationMonths}
                                value={durationMonths}
                              >
                                {durationMonths === 1
                                  ? t('internships.oneMonth')
                                  : t('internships.monthCount', {
                                      count: durationMonths,
                                    })}
                              </option>
                            )
                          })}
                        </select>
                        {isAvailable && endMonth && (
                          <span className="mt-1 block text-xs text-slate-400">
                            {t('internships.periodPreview', {
                              start: draft.startMonth,
                              end: endMonth,
                            })}
                          </span>
                        )}
                        {!isAvailable && (
                          <span className="mt-1 block text-xs text-red-600">
                            {t('internships.overlapError')}
                          </span>
                        )}
                      </label>

                      <div className="flex flex-wrap items-center justify-between gap-2 xl:justify-end">
                        {savedTeacherId === teacher.id && (
                          <span className="text-xs font-medium text-emerald-700">
                            {t('internships.saved')}
                          </span>
                        )}
                        {currentPeriod && (
                          <Button
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={
                              savingTeacherId !== null ||
                              removingTeacherId !== null
                            }
                            onClick={() => void removePeriod(teacher)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" size={15} />
                            {removingTeacherId === teacher.id
                              ? t('internships.removing')
                              : t('internships.removePeriod')}
                          </Button>
                        )}
                        <Button
                          disabled={
                            !isAvailable ||
                            isUnchanged ||
                            savingTeacherId !== null ||
                            removingTeacherId !== null ||
                            !draft.startMonth
                          }
                          onClick={() => void savePeriod(teacher.id, draft)}
                          type="button"
                        >
                          <Save aria-hidden="true" size={16} />
                          {savingTeacherId === teacher.id
                            ? t('internships.saving')
                            : t('internships.save')}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
