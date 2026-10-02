"""Make src/seed/curriculumRoster.ts agree with data/pdf_source/subject_overrides.json (run after apply_pdf_timetables.py)."""
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'src', 'seed', 'curriculumRoster.ts')
O = json.load(open(os.path.join(ROOT, 'data', 'pdf_source', 'subject_overrides.json')))
src = open(P).read()
blocks = re.findall(r'  \{\n    "id": "SUB-[^\n]*\n(?:    [^\n]*\n)*?  \},?\n', src)
out = src
for b in blocks:
    code = re.search(r'"code": "([^"]+)"', b).group(1)
    if code in O['remove']:
        out = out.replace(b, '', 1); continue
    if code in O['overrides']:
        nb = b
        for k, v in O['overrides'][code].items():
            nb = re.sub(rf'("{k}": )(?:"[^"]*"|\d+)', lambda m: m.group(1) + (json.dumps(v)), nb, count=1)
        out = out.replace(b, nb, 1)
open(P, 'w').write(out)
print('patched', len([b for b in blocks if re.search(r'"code": "([^"]+)"', b).group(1) in O['overrides']]), 'removed', len(O['remove']))
