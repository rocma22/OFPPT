import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createAcademicYear,
  createTeacher,
  createTeacherAssignment,
  deleteAcademicYear,
  deleteAllTeachers,
  deleteInternshipPeriod,
  deleteTeacher,
  deleteTeacherAssignment,
  getAcademicYears,
  getDashboardStats,
  getHoursPlanningData,
  getInternshipGroups,
  getInternshipPeriods,
  getTeachers,
  importTeachers,
  initializeDatabase,
  saveInternshipPeriod,
  saveHoursPlanningData,
  updateTeachers,
  updateTeacherAssignment,
} from './database'
import { parseTeacherWorkbook } from './teacher-excel'
import type {
  CreateAcademicYearInput,
  AppLanguage,
  HoursPlanningData,
  SaveInternshipPeriodInput,
  TeacherDuplicateStrategy,
  TeacherAssignmentInput,
  TeacherImportBundle,
  TeacherInput,
  TeacherUpdate,
} from '../shared/types'
import ar from '../renderer/locales/ar.json'
import en from '../renderer/locales/en.json'
import fr from '../renderer/locales/fr.json'

const startupMessages = { fr: fr.startup, en: en.startup, ar: ar.startup }
const workbookDialogText = {
  fr: fr.teachers,
  en: en.teachers,
  ar: ar.teachers,
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: '#f4f2ff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  try {
    initializeDatabase()

    ipcMain.handle('academic-years:list', () => getAcademicYears())
    ipcMain.handle(
      'academic-years:create',
      (_event, input: CreateAcademicYearInput) => createAcademicYear(input),
    )
    ipcMain.handle('academic-years:delete', (_event, academicYearId: number) =>
      deleteAcademicYear(academicYearId),
    )
    ipcMain.handle('dashboard:stats', (_event, academicYearId: number) =>
      getDashboardStats(academicYearId),
    )
    ipcMain.handle('internships:list', (_event, academicYearId: number) =>
      getInternshipPeriods(academicYearId),
    )
    ipcMain.handle('internships:groups', (_event, academicYearId: number) =>
      getInternshipGroups(academicYearId),
    )
    ipcMain.handle(
      'internships:save-period',
      (_event, input: SaveInternshipPeriodInput) => saveInternshipPeriod(input),
    )
    ipcMain.handle(
      'internships:delete-period',
      (_event, academicYearId: number, groupCode: string) =>
        deleteInternshipPeriod(academicYearId, groupCode),
    )
    ipcMain.handle(
      'hours-planning:get-data',
      (_event, academicYearId: number) =>
        getHoursPlanningData(academicYearId),
    )
    ipcMain.handle(
      'hours-planning:save-data',
      (_event, academicYearId: number, data: HoursPlanningData) =>
        saveHoursPlanningData(academicYearId, data),
    )
    ipcMain.handle('teachers:list', (_event, academicYearId: number) =>
      getTeachers(academicYearId),
    )
    ipcMain.handle(
      'teachers:create',
      (_event, academicYearId: number, teacher: TeacherInput) =>
        createTeacher(academicYearId, teacher),
    )
    ipcMain.handle(
      'teachers:update',
      (_event, academicYearId: number, updates: TeacherUpdate[]) =>
        updateTeachers(academicYearId, updates),
    )
    ipcMain.handle(
      'teachers:delete',
      (_event, academicYearId: number, teacherId: number) =>
        deleteTeacher(academicYearId, teacherId),
    )
    ipcMain.handle('teachers:delete-all', (_event, academicYearId: number) =>
      deleteAllTeachers(academicYearId),
    )
    ipcMain.handle(
      'teachers:assignment-create',
      (
        _event,
        academicYearId: number,
        teacherId: number,
        assignment: TeacherAssignmentInput,
      ) => createTeacherAssignment(academicYearId, teacherId, assignment),
    )
    ipcMain.handle(
      'teachers:assignment-update',
      (
        _event,
        academicYearId: number,
        teacherId: number,
        assignmentId: number,
        changes: Partial<TeacherAssignmentInput>,
      ) =>
        updateTeacherAssignment(
          academicYearId,
          teacherId,
          assignmentId,
          changes,
        ),
    )
    ipcMain.handle(
      'teachers:assignment-delete',
      (
        _event,
        academicYearId: number,
        teacherId: number,
        assignmentId: number,
      ) => deleteTeacherAssignment(academicYearId, teacherId, assignmentId),
    )
    ipcMain.handle(
      'teachers:select-workbook',
      async (
        _event,
        language: AppLanguage,
      ): Promise<Awaited<ReturnType<typeof parseTeacherWorkbook>> | null> => {
        const messages = workbookDialogText[language]
        const selection = await dialog.showOpenDialog({
          title: messages.fileDialogTitle,
          properties: ['openFile'],
          filters: [{ name: messages.excelWorkbook, extensions: ['xlsx'] }],
        })
        if (selection.canceled || !selection.filePaths[0]) return null
        return parseTeacherWorkbook(await readFile(selection.filePaths[0]))
      },
    )
    ipcMain.handle(
      'teachers:import',
      (
        _event,
        academicYearId: number,
        teachers: TeacherImportBundle[],
        strategy: TeacherDuplicateStrategy,
      ) => importTeachers(academicYearId, teachers, strategy),
    )

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (error) {
    const details =
      error instanceof Error ? error.message : 'Unknown database startup error'
    const locale = app.getLocale().toLowerCase()
    const language = locale.startsWith('ar')
      ? 'ar'
      : locale.startsWith('fr')
        ? 'fr'
        : 'en'
    const messages = startupMessages[language]
    console.error('Unable to initialize the local database', error)
    dialog.showErrorBox(
      messages.title,
      `${messages.description}\n\n${details}\n\n${messages.instructions}`,
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
