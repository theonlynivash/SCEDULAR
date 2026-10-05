"""
Fill the details printed on the class timetable sheets from the department's printed timetables:
short names (ARVR, NLP...), L-T-P, which table lists each subject, and each section's class in-charge.
Run with the backend STOPPED:  python3 scripts/apply_print_metadata.py
"""
import json, os, re, sys, shutil, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from pdf_match import match
ROOT = os.path.dirname(HERE); DBP = os.path.join(ROOT, 'data', 'scedular_local_db.json')
shutil.copy(DBP, DBP + f'.backup-{int(time.time())}')
D = json.load(open(DBP))

SHORT = {  # as printed in the timetable grids
    '23MA1304': 'MFAI', '23AD1301': 'ICS', '23AD1302': 'AIES', '23AD1303': 'OOP', '23CS1303': 'DBMS', '23MC1002': 'COI',
    '23HS1302': 'QAP', '23HS1301': 'SCD', '23AD1311': 'AIES', '23AD1312': 'OOP', '23CS1312': 'DBMS', '23ES1311': 'TSP LAB',
    '23AD1501': 'FLAT', '23AD1502': 'DCNS', '23CS1908': 'QC', '23CS1908-FSD': 'FS', '23AD1505': 'DEV', '23AD1506': 'DA',
    '23AD1507': 'KIES', '23AD1513': 'TS & R', '23ES1511': 'TSP IV',
    '23AD1701': 'ARVR', '23ML1702': 'NLP', '23AD1908': 'BDM', '23IT1906': 'STA', '23AD1702': 'AIR', '23AD1711': 'ARVR',
    '23AD1712': 'IP', '23AD1907': 'EAI', '23IT1905': 'DEV',
}
PRACTICAL_LISTED = {'23AD1513', '23ES1511', '23ES1311'}

ltp = {}
credits = {}
for fn in ('year2_sem3_timetable.json', 'year3_sem5_timetable.json', 'year4_sem7_timetable.json'):
    T = json.load(open(os.path.join(ROOT, 'data', 'pdf_source', fn)))
    for sec in T.values():
        for r in sec['theory'] + sec['practical']:
            l = r['LTPC']
            if len(l) == 4 and r['code'] not in ltp: ltp[r['code']] = [l[0], l[1], l[2]]; credits[r['code']] = l[3]
n = 0
for s in D['subjects']:
    c = s['code']
    if c in SHORT: s['shortName'] = SHORT[c]; n += 1
    base = c.split('-')[0]
    if base in ltp: s['ltp'] = ltp[base]; s['credits'] = credits[base]   # the printed C column is authoritative
    if c in PRACTICAL_LISTED: s['printAs'] = 'PRACTICAL'

unres = []
sec_ids = {s['id'] for s in D['sections']}
for fn, pre in (('ii_tt.txt', 'Y2'), ('iii_tt.txt', 'Y3'), ('iv_tt.txt', 'Y4')):
    lines = [l.strip() for l in open(os.path.join(ROOT, 'data', 'pdf_source', fn)).read().split('\n')]
    cur = None
    for i, ln in enumerate(lines):
        m = re.match(r'^SECTION ([A-L])$', ln)
        if m: cur = m.group(1)
        mm = re.search(r'CLASS\s+(?:INCHARGE|ADVISOR)\s*:?\s*(.*)$', ln)
        if mm and cur:
            name = mm.group(1).strip(' :')
            j = i + 1
            while not name and j < len(lines) and j < i + 3: name = lines[j].strip(' :'); j += 1
            fid = match(name)[0] if name else None
            sid = f'{pre}-{cur}'
            if fid and sid in sec_ids:
                for s in D['sections']:
                    if s['id'] == sid: s['classIncharge'] = fid
            else: unres.append((sid, name))
json.dump(D, open(DBP, 'w'), indent=2)
live = [s for s in D['sections'] if re.fullmatch(r'Y[234]-[A-L]', s['id'])]
print('short names set:', n, '| ltp known for', len(ltp), 'codes | class in-charge set:', sum(1 for s in live if s.get('classIncharge')), 'of', len(live))
print('unresolved:', unres)
