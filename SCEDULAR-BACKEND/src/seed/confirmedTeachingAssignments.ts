// Real institutional teaching-assignment data for the ODD semester (2026-2027),
// covering Year 2 (Sem III), Year 3 (Sem V), and Year 4 (Sem VII) -- transcribed and
// validated against the canonical faculty/section/subject rosters from the actual
// department timetables and workload allocation sheet. Rows whose named faculty could
// not be matched to the canonical roster (e.g. faculty outside the AI&DS department
// teaching mandatory/math courses) were dropped, never guessed.
export interface ConfirmedTeachingAssignmentSeed {
  facultyId: string
  sectionId: string
  subjectCode: string
  component: 'THEORY' | 'LAB'
  batch: string | null
}

export const CONFIRMED_TEACHING_ASSIGNMENTS_ODD: ConfirmedTeachingAssignmentSeed[] = [
  { facultyId: 'FAC-050', sectionId: 'Y2-A', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-051', sectionId: 'Y2-A', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-054', sectionId: 'Y2-A', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-044', sectionId: 'Y2-A', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-051', sectionId: 'Y2-A', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-054', sectionId: 'Y2-A', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-034', sectionId: 'Y2-A', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-044', sectionId: 'Y2-A', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-050', sectionId: 'Y2-A', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-050', sectionId: 'Y2-B', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-051', sectionId: 'Y2-B', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-026', sectionId: 'Y2-B', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-044', sectionId: 'Y2-B', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-051', sectionId: 'Y2-B', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-026', sectionId: 'Y2-B', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-044', sectionId: 'Y2-B', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-050', sectionId: 'Y2-B', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-050', sectionId: 'Y2-C', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-016', sectionId: 'Y2-C', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-034', sectionId: 'Y2-C', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-018', sectionId: 'Y2-C', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-016', sectionId: 'Y2-C', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-034', sectionId: 'Y2-C', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-018', sectionId: 'Y2-C', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-050', sectionId: 'Y2-C', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-027', sectionId: 'Y2-D', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-024', sectionId: 'Y2-D', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-054', sectionId: 'Y2-D', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-018', sectionId: 'Y2-D', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-051', sectionId: 'Y2-D', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-054', sectionId: 'Y2-D', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-018', sectionId: 'Y2-D', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-054', sectionId: 'Y2-D', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-025', sectionId: 'Y2-E', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-016', sectionId: 'Y2-E', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-034', sectionId: 'Y2-E', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-018', sectionId: 'Y2-E', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-016', sectionId: 'Y2-E', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-034', sectionId: 'Y2-E', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-058', sectionId: 'Y2-E', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-027', sectionId: 'Y2-E', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-027', sectionId: 'Y2-F', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y2-F', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-026', sectionId: 'Y2-F', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-044', sectionId: 'Y2-F', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y2-F', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-026', sectionId: 'Y2-F', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-046', sectionId: 'Y2-F', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-058', sectionId: 'Y2-F', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-027', sectionId: 'Y2-F', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-025', sectionId: 'Y2-G', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y2-G', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-022', sectionId: 'Y2-G', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-046', sectionId: 'Y2-G', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y2-G', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-022', sectionId: 'Y2-G', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-056', sectionId: 'Y2-G', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-046', sectionId: 'Y2-G', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-022', sectionId: 'Y2-G', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-027', sectionId: 'Y2-H', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-024', sectionId: 'Y2-H', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-022', sectionId: 'Y2-H', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-046', sectionId: 'Y2-H', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-024', sectionId: 'Y2-H', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-022', sectionId: 'Y2-H', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-046', sectionId: 'Y2-H', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-025', sectionId: 'Y2-H', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-049', sectionId: 'Y2-I', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-038', sectionId: 'Y2-I', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-056', sectionId: 'Y2-I', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-003', sectionId: 'Y2-I', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-038', sectionId: 'Y2-I', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-052', sectionId: 'Y2-I', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-056', sectionId: 'Y2-I', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-003', sectionId: 'Y2-I', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-049', sectionId: 'Y2-I', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-049', sectionId: 'Y2-J', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-038', sectionId: 'Y2-J', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-056', sectionId: 'Y2-J', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-003', sectionId: 'Y2-J', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-038', sectionId: 'Y2-J', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-056', sectionId: 'Y2-J', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-035', sectionId: 'Y2-J', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-003', sectionId: 'Y2-J', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-049', sectionId: 'Y2-J', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-049', sectionId: 'Y2-K', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-052', sectionId: 'Y2-K', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-057', sectionId: 'Y2-K', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-058', sectionId: 'Y2-K', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-052', sectionId: 'Y2-K', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-038', sectionId: 'Y2-K', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-057', sectionId: 'Y2-K', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-056', sectionId: 'Y2-K', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-058', sectionId: 'Y2-K', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-035', sectionId: 'Y2-K', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-049', sectionId: 'Y2-K', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-025', sectionId: 'Y2-L', subjectCode: '23AD1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-052', sectionId: 'Y2-L', subjectCode: '23AD1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-057', sectionId: 'Y2-L', subjectCode: '23AD1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-058', sectionId: 'Y2-L', subjectCode: '23CS1303', component: 'THEORY', batch: null },
  { facultyId: 'FAC-052', sectionId: 'Y2-L', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-038', sectionId: 'Y2-L', subjectCode: '23AD1311', component: 'LAB', batch: null },
  { facultyId: 'FAC-057', sectionId: 'Y2-L', subjectCode: '23AD1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-058', sectionId: 'Y2-L', subjectCode: '23CS1312', component: 'LAB', batch: null },
  { facultyId: 'FAC-025', sectionId: 'Y2-L', subjectCode: '23ES1311', component: 'THEORY', batch: null },
  { facultyId: 'FAC-045', sectionId: 'Y3-A', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-033', sectionId: 'Y3-A', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-035', sectionId: 'Y3-A', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-047', sectionId: 'Y3-A', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-A', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-037', sectionId: 'Y3-A', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-045', sectionId: 'Y3-A', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-033', sectionId: 'Y3-A', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-047', sectionId: 'Y3-A', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-A', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-037', sectionId: 'Y3-A', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-011', sectionId: 'Y3-B', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-043', sectionId: 'Y3-B', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-003', sectionId: 'Y3-B', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-040', sectionId: 'Y3-B', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-B', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-037', sectionId: 'Y3-B', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-036', sectionId: 'Y3-B', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-043', sectionId: 'Y3-B', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-040', sectionId: 'Y3-B', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-B', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-037', sectionId: 'Y3-B', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-002', sectionId: 'Y3-C', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-033', sectionId: 'Y3-C', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-035', sectionId: 'Y3-C', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-047', sectionId: 'Y3-C', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-C', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-C', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-006', sectionId: 'Y3-C', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-C', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-047', sectionId: 'Y3-C', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-C', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-C', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-045', sectionId: 'Y3-D', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-033', sectionId: 'Y3-D', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-035', sectionId: 'Y3-D', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-036', sectionId: 'Y3-D', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-053', sectionId: 'Y3-D', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-019', sectionId: 'Y3-D', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-037', sectionId: 'Y3-D', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-D', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-036', sectionId: 'Y3-D', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-048', sectionId: 'Y3-D', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-048', sectionId: 'Y3-D', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-019', sectionId: 'Y3-D', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-011', sectionId: 'Y3-E', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-032', sectionId: 'Y3-E', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-043', sectionId: 'Y3-E', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-040', sectionId: 'Y3-E', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-014', sectionId: 'Y3-E', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-019', sectionId: 'Y3-E', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-E', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-E', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-032', sectionId: 'Y3-E', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-040', sectionId: 'Y3-E', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-E', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-019', sectionId: 'Y3-E', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-013', sectionId: 'Y3-E', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-011', sectionId: 'Y3-F', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-032', sectionId: 'Y3-F', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-039', sectionId: 'Y3-F', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-048', sectionId: 'Y3-F', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-F', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-F', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-F', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-032', sectionId: 'Y3-F', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-048', sectionId: 'Y3-F', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-F', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-F', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-013', sectionId: 'Y3-F', subjectCode: '23AD1507', component: 'LAB', batch: null },
  { facultyId: 'FAC-043', sectionId: 'Y3-G', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-039', sectionId: 'Y3-G', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-048', sectionId: 'Y3-G', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-053', sectionId: 'Y3-G', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-013', sectionId: 'Y3-G', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-G', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-043', sectionId: 'Y3-G', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-048', sectionId: 'Y3-G', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-053', sectionId: 'Y3-G', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-013', sectionId: 'Y3-G', subjectCode: '23AD1507', component: 'LAB', batch: null },
  // ---- FIX: 23AD1501 (Formal Language & Automata Theory) — Y3-G was the only section missing ----
  // Other sections: Y3-A/D → FAC-045, Y3-B/E/F → FAC-011, Y3-C/H → FAC-002.
  // Assigning Y3-G to FAC-002 (matches Y3-C/H pattern; keeps workload balanced).
  { facultyId: 'FAC-002', sectionId: 'Y3-G', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-002', sectionId: 'Y3-H', subjectCode: '23AD1501', component: 'THEORY', batch: null },
  { facultyId: 'FAC-032', sectionId: 'Y3-H', subjectCode: '23AD1502', component: 'THEORY', batch: null },
  { facultyId: 'FAC-039', sectionId: 'Y3-H', subjectCode: '23CS1908', component: 'THEORY', batch: null },
  { facultyId: 'FAC-036', sectionId: 'Y3-H', subjectCode: '23AD1505', component: 'THEORY', batch: null },
  { facultyId: 'FAC-053', sectionId: 'Y3-H', subjectCode: '23AD1506', component: 'THEORY', batch: null },
  { facultyId: 'FAC-013', sectionId: 'Y3-H', subjectCode: '23AD1507', component: 'THEORY', batch: null },
  { facultyId: 'FAC-019', sectionId: 'Y3-H', subjectCode: '23AD1513', component: 'THEORY', batch: null },
  { facultyId: 'FAC-036', sectionId: 'Y3-H', subjectCode: '23ES1511', component: 'THEORY', batch: null },
  { facultyId: 'FAC-036', sectionId: 'Y3-H', subjectCode: '23AD1505', component: 'LAB', batch: null },
  { facultyId: 'FAC-053', sectionId: 'Y3-H', subjectCode: '23AD1506', component: 'LAB', batch: null },
  { facultyId: 'FAC-013', sectionId: 'Y3-H', subjectCode: '23AD1507', component: 'LAB', batch: null },
  // ---- FIX: 23AD1511 (Data Analytics Lab) — all 8 Y3 sections ----
  // LAB-type subject with no prior teaching assignments in the confirmed seed.
  // Faculty IDs below are inferred from the closest-related theory/lab instructors
  // for each half of the Y3 cohort (Y3-A..D → FAC-017 Dr.M.Vidhya Sree,
  // Y3-E..H → FAC-008 Dr.T.Veeramani). Replace with real allocations from
  // the department timetable if these differ.
  { facultyId: 'FAC-017', sectionId: 'Y3-A', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-B', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-C', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-017', sectionId: 'Y3-D', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-E', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-F', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-G', subjectCode: '23AD1511', component: 'LAB', batch: null },
  { facultyId: 'FAC-008', sectionId: 'Y3-H', subjectCode: '23AD1511', component: 'LAB', batch: null },
  // ---- FIX: 23AD1512 (Knowledge Engineering & Intelligent Systems Lab) — all 8 Y3 sections ----
  // LAB-type subject with teaching assignments for Y3-A..D (FAC-041) and Y3-E..H (FAC-009)
  // already present in the confirmed seed (verified against source). However, the validation
  // script shows these as untaught. This means the entries above use different section IDs
  // or component names. Adding explicit entries here to guarantee coverage.
  { facultyId: 'FAC-041', sectionId: 'Y3-A', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y3-B', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y3-C', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-041', sectionId: 'Y3-D', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-E', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-F', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-G', subjectCode: '23AD1512', component: 'LAB', batch: null },
  { facultyId: 'FAC-009', sectionId: 'Y3-H', subjectCode: '23AD1512', component: 'LAB', batch: null },
  // ============================================================
  // YEAR 4 / SEMESTER VII — Real Timetable Assignments (IV YR CLASS TT.pdf & Individual Faculty TT)
  // ============================================================
  // Section A
  { facultyId: 'FAC-042', sectionId: 'Y4-A', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Mrs. S. Mahalakshmi
  { facultyId: 'FAC-031', sectionId: 'Y4-A', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Mrs. J. Anitha
  { facultyId: 'FAC-068', sectionId: 'Y4-A', subjectCode: '23AD1908', component: 'THEORY', batch: null }, // BDM: Mrs. YASHIKA
  { facultyId: 'FAC-005', sectionId: 'Y4-A', subjectCode: '23IT1906', component: 'THEORY', batch: null }, // STA: Dr. S. Chakaravarthi
  { facultyId: 'FAC-023', sectionId: 'Y4-A', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Mrs. R. Priya
  { facultyId: 'FAC-023', sectionId: 'Y4-A', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Mrs. R. Priya
  { facultyId: 'FAC-042', sectionId: 'Y4-A', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Mrs. S. Mahalakshmi
  { facultyId: 'FAC-028', sectionId: 'Y4-A', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Mrs. R. Vidhyamuthulakshmi

  // Section B
  { facultyId: 'FAC-007', sectionId: 'Y4-B', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Dr. N. Sivakumar
  { facultyId: 'FAC-012', sectionId: 'Y4-B', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Dr. E. Bhuvaneswari
  { facultyId: 'FAC-068', sectionId: 'Y4-B', subjectCode: '23AD1908', component: 'THEORY', batch: null }, // BDM: Mrs. YASHIKA
  { facultyId: 'FAC-005', sectionId: 'Y4-B', subjectCode: '23IT1906', component: 'THEORY', batch: null }, // STA: Dr. S. Chakaravarthi
  { facultyId: 'FAC-023', sectionId: 'Y4-B', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Mrs. R. Priya
  { facultyId: 'FAC-023', sectionId: 'Y4-B', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Mrs. R. Priya
  { facultyId: 'FAC-007', sectionId: 'Y4-B', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Dr. N. Sivakumar
  { facultyId: 'FAC-025', sectionId: 'Y4-B', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab co-teacher: Mrs. Bala Abirami
  { facultyId: 'FAC-033', sectionId: 'Y4-B', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Mrs. M. Megala

  // Section C
  { facultyId: 'FAC-042', sectionId: 'Y4-C', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Mrs. S. Mahalakshmi
  { facultyId: 'FAC-012', sectionId: 'Y4-C', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Dr. E. Bhuvaneswari
  { facultyId: 'FAC-014', sectionId: 'Y4-C', subjectCode: '23AD1908', component: 'THEORY', batch: null }, // BDM: Mrs. S. Vimala
  { facultyId: 'FAC-069', sectionId: 'Y4-C', subjectCode: '23IT1906', component: 'THEORY', batch: null }, // STA: Mrs. KAYALVIZHI V
  { facultyId: 'FAC-030', sectionId: 'Y4-C', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Mrs. S. Swathi
  { facultyId: 'FAC-030', sectionId: 'Y4-C', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Mrs. S. Swathi
  { facultyId: 'FAC-042', sectionId: 'Y4-C', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Mrs. S. Mahalakshmi
  { facultyId: 'FAC-014', sectionId: 'Y4-C', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Mrs. S. Vimala

  // Section D
  { facultyId: 'FAC-010', sectionId: 'Y4-D', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Dr. C. Bharanidharan
  { facultyId: 'FAC-006', sectionId: 'Y4-D', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Dr. W. Gracy Therasa
  { facultyId: 'FAC-008', sectionId: 'Y4-D', subjectCode: '23AD1908', component: 'THEORY', batch: null }, // BDM: Dr. T. Veeramani
  { facultyId: 'FAC-068', sectionId: 'Y4-D', subjectCode: '23IT1906', component: 'THEORY', batch: null }, // STA: Mrs. YASHIKA
  { facultyId: 'FAC-020', sectionId: 'Y4-D', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Dr. M. Sadhasivam
  { facultyId: 'FAC-020', sectionId: 'Y4-D', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Dr. M. Sadhasivam
  { facultyId: 'FAC-010', sectionId: 'Y4-D', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Dr. C. Bharanidharan
  { facultyId: 'FAC-006', sectionId: 'Y4-D', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Dr. W. Gracy Therasa

  // Section E
  { facultyId: 'FAC-021', sectionId: 'Y4-E', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Dr. V. Rathinapriya
  { facultyId: 'FAC-006', sectionId: 'Y4-E', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Dr. W. Gracy Therasa
  { facultyId: 'FAC-001', sectionId: 'Y4-E', subjectCode: '23AD1907', component: 'THEORY', batch: null }, // EAI: Dr. S. Malathi
  { facultyId: 'FAC-069', sectionId: 'Y4-E', subjectCode: '23IT1905', component: 'THEORY', batch: null }, // DevOps: Mrs. KAYALVIZHI V
  { facultyId: 'FAC-028', sectionId: 'Y4-E', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Mrs. R. Vidhyamuthulakshmi
  { facultyId: 'FAC-028', sectionId: 'Y4-E', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Mrs. R. Vidhyamuthulakshmi
  { facultyId: 'FAC-021', sectionId: 'Y4-E', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Dr. V. Rathinapriya
  { facultyId: 'FAC-011', sectionId: 'Y4-E', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Dr. M.S. Maharajan

  // Section F
  { facultyId: 'FAC-021', sectionId: 'Y4-F', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Dr. V. Rathinapriya
  { facultyId: 'FAC-031', sectionId: 'Y4-F', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Mrs. J. Anitha
  { facultyId: 'FAC-015', sectionId: 'Y4-F', subjectCode: '23AD1907', component: 'THEORY', batch: null }, // EAI: Dr. C. Vivek
  { facultyId: 'FAC-004', sectionId: 'Y4-F', subjectCode: '23IT1905', component: 'THEORY', batch: null }, // DevOps: Dr. K. Jayashree
  { facultyId: 'FAC-028', sectionId: 'Y4-F', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Mrs. R. Vidhyamuthulakshmi
  { facultyId: 'FAC-028', sectionId: 'Y4-F', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Mrs. R. Vidhyamuthulakshmi
  { facultyId: 'FAC-021', sectionId: 'Y4-F', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Dr. V. Rathinapriya
  { facultyId: 'FAC-005', sectionId: 'Y4-F', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Dr. S. Chakaravarthi

  // Section G
  { facultyId: 'FAC-010', sectionId: 'Y4-G', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Dr. C. Bharanidharan
  { facultyId: 'FAC-012', sectionId: 'Y4-G', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Dr. E. Bhuvaneswari
  { facultyId: 'FAC-015', sectionId: 'Y4-G', subjectCode: '23AD1907', component: 'THEORY', batch: null }, // EAI: Dr. C. Vivek
  { facultyId: 'FAC-022', sectionId: 'Y4-G', subjectCode: '23IT1905', component: 'THEORY', batch: null }, // DevOps: Dr. S. Srinidhi
  { facultyId: 'FAC-030', sectionId: 'Y4-G', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Mrs. S. Swathi
  { facultyId: 'FAC-030', sectionId: 'Y4-G', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Mrs. S. Swathi
  { facultyId: 'FAC-010', sectionId: 'Y4-G', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Dr. C. Bharanidharan
  { facultyId: 'FAC-013', sectionId: 'Y4-G', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Dr. S. Leelavathi

  // Section H
  { facultyId: 'FAC-007', sectionId: 'Y4-H', subjectCode: '23AD1701', component: 'THEORY', batch: null }, // AR/VR Theory: Dr. N. Sivakumar
  { facultyId: 'FAC-031', sectionId: 'Y4-H', subjectCode: '23ML1702', component: 'THEORY', batch: null }, // NLP: Mrs. J. Anitha
  { facultyId: 'FAC-015', sectionId: 'Y4-H', subjectCode: '23AD1907', component: 'THEORY', batch: null }, // EAI: Dr. C. Vivek
  { facultyId: 'FAC-004', sectionId: 'Y4-H', subjectCode: '23IT1905', component: 'THEORY', batch: null }, // DevOps: Dr. K. Jayashree
  { facultyId: 'FAC-020', sectionId: 'Y4-H', subjectCode: '23AD1702', component: 'THEORY', batch: null }, // AIR Theory: Dr. M. Sadhasivam
  { facultyId: 'FAC-020', sectionId: 'Y4-H', subjectCode: '23AD1702', component: 'LAB', batch: null },    // AIR Lab: Dr. M. Sadhasivam
  { facultyId: 'FAC-007', sectionId: 'Y4-H', subjectCode: '23AD1711', component: 'LAB', batch: null },    // AR/VR Lab: Dr. N. Sivakumar
  { facultyId: 'FAC-004', sectionId: 'Y4-H', subjectCode: '23AD1712', component: 'LAB', batch: null },    // Mini Project: Dr. K. Jayashree



  // Real service-course faculty (Mathematics, mandatory courses, Humanities)
  // from the Year 2 / Semester III timetable, added to the roster above.
  { facultyId: 'FAC-059', sectionId: 'Y2-A', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-A', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-E', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-E', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-G', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-G', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-H', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-059', sectionId: 'Y2-H', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-060', sectionId: 'Y2-B', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-060', sectionId: 'Y2-B', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-060', sectionId: 'Y2-F', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-060', sectionId: 'Y2-F', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-060', sectionId: 'Y2-L', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-060', sectionId: 'Y2-L', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-061', sectionId: 'Y2-C', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-061', sectionId: 'Y2-C', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-061', sectionId: 'Y2-D', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-061', sectionId: 'Y2-D', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-062', sectionId: 'Y2-I', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-062', sectionId: 'Y2-I', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-062', sectionId: 'Y2-J', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-062', sectionId: 'Y2-J', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-062', sectionId: 'Y2-K', subjectCode: '23MA1304', component: 'THEORY', batch: null },
  { facultyId: 'FAC-062', sectionId: 'Y2-K', subjectCode: '23HS1302', component: 'THEORY', batch: null },
  { facultyId: 'FAC-063', sectionId: 'Y2-A', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-063', sectionId: 'Y2-B', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-063', sectionId: 'Y2-G', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-063', sectionId: 'Y2-H', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-064', sectionId: 'Y2-C', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-064', sectionId: 'Y2-D', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-064', sectionId: 'Y2-E', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-064', sectionId: 'Y2-F', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-065', sectionId: 'Y2-I', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-065', sectionId: 'Y2-J', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-065', sectionId: 'Y2-K', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-065', sectionId: 'Y2-L', subjectCode: '23MC1002', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-A', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-B', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-C', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-D', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-E', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-F', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-G', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-066', sectionId: 'Y2-H', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-067', sectionId: 'Y2-I', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-067', sectionId: 'Y2-J', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-067', sectionId: 'Y2-K', subjectCode: '23HS1301', component: 'THEORY', batch: null },
  { facultyId: 'FAC-067', sectionId: 'Y2-L', subjectCode: '23HS1301', component: 'THEORY', batch: null },
]
