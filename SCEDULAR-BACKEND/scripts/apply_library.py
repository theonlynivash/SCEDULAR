"""
Add the one-period weekly Library slot that the printed Year 2 / Year 3 timetables carry (the "LIB" cell and the
"Library" row of the practicals table), so every section's week is the full 40 periods.
Run with the backend STOPPED:  python3 scripts/apply_library.py
"""
import json, os, re, sys, shutil, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from pdf_match import match
ROOT = os.path.dirname(HERE); DBP = os.path.join(ROOT, 'data', 'scedular_local_db.json')
shutil.copy(DBP, DBP + f'.backup-{int(time.time())}')
D = json.load(open(DBP))

def library_staff(fn):
    L = [l.strip() for l in open(os.path.join(ROOT, 'data', 'pdf_source', fn)).read().split('\n')]
    cur = None; out = {}
    for i, l in enumerate(L):
        m = re.match(r'^SECTION ([A-L])$', l)
        if m: cur = m.group(1)
        if re.fullmatch(r'(?i)library', l) and cur and cur not in out:
            seg = []
            for j in range(i + 1, min(i + 8, len(L))):
                if re.fullmatch(r'\d+', L[j]): continue
                if re.match(r'^(CLASS|PANIMALAR|===|SECTION)', L[j]): break
                seg.append(L[j])
            out[cur] = re.sub(r'\s*CLA.*$', '', ' '.join(seg)).strip()
    return out

PLAN = [('III', 'Year 2', 'Y2', 'ii_tt.txt'), ('V', 'Year 3', 'Y3', 'iii_tt.txt')]
added = 0; unresolved = []
for sem, year, pre, fn in PLAN:
    code = f'LIBRARY-{sem}'
    if not any(s['code'] == code for s in D['subjects']):
        D['subjects'].append({'id': f'SUB-{code}', 'code': code, 'name': 'Library', 'credits': 0, 'deliveryType': 'THEORY', 'category': 'ADDITIONAL',
                              'year': year, 'semester': sem, 'theoryPeriods': 1, 'labPeriods': 0, 'vertical': None,
                              'shortName': 'LIB', 'ltp': None, 'printAs': 'PRACTICAL'})
        D['courses'].append({'id': code, 'code': code, 'name': 'Library', 'componentType': 'ADDITIONAL', 'labBlockLength': 3})
    sid = f'SUB-{code}'
    staff = library_staff(fn)
    for sec in [s for s in D['sections'] if re.fullmatch(rf'{pre}-[A-L]', s['id'])]:
        if any(x['sectionId'] == sec['id'] and x['subjectId'] == sid for x in D['sectionSubjects']): continue
        ssid = max([x['id'] for x in D['sectionSubjects']] + [0]) + 1
        D['sectionSubjects'].append({'id': ssid, 'sectionId': sec['id'], 'subjectId': sid, 'theoryPeriods': 1, 'labPeriods': 0, 'labBlockLength': None})
        name = staff.get(sec['id'][-1], '')
        fid = match(name)[0] if name else None
        if not fid: unresolved.append((sec['id'], name))
        else:
            tid = max([t['id'] for t in D['teachingAssignments']] + [0]) + 1
            D['teachingAssignments'].append({'id': tid, 'facultyId': fid, 'sectionSubjectId': ssid, 'component': 'THEORY', 'batch': None})
        added += 1
D['nextSectionSubjectId'] = len(D['sectionSubjects']) + 1
D['nextTeachingAssignmentId'] = max([t['id'] for t in D['teachingAssignments']] + [0]) + 1
json.dump(D, open(DBP, 'w'), indent=2)
print('Library offerings added:', added, '| unresolved:', unresolved)
