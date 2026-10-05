import re, json, difflib, os
D = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'scedular_local_db.json')))
FAC={f['id']:f['name'] for f in D['faculty']}
def norm(s):
    s=s.lower()
    s=re.sub(r'\b(dr|mr|mrs|ms|miss)\b\.?','',s)
    s=re.sub(r'[^a-z ]','',s.replace('.',' '))
    return re.sub(r'\s+','',s)
NF={k:norm(v) for k,v in FAC.items()}
ALIAS={'yasikha':'yashika','chakravarthi':'chakaravarthi','bharanidharan':'bharanidharan','therasa':'theresa','grecytherasa':'gracytheresa'}
def match(name):
    n=norm(name)
    for a,b in ALIAS.items(): n=n.replace(a,b)
    best=[]
    for k,v in NF.items():
        v2=v
        for a,b in ALIAS.items(): v2=v2.replace(a,b)
        r=difflib.SequenceMatcher(None,n,v2).ratio()
        # initials-insensitive: compare last token too
        best.append((r,k))
    best.sort(reverse=True)
    return best[0][1] if best[0][0]>=0.8 and (len(best)<2 or best[0][0]-best[1][0]>0.03) else None, best[:2]
def split_staff(s):
    s=re.sub(r'\bLibrary.*$','',s,flags=re.I)
    s=re.sub(r'CLA.*$','',s)
    return [x.strip() for x in re.split(r'/|&',s) if x.strip()]
if __name__=='__main__':
    names=set()
    for fn in('y3.json','y4.json'):
        J=json.load(open(fn))
        for s,v in J.items():
            for k in('theory','practical'):
                for r in v[k]: names.update(split_staff(r['staff']))
    bad=[]
    for n in sorted(names):
        m,b=match(n)
        if not m: bad.append((n,[(round(r,2),FAC[k]) for r,k in b]))
    print(len(names),'names;',len(bad),'unmatched')
    for x in bad: print(x)
