"""
Rebuild Year 3 (Sem V) and Year 4 (Sem VII) section offerings + teachers from the
department's printed class timetables (data/pdf_source/*.json, extracted from
"III YEAR TT 29.6.26.pdf" and "IV YR CLASS TT.pdf"). Weekly periods are the printed
"HOURS ALLOCATED" per section, which is what fills each section to 40 periods.
Backs up the DB first. Run with the backend STOPPED:  python3 scripts/apply_pdf_timetables.py
"""
import json, sys, os, shutil, time, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pdf_match import match, split_staff

ROOT = os.path.dirname(HERE)
DBP = os.path.join(ROOT, 'data', 'scedular_local_db.json')
shutil.copy(DBP, DBP + f'.backup-{int(time.time())}')
D = json.load(open(DBP))
MANUAL = {'Mrs.R.VIDHYAMUTHU': 'FAC-028', 'New Faculty 1': 'FAC-045'}
unresolved = []

def fid(name):
    if name in MANUAL: return MANUAL[name]
    m, _ = match(name)
    if not m: unresolved.append(name)
    return m

# Year 3 sections E-H reuse code 23CS1908 in the printed TT for Full Stack (Quantum Computing elsewhere).
if 'SUB-23CS1908-FSD' not in {s['id'] for s in D['subjects']}:
    D['subjects'].append({'id': 'SUB-23CS1908-FSD', 'code': '23CS1908-FSD', 'name': 'Full Stack Web Development', 'credits': 3,
                          'deliveryType': 'THEORY', 'category': 'PROFESSIONAL CORE', 'year': 'Year 3', 'semester': 'V',
                          'theoryPeriods': 5, 'labPeriods': 0, 'vertical': None})
    D['courses'].append({'id': '23CS1908-FSD', 'code': '23CS1908-FSD', 'name': 'Full Stack Web Development', 'componentType': 'THEORY_ONLY', 'labBlockLength': 3})
sid_of = {s['code']: s['id'] for s in D['subjects']}

THEORY_LIKE_PRACTICAL = {'23AD1513', '23ES1511', '23ES1311'}  # printed under PRACTICALS but are 2-period classroom sessions
sources = [('V', 'Y3', 'data/pdf_source/year3_sem5_timetable.json'),
           ('VII', 'Y4', 'data/pdf_source/year4_sem7_timetable.json')]

sec_ids = {f'{p}-{c}' for _, p, _ in sources for c in 'ABCDEFGH'}
old_ss = {x['id'] for x in D['sectionSubjects'] if x['sectionId'] in sec_ids}
D['sectionSubjects'] = [x for x in D['sectionSubjects'] if x['id'] not in old_ss]
D['teachingAssignments'] = [t for t in D['teachingAssignments'] if t['sectionSubjectId'] not in old_ss]

new_master = {}
rows_added = 0
for sem, pre, path in sources:
    TT = json.load(open(os.path.join(ROOT, path)))
    for sec, v in TT.items():
        section_id = f'{pre}-{sec}'
        per = collections.OrderedDict()
        for r in v['theory']:
            code = r['code']
            if code == '23CS1908' and 'full stack' in r['title'].lower(): code = '23CS1908-FSD'
            per.setdefault(code, {'T': 0, 'L': 0, 'tstaff': [], 'lstaff': []})
            per[code]['T'] += r['hours'] or 0
            per[code]['tstaff'] = split_staff(r['staff'])
        for r in v['practical']:
            code = r['code']
            per.setdefault(code, {'T': 0, 'L': 0, 'tstaff': [], 'lstaff': []})
            if code in THEORY_LIKE_PRACTICAL:
                per[code]['T'] += r['hours'] or 0
                per[code]['tstaff'] = split_staff(r['staff'])
            else:
                per[code]['L'] += r['hours'] or 0
                per[code]['lstaff'] = split_staff(r['staff'])
        for code, p in per.items():
            ssid = D['nextSectionSubjectId']; D['nextSectionSubjectId'] += 1
            D['sectionSubjects'].append({'id': ssid, 'sectionId': section_id, 'subjectId': sid_of[code],
                                         'theoryPeriods': p['T'], 'labPeriods': p['L'], 'labBlockLength': (p['L'] or None)})
            rows_added += 1
            new_master[code] = ('INTEGRATED' if p['T'] and p['L'] else ('LAB' if p['L'] else 'THEORY'), p['T'], p['L'])
            def add(f, comp):
                if not f: return
                tid = D['nextTeachingAssignmentId']; D['nextTeachingAssignmentId'] += 1
                D['teachingAssignments'].append({'id': tid, 'facultyId': f, 'sectionSubjectId': ssid, 'component': comp, 'batch': None})
            if p['T'] and p['tstaff']: add(fid(p['tstaff'][0]), 'THEORY')   # one theory teacher per section
            for n in p['lstaff']: add(fid(n), 'LAB')                         # all lab co-teachers kept

for s in D['subjects']:
    if s['code'] in new_master:
        s['deliveryType'], s['theoryPeriods'], s['labPeriods'] = new_master[s['code']]
    if s['code'] == '23ES1311':   # Year 2 TSP: 2-period classroom session, as in the printed TT
        s['deliveryType'], s['theoryPeriods'], s['labPeriods'] = 'THEORY', 2, 0

# Curriculum courses that the printed timetables do not run this semester (not offered to any section).
PHANTOM = {'23AD1511', '23AD1512', '23AD1704', '23AD1705', '23HS1701', '23AD1703'}
phantom_ids = {s['id'] for s in D['subjects'] if s['code'] in PHANTOM}
D['subjects'] = [s for s in D['subjects'] if s['code'] not in PHANTOM]
D['courses'] = [c for c in D['courses'] if c['code'].split('_')[0] not in PHANTOM]
D['labMappings'] = [m for m in D['labMappings'] if m['subjectId'] not in phantom_ids]
D['facultyPreferences'] = [p for p in D['facultyPreferences'] if p['subjectId'] not in phantom_ids]

# Contiguous section-subject ids (the loader sets next id = row count + 1).
remap = {}
for i, x in enumerate(sorted(D['sectionSubjects'], key=lambda r: r['id']), 1):
    remap[x['id']] = i
for x in D['sectionSubjects']: x['id'] = remap[x['id']]
D['sectionSubjects'].sort(key=lambda r: r['id'])
for t in D['teachingAssignments']: t['sectionSubjectId'] = remap[t['sectionSubjectId']]
for i, t in enumerate(sorted(D['teachingAssignments'], key=lambda r: r['id']), 1): t['id'] = i
D['teachingAssignments'].sort(key=lambda r: r['id'])
D['nextSectionSubjectId'] = len(D['sectionSubjects']) + 1
D['nextTeachingAssignmentId'] = len(D['teachingAssignments']) + 1

# What the curriculum roster must say so the startup sync keeps these values.
overrides = {c: {'deliveryType': v[0], 'theoryPeriods': v[1], 'labPeriods': v[2]} for c, v in new_master.items()}
overrides['23ES1311'] = {'deliveryType': 'THEORY', 'theoryPeriods': 2, 'labPeriods': 0}
json.dump({'overrides': overrides, 'remove': sorted(PHANTOM)}, open(os.path.join(ROOT, 'data', 'pdf_source', 'subject_overrides.json'), 'w'), indent=1)

live = {(x['subjectId'], x['sectionId']) for x in D['sectionSubjects'] if x['labPeriods'] > 0}
D['labMappings'] = [m for m in D['labMappings'] if m['sectionId'] not in sec_ids or (m['subjectId'], m['sectionId']) in live]

json.dump(D, open(DBP, 'w'), indent=2)
have = {(m['subjectId'], m['sectionId']) for m in D['labMappings']}
missing = sorted((a, b) for a, b in live if (a, b) not in have)
print('section offerings written:', rows_added)
print('unresolved staff names:', sorted(set(unresolved)))
print('lab offerings without a lab room:', len(missing))
by = collections.defaultdict(list)
for a, b in missing: by[a].append(b)
for a, b in by.items(): print('  ', a, b)
