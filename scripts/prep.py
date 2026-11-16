import sys, json, warnings, rdata, pandas as pd, numpy as np
warnings.filterwarnings("ignore")
d, out = sys.argv[1], sys.argv[2]
YEARS=[1950,1975,2000,2025,2050,2075,2100]
u = pd.read_csv(f"{d}/UNlocations.txt", sep="\t"); u=u[u.location_type==4]
REG=["Asia","Africa","Europe","Latin America and the Caribbean","Northern America","Oceania"]
def inc(r):
    for i,c in enumerate(["agcode_1500000","agcode_1501000","agcode_1502000","agcode_1503000"]):
        if r[c]!=-1: return i
    return 4
u=u.assign(reg=u.area_name.map(REG.index), inc=u.apply(inc,axis=1))[["country_code","reg","inc","name"]]
print(u[u.inc==4].name.tolist())
e = rdata.read_rda(f"{d}/popAge1dt.rda")["popAge1dt"][["country_code","year","age","pop"]]
p = rdata.read_rda(f"{d}/popprojAge1dt.rda")["popprojAge1dt"]; p=p.assign(pop=p.popM+p.popF, year=p.year.astype(int))[["country_code","year","age","pop"]]
e["pop"]=e["pop"].astype(float); p["pop"]=p["pop"].astype(float); print("nan", e["pop"].isna().sum(), p["pop"].isna().sum(), p.year.min(), p.year.max()); full = pd.concat([e,p]).dropna(subset=["pop"])
hi = full[full.year.isin(YEARS)]; lo = full[full.year.isin([y-1 for y in YEARS])].assign(year=lambda d:d.year+1)
mid = pd.concat([hi,lo]).groupby(["country_code","year","age"],as_index=False)["pop"].mean()
a = mid[mid.country_code.isin(u.country_code)].merge(u,on="country_code")
a["ageg"]=np.where(a.age<15,0,np.where(a.age<65,1,2))
a["cell"]=a.reg*15+a.ageg*5+a.inc
tot = a.groupby("year")["pop"].sum()
w = mid[mid.country_code==900].groupby("year")["pop"].sum()
print(pd.DataFrame({"sum":tot,"world":w}))
# 1 ball = a fixed number of people in every year: world population of 2025 / 1000
ABS=90  # code for "this ball does not exist in this year"
unit=float(w[2025])/1000
ns={y:int(round(float(w[y])/unit)) for y in YEARS}; NMAX=max(ns.values())
print("unit (thousand):", unit, "balls:", ns)
res={}; prev=None
for y in YEARS:
    n=ns[y]
    s=a[a.year==y].groupby("cell")["pop"].sum().reindex(range(90),fill_value=0)
    q=s/s.sum()*n; f=np.floor(q).astype(int); r=n-f.sum()
    for c in (q-f).sort_values(ascending=False).index[:r]: f[c]+=1
    cnt=f.to_dict()
    if prev is None:
        asg=[c for c in range(90) for _ in range(cnt[c])]+[ABS]*(NMAX-n)
    else:
        need=dict(cnt); asg=[None]*NMAX
        for i,c in enumerate(prev):               # stay in the same group where possible
            if c!=ABS and need[c]>0: asg[i]=c; need[c]-=1
        pool=[c for c in range(90) for _ in range(need[c])]
        for i,c in enumerate(prev):               # movers: prefer same region, then same age
            if c!=ABS and asg[i] is None:
                if pool:
                    j=min(range(len(pool)), key=lambda k:(pool[k]//15!=c//15, (pool[k]//5)%3!=(c//5)%3, pool[k]%5!=c%5))
                    asg[i]=pool.pop(j)
                else: asg[i]=ABS                  # population shrank: the ball leaves
        for i,c in enumerate(prev):               # population grew: new balls
            if asg[i] is None: asg[i]=pool.pop(0) if pool else ABS
    assert sum(1 for c in asg if c!=ABS)==n
    prev=asg; res[y]=asg
    print(y, n, [sum(1 for c in asg if c!=ABS and c//15==r) for r in range(6)], [sum(1 for c in asg if c!=ABS and (c//5)%3==g) for g in range(3)], [sum(1 for c in asg if c!=ABS and c%5==g) for g in range(5)])
json.dump({"years":YEARS,"total":[round(float(w[y])/1e6,3) for y in YEARS],"n":[ns[y] for y in YEARS],"unit":round(unit),"cells":{str(y):"".join(chr(33+c) for c in res[y]) for y in YEARS}}, open(out,"w"))
