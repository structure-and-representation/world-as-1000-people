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
res={}; prev=None
for y in YEARS:
    s=a[a.year==y].groupby("cell")["pop"].sum().reindex(range(90),fill_value=0)
    q=s/s.sum()*1000; f=np.floor(q).astype(int); r=1000-f.sum()
    for c in (q-f).sort_values(ascending=False).index[:r]: f[c]+=1
    cnt=f.to_dict()
    if prev is None:
        asg=[c for c in range(90) for _ in range(cnt[c])]
    else:
        need=dict(cnt); asg=[None]*1000
        for i,c in enumerate(prev):
            if need[c]>0: asg[i]=c; need[c]-=1
        pool=[c for c in range(90) for _ in range(need[c])]
        # movers: prefer same region, then same age
        for i,c in enumerate(prev):
            if asg[i] is None:
                j=min(range(len(pool)), key=lambda k:(pool[k]//15!=c//15, (pool[k]//5)%3!=(c//5)%3, pool[k]%5!=c%5))
                asg[i]=pool.pop(j)
    prev=asg; res[y]=asg
    print(y, [sum(1 for c in asg if c//15==r) for r in range(6)], [sum(1 for c in asg if (c//5)%3==g) for g in range(3)], [sum(1 for c in asg if c%5==g) for g in range(5)])
json.dump({"years":YEARS,"total":[round(float(w[y])/1e6,2) for y in YEARS],"cells":{str(y):"".join(chr(33+c) for c in res[y]) for y in YEARS}}, open(out,"w"))
