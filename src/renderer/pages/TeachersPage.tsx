import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FileUp,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  Teacher,
  TeacherAssignment,
  TeacherAssignmentInput,
  TeacherDuplicateStrategy,
  TeacherImportField,
  TeacherInput,
  TeacherWorkbookFile,
} from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  groupTeacherWorkbookRows,
  importFields,
  mapTeacherWorkbookRows,
} from '@/lib/teacher-workbook'
import { detectTeacherColumnMapping } from '@shared/teacher-columns'

interface TeachersContext {
  academicYearId: number | null
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void
}

const blankTeacher: TeacherInput = {
  fullName: '',
  cin: '',
  specialty: '',
  phone: '',
  email: '',
  matricule: '',
}

const teacherFields: Array<{
  key: keyof TeacherInput
  type: 'text' | 'tel' | 'email'
}> = [
  { key: 'fullName', type: 'text' },
  { key: 'cin', type: 'text' },
  { key: 'specialty', type: 'text' },
  { key: 'phone', type: 'tel' },
  { key: 'email', type: 'email' },
  { key: 'matricule', type: 'text' },
]

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

function importLabel(
  field: TeacherImportField,
  translate: (key: string) => string,
): string {
  return translate(
    field === 'fullName'
      ? 'teachers.fields.assignedTrainer'
      : `teachers.fields.${field}`,
  )
}

function getPreviewValue(
  row: ReturnType<typeof mapTeacherWorkbookRows>[number],
  field: TeacherImportField,
): string | number | null {
  switch (field) {
    case 'fullName':
      return row.teacher.fullName
    case 'cin':
      return row.teacher.cin
    case 'specialty':
      return row.teacher.specialty
    case 'groupe':
      return row.assignment.groupCode
    case 'module':
      return row.assignment.module
    case 'mhp':
    case 'mhd':
    case 'mhg':
      return row.assignment[field]
    case 'codeFiliere':
      return row.assignment.codeFiliere ?? ''
    case 'filiere':
      return row.assignment.filiere ?? ''
    case 'mode':
      return row.assignment.mode ?? ''
    case 'codeModule':
      return row.assignment.codeModule ?? ''
    case 'regional':
      return row.assignment.regional ?? ''
  }
}

function hoursValue(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const number = Number(text.replace(',', '.'))
  return Number.isFinite(number) ? number : Number.NaN
}

export function TeachersPage() {
  const { i18n, t } = useTranslation()
  const { academicYearId, setHasUnsavedChanges } =
    useOutletContext<TeachersContext>()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<number, Partial<TeacherAssignmentInput>>
  >({})
  const [assignmentFormDirty, setAssignmentFormDirty] = useState(false)
  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null)
  const [teacherDialog, setTeacherDialog] = useState<Teacher | 'new' | null>(
    null,
  )
  const [teacherFormDirty, setTeacherFormDirty] = useState(false)
  const [teacherFormError, setTeacherFormError] = useState('')
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [assignmentFormError, setAssignmentFormError] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [isSelectingWorkbook, setIsSelectingWorkbook] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [workbook, setWorkbook] = useState<TeacherWorkbookFile | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState('')
  const [columnMapping, setColumnMapping] = useState<
    Partial<Record<TeacherImportField, number | null>>
  >({})
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<TeacherDuplicateStrategy>('skip')

  const loadTeachers = useCallback(async (): Promise<Teacher[]> => {
    if (academicYearId === null) {
      setTeachers([])
      setLoading(false)
      return []
    }
    setLoading(true)
    setLoadError(false)
    try {
      const loaded = await window.desktopApi.getTeachers(academicYearId)
      setTeachers(loaded)
      return loaded
    } catch (error) {
      console.error('Unable to load teachers', error)
      setLoadError(true)
      return []
    } finally {
      setLoading(false)
    }
  }, [academicYearId])

  useEffect(() => {
    setAssignmentDrafts({})
    setAssignmentFormDirty(false)
    setActiveTeacher(null)
    setTeacherDialog(null)
    setTeacherFormDirty(false)
    setPageError('')
    setSuccessMessage('')
    void loadTeachers()
  }, [loadTeachers])

  useEffect(() => {
    setHasUnsavedChanges(
      Object.keys(assignmentDrafts).length > 0 ||
        teacherFormDirty ||
        assignmentFormDirty,
    )
  }, [
    assignmentDrafts,
    assignmentFormDirty,
    setHasUnsavedChanges,
    teacherFormDirty,
  ])

  const teachersWithDrafts = useMemo(
    () =>
      teachers.map((teacher) => {
        const assignments = teacher.assignments.map((assignment) => ({
          ...assignment,
          ...assignmentDrafts[assignment.id],
        }))
        return {
          ...teacher,
          assignments,
          groupCount: new Set(
            assignments
              .map((assignment) =>
                assignment.groupCode.trim().toLocaleUpperCase(),
              )
              .filter(Boolean),
          ).size,
          totalHours: assignments.reduce(
            (total, assignment) =>
              total +
              (assignment.mhp ?? 0) +
              (assignment.mhd ?? 0) +
              (assignment.mhg ?? 0),
            0,
          ),
        }
      }),
    [assignmentDrafts, teachers],
  )

  const filteredTeachers = useMemo(() => {
    const term = normalizeSearch(search)
    const displayed = teachersWithDrafts
    if (!term) return displayed
    return displayed.filter((teacher) =>
      [
        teacher.cin,
        teacher.matricule,
        teacher.fullName,
        ...teacher.assignments.map((assignment) => assignment.groupCode),
      ].some((value) => normalizeSearch(value ?? '').includes(term)),
    )
  }, [search, teachersWithDrafts])

  const discardDrafts = useCallback(() => {
    setAssignmentDrafts({})
    setAssignmentFormDirty(false)
  }, [])

  function closeTeacherDialog() {
    if (
      teacherFormDirty &&
      !window.confirm(t('teachers.unsavedChangesPrompt'))
    ) {
      return
    }
    setTeacherFormDirty(false)
    setTeacherDialog(null)
  }

  const deleteTeacher = useCallback(
    async (teacher: Teacher) => {
      if (!academicYearId) return
      const hasUnsavedAssignments = teacher.assignments.some((assignment) =>
        Object.hasOwn(assignmentDrafts, assignment.id),
      )
      if (
        !window.confirm(
          t(
            hasUnsavedAssignments
              ? 'teachers.confirmDeleteWithChanges'
              : 'teachers.confirmDelete',
            { name: teacher.fullName },
          ),
        )
      ) {
        return
      }
      try {
        await window.desktopApi.deleteTeacher(academicYearId, teacher.id)
        const assignmentIds = new Set(
          teacher.assignments.map((assignment) => assignment.id),
        )
        setAssignmentDrafts((drafts) =>
          Object.fromEntries(
            Object.entries(drafts).filter(
              ([assignmentId]) => !assignmentIds.has(Number(assignmentId)),
            ),
          ),
        )
        if (activeTeacher?.id === teacher.id) {
          setActiveTeacher(null)
          setAssignmentFormDirty(false)
        }
        await loadTeachers()
      } catch (error) {
        console.error('Unable to delete teacher', error)
        setPageError(t('teachers.deleteError'))
      }
    },
    [academicYearId, activeTeacher, assignmentDrafts, loadTeachers, t],
  )

  const columns = useMemo<ColumnDef<Teacher>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: ({ column }) => (
          <SortHeader column={column} label={t('teachers.fields.fullName')} />
        ),
        cell: ({ row }) => row.original.fullName,
      },
      {
        accessorKey: 'cin',
        header: ({ column }) => (
          <SortHeader column={column} label={t('teachers.fields.cin')} />
        ),
        cell: ({ row }) => row.original.cin || '—',
      },
      {
        accessorKey: 'specialty',
        header: ({ column }) => (
          <SortHeader column={column} label={t('teachers.fields.specialty')} />
        ),
        cell: ({ row }) => row.original.specialty || '—',
      },
      {
        accessorKey: 'groupCount',
        header: ({ column }) => (
          <SortHeader column={column} label={t('teachers.groupCount')} />
        ),
        cell: ({ row }) => row.original.groupCount,
      },
      {
        accessorKey: 'totalHours',
        header: ({ column }) => (
          <SortHeader column={column} label={t('teachers.totalHours')} />
        ),
        cell: ({ row }) => row.original.totalHours,
      },
      {
        id: 'actions',
        header: t('teachers.actions'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              aria-label={t('teachers.details')}
              className="h-8 w-8"
              onClick={() => {
                setActiveTeacher(row.original)
                setAssignmentFormError('')
              }}
              size="icon"
              title={t('teachers.details')}
              variant="ghost"
            >
              <Eye size={16} />
            </Button>
            <Button
              aria-label={t('teachers.edit')}
              className="h-8 w-8"
              onClick={() => {
                setTeacherFormError('')
                setTeacherFormDirty(false)
                setTeacherDialog(row.original)
              }}
              size="icon"
              title={t('teachers.edit')}
              variant="ghost"
            >
              <Pencil size={16} />
            </Button>
            <Button
              aria-label={t('teachers.deleteTeacher', {
                name: row.original.fullName,
              })}
              className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
              onClick={() => void deleteTeacher(row.original)}
              size="icon"
              title={t('teachers.delete')}
              variant="ghost"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ),
      },
    ],
    [deleteTeacher, t],
  )

  const table = useReactTable({
    data: filteredTeachers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  const selectedSheet = workbook?.sheets.find(
    (sheet) => sheet.sheetName === selectedSheetName,
  )
  const mappedRows = useMemo(
    () =>
      selectedSheet ? mapTeacherWorkbookRows(selectedSheet, columnMapping) : [],
    [columnMapping, selectedSheet],
  )
  const groupedImport = useMemo(
    () => groupTeacherWorkbookRows(mappedRows),
    [mappedRows],
  )
  const validRowCount = mappedRows.filter(
    (row) => row.errors.length === 0,
  ).length
  const assignmentCount = groupedImport.teachers.reduce(
    (total, bundle) => total + bundle.assignments.length,
    0,
  )

  async function handleDeleteAll() {
    if (!academicYearId || !teachers.length) return
    if (
      !window.confirm(
        t('teachers.confirmDeleteAll', { count: teachers.length }),
      )
    ) {
      return
    }
    setDeletingAll(true)
    try {
      await window.desktopApi.deleteAllTeachers(academicYearId)
      discardDrafts()
      setActiveTeacher(null)
      setSearch('')
      setSuccessMessage(t('teachers.deletedAll'))
      await loadTeachers()
    } catch (error) {
      console.error('Unable to delete all teachers', error)
      setPageError(t('teachers.deleteAllError'))
    } finally {
      setDeletingAll(false)
    }
  }

  async function handleTeacherForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (academicYearId === null) return
    const form = new FormData(event.currentTarget)
    const teacher: TeacherInput = {
      fullName: String(form.get('fullName') ?? '').trim(),
      cin: String(form.get('cin') ?? '').trim(),
      specialty: String(form.get('specialty') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      matricule: String(form.get('matricule') ?? '').trim(),
    }
    if (!teacher.fullName || !teacher.cin) {
      setTeacherFormError(t('teachers.validationError'))
      return
    }
    setSavingTeacher(true)
    setTeacherFormError('')
    try {
      if (teacherDialog === 'new') {
        await window.desktopApi.createTeacher(academicYearId, teacher)
        setSuccessMessage(t('teachers.added'))
      } else if (teacherDialog) {
        await window.desktopApi.updateTeachers(academicYearId, [
          { id: teacherDialog.id, changes: teacher },
        ])
        setSuccessMessage(t('teachers.saved'))
      }
      setTeacherFormDirty(false)
      setTeacherDialog(null)
      await loadTeachers()
    } catch (error) {
      console.error('Unable to save teacher', error)
      setTeacherFormError(
        error instanceof Error && error.message.toLowerCase().includes('cin')
          ? t('teachers.validation.cin')
          : t(
              teacherDialog === 'new'
                ? 'teachers.addError'
                : 'teachers.saveError',
            ),
      )
    } finally {
      setSavingTeacher(false)
    }
  }

  async function handleSaveAssignmentDrafts() {
    if (!academicYearId || !activeTeacher) return
    const items = Object.entries(assignmentDrafts)
    try {
      for (const [assignmentId, changes] of items) {
        const current = activeTeacher.assignments.find(
          (assignment) => assignment.id === Number(assignmentId),
        )
        if (!current) continue
        const merged = { ...current, ...changes }
        if (!merged.groupCode.trim() || !merged.module.trim()) {
          setAssignmentFormError(t('teachers.assignmentRequired'))
          return
        }
        if (
          [merged.mhp, merged.mhd, merged.mhg].some(
            (hours) =>
              hours !== null &&
              (hours === undefined || !Number.isFinite(hours) || hours < 0),
          )
        ) {
          setAssignmentFormError(t('teachers.validation.hours'))
          return
        }
        await window.desktopApi.updateTeacherAssignment(
          academicYearId,
          activeTeacher.id,
          Number(assignmentId),
          changes,
        )
      }
      setAssignmentDrafts({})
      setAssignmentFormError('')
      const loaded = await loadTeachers()
      setActiveTeacher(
        loaded.find((teacher) => teacher.id === activeTeacher.id) ?? null,
      )
    } catch (error) {
      console.error('Unable to save assignment changes', error)
      setAssignmentFormError(t('teachers.assignmentSaveError'))
    }
  }

  async function handleAddAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!academicYearId || !activeTeacher) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const assignment: TeacherAssignmentInput = {
      groupCode: String(form.get('groupCode') ?? '').trim(),
      module: String(form.get('module') ?? '').trim(),
      mhp: hoursValue(form.get('mhp')),
      mhd: hoursValue(form.get('mhd')),
      mhg: hoursValue(form.get('mhg')),
    }
    if (!assignment.groupCode || !assignment.module) {
      setAssignmentFormError(t('teachers.assignmentRequired'))
      return
    }
    if (
      [assignment.mhp, assignment.mhd, assignment.mhg].some(
        (hours) => hours !== null && (!Number.isFinite(hours) || hours < 0),
      )
    ) {
      setAssignmentFormError(t('teachers.validation.hours'))
      return
    }
    setSavingAssignment(true)
    try {
      await window.desktopApi.createTeacherAssignment(
        academicYearId,
        activeTeacher.id,
        assignment,
      )
      formElement.reset()
      setAssignmentFormDirty(false)
      setAssignmentFormError('')
      const loaded = await loadTeachers()
      setActiveTeacher(
        loaded.find((teacher) => teacher.id === activeTeacher.id) ?? null,
      )
    } catch (error) {
      console.error('Unable to add assignment', error)
      setAssignmentFormError(t('teachers.assignmentSaveError'))
    } finally {
      setSavingAssignment(false)
    }
  }

  async function handleDeleteAssignment(assignment: TeacherAssignment) {
    if (!academicYearId || !activeTeacher) return
    if (!window.confirm(t('teachers.confirmDeleteAssignment'))) return
    try {
      await window.desktopApi.deleteTeacherAssignment(
        academicYearId,
        activeTeacher.id,
        assignment.id,
      )
      setAssignmentDrafts((drafts) => {
        const next = { ...drafts }
        delete next[assignment.id]
        return next
      })
      const loaded = await loadTeachers()
      setActiveTeacher(
        loaded.find((teacher) => teacher.id === activeTeacher.id) ?? null,
      )
    } catch (error) {
      console.error('Unable to delete assignment', error)
      setAssignmentFormError(t('teachers.assignmentDeleteError'))
    }
  }

  async function handleSelectWorkbook() {
    setIsSelectingWorkbook(true)
    setImportError('')
    try {
      const currentLanguage =
        i18n.resolvedLanguage === 'en' || i18n.resolvedLanguage === 'ar'
          ? i18n.resolvedLanguage
          : 'fr'
      const parsed =
        await window.desktopApi.selectTeacherWorkbook(currentLanguage)
      if (!parsed) return
      setWorkbook(parsed)
      const preferredSheet = parsed.sheets.find((sheet) =>
        ['affectationvf', 'afectationvf'].includes(
          sheet.sheetName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/gi, '')
            .toLocaleLowerCase(),
        ),
      )
      const initialSheet = preferredSheet ?? parsed.sheets[0]
      setSelectedSheetName(initialSheet?.sheetName ?? '')
      setColumnMapping(
        initialSheet ? detectTeacherColumnMapping(initialSheet.headers) : {},
      )
    } catch (error) {
      console.error('Unable to read teacher workbook', error)
      setImportError(t('teachers.importError'))
    } finally {
      setIsSelectingWorkbook(false)
    }
  }

  async function handleImportTeachers() {
    if (!academicYearId || !groupedImport.teachers.length) return
    setIsImporting(true)
    setImportError('')
    try {
      const summary = await window.desktopApi.importTeachers(
        academicYearId,
        groupedImport.teachers,
        duplicateStrategy,
      )
      setSuccessMessage(
        t('teachers.importComplete', {
          inserted: summary.inserted,
          updated: summary.updated,
          skipped: summary.skipped,
        }),
      )
      setWorkbook(null)
      await loadTeachers()
    } catch (error) {
      console.error('Unable to import teachers', error)
      setImportError(t('teachers.importError'))
    } finally {
      setIsImporting(false)
    }
  }

  function updateMapping(field: TeacherImportField, value: string) {
    const mappedIndex = value === '' ? null : Number(value)
    setColumnMapping((current) => {
      const next = { ...current, [field]: mappedIndex }
      if (mappedIndex !== null) {
        for (const otherField of importFields) {
          if (otherField !== field && next[otherField] === mappedIndex) {
            next[otherField] = null
          }
        }
      }
      return next
    })
  }

  const rtl = i18n.resolvedLanguage === 'ar'
  const activeTeacherData = activeTeacher
    ? (teachersWithDrafts.find((teacher) => teacher.id === activeTeacher.id) ??
      activeTeacher)
    : null
  const activeTotalHours = activeTeacherData?.assignments.reduce(
    (total, assignment) =>
      total +
      (assignment.mhp ?? 0) +
      (assignment.mhd ?? 0) +
      (assignment.mhg ?? 0),
    0,
  )

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-bold tracking-[0.16em] text-brand">
            {t('navigation.teachers').toLocaleUpperCase()}
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">
            {t('navigation.teachers')}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t('pages.teachersDescription')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!teachers.length || deletingAll}
            onClick={() => void handleDeleteAll()}
            variant="outline"
          >
            <Trash2 size={16} />
            {deletingAll ? t('teachers.deletingAll') : t('teachers.deleteAll')}
          </Button>
          <Button
            disabled={isSelectingWorkbook || academicYearId === null}
            onClick={() => void handleSelectWorkbook()}
            variant="outline"
          >
            <FileUp size={16} />
            {isSelectingWorkbook
              ? t('teachers.openingWorkbook')
              : t('teachers.importExcel')}
          </Button>
          <Button
            disabled={academicYearId === null}
            onClick={() => {
              setTeacherFormError('')
              setTeacherFormDirty(false)
              setTeacherDialog('new')
            }}
          >
            <Plus size={16} />
            {t('teachers.addTeacher')}
          </Button>
        </div>
      </div>

      {loadError && <Alert>{t('teachers.loadError')}</Alert>}
      {pageError && <Alert>{pageError}</Alert>}
      {successMessage && (
        <div
          className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold text-ink">
              {t('teachers.listTitle')}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {t('teachers.teacherCount', { count: teachers.length })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-10 w-72 max-w-full items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-brand/20">
              <span className="sr-only">{t('teachers.search')}</span>
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                onChange={(event) => {
                  setSearch(event.target.value)
                  table.setPageIndex(0)
                }}
                placeholder={t('teachers.search')}
                type="search"
                value={search}
              />
            </label>
            {(Object.keys(assignmentDrafts).length > 0 ||
              assignmentFormDirty) && (
              <Button onClick={discardDrafts} variant="outline">
                {t('teachers.discardChanges')}
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-start">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      className="border-b border-slate-100 px-4 py-3 text-start"
                      key={header.id}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm text-slate-400"
                    colSpan={columns.length}
                  >
                    {t('common.loading')}
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm text-slate-400"
                    colSpan={columns.length}
                  >
                    {search
                      ? t('teachers.noSearchResults')
                      : t('teachers.empty')}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr className="hover:bg-slate-50/70" key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        className="px-4 py-3 text-sm text-slate-700"
                        key={cell.id}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
          <span>
            {t('teachers.pageOf', {
              page: table.getState().pagination.pageIndex + 1,
              pages: Math.max(table.getPageCount(), 1),
            })}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="sm"
              variant="outline"
            >
              {t('teachers.previous')}
            </Button>
            <Button
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="sm"
              variant="outline"
            >
              {t('teachers.next')}
            </Button>
          </div>
        </div>
      </Card>

      {teacherDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <section
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card bg-white p-6 shadow-2xl"
            role="dialog"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">
                {t(
                  teacherDialog === 'new'
                    ? 'teachers.addDialogTitle'
                    : 'teachers.editDialogTitle',
                )}
              </h2>
              <Button
                aria-label={t('teachers.close')}
                onClick={closeTeacherDialog}
                size="icon"
                variant="ghost"
              >
                <X size={18} />
              </Button>
            </div>
            <form
              className="space-y-5"
              onSubmit={(event) => void handleTeacherForm(event)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {teacherFields.map((field) => {
                  const value =
                    teacherDialog === 'new'
                      ? blankTeacher[field.key]
                      : teacherDialog[field.key]
                  return (
                    <label
                      className="block text-sm font-medium text-slate-700"
                      key={field.key}
                    >
                      {t(`teachers.fields.${field.key}`)}
                      {(field.key === 'fullName' || field.key === 'cin') && (
                        <span className="ms-1 text-red-500">*</span>
                      )}
                      <input
                        className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                        defaultValue={value}
                        name={field.key}
                        onChange={() => setTeacherFormDirty(true)}
                        required={
                          field.key === 'fullName' || field.key === 'cin'
                        }
                        type={field.type}
                      />
                    </label>
                  )
                })}
              </div>
              {teacherFormError && (
                <p className="text-sm text-red-600" role="alert">
                  {teacherFormError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  onClick={closeTeacherDialog}
                  type="button"
                  variant="outline"
                >
                  {t('teachers.cancel')}
                </Button>
                <Button disabled={savingTeacher} type="submit">
                  {savingTeacher
                    ? t('teachers.saving')
                    : t('teachers.saveChanges')}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activeTeacherData && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/30"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              if (
                (Object.keys(assignmentDrafts).length || assignmentFormDirty) &&
                !window.confirm(t('teachers.unsavedChangesPrompt'))
              )
                return
              setAssignmentDrafts({})
              setAssignmentFormDirty(false)
              setActiveTeacher(null)
            }
          }}
        >
          <aside
            aria-label={t('teachers.details')}
            aria-modal="true"
            className={`absolute inset-y-0 w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7 ${rtl ? 'left-0' : 'right-0'}`}
            dir={rtl ? 'rtl' : 'ltr'}
            role="dialog"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">
                  {activeTeacherData.fullName}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('teachers.fields.cin')}: {activeTeacherData.cin || '—'} ·{' '}
                  {t('teachers.fields.specialty')}:{' '}
                  {activeTeacherData.specialty || '—'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t('teachers.fields.phone')}: {activeTeacherData.phone || '—'}{' '}
                  · {t('teachers.fields.email')}:{' '}
                  {activeTeacherData.email || '—'} ·{' '}
                  {t('teachers.fields.matricule')}:{' '}
                  {activeTeacherData.matricule || '—'}
                </p>
              </div>
              <Button
                aria-label={t('teachers.close')}
                onClick={() => {
                  if (
                    (Object.keys(assignmentDrafts).length ||
                      assignmentFormDirty) &&
                    !window.confirm(t('teachers.unsavedChangesPrompt'))
                  )
                    return
                  setAssignmentDrafts({})
                  setAssignmentFormDirty(false)
                  setActiveTeacher(null)
                }}
                size="icon"
                variant="ghost"
              >
                <X size={18} />
              </Button>
            </div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">
                {t('teachers.assignments')}
              </h3>
              {Object.keys(assignmentDrafts).length > 0 && (
                <Button
                  onClick={() => void handleSaveAssignmentDrafts()}
                  size="sm"
                >
                  <Save size={15} />
                  {t('teachers.saveChanges')}
                </Button>
              )}
            </div>
            {assignmentFormError && <Alert>{assignmentFormError}</Alert>}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    {['group', 'module', 'mhp', 'mhd', 'mhg', 'actions'].map(
                      (key) => (
                        <th className="px-2 py-2 text-start" key={key}>
                          {t(
                            `teachers.${key === 'group' ? 'fields.groupe' : key === 'actions' ? 'actions' : `fields.${key}`}`,
                          )}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeTeacherData.assignments.map((assignment) => {
                    const draft = assignmentDrafts[assignment.id] ?? {}
                    const value = <K extends keyof TeacherAssignmentInput>(
                      key: K,
                    ) =>
                      Object.hasOwn(draft, key) ? draft[key] : assignment[key]
                    return (
                      <tr key={assignment.id}>
                        {(
                          ['groupCode', 'module', 'mhp', 'mhd', 'mhg'] as const
                        ).map((field) => (
                          <td className="px-2 py-2" key={field}>
                            <input
                              aria-label={t(
                                `teachers.${field === 'groupCode' ? 'fields.groupe' : `fields.${field}`}`,
                              )}
                              className="w-full min-w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                              min={
                                field === 'groupCode' || field === 'module'
                                  ? undefined
                                  : 0
                              }
                              onChange={(event) => {
                                const nextValue =
                                  field === 'groupCode' || field === 'module'
                                    ? event.target.value
                                    : hoursValue(event.target.value)
                                setAssignmentDrafts((drafts) => ({
                                  ...drafts,
                                  [assignment.id]: {
                                    ...drafts[assignment.id],
                                    [field]: nextValue,
                                  },
                                }))
                              }}
                              step={
                                field === 'groupCode' || field === 'module'
                                  ? undefined
                                  : 'any'
                              }
                              type={
                                field === 'groupCode' || field === 'module'
                                  ? 'text'
                                  : 'number'
                              }
                              value={value(field) ?? ''}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <Button
                            aria-label={t('teachers.deleteAssignment')}
                            className="h-8 w-8 text-red-500"
                            onClick={() =>
                              void handleDeleteAssignment(assignment)
                            }
                            size="icon"
                            title={t('teachers.deleteAssignment')}
                            variant="ghost"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-2 py-2" colSpan={2}>
                      {t('teachers.total')}
                    </td>
                    <td className="px-2 py-2">
                      {activeTeacherData.assignments.reduce(
                        (sum, item) => sum + (item.mhp ?? 0),
                        0,
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {activeTeacherData.assignments.reduce(
                        (sum, item) => sum + (item.mhd ?? 0),
                        0,
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {activeTeacherData.assignments.reduce(
                        (sum, item) => sum + (item.mhg ?? 0),
                        0,
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {t('teachers.totalHours')}: {activeTotalHours}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <form
              className="mt-6 rounded-xl border border-slate-100 p-4"
              onSubmit={(event) => void handleAddAssignment(event)}
            >
              <h4 className="mb-3 text-sm font-semibold text-ink">
                {t('teachers.addAssignment')}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['groupCode', 'module'] as const).map((field) => (
                  <label className="text-sm text-slate-600" key={field}>
                    {t(
                      `teachers.fields.${field === 'groupCode' ? 'groupe' : field}`,
                    )}
                    <input
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2"
                      name={field}
                      onChange={() => setAssignmentFormDirty(true)}
                      required
                    />
                  </label>
                ))}
                {(['mhp', 'mhd', 'mhg'] as const).map((field) => (
                  <label className="text-sm text-slate-600" key={field}>
                    {t(`teachers.fields.${field}`)}
                    <input
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2"
                      min="0"
                      name={field}
                      onChange={() => setAssignmentFormDirty(true)}
                      step="any"
                      type="number"
                    />
                  </label>
                ))}
              </div>
              <Button
                className="mt-3"
                disabled={savingAssignment}
                type="submit"
              >
                <Plus size={15} />
                {t('teachers.addAssignment')}
              </Button>
            </form>
          </aside>
        </div>
      )}

      {workbook && selectedSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <section
            aria-labelledby="teacher-import-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-card bg-white p-6 shadow-2xl"
            role="dialog"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2
                  className="text-lg font-bold text-ink"
                  id="teacher-import-title"
                >
                  {t('teachers.importTitle')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('teachers.importDescription', {
                    count: selectedSheet.rows.length,
                    sheet: selectedSheet.sheetName,
                  })}
                </p>
              </div>
              <Button
                aria-label={t('teachers.close')}
                onClick={() => setWorkbook(null)}
                size="icon"
                variant="ghost"
              >
                <X size={18} />
              </Button>
            </div>
            <label className="mb-4 block max-w-md text-sm font-medium text-slate-700">
              {t('teachers.sheetLabel')}
              <select
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand"
                onChange={(event) => {
                  const nextSheet = workbook.sheets.find(
                    (sheet) => sheet.sheetName === event.target.value,
                  )
                  setSelectedSheetName(event.target.value)
                  setColumnMapping(
                    nextSheet
                      ? detectTeacherColumnMapping(nextSheet.headers)
                      : {},
                  )
                }}
                value={selectedSheetName}
              >
                {workbook.sheets.map((sheet) => (
                  <option key={sheet.sheetName} value={sheet.sheetName}>
                    {sheet.sheetName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {importFields.map((field) => (
                <label
                  className="block text-sm font-medium text-slate-700"
                  key={field}
                >
                  {importLabel(field, t)}
                  <select
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand"
                    onChange={(event) =>
                      updateMapping(field, event.target.value)
                    }
                    value={columnMapping[field] ?? ''}
                  >
                    <option value="">{t('teachers.notMapped')}</option>
                    {selectedSheet.headers.map((header, index) => (
                      <option
                        disabled={importFields.some(
                          (other) =>
                            other !== field && columnMapping[other] === index,
                        )}
                        key={`${index}-${header}`}
                        value={index}
                      >
                        {header ||
                          t('teachers.unnamedColumn', { index: index + 1 })}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <p>
                {t('teachers.previewTeachers', {
                  count: groupedImport.teachers.length,
                })}
              </p>
              <p>
                {t('teachers.previewAssignments', { count: assignmentCount })}
              </p>
              <p>
                {t('teachers.previewWarnings', {
                  count: groupedImport.warnings.length,
                })}
              </p>
            </div>
            {groupedImport.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-amber-700">
                {groupedImport.warnings.map((warning, index) => (
                  <li key={`${warning.type}-${index}`}>
                    {t(`teachers.warnings.${warning.type}`, {
                      name: warning.name,
                      detail: warning.detail,
                    })}
                  </li>
                ))}
              </ul>
            )}
            <label className="mt-4 block max-w-md text-sm font-medium text-slate-700">
              {t('teachers.duplicateStrategy')}
              <select
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3"
                onChange={(event) =>
                  setDuplicateStrategy(
                    event.target.value as TeacherDuplicateStrategy,
                  )
                }
                value={duplicateStrategy}
              >
                <option value="skip">
                  {t('teachers.duplicateOptions.skip')}
                </option>
                <option value="update">
                  {t('teachers.duplicateOptions.update')}
                </option>
                <option value="addAssignments">
                  {t('teachers.duplicateOptions.addAssignments')}
                </option>
              </select>
            </label>
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-slate-50 text-start text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">
                      {t('teachers.row')}
                    </th>
                    {importFields.map((field) => (
                      <th className="px-3 py-2 text-start" key={field}>
                        {importLabel(field, t)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-start">
                      {t('teachers.validationStatus')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mappedRows.slice(0, 6).map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2 text-slate-400">
                        {row.rowNumber}
                      </td>
                      {importFields.map((field) => (
                        <td className="px-3 py-2" key={field}>
                          {getPreviewValue(row, field) ?? '—'}
                        </td>
                      ))}
                      <td
                        className={
                          row.errors.length
                            ? 'px-3 py-2 text-red-600'
                            : 'px-3 py-2 text-emerald-600'
                        }
                      >
                        {row.errors.length
                          ? t('teachers.invalidRow', {
                              fields: row.errors
                                .map((field) => importLabel(field, t))
                                .join(', '),
                            })
                          : t('teachers.validRow')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {t('teachers.importPreviewCount', {
                valid: validRowCount,
                invalid: mappedRows.length - validRowCount,
              })}
            </p>
            {importError && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {importError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                disabled={isImporting}
                onClick={() => setWorkbook(null)}
                variant="outline"
              >
                {t('teachers.cancel')}
              </Button>
              <Button
                disabled={isImporting || !groupedImport.teachers.length}
                onClick={() => void handleImportTeachers()}
              >
                {isImporting
                  ? t('teachers.importing')
                  : t('teachers.confirmImport')}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function SortHeader({
  column,
  label,
}: {
  column: {
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined
    getIsSorted: () => false | 'asc' | 'desc'
  }
  label: string
}) {
  return (
    <button
      className="flex items-center gap-1 whitespace-nowrap text-start"
      onClick={column.getToggleSortingHandler()}
      type="button"
    >
      {label}
      {column.getIsSorted() === 'asc' ? (
        <ArrowUp aria-hidden="true" size={13} />
      ) : column.getIsSorted() === 'desc' ? (
        <ArrowDown aria-hidden="true" size={13} />
      ) : (
        <ArrowUpDown aria-hidden="true" size={13} />
      )}
    </button>
  )
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
      role="alert"
    >
      {children}
    </div>
  )
}
