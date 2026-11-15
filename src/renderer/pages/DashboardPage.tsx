import {
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DashboardStats } from '@shared/types'
import { Card } from '@/components/ui/card'

interface DashboardContext {
  academicYearId: number | null
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { academicYearId } = useOutletContext<DashboardContext>()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let active = true
    if (academicYearId === null) {
      setStats(null)
      setIsLoading(true)
      return () => {
        active = false
      }
    }

    setStats(null)
    setIsLoading(true)
    setHasError(false)
    window.desktopApi
      .getDashboardStats(academicYearId)
      .then((result) => {
        if (active) setStats(result)
      })
      .catch((error: unknown) => {
        console.error('Unable to load dashboard statistics', error)
        if (active) setHasError(true)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [academicYearId])

  const statCards = [
    {
      label: t('dashboard.teachers'),
      value: stats?.teachers,
      icon: UsersRound,
      iconClass: 'bg-[#F0EDFF] text-brand',
    },
    {
      label: t('dashboard.groups'),
      value: stats?.groups,
      icon: BriefcaseBusiness,
      iconClass: 'bg-[#E8F8F2] text-[#35A77A]',
    },
    {
      label: t('dashboard.totalHours'),
      value: stats?.totalHours,
      icon: Clock3,
      iconClass: 'bg-[#FFF4E8] text-[#E9983E]',
    },
  ]

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8">
        <div className="mb-2 text-xs font-bold tracking-[0.16em] text-brand">
          {t('dashboard.eyebrow')}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          {t('dashboard.title')}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('dashboard.description')}
        </p>
      </div>

      {hasError && (
        <div
          className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {t('dashboard.error')}
        </div>
      )}

      <section
        aria-label={t('dashboard.eyebrow')}
        className="grid gap-5 md:grid-cols-3"
      >
        {statCards.map(({ label, value, icon: Icon, iconClass }) => (
          <Card className="p-6" key={label}>
            <div className="flex items-start justify-between">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClass}`}
              >
                <Icon size={22} strokeWidth={1.9} />
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <div className="mt-6 text-sm font-medium text-slate-500">
              {label}
            </div>
            <div className="mt-1 text-[32px] font-bold tracking-tight text-ink">
              {isLoading ? (
                <span className="inline-block h-9 w-14 animate-pulse rounded-lg bg-slate-100" />
              ) : (
                (value ?? 0).toLocaleString()
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {t('dashboard.placeholder')}
            </div>
          </Card>
        ))}
      </section>

      <Card className="mt-6 flex min-h-44 items-center justify-center border border-dashed border-slate-200 bg-white/70 p-8 text-center shadow-none">
        <p className="max-w-md text-sm leading-6 text-slate-400">
          {isLoading ? t('dashboard.loading') : t('dashboard.placeholder')}
        </p>
      </Card>
    </div>
  )
}
