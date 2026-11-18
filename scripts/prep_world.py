import sys, os, json, warnings, rdata, pandas as pd, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import balls
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
# 1 ball = 10 million people in every year (population in the tables is in thousands)
print(pd.DataFrame({"sum": tot, "world": w}))
pops = {y: a[a.year == y].groupby("cell")["pop"].sum().reindex(range(90), fill_value=0).to_numpy() * 1000 for y in YEARS}
# cell = region(6) x age(3) x income(5); a moving ball keeps its region first, then its age
balls.write(out, pops, (6, 3, 5), 10_000_000, (0, 1, 2))
