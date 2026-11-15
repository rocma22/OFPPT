const ExcelJS = require('exceljs')
const path = require('node:path')

async function main() {
  const outputPath = path.resolve(process.argv[2] ?? 'teachers-sample.xlsx')
  const workbook = new ExcelJS.Workbook()
  const otherSheet = workbook.addWorksheet('Instructions')
  otherSheet.addRow(['Only the AFFECTATION VF sheet is imported.'])
  const worksheet = workbook.addWorksheet('AFFECTATION VF')

  worksheet.addRow([
    'Code Filière',
    'Filière',
    'Groupe',
    'Mode',
    'Code Module',
    'Module',
    'Régional',
    'Formateur Affecté Présentiel Actif',
    'MHP',
    'MHD',
    'MHG',
  ])
  worksheet.addRows([
    [
      'DD-101',
      'Développement digital',
      'DD-101-G1',
      'Présentiel',
      'M101',
      'Algorithmique',
      'Casablanca-Settat',
      'Amina El Idrissi',
      18,
      2,
      4,
    ],
    [
      'DD-101',
      'Développement digital',
      'DD-101-G1',
      'Présentiel',
      'M102',
      'JavaScript',
      'Casablanca-Settat',
      'Amina El Idrissi',
      12,
      3,
      2,
    ],
    [
      'DD-101',
      'Développement digital',
      'DD-101-G2',
      'Présentiel',
      'M201',
      'Bases de données',
      'Casablanca-Settat',
      'Amina El Idrissi',
      15,
      2,
      3,
    ],
    [
      'RS-201',
      'Réseaux',
      'RS-201-G2',
      'Présentiel',
      'M205',
      'Sécurité réseau',
      'Rabat-Salé-Kénitra',
      'Youssef Benali',
      10,
      4,
      1,
    ],
  ])
  worksheet.getRow(1).font = { bold: true }
  worksheet.columns.forEach((column) => {
    column.width = Math.max(
      14,
      ...worksheet
        .getColumn(column.number)
        .values.slice(1)
        .map((value) => String(value ?? '').length + 2),
    )
  })

  await workbook.xlsx.writeFile(outputPath)
  console.log(`Sample teacher workbook written to ${outputPath}`)
}

main().catch((error) => {
  console.error('Unable to generate the teacher sample workbook', error)
  process.exitCode = 1
})
