import type { TeacherImportField } from './types'

const fieldAliases: Record<TeacherImportField, string[]> = {
  fullName: [
    'formateuraffectepresentielactif',
    'assignedactiveinpersontrainer',
    'fullname',
    'name',
    'nom',
    'nomcomplet',
    'nometprenom',
    'nomprenom',
    'nomduformateur',
    'nomdelenseignant',
    'teacher',
    'teachername',
    'professorname',
    'enseignant',
    'formateur',
  ],
  cin: ['cin', 'nationalid', 'idnumber'],
  specialty: ['specialty', 'specialite', 'speciality'],
  codeFiliere: ['codefiliere', 'programcode'],
  filiere: ['filiere', 'program'],
  groupe: ['groupe', 'group'],
  mode: ['mode', 'trainingmode'],
  codeModule: ['codemodule', 'modulecode'],
  module: ['module'],
  regional: ['regional', 'regionaloffice'],
  mhp: ['mhp'],
  mhd: ['mhd'],
  mhg: ['mhg'],
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function detectTeacherColumnMapping(
  headers: string[],
): Partial<Record<TeacherImportField, number>> {
  const mapping: Partial<Record<TeacherImportField, number>> = {}
  const claimed = new Set<number>()

  for (const [field, aliases] of Object.entries(fieldAliases) as [
    TeacherImportField,
    string[],
  ][]) {
    const index = headers.findIndex((header, candidateIndex) => {
      const normalized = normalizeHeader(header)
      return !claimed.has(candidateIndex) && aliases.includes(normalized)
    })
    if (index >= 0) {
      mapping[field] = index
      claimed.add(index)
    }
  }
  return mapping
}
