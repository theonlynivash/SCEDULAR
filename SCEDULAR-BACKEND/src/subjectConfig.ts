// Centralized curriculum configuration.
// Two independent axes:
//   1. CURRICULUM_CATEGORY — canonical SubjectCategory enum
//      (CORE, BASIC_SCIENCE, ENGINEERING_SCIENCE, HUMANITIES, INTEGRATED,
//       THEORY, LAB_ONLY, MANDATORY, ADDITIONAL, PROFESSIONAL_ELECTIVE,
//       OPEN_ELECTIVE, PROJECT, TRAINING, VALUE_ADDED, OTHER).
//   2. DELIVERY_TYPE — how a subject is taught (THEORY, INTEGRATED, LAB, PROJECT).
// Category and delivery type are independent; never derive one from the other.
//
// This is the SINGLE source of truth — do not hardcode colors or labels elsewhere.

import type { SubjectCategory, SubjectDeliveryType } from './types.js'

// ---------------------------------------------------------------------------
// Curriculum category configuration
// ---------------------------------------------------------------------------

export interface CurriculumCategoryEntry {
  label: string
  color: string
  /** Whether this category is treated as a theory-style scheduling block */
  schedulesAsTheory: boolean
  /** Whether this category is treated as a lab-style scheduling block */
  schedulesAsLab: boolean
  /** Short description for UI tooltips / help text */
  description: string
}

export const CURRICULUM_CATEGORY_CONFIG: Record<SubjectCategory, CurriculumCategoryEntry> = {
  CORE: {
    label: 'Core',
    color: '#7C3AED',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Regular department professional/core academic subjects.',
  },
  BASIC_SCIENCE: {
    label: 'Basic Science',
    color: '#2563EB',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Mathematics/science foundation subjects.',
  },
  ENGINEERING_SCIENCE: {
    label: 'Engineering Science',
    color: '#EA580C',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Engineering foundation subjects.',
  },
  HUMANITIES: {
    label: 'Humanities',
    color: '#DB2777',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Humanities/language/social-science curriculum components.',
  },
  INTEGRATED: {
    label: 'Integrated',
    color: '#F59E0B',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Integrated theory+lab subject.',
  },
  THEORY: {
    label: 'Theory',
    color: '#64748B',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Theory-only subject.',
  },
  LAB_ONLY: {
    label: 'Lab Only',
    color: '#0F766E',
    schedulesAsTheory: false,
    schedulesAsLab: true,
    description: 'Practical/laboratory-only subject.',
  },
  MANDATORY: {
    label: 'Mandatory',
    color: '#DC2626',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'University-assigned mandatory course (23MC1001–23MC1008). NOT a normal Theory subject.',
  },
  ADDITIONAL: {
    label: 'Additional',
    color: '#CA8A04',
    schedulesAsTheory: false,
    schedulesAsLab: false,
    description: 'Employability/skill-development/value-added courses — not scheduled by CSP.',
  },
  PROFESSIONAL_ELECTIVE: {
    label: 'Professional Elective',
    color: '#4F46E5',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Student-selected professional elective.',
  },
  OPEN_ELECTIVE: {
    label: 'Open Elective',
    color: '#0891B2',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Student-selected open elective.',
  },
  PROJECT: {
    label: 'Project',
    color: '#9333EA',
    schedulesAsTheory: false,
    schedulesAsLab: false,
    description: 'Mini Project / Project Work — not scheduled by CSP.',
  },
  TRAINING: {
    label: 'Training',
    color: '#10B981',
    schedulesAsTheory: false,
    schedulesAsLab: false,
    description: 'Industrial training / internship — not scheduled by CSP.',
  },
  VALUE_ADDED: {
    label: 'Value Added',
    color: '#059669',
    schedulesAsTheory: false,
    schedulesAsLab: false,
    description: 'Value-added course — not scheduled by CSP.',
  },
  OTHER: {
    label: 'Other',
    color: '#94A3B8',
    schedulesAsTheory: true,
    schedulesAsLab: false,
    description: 'Unclassified subject.',
  },
}

/** All valid SubjectCategory values as an array */
export const ALL_SUBJECT_CATEGORIES: SubjectCategory[] = Object.keys(CURRICULUM_CATEGORY_CONFIG) as SubjectCategory[]

/** Get display label for a curriculum category */
export function getSubjectCategoryLabel(category: string): string {
  return CURRICULUM_CATEGORY_CONFIG[category as SubjectCategory]?.label ?? category
}

/** Get color for a curriculum category */
export function getSubjectCategoryColor(category: string): string {
  return CURRICULUM_CATEGORY_CONFIG[category as SubjectCategory]?.color ?? '#94A3B8'
}

// ---------------------------------------------------------------------------
// Delivery type configuration
// ---------------------------------------------------------------------------

export interface DeliveryTypeEntry {
  label: string
  color: string
  /** Short description for UI tooltips / help text */
  description: string
}

export const DELIVERY_TYPE_CONFIG: Record<SubjectDeliveryType, DeliveryTypeEntry> = {
  THEORY: {
    label: 'Theory',
    color: '#64748B',
    description: 'Theory-only delivery (lecture periods).',
  },
  INTEGRATED: {
    label: 'Integrated',
    color: '#F59E0B',
    description: 'Subject with both theory and laboratory components.',
  },
  LAB: {
    label: 'Lab',
    color: '#16A34A',
    description: 'Practical/laboratory-only delivery.',
  },
  PROJECT: {
    label: 'Project',
    color: '#8B5CF6',
    description: 'Project-style delivery (Mini Project / Project Work).',
  },
}

/** All valid SubjectDeliveryType values as an array */
export const ALL_DELIVERY_TYPES: SubjectDeliveryType[] = Object.keys(DELIVERY_TYPE_CONFIG) as SubjectDeliveryType[]

/** Get display label for a delivery type */
export function getDeliveryTypeLabel(deliveryType: string): string {
  return DELIVERY_TYPE_CONFIG[deliveryType as SubjectDeliveryType]?.label ?? deliveryType
}

/** Get color for a delivery type */
export function getDeliveryTypeColor(deliveryType: string): string {
  return DELIVERY_TYPE_CONFIG[deliveryType as SubjectDeliveryType]?.color ?? '#94A3B8'
}

// ---------------------------------------------------------------------------
// Legacy helpers
// ---------------------------------------------------------------------------

/**
 * Derive the legacy ComponentType (course-type enum) from a Subject's
 * category and deliveryType.  MANDATORY/ADDITIONAL get their own
 * ComponentType values; everything else maps via delivery type alone.
 */
export function deriveComponentType(category: string, deliveryType: string): string {
  if (category === 'MANDATORY') return 'MANDATORY'
  if (category === 'ADDITIONAL') return 'ADDITIONAL'
  if (deliveryType === 'INTEGRATED') return 'INTEGRATED_THEORY'
  if (deliveryType === 'LAB') return 'LAB_ONLY'
  if (deliveryType === 'PROJECT') return 'PROJECT'
  return 'THEORY_ONLY'
}

/**
 * Whether a subject category should be scheduled by the CSP solver.
 * PROJECT, ADDITIONAL, TRAINING, VALUE_ADDED are non-schedulable.
 */
export function isSchedulableCategory(category: string): boolean {
  const nonSchedulable = new Set(['PROJECT', 'ADDITIONAL', 'TRAINING', 'VALUE_ADDED'])
  return !nonSchedulable.has(category)
}
