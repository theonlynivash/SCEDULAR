// Centralized curriculum configuration — frontend mirror of backend subjectConfig.ts.
// Two independent axes:
//   1. CURRICULUM_CATEGORY_CONFIG — canonical SubjectCategory enum
//      (CORE, BASIC_SCIENCE, ENGINEERING_SCIENCE, HUMANITIES, INTEGRATED,
//       THEORY, LAB_ONLY, MANDATORY, ADDITIONAL, PROFESSIONAL_ELECTIVE,
//       OPEN_ELECTIVE, PROJECT, TRAINING, VALUE_ADDED, OTHER).
//   2. DELIVERY_TYPE_CONFIG — how a subject is taught (THEORY, INTEGRATED, LAB,
//      PROJECT). Delivery colors are distinct from category colors — the two
//      axes never share a palette.
//
// Every color, label, and badge in the UI MUST read from here. Do NOT hardcode
// subject-type colors in individual components.

export type SubjectCategory =
  | 'CORE'
  | 'BASIC_SCIENCE'
  | 'ENGINEERING_SCIENCE'
  | 'HUMANITIES'
  | 'INTEGRATED'
  | 'THEORY'
  | 'LAB_ONLY'
  | 'MANDATORY'
  | 'ADDITIONAL'
  | 'PROFESSIONAL_ELECTIVE'
  | 'OPEN_ELECTIVE'
  | 'PROJECT'
  | 'TRAINING'
  | 'VALUE_ADDED'
  | 'OTHER'

export type SubjectDeliveryType = 'THEORY' | 'INTEGRATED' | 'LAB' | 'PROJECT'

export interface CurriculumCategoryEntry {
  label: string
  color: string
  /** Tailwind-friendly background class (e.g. 'bg-blue-100') */
  bgClass: string
  /** Tailwind-friendly text class (e.g. 'text-blue-800') */
  textClass: string
  /** Short description for tooltips / help text */
  description: string
}

export interface DeliveryTypeEntry {
  label: string
  color: string
  bgClass: string
  textClass: string
  /** Short description for tooltips / help text */
  description: string
}

/** Maps a hex color to the closest Tailwind bg/text pair for badges */
function tw(hex: string): { bgClass: string; textClass: string } {
  const map: Record<string, { bgClass: string; textClass: string }> = {
    '#2563EB': { bgClass: 'bg-blue-100', textClass: 'text-blue-800' },
    '#EA580C': { bgClass: 'bg-orange-100', textClass: 'text-orange-800' },
    '#7C3AED': { bgClass: 'bg-violet-100', textClass: 'text-violet-800' },
    '#DB2777': { bgClass: 'bg-pink-100', textClass: 'text-pink-800' },
    '#CA8A04': { bgClass: 'bg-yellow-100', textClass: 'text-yellow-800' },
    '#0F766E': { bgClass: 'bg-teal-100', textClass: 'text-teal-800' },
    '#4F46E5': { bgClass: 'bg-indigo-100', textClass: 'text-indigo-800' },
    '#0891B2': { bgClass: 'bg-cyan-100', textClass: 'text-cyan-800' },
    '#059669': { bgClass: 'bg-emerald-100', textClass: 'text-emerald-800' },
    '#DC2626': { bgClass: 'bg-red-100', textClass: 'text-red-800' },
    '#9333EA': { bgClass: 'bg-purple-100', textClass: 'text-purple-800' },
    '#10B981': { bgClass: 'bg-green-100', textClass: 'text-green-800' },
    '#94A3B8': { bgClass: 'bg-slate-100', textClass: 'text-slate-600' },
    // Delivery type palette (distinct from category colors)
    '#64748B': { bgClass: 'bg-slate-200', textClass: 'text-slate-700' },
    '#F59E0B': { bgClass: 'bg-amber-100', textClass: 'text-amber-800' },
    '#16A34A': { bgClass: 'bg-green-100', textClass: 'text-green-800' },
    '#8B5CF6': { bgClass: 'bg-violet-100', textClass: 'text-violet-800' },
  }
  return map[hex] ?? { bgClass: 'bg-slate-100', textClass: 'text-slate-600' }
}

export const CURRICULUM_CATEGORY_CONFIG: Record<SubjectCategory, CurriculumCategoryEntry> = {
  CORE: {
    label: 'Core',
    color: '#7C3AED',
    ...tw('#7C3AED'),
    description: 'Regular department professional/core academic subjects.',
  },
  BASIC_SCIENCE: {
    label: 'Basic Science',
    color: '#2563EB',
    ...tw('#2563EB'),
    description: 'Mathematics/science foundation subjects.',
  },
  ENGINEERING_SCIENCE: {
    label: 'Engineering Science',
    color: '#EA580C',
    ...tw('#EA580C'),
    description: 'Engineering foundation subjects.',
  },
  HUMANITIES: {
    label: 'Humanities',
    color: '#DB2777',
    ...tw('#DB2777'),
    description: 'Humanities/language/social-science curriculum components.',
  },
  INTEGRATED: {
    label: 'Integrated',
    color: '#F59E0B',
    ...tw('#F59E0B'),
    description: 'Integrated theory+lab subject.',
  },
  THEORY: {
    label: 'Theory',
    color: '#64748B',
    ...tw('#64748B'),
    description: 'Theory-only subject.',
  },
  LAB_ONLY: {
    label: 'Lab Only',
    color: '#0F766E',
    ...tw('#0F766E'),
    description: 'Practical/laboratory-only subject.',
  },
  MANDATORY: {
    label: 'Mandatory',
    color: '#DC2626',
    ...tw('#DC2626'),
    description: 'University-assigned mandatory course (23MC1001–23MC1008). NOT a normal Theory subject.',
  },
  ADDITIONAL: {
    label: 'Additional',
    color: '#CA8A04',
    ...tw('#CA8A04'),
    description: 'Employability/skill-development/value-added courses — not scheduled by CSP.',
  },
  PROFESSIONAL_ELECTIVE: {
    label: 'Professional Elective',
    color: '#4F46E5',
    ...tw('#4F46E5'),
    description: 'Student-selected professional elective.',
  },
  OPEN_ELECTIVE: {
    label: 'Open Elective',
    color: '#0891B2',
    ...tw('#0891B2'),
    description: 'Student-selected open elective.',
  },
  PROJECT: {
    label: 'Project',
    color: '#9333EA',
    ...tw('#9333EA'),
    description: 'Mini Project / Project Work — not scheduled by CSP.',
  },
  TRAINING: {
    label: 'Training',
    color: '#10B981',
    ...tw('#10B981'),
    description: 'Industrial training / internship — not scheduled by CSP.',
  },
  VALUE_ADDED: {
    label: 'Value Added',
    color: '#059669',
    ...tw('#059669'),
    description: 'Value-added course — not scheduled by CSP.',
  },
  OTHER: {
    label: 'Other',
    color: '#94A3B8',
    ...tw('#94A3B8'),
    description: 'Unclassified subject.',
  },
}

export const DELIVERY_TYPE_CONFIG: Record<SubjectDeliveryType, DeliveryTypeEntry> = {
  THEORY: {
    label: 'Theory',
    color: '#64748B',
    ...tw('#64748B'),
    description: 'Theory-only delivery (lecture periods).',
  },
  INTEGRATED: {
    label: 'Integrated',
    color: '#F59E0B',
    ...tw('#F59E0B'),
    description: 'Subject with both theory and laboratory components.',
  },
  LAB: {
    label: 'Lab',
    color: '#16A34A',
    ...tw('#16A34A'),
    description: 'Practical/laboratory-only delivery.',
  },
  PROJECT: {
    label: 'Project',
    color: '#8B5CF6',
    ...tw('#8B5CF6'),
    description: 'Project-style delivery (Mini Project / Project Work).',
  },
}

/** All valid SubjectCategory values as an ordered array */
export const ALL_SUBJECT_CATEGORIES: SubjectCategory[] = Object.keys(CURRICULUM_CATEGORY_CONFIG) as SubjectCategory[]

/** All valid SubjectDeliveryType values as an ordered array */
export const ALL_DELIVERY_TYPES: SubjectDeliveryType[] = Object.keys(DELIVERY_TYPE_CONFIG) as SubjectDeliveryType[]

/** Get display label for a curriculum category */
export function getSubjectCategoryLabel(category: string): string {
  return CURRICULUM_CATEGORY_CONFIG[category as SubjectCategory]?.label ?? category
}

/** Get color for a curriculum category */
export function getSubjectCategoryColor(category: string): string {
  return CURRICULUM_CATEGORY_CONFIG[category as SubjectCategory]?.color ?? '#94A3B8'
}

/** Get Tailwind badge classes for a curriculum category */
export function getSubjectCategoryBadgeClasses(category: string): { bg: string; text: string } {
  const entry = CURRICULUM_CATEGORY_CONFIG[category as SubjectCategory]
  return entry ? { bg: entry.bgClass, text: entry.textClass } : { bg: 'bg-slate-100', text: 'text-slate-600' }
}

/** Get display label for a delivery type */
export function getDeliveryTypeLabel(deliveryType: string): string {
  return DELIVERY_TYPE_CONFIG[deliveryType as SubjectDeliveryType]?.label ?? deliveryType
}

/** Get color for a delivery type */
export function getDeliveryTypeColor(deliveryType: string): string {
  return DELIVERY_TYPE_CONFIG[deliveryType as SubjectDeliveryType]?.color ?? '#94A3B8'
}

/** Get Tailwind badge classes for a delivery type */
export function getDeliveryTypeBadgeClasses(deliveryType: string): { bg: string; text: string } {
  const entry = DELIVERY_TYPE_CONFIG[deliveryType as SubjectDeliveryType]
  return entry ? { bg: entry.bgClass, text: entry.textClass } : { bg: 'bg-slate-100', text: 'text-slate-600' }
}
