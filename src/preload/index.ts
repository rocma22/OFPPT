import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateAcademicYearInput,
  AppLanguage,
  DesktopApi,
  HoursPlanningData,
  SaveInternshipPeriodInput,
  TeacherDuplicateStrategy,
  TeacherImportBundle,
} from '../shared/types'

const desktopApi: DesktopApi = {
  getAcademicYears: () => ipcRenderer.invoke('academic-years:list'),
  createAcademicYear: (input: CreateAcademicYearInput) =>
    ipcRenderer.invoke('academic-years:create', input),
  deleteAcademicYear: (academicYearId) =>
    ipcRenderer.invoke('academic-years:delete', academicYearId),
  getInternshipGroups: (academicYearId) =>
    ipcRenderer.invoke('internships:groups', academicYearId),
  getInternshipPeriods: (academicYearId) =>
    ipcRenderer.invoke('internships:list', academicYearId),
  saveInternshipPeriod: (input: SaveInternshipPeriodInput) =>
    ipcRenderer.invoke('internships:save-period', input),
  deleteInternshipPeriod: (academicYearId, groupCode) =>
    ipcRenderer.invoke('internships:delete-period', academicYearId, groupCode),
  getHoursPlanningData: (academicYearId) =>
    ipcRenderer.invoke('hours-planning:get-data', academicYearId),
  saveHoursPlanningData: (
    academicYearId: number,
    data: HoursPlanningData,
  ) => ipcRenderer.invoke('hours-planning:save-data', academicYearId, data),
  getDashboardStats: (academicYearId: number) =>
    ipcRenderer.invoke('dashboard:stats', academicYearId),
  getTeachers: (academicYearId) =>
    ipcRenderer.invoke('teachers:list', academicYearId),
  createTeacher: (academicYearId, teacher) =>
    ipcRenderer.invoke('teachers:create', academicYearId, teacher),
  updateTeachers: (academicYearId, updates) =>
    ipcRenderer.invoke('teachers:update', academicYearId, updates),
  deleteTeacher: (academicYearId, teacherId) =>
    ipcRenderer.invoke('teachers:delete', academicYearId, teacherId),
  deleteAllTeachers: (academicYearId) =>
    ipcRenderer.invoke('teachers:delete-all', academicYearId),
  createTeacherAssignment: (academicYearId, teacherId, assignment) =>
    ipcRenderer.invoke(
      'teachers:assignment-create',
      academicYearId,
      teacherId,
      assignment,
    ),
  updateTeacherAssignment: (academicYearId, teacherId, assignmentId, changes) =>
    ipcRenderer.invoke(
      'teachers:assignment-update',
      academicYearId,
      teacherId,
      assignmentId,
      changes,
    ),
  deleteTeacherAssignment: (academicYearId, teacherId, assignmentId) =>
    ipcRenderer.invoke(
      'teachers:assignment-delete',
      academicYearId,
      teacherId,
      assignmentId,
    ),
  selectTeacherWorkbook: (language: AppLanguage) =>
    ipcRenderer.invoke('teachers:select-workbook', language),
  importTeachers: (
    academicYearId: number,
    teachers: TeacherImportBundle[],
    strategy: TeacherDuplicateStrategy,
  ) =>
    ipcRenderer.invoke('teachers:import', academicYearId, teachers, strategy),
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
