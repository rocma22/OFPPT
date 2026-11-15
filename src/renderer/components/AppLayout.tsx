import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Search,
  Settings,
  Trash2,
  UsersRound,
  BriefcaseBusiness,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ar, enUS, fr } from 'date-fns/locale'
import { NavLink, Outlet, useBlocker, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { AcademicYear, CreateAcademicYearInput } from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { to: '/', label: 'navigation.dashboard', icon: LayoutDashboard },
  { to: '/teachers', label: 'navigation.teachers', icon: GraduationCap },
  { to: '/groups', label: 'navigation.groups', icon: UsersRound },
  {
    to: '/internships',
    label: 'navigation.internships',
    icon: BriefcaseBusiness,
  },
  {
    to: '/hours-planning',
    label: 'navigation.hoursPlanning',
    icon: ClipboardList,
  },
  { to: '/calendar', label: 'navigation.calendar', icon: CalendarDays },
  { to: '/settings', label: 'navigation.settings', icon: Settings },
]

const languageNames: Record<string, string> = {
  fr: 'common.french',
  en: 'common.english',
  ar: 'common.arabic',
}

export function AppLayout() {
  const { i18n, t } = useTranslation()
  const location = useLocation()
  const [years, setYears] = useState<AcademicYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null)
  const [isYearDialogOpen, setIsYearDialogOpen] = useState(false)
  const [yearError, setYearError] = useState(false)
  const [yearDeleteError, setYearDeleteError] = useState(false)
  const [isCreatingYear, setIsCreatingYear] = useState(false)
  const [isDeletingYear, setIsDeletingYear] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const blocker = useBlocker(hasUnsavedChanges)
  const currentLanguage = i18n.resolvedLanguage ?? 'fr'
  const dateLocale =
    currentLanguage === 'ar' ? ar : currentLanguage === 'en' ? enUS : fr
  const today = useMemo(
    () => format(new Date(), 'EEEE, d MMMM yyyy', { locale: dateLocale }),
    [dateLocale],
  )
  const selectedYear = years.find((year) => year.id === selectedYearId)
  const isDashboard = location.pathname === '/'

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(t('teachers.unsavedChangesPrompt'))) {
      setHasUnsavedChanges(false)
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker, t])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    document.documentElement.lang = currentLanguage
    document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr'
    document.title = t('app.name')
    window.localStorage.setItem('planning-ofppt-language', currentLanguage)
  }, [currentLanguage, t])

  useEffect(() => {
    let active = true
    window.desktopApi
      .getAcademicYears()
      .then((loadedYears) => {
        if (active) {
          setYears(loadedYears)
          setSelectedYearId((current) => current ?? loadedYears[0]?.id ?? null)
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to load academic years', error)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleCreateYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setIsCreatingYear(true)
    setYearError(false)
    const formData = new FormData(form)
    const input: CreateAcademicYearInput = {
      label: String(formData.get('label') ?? ''),
      startDate: String(formData.get('startDate') ?? ''),
      endDate: String(formData.get('endDate') ?? ''),
      ...(formData.get('copyTeachers') === 'on' && selectedYearId !== null
        ? { copyTeachersFromYearId: selectedYearId }
        : {}),
    }
    try {
      const newYear = await window.desktopApi.createAcademicYear(input)
      setYears((current) =>
        [...current, newYear].sort((a, b) =>
          b.startDate.localeCompare(a.startDate),
        ),
      )
      setSelectedYearId(newYear.id)
      setHasUnsavedChanges(false)
      setIsYearDialogOpen(false)
      form.reset()
    } catch (error) {
      console.error('Unable to create academic year', error)
      setYearError(true)
    } finally {
      setIsCreatingYear(false)
    }
  }

  async function handleDeleteYear() {
    const year = years.find(({ id }) => id === selectedYearId)
    if (!year || isDeletingYear) return
    if (
      hasUnsavedChanges &&
      !window.confirm(t('teachers.unsavedChangesPrompt'))
    ) {
      return
    }
    if (!window.confirm(t('yearDialog.confirmDelete', { label: year.label }))) {
      return
    }

    setIsDeletingYear(true)
    setYearDeleteError(false)
    try {
      await window.desktopApi.deleteAcademicYear(year.id)
      const remainingYears = years.filter(({ id }) => id !== year.id)
      setYears(remainingYears)
      if (selectedYearId === year.id) {
        setSelectedYearId(remainingYears[0]?.id ?? null)
      }
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('Unable to delete academic year', error)
      setYearDeleteError(true)
    } finally {
      setIsDeletingYear(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F7F8FC] text-ink">
      <aside className="flex w-[248px] shrink-0 flex-col border-e border-slate-100 bg-white px-5 py-7">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
            <GraduationCap size={24} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-ink">
              {t('app.name')}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {t('app.tagline')}
            </div>
          </div>
        </div>

        <nav aria-label={t('app.name')} className="flex flex-1 flex-col gap-1">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] font-medium transition-colors',
                  isActive
                    ? 'bg-brand-light text-brand'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-ink',
                )
              }
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rounded-2xl bg-brand-light p-4">
          <div className="mb-1 text-xs font-semibold text-brand">
            {t('header.academicYear')}
          </div>
          <div className="text-sm font-bold text-ink">
            {selectedYear?.label ?? t('common.loading')}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[82px] items-center justify-between gap-5 border-b border-slate-100 bg-white px-8">
          <label className="flex h-11 w-full max-w-[360px] items-center gap-3 rounded-xl bg-slate-50 px-3.5 text-slate-400 focus-within:ring-2 focus-within:ring-brand/20">
            <Search size={18} />
            <input
              aria-label={t('header.search')}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              placeholder={t('header.search')}
              type="search"
            />
          </label>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-end text-xs capitalize text-slate-400 xl:block">
              {t('header.today')}, {today}
            </div>
            <div className="h-8 w-px bg-slate-100" />
            <label className="sr-only" htmlFor="language-select">
              {t('common.language')}
            </label>
            <select
              id="language-select"
              aria-label={t('common.language')}
              className="h-10 rounded-xl border-0 bg-slate-50 px-3 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-brand/20"
              onChange={(event) => void i18n.changeLanguage(event.target.value)}
              value={currentLanguage}
            >
              {Object.entries(languageNames).map(([code, label]) => (
                <option key={code} value={code}>
                  {t(label)}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="academic-year-select">
              {t('header.academicYear')}
            </label>
            <select
              id="academic-year-select"
              aria-label={t('header.academicYear')}
              className="h-10 max-w-36 rounded-xl border-0 bg-slate-50 px-3 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-brand/20"
              onChange={(event) => {
                if (
                  hasUnsavedChanges &&
                  !window.confirm(t('teachers.unsavedChangesPrompt'))
                ) {
                  event.currentTarget.value = String(selectedYearId ?? '')
                  return
                }
                setHasUnsavedChanges(false)
                setYearDeleteError(false)
                setSelectedYearId(Number(event.target.value))
              }}
              value={selectedYearId ?? ''}
            >
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                </option>
              ))}
            </select>
            <Button
              aria-label={t('yearDialog.delete')}
              className="h-10 w-10 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={selectedYearId === null || isDeletingYear}
              onClick={() => void handleDeleteYear()}
              size="icon"
              title={t('yearDialog.delete')}
              variant="outline"
            >
              <Trash2 aria-hidden="true" size={16} />
            </Button>
            <Button
              aria-label={t('header.newYear')}
              className="h-10 w-10"
              onClick={() => {
                if (
                  hasUnsavedChanges &&
                  !window.confirm(t('teachers.unsavedChangesPrompt'))
                ) {
                  return
                }
                setHasUnsavedChanges(false)
                setIsYearDialogOpen(true)
              }}
              size="icon"
              title={t('header.newYear')}
              variant="outline"
            >
              <span className="text-lg leading-none">+</span>
            </Button>

            <Button
              aria-label={t('header.notifications')}
              className="relative text-slate-500"
              size="icon"
              title={t('header.notifications')}
              variant="ghost"
            >
              <Bell size={19} />
              <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-brand" />
            </Button>

            <div
              aria-label={t('header.profile')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E9E5FF] text-sm font-bold text-brand"
              title={t('header.profile')}
            >
              <UserRound aria-hidden="true" size={19} />
            </div>
            <ChevronDown
              aria-hidden="true"
              className="text-slate-400"
              size={16}
            />
          </div>
        </header>

        <main className="flex-1 px-8 py-8">
          {yearDeleteError && (
            <div
              className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {t('yearDialog.deleteError')}
            </div>
          )}
          <Outlet
            context={{
              academicYearId: selectedYearId,
              academicYear: selectedYear ?? null,
              isDashboard,
              setHasUnsavedChanges,
            }}
          />
        </main>
      </div>

      {isYearDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsYearDialogOpen(false)
          }}
        >
          <section
            aria-labelledby="year-dialog-title"
            aria-modal="true"
            className="w-full max-w-md rounded-card bg-white p-6 shadow-2xl"
            role="dialog"
          >
            <h2 className="text-lg font-bold text-ink" id="year-dialog-title">
              {t('yearDialog.title')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {t('yearDialog.description')}
            </p>
            <form className="mt-5 space-y-4" onSubmit={handleCreateYear}>
              <label className="block text-sm font-medium text-slate-700">
                {t('yearDialog.label')}
                <input
                  autoFocus
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  name="label"
                  placeholder={t('yearDialog.labelPlaceholder')}
                  pattern="\d{4}-\d{4}"
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  {t('yearDialog.startDate')}
                  <input
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    name="startDate"
                    required
                    type="date"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  {t('yearDialog.endDate')}
                  <input
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    name="endDate"
                    required
                    type="date"
                  />
                </label>
              </div>
              <label className="flex items-start gap-2 text-sm leading-5 text-slate-600">
                <input
                  className="mt-1 accent-brand"
                  disabled={selectedYearId === null}
                  name="copyTeachers"
                  type="checkbox"
                />
                <span>{t('yearDialog.copyTeachers')}</span>
              </label>
              {yearError && (
                <p className="text-sm text-red-600" role="alert">
                  {t('yearDialog.error')}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  disabled={isCreatingYear}
                  onClick={() => setIsYearDialogOpen(false)}
                  type="button"
                  variant="outline"
                >
                  {t('yearDialog.cancel')}
                </Button>
                <Button disabled={isCreatingYear} type="submit">
                  {isCreatingYear
                    ? t('yearDialog.creating')
                    : t('yearDialog.create')}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
