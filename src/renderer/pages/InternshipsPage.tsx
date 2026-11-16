import { CalendarDays, Save, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  AcademicYear,
  InternshipPeriod,
  SaveInternshipPeriodInput,
} from '@shared/types'
import {
  getAcademicYearMonths,
  isInternshipPeriodWithinAcademicYear,
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
  startMonth: string,
): number[] {
  return months
    .map((_, index) => index + 1)
    .filter((durationMonths) =>
      isInternshipPeriodWithinAcademicYear(months, startMonth, durationMonths),
    )
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
  const [groups, setGroups] = useState<string[]>([])
  const [periods, setPeriods] = useState<InternshipPeriod[]>([])
  const [drafts, setDrafts] = useState<Record<string, InternshipDraft>>({})
  const [dirtyGroupCodes, setDirtyGroupCodes] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [pageError, setPageError] = useState('')
  const [savingGroupCode, setSavingGroupCode] = useState<string | null>(null)
  const [removingGroupCode, setRemovingGroupCode] = useState<string | null>(
    null,
  )
  const [savedGroupCode, setSavedGroupCode] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setGroups([])
    setPeriods([])
    setDrafts({})
    setDirtyGroupCodes([])
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
      window.desktopApi.getInternshipGroups(academicYearId),
      window.desktopApi.getInternshipPeriods(academicYearId),
    ])
      .then(([loadedGroups, loadedPeriods]) => {
        if (!active) return
        setGroups(loadedGroups)
        setPeriods(loadedPeriods)
        setDrafts(
          Object.fromEntries(
            loadedGroups.map((groupCode) => {
              const savedPeriod = loadedPeriods.find(
                (period) => period.groupCode === groupCode,
              )
              const startMonth =
                savedPeriod?.startDate.slice(0, 7) ?? months[0] ?? ''
              const startIndex = months.indexOf(startMonth)
              const endIndex = savedPeriod
                ? months.indexOf(savedPeriod.endDate.slice(0, 7))
                : startIndex
              return [
                groupCode,
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

  const periodByGroup = useMemo(
    () => new Map(periods.map((period) => [period.groupCode, period])),
    [periods],
  )
  const groupsByMonth = useMemo(() => {
    const assignments = new Map<string, string[]>()
    for (const period of periods) {
      for (const month of months) {
        if (
          month >= period.startDate.slice(0, 7) &&
          month <= period.endDate.slice(0, 7)
        ) {
          assignments.set(month, [
            ...(assignments.get(month) ?? []),
            period.groupCode,
          ])
        }
      }
    }
    return assignments
  }, [months, periods])
  const filteredGroups = useMemo(() => {
    const term = normalizeSearch(search)
    if (!term) return groups
    return groups.filter((groupCode) => normalizeSearch(groupCode).includes(term))
  }, [groups, search])

  useEffect(() => {
    setHasUnsavedChanges(dirtyGroupCodes.length > 0)
    return () => setHasUnsavedChanges(false)
  }, [dirtyGroupCodes.length, setHasUnsavedChanges])

  const savePeriod = useCallback(
    async (groupCode: string, draft: InternshipDraft) => {
      if (academicYearId === null) return
      if (
        !isInternshipPeriodWithinAcademicYear(
          months,
          draft.startMonth,
          draft.durationMonths,
        )
      ) {
        setPageError(t('internships.invalidPeriodError'))
        return
      }

      const input: SaveInternshipPeriodInput = {
        academicYearId,
        groupCode,
        startMonth: draft.startMonth,
        durationMonths: draft.durationMonths,
      }
      setSavingGroupCode(groupCode)
      setSavedGroupCode(null)
      setPageError('')
      try {
        const savedPeriod = await window.desktopApi.saveInternshipPeriod(input)
        setPeriods((current) => [
          ...current.filter((period) => period.groupCode !== groupCode),
          savedPeriod,
        ])
        setDirtyGroupCodes((current) =>
          current.filter((code) => code !== groupCode),
        )
        setSavedGroupCode(groupCode)
      } catch (error) {
        console.error('Unable to save internship period', error)
        setPageError(t('internships.saveError'))
      } finally {
        setSavingGroupCode(null)
      }
    },
    [academicYearId, months, t],
  )

  const removePeriod = useCallback(
    async (groupCode: string) => {
      if (
        academicYearId === null ||
        !periodByGroup.has(groupCode) ||
        removingGroupCode !== null ||
        savingGroupCode !== null
      ) {
        return
      }
      if (
        !window.confirm(
          t('internships.confirmRemove', { name: groupCode }),
        )
      ) {
        return
      }

      setRemovingGroupCode(groupCode)
      setPageError('')
      setSavedGroupCode(null)
      try {
        await window.desktopApi.deleteInternshipPeriod(
          academicYearId,
          groupCode,
        )
        setPeriods((current) =>
          current.filter((period) => period.groupCode !== groupCode),
        )
        setDirtyGroupCodes((current) =>
          current.filter((code) => code !== groupCode),
        )
      } catch (error) {
        console.error('Unable to remove internship period', error)
        setPageError(t('internships.removeError'))
      } finally {
        setRemovingGroupCode(null)
      }
    },
    [
      academicYearId,
      periodByGroup,
      removingGroupCode,
      savingGroupCode,
      t,
    ],
  )

  function updateDraft(groupCode: string, changes: Partial<InternshipDraft>) {
    const updatedDraft = { ...drafts[groupCode], ...changes }
    const savedPeriod = periodByGroup.get(groupCode)
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
      [groupCode]: updatedDraft,
    }))
    setDirtyGroupCodes((current) =>
      matchesSavedPeriod
        ? current.filter((code) => code !== groupCode)
        : current.includes(groupCode)
          ? current
          : [...current, groupCode],
    )
    setPageError('')
    setSavedGroupCode(null)
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
              const assignedGroups = groupsByMonth.get(month) ?? []
              const assigned = assignedGroups.length > 0
              return (
                <div
                  className={`min-w-0 rounded-xl border p-3 ${
                    assigned
                      ? 'border-brand/20 bg-brand-light'
                      : 'border-emerald-100 bg-emerald-50'
                  }`}
                  key={month}
                >
                  <div className="text-xs font-bold text-ink">{month}</div>
                  <div className="mt-1 truncate text-xs capitalize text-slate-500">
                    {formatMonth(month, language)}
                  </div>
                  {assigned ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {assignedGroups.map((groupCode) => (
                        <span
                          className="break-words rounded-md bg-white/70 px-1.5 py-0.5 text-xs font-medium text-brand"
                          key={groupCode}
                        >
                          {groupCode}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs font-medium text-emerald-700">
                      {t('internships.available')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <section aria-labelledby="internship-groups-title">
        <h2
          className="mb-3 text-lg font-semibold text-ink"
          id="internship-groups-title"
        >
          {t('internships.groups')}
        </h2>
        {isLoading ? (
          <Card className="p-6 text-center text-sm text-slate-400">
            {t('common.loading')}
          </Card>
        ) : groups.length === 0 ? (
          <Card className="border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            {t('internships.noGroups')}
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
            {filteredGroups.length === 0 ? (
              <Card className="border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                {t('internships.noSearchResults')}
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredGroups.map((groupCode) => {
                  const draft = drafts[groupCode]
                  if (!draft) return null
                  const currentPeriod = periodByGroup.get(groupCode)
                  const isAvailable = isInternshipPeriodWithinAcademicYear(
                    months,
                    draft.startMonth,
                    draft.durationMonths,
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
                      key={groupCode}
                    >
                      <div className="min-w-0 self-center">
                        <div className="truncate font-semibold text-ink">
                          {groupCode}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {currentPeriod
                            ? t('internships.assignedPeriod', {
                                start: currentPeriod.startDate.slice(0, 7),
                                end: currentPeriod.endDate.slice(0, 7),
                              })
                            : t('internships.notAssigned')}
                        </div>
                      </div>

                      <label className="block text-sm font-medium text-slate-600">
                        {t('internships.startMonth')}
                        <select
                          aria-label={t('internships.startMonthFor', {
                            name: groupCode,
                          })}
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          disabled={
                            savingGroupCode !== null ||
                            removingGroupCode !== null ||
                            months.length === 0
                          }
                          onChange={(event) => {
                            const startMonth = event.target.value
                            const validDurations = availableDurations(
                              months,
                              startMonth,
                            )
                            updateDraft(groupCode, {
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
                            <option key={month} value={month}>
                              {month}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-slate-600">
                        {t('internships.duration')}
                        <select
                          aria-label={t('internships.durationFor', {
                            name: groupCode,
                          })}
                          className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          disabled={
                            savingGroupCode !== null ||
                            removingGroupCode !== null ||
                            months.length === 0
                          }
                          onChange={(event) =>
                            updateDraft(groupCode, {
                              durationMonths: Number(event.target.value),
                            })
                          }
                          value={draft.durationMonths}
                        >
                          {months.map((_, index) => {
                            const durationMonths = index + 1
                            return (
                              <option
                                disabled={
                                  !availableDurations(
                                    months,
                                    draft.startMonth,
                                  ).includes(durationMonths)
                                }
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
                            {t('internships.invalidPeriodError')}
                          </span>
                        )}
                      </label>

                      <div className="flex flex-wrap items-center justify-between gap-2 xl:justify-end">
                        {savedGroupCode === groupCode && (
                          <span className="text-xs font-medium text-emerald-700">
                            {t('internships.saved')}
                          </span>
                        )}
                        {currentPeriod && (
                          <Button
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={
                              savingGroupCode !== null ||
                              removingGroupCode !== null
                            }
                            onClick={() => void removePeriod(groupCode)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" size={15} />
                            {removingGroupCode === groupCode
                              ? t('internships.removing')
                              : t('internships.removePeriod')}
                          </Button>
                        )}
                        <Button
                          disabled={
                            !isAvailable ||
                            isUnchanged ||
                            savingGroupCode !== null ||
                            removingGroupCode !== null ||
                            !draft.startMonth
                          }
                          onClick={() => void savePeriod(groupCode, draft)}
                          type="button"
                        >
                          <Save aria-hidden="true" size={16} />
                          {savingGroupCode === groupCode
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
