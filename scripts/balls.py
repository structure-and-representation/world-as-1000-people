"""Shared step for every page: turn group populations into balls.

One ball is a fixed number of people in every year, so the number of balls changes
from year to year. Balls keep their identity across years: a ball stays in its group
where it can, moves to another group where its own group shrank, appears where the
population grew and disappears where it fell.
"""
import json
import numpy as np


def allocate(pop_by_year, sizes, unit, prio):
    """pop_by_year: {year: array of length prod(sizes) with people per cell}
    sizes: number of categories of each of the three dimensions, in cell-code order
    unit:  people per ball
    prio:  dimension indexes, most important first, that a moving ball tries to keep
    returns (balls per year, {year: cell code per ball slot, ABS where no ball})"""
    ncell = int(np.prod(sizes)); ABS = ncell
    years = sorted(pop_by_year)
    ns = {y: int(round(float(pop_by_year[y].sum()) / unit)) for y in years}
    nmax = max(ns.values())

    def parts(c):
        return (c // (sizes[1] * sizes[2]), (c // sizes[2]) % sizes[1], c % sizes[2])

    res, prev = {}, None
    for y in years:
        n = ns[y]; s = np.asarray(pop_by_year[y], dtype=float)
        q = s / s.sum() * n; f = np.floor(q).astype(int)
        for c in np.argsort(-(q - f), kind="stable")[: n - f.sum()]:   # largest remainder
            f[c] += 1
        need = {c: int(f[c]) for c in range(ncell)}
        if prev is None:
            asg = [c for c in range(ncell) for _ in range(need[c])] + [ABS] * (nmax - n)
        else:
            asg = [None] * nmax
            for i, c in enumerate(prev):                 # stay in the same group where possible
                if c != ABS and need[c] > 0:
                    asg[i] = c; need[c] -= 1
            pool = [c for c in range(ncell) for _ in range(need[c])]
            for i, c in enumerate(prev):                 # movers keep what they can, in prio order
                if c != ABS and asg[i] is None:
                    if pool:
                        pc = parts(c)
                        j = min(range(len(pool)), key=lambda k: tuple(parts(pool[k])[d] != pc[d] for d in prio))
                        asg[i] = pool.pop(j)
                    else:
                        asg[i] = ABS                     # population fell: the ball leaves
            for i in range(nmax):                        # population grew: new balls
                if asg[i] is None:
                    asg[i] = pool.pop(0) if pool else ABS
        assert sum(1 for c in asg if c != ABS) == n
        prev = asg; res[y] = asg
    return ns, res


def write(out, pop_by_year, sizes, unit, prio):
    ns, res = allocate(pop_by_year, sizes, unit, prio)
    years = sorted(pop_by_year)
    json.dump({"years": years,
               "pop": [int(round(float(pop_by_year[y].sum()))) for y in years],
               "n": [ns[y] for y in years], "unit": int(unit), "sizes": list(sizes),
               "cells": {str(y): "".join(chr(33 + c) for c in res[y]) for y in years}},
              open(out, "w"))
    for y in years:
        a = [c for c in res[y] if c != int(np.prod(sizes))]
        d0 = [sum(1 for c in a if c // (sizes[1] * sizes[2]) == r) for r in range(sizes[0])]
        d1 = [sum(1 for c in a if (c // sizes[2]) % sizes[1] == r) for r in range(sizes[1])]
        d2 = [sum(1 for c in a if c % sizes[2] == r) for r in range(sizes[2])]
        print(y, int(round(float(pop_by_year[y].sum()))), ns[y], d0, d1, d2)
