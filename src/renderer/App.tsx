import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { InternshipsPage } from '@/pages/InternshipsPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { TeachersPage } from '@/pages/TeachersPage'
import { useTranslation } from 'react-i18next'

export function App() {
  const { t } = useTranslation()

  if (typeof window.desktopApi === 'undefined') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F8FC] p-6 text-ink">
        <section
          aria-labelledby="desktop-required-title"
          className="w-full max-w-lg rounded-card bg-white p-8 shadow-card"
          role="alert"
        >
          <h1
            className="text-xl font-bold tracking-tight"
            id="desktop-required-title"
          >
            {t('desktopRequired.title')}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {t('desktopRequired.description')}
          </p>
          <code className="mt-4 inline-block rounded-lg bg-slate-50 px-3 py-2 text-sm text-brand">
            npm run dev
          </code>
        </section>
      </main>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="internships" element={<InternshipsPage />} />
        <Route path="hours-planning" element={<PlaceholderPage />} />
        <Route path="calendar" element={<PlaceholderPage />} />
        <Route path="settings" element={<PlaceholderPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  )
}
