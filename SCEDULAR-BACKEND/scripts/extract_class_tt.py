"""Extract the per-section subject tables (code, L-T-P-C, hours, staff) from the text of a printed class timetable.
Usage: python3 scripts/extract_class_tt.py <timetable.txt> <out.json>"""
import re, json, sys
L = [l.strip() for l in open(sys.argv[1]).read().split('\n')]
code = re.compile(r'^\d\d[A-Z]{2}\d{4}$')
res = {}; sec = None; mode = None; i = 0
while i < len(L):
    l = L[i]
    m = re.match(r'^SECTION ([A-L])$', l)
    if m: sec = m.group(1); mode = None; res[sec] = {'theory': [], 'practical': []}; i += 1; continue
    if 'SUBJECT HANDLING THEORY' in l: mode = 'theory'; i += 1; continue
    if l.startswith('PRACTICALS'): mode = 'practical'; i += 1; continue
    if sec and mode and code.match(l.replace(' ', '')):
        c = l.replace(' ', ''); j = i + 1; title = []
        while j < len(L) and not re.fullmatch(r'\d+', L[j]): title.append(L[j]); j += 1
        nums = []
        while j < len(L) and re.fullmatch(r'\d+', L[j]) and len(nums) < 5: nums.append(int(L[j])); j += 1
        staff = []
        while j < len(L) and not code.match(L[j].replace(' ', '')) and not L[j].startswith(('PRACTICALS', 'CLASS', '===', 'PANIMALAR', 'Staff')) and L[j] not in ('LAKSHMI',):
            staff.append(L[j]); j += 1
        res[sec][mode].append({'code': c, 'title': ' '.join(title), 'LTPC': nums[:4], 'hours': nums[4] if len(nums) > 4 else None, 'staff': ' '.join(staff)})
        i = j; continue
    i += 1
json.dump(res, open(sys.argv[2], 'w'), indent=1)
print(len(res), 'sections')
