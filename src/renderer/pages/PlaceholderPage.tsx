import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/card'

const pageContent: Record<string, { title: string; description: string }> = {
  '/teachers': {
    title: 'navigation.teachers',
    description: 'pages.teachersDescription',
  },
  '/groups': {
    title: 'navigation.groups',
    description: 'pages.groupsDescription',
  },
  '/internships': {
    title: 'navigation.internships',
    description: 'pages.internshipsDescription',
  },
  '/hours-planning': {
    title: 'navigation.hoursPlanning',
    description: 'pages.hoursPlanningDescription',
  },
  '/calendar': {
    title: 'navigation.calendar',
    description: 'pages.calendarDescription',
  },
  '/settings': {
    title: 'navigation.settings',
    description: 'pages.settingsDescription',
  },
}

export function PlaceholderPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const content = pageContent[location.pathname]

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8">
        <div className="mb-2 text-xs font-bold tracking-[0.16em] text-brand">
          {t('app.name')}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          {t(content.title)}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{t(content.description)}</p>
      </div>
      <Card className="flex min-h-60 items-center justify-center border border-dashed border-slate-200 bg-white/70 p-8 text-center shadow-none">
        <p className="text-sm text-slate-400">{t('common.noData')}</p>
      </Card>
    </div>
  )
}
