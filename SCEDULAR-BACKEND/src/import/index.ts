import type { CanonicalImportDataset, ImportPreview } from './types.js'
import { parseWorkbook } from './parser.js'
import { normalizeWorkbook } from './normalize.js'
import { validateDataset } from './validate.js'

export function previewWorkbook(buffer: Uint8Array): ImportPreview {
  const parsed = parseWorkbook(buffer)
  const normalized = normalizeWorkbook(parsed.sheets, parsed.diagnostics)
  const validation = validateDataset(normalized.dataset)
  const errors = validation.errors
  const warnings = validation.warnings
  const summary = {
    sections: normalized.dataset.sections.length,
    subjects: normalized.dataset.subjects.length,
    sectionSubjects: normalized.dataset.sectionSubjects.length,
    faculty: normalized.dataset.faculty.length,
    teachingAssignments: normalized.dataset.teachingAssignments.length,
    labs: normalized.dataset.labs.length,
    labMappings: normalized.dataset.labMappings.length,
    facultyUnavailability: normalized.dataset.facultyUnavailability.length,
  }
  return { valid: errors.length === 0, summary, errors, warnings, dataset: normalized.dataset }
}

export function validatePayload(dataset: CanonicalImportDataset): ImportPreview {
  const validation = validateDataset(dataset)
  return {
    valid: validation.errors.length === 0,
    summary: {
      sections: dataset.sections.length,
      subjects: dataset.subjects.length,
      sectionSubjects: dataset.sectionSubjects.length,
      faculty: dataset.faculty.length,
      teachingAssignments: dataset.teachingAssignments.length,
      labs: dataset.labs.length,
      labMappings: dataset.labMappings.length,
      facultyUnavailability: dataset.facultyUnavailability.length,
    },
    errors: validation.errors,
    warnings: validation.warnings,
    dataset,
  }
}
