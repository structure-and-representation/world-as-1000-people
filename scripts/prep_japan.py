"""Japan page: population by prefecture (grouped into six regions) x age x sex, 1925-2050, 1 ball = 100,000 people.

usage: prep_japan.py <census_csv> <ipss_dir> <out_json>
  census_csv: e-Stat 国勢調査 時系列データ 表3「年齢（5歳階級），男女別人口－都道府県（大正9年～平成27年）」
              (statInfId=000031523105, CSV, Shift_JIS)
  ipss_dir:   the 47 workbooks 01.xlsx .. 47.xlsx of 社人研「日本の地域別将来推計人口（令和5年推計）」
              3. 都道府県・市区町村別の男女・年齢（5歳）階級別将来推計人口
"""
import sys, os, re
import numpy as np, pandas as pd, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import balls

census_csv, ipss_dir, out = sys.argv[1:4]
CENSUS_YEARS = [1925, 1950, 1975, 2000]
IPSS_YEARS = [2025, 2050]
# six regions, by prefecture code
REGION = {**{c: 0 for c in range(1, 8)},     # 北海道・東北
          **{c: 1 for c in range(8, 15)},    # 関東
          **{c: 2 for c in range(15, 24)},   # 中部
          **{c: 3 for c in range(24, 31)},   # 近畿
          **{c: 4 for c in range(31, 40)},   # 中国・四国
          **{c: 5 for c in range(40, 48)}}   # 九州・沖縄
# people by prefecture (0-46) x age (0:0-14 1:15-64 2:65+) x sex (0:男 1:女)
pops = {y: np.zeros((47, 3, 2)) for y in CENSUS_YEARS + IPSS_YEARS}

# ---- census -------------------------------------------------------------
d = pd.read_csv(census_csv, encoding="cp932", dtype=str)
d.columns = ["code", "pref", "age", "era", "wy", "year", "t", "m", "f"]
d = d.dropna(subset=["year"])
d = d[d.year.astype(int).isin(CENSUS_YEARS)]
for c in ("m", "f"):
    d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0)

def age_group(label):
    lo = int(re.match(r"(\d+)", label).group(1))
    return 0 if lo < 15 else 1 if lo < 65 else 2

for (code, year), g in d.groupby(["code", "year"]):
    pi = int(code) - 1; y = int(year)
    tot = g[g.age == "総数"].iloc[0]; rows = g[g.age != "総数"]
    for si, col in enumerate(("m", "f")):
        by = np.zeros(3)
        for _, r in rows.iterrows():
            by[age_group(r.age)] += r[col]
        # the total includes people of unknown age; no age class may be counted twice
        assert by.sum() <= tot[col] + 0.5, (code, year, col, by.sum(), tot[col])
        by *= tot[col] / by.sum()          # spread unknown ages in proportion
        for ai in range(3):
            pops[y][pi, ai, si] += by[ai]

# ---- projections --------------------------------------------------------
for code in range(1, 48):
    wb = openpyxl.load_workbook(f"{ipss_dir}/{code:02d}.xlsx", read_only=True, data_only=True)
    rows = list(wb[wb.sheetnames[0]].iter_rows(values_only=True))     # first sheet = the prefecture
    assert int(rows[1][0]) == code * 1000, rows[1]
    head = next(r for r in rows if r[0] == "男女計")
    blocks = {str(v): i for i, v in enumerate(head) if v in ("男", "女")}
    for si, sx in enumerate(("男", "女")):
        b = blocks[sx]
        ycol = {int(str(head[b + k])[:4]): b + k for k in range(1, 8)}
        for ai, lab in enumerate(("（再掲）0～14歳", "（再掲）15～64歳", "（再掲）65歳以上")):
            r = next(r for r in rows if r[b] == lab)
            for y in IPSS_YEARS:
                pops[y][code - 1, ai, si] += float(r[ycol[y]])

# ---- balls ---------------------------------------------------------------
UNIT = 100_000
parent = np.array([REGION[c] for c in range(1, 48)])
counts = {}
for y, fine in pops.items():
    # 1) balls per region x age x sex, rounded on the region level (what the opening view shows)
    coarse = np.zeros((6, 3, 2))
    for p in range(47):
        coarse[parent[p]] += fine[p]
    cc = balls.lr(coarse, int(round(fine.sum() / UNIT))).reshape(6, 3, 2)
    # 2) inside every region, hand its balls to its prefectures (what "look inside" shows)
    k = np.zeros((47, 3, 2), dtype=int)
    for r in range(6):
        mem = np.where(parent == r)[0]
        k[mem] = balls.nested(fine[mem].reshape(len(mem), 6), cc[r].reshape(6)).reshape(len(mem), 3, 2)
    counts[y] = k.reshape(-1)
    print(y, int(round(fine.sum())), int(k.sum()), cc.sum(axis=(1, 2)).tolist(), cc.sum(axis=(0, 2)).tolist(), cc.sum(axis=(0, 1)).tolist())
    dev = k.sum(axis=(1, 2)) - fine.sum(axis=(1, 2)) / UNIT
    print("   prefecture balls vs population/unit: max difference %.2f" % np.abs(dev).max(), "| Tokyo", int(k[12].sum()), "Tottori", int(k[30].sum()))

# cell code = prefecture*6 + age*2 + sex. A moving ball keeps its prefecture first, then its region, sex, age.
part = lambda c: (c // 6, parent[c // 6], c % 2, (c // 2) % 3)
res = balls.assign(counts, 47 * 6, lambda a, b: tuple(x != z for x, z in zip(part(a), part(b))))
balls.dump(out, {y: pops[y].sum() for y in pops}, counts, res, UNIT, (47, 3, 2),
           {"sub": {str(y): [int(round(v)) for v in pops[y].sum(axis=(1, 2))] for y in pops}})
