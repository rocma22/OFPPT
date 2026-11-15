import { Search, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Teacher } from '@shared/types'
import { Card } from '@/components/ui/card'
import { buildGroupOverview, type GroupOverview } from '@/lib/group-overview'

interface GroupsContext {
  academicYearId: number | null
}

function matchesSearch(group: GroupOverview, term: string): boolean {
  const searchable = [
    group.groupCode,
    ...group.programs,
    ...group.modes,
    ...group.regionalOffices,
    ...group.assignments.flatMap((assignment) => [
      assignment.module,
      assignment.moduleCode,
      assignment.teacherName,
    ]),
  ]
  return searchable.some((value) => value.toLocaleLowerCase().includes(term))
}

export function GroupsPage() {
  const { t } = useTranslation()
  const { academicYearId } = useOutletContext<GroupsContext>()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let active = true
    if (academicYearId === null) {
      setTeachers([])
      setIsLoading(false)
      return () => {
        active = false
      }
    }

    setTeachers([])
    setIsLoading(true)
    setHasError(false)
    window.desktopApi
      .getTeachers(academicYearId)
      .then((loaded) => {
        if (active) setTeachers(loaded)
      })
      .catch((error: unknown) => {
        console.error('Unable to load groups', error)
        if (active) setHasError(true)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [academicYearId])

  const groups = useMemo(() => buildGroupOverview(teachers), [teachers])
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredGroups = groups.filter((group) =>
    matchesSearch(group, normalizedSearch),
  )

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-8">
        <div className="mb-2 text-xs font-bold tracking-[0.16em] text-brand">
          {t('app.name')}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          {t('navigation.groups')}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('pages.groupsDescription')}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">
          {t('Group Page', { count: filteredGroups.length })}
        </div>
        <label className="flex h-11 w-full max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-400 focus-within:ring-2 focus-within:ring-brand/20">
          <Search aria-hidden="true" size={18} />
          <input
            aria-label={t('groupsPage.search')}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search')}
            type="search"
            value={search}
          />
        </label>
      </div>

      {hasError && (
        <div
          className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {t('groupsPage.loadError')}
        </div>
      )}

      {isLoading ? (
        <Card className="flex min-h-60 items-center justify-center p-8 text-sm text-slate-400">
          {t('common.loading')}
        </Card>
      ) : groups.length === 0 ? (
        <Card className="flex min-h-60 items-center justify-center border border-dashed border-slate-200 bg-white/70 p-8 text-center shadow-none">
          <div>
            <UsersRound className="mx-auto mb-3 text-slate-300" size={28} />
            <p className="text-sm text-slate-500">{t('groupsPage.empty')}</p>
          </div>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="flex min-h-40 items-center justify-center p-8 text-sm text-slate-400">
          {t('groupsPage.noSearchResults')}
        </Card>
      ) : (
        <div className="space-y-5">
          {filteredGroups.map((group) => (
            <Card className="overflow-hidden" key={group.groupCode}>
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-ink">
                      {group.groupCode}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {t('Assignment Count', {
                        count: group.assignments.length,
                      })}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
                    <UsersRound aria-hidden="true" size={20} />
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <GroupDetail
                    label={t('Code Filière + Filière')}
                    value={group.programs.join(', ')}
                  />
                  <GroupDetail
                    label={t('Mode')}
                    value={group.modes.join(', ')}
                  />
                  <GroupDetail
                    label={t('Regional Office')}
                    value={group.regionalOffices.join(', ')}
                  />
                  <GroupDetail
                    label={t('Total Hours')}
                    value={group.assignments
                      .reduce(
                        (total, assignment) =>
                          total +
                          (assignment.mhp ?? 0) +
                          (assignment.mhd ?? 0) +
                          (assignment.mhg ?? 0),
                        0,
                      )
                      .toLocaleString()}
                  />
                </dl>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-start text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                    <tr>
                      {[
                        'module',
                        'moduleCode',
                        'teacher',
                        'mhp',
                        'mhd',
                        'mhg',
                      ].map((column) => (
                        <th className="px-4 py-3 text-start" key={column}>
                          {t(`${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.assignments.map((assignment, index) => (
                      <tr
                        key={`${assignment.moduleCode}-${assignment.module}-${assignment.teacherName}-${index}`}
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          {assignment.module || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {assignment.moduleCode || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {assignment.teacherName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {assignment.mhp ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {assignment.mhd ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {assignment.mhg ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 truncate font-medium text-slate-700">
        {value || '—'}
      </dd>
    </div>
  )
}
