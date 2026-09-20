export interface SeedSection {
  id: string
  name: string
  year: string // 'Year 1' | 'Year 2' | 'Year 3' | 'Year 4'
  semester: string // default odd sem 'I' | 'III' | 'V' | 'VII'
  department: string
  studentCount: number | null
  active: boolean
}

export interface SeedLab {
  id: string
  name: string
  room: string
  department: string
  capacity: number | null
  capacitySource: 'OFFICIAL' | 'INFERRED' | 'NOT_SPECIFIED'
  active: boolean
  notes?: string
}

export interface SeedLabMapping {
  sectionId: string
  subjectCode: string
  labId: string
}

// Year 2 (Y2-A to Y2-L: 12 sections), Year 3 (Y3-A to Y3-H: 8 sections), Year 4 (Y4-A to Y4-H: 8 sections)
export const KNOWN_SECTIONS_ROSTER: SeedSection[] = [
  // Year 2 (Sem III)
  { id: 'Y2-A', name: 'II Year AI&DS A', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-B', name: 'II Year AI&DS B', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-C', name: 'II Year AI&DS C', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-D', name: 'II Year AI&DS D', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-E', name: 'II Year AI&DS E', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-F', name: 'II Year AI&DS F', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-G', name: 'II Year AI&DS G', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-H', name: 'II Year AI&DS H', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-I', name: 'II Year AI&DS I', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-J', name: 'II Year AI&DS J', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-K', name: 'II Year AI&DS K', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y2-L', name: 'II Year AI&DS L', year: 'Year 2', semester: 'III', department: 'AI & DS', studentCount: null, active: true },

  // Year 3 (Sem V)
  { id: 'Y3-A', name: 'III Year AI&DS A', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-B', name: 'III Year AI&DS B', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-C', name: 'III Year AI&DS C', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-D', name: 'III Year AI&DS D', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-E', name: 'III Year AI&DS E', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-F', name: 'III Year AI&DS F', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-G', name: 'III Year AI&DS G', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y3-H', name: 'III Year AI&DS H', year: 'Year 3', semester: 'V', department: 'AI & DS', studentCount: null, active: true },

  // Year 4 (Sem VII)
  { id: 'Y4-A', name: 'IV Year AI&DS A', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-B', name: 'IV Year AI&DS B', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-C', name: 'IV Year AI&DS C', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-D', name: 'IV Year AI&DS D', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-E', name: 'IV Year AI&DS E', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-F', name: 'IV Year AI&DS F', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-G', name: 'IV Year AI&DS G', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
  { id: 'Y4-H', name: 'IV Year AI&DS H', year: 'Year 4', semester: 'VII', department: 'AI & DS', studentCount: null, active: true },
]

// Known Physical Labs from Lab Timetable
export const KNOWN_LABS_ROSTER: SeedLab[] = [
  { id: 'CC15', name: 'Computer Centre 15', room: 'CC15', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Department Computer Centre' },
  { id: 'CC16', name: 'Computer Centre 16', room: 'CC16', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Department Computer Centre' },
  { id: 'CC17', name: 'Computer Centre 17 / AI Lab', room: 'CC17', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Primary AI/ML Laboratory' },
  { id: 'CC18', name: 'Computer Centre 18', room: 'CC18', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Department Computer Centre' },
  { id: 'CC19', name: 'Computer Centre 19', room: 'CC19', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Department Computer Centre' },
  { id: 'CC23', name: 'Computer Centre 23', room: 'CC23', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Data Science Laboratory' },
  { id: 'CC24', name: 'Computer Centre 24', room: 'CC24', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Department Computer Centre' },
  { id: 'CC25', name: 'Computer Centre 25', room: 'CC25', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Department Computer Centre' },
  { id: 'CC43', name: 'Computer Centre 43', room: 'CC43', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Advanced Computing Lab' },
  { id: 'CC46', name: 'Computer Centre 46', room: 'CC46', department: 'AI & DS', capacity: null, capacitySource: 'NOT_SPECIFIED', active: true, notes: 'Advanced Computing Lab' },
]

export const KNOWN_LAB_MAPPINGS: SeedLabMapping[] = [
  { sectionId: 'Y2-A', subjectCode: '23AD1311', labId: 'CC17' },
  { sectionId: 'Y2-B', subjectCode: '23AD1311', labId: 'CC17' },
  { sectionId: 'Y2-C', subjectCode: '23AD1312', labId: 'CC16' },
  { sectionId: 'Y2-D', subjectCode: '23AD1312', labId: 'CC16' },
  { sectionId: 'Y2-E', subjectCode: '23CS1312', labId: 'CC15' },
  { sectionId: 'Y3-A', subjectCode: '23AD1511', labId: 'CC17' },
  { sectionId: 'Y3-B', subjectCode: '23AD1511', labId: 'CC17' },
  { sectionId: 'Y3-C', subjectCode: '23AD1512', labId: 'CC23' },
  { sectionId: 'Y4-A', subjectCode: '23ML1702', labId: 'CC43' },
  { sectionId: 'Y4-B', subjectCode: '23AD1704', labId: 'CC46' },
]
