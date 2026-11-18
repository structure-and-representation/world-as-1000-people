"""Shared steps for every page: turn group populations into balls.

One ball is a fixed number of people in every year, so the number of balls changes
from year to year. Balls keep their identity across years: a ball stays in its group
where it can, moves to another group where its own group shrank, appears where the
population grew and disappears where it fell.
"""
import json
import numpy as np


def lr(pop, n):
    """largest-remainder rounding: split n balls over the cells in proportion to pop"""
    s = np.asarray(pop, dtype=float).ravel()
    q = s / s.sum() * n if s.sum() > 0 else np.zeros_like(s)
    f = np.floor(q).astype(int)
    for c in np.argsort(-(q - f), kind="stable")[: n - f.sum()]:
        f[c] += 1
    return f


def nested(fine, col_counts):
    """split the balls of one coarse group over its members.
    fine:       people, shape (members, columns)
    col_counts: balls the coarse group has in each column (these stay exactly as given)
    returns balls, shape (members, columns); member totals are kept as close as
    possible to the member's own share of the group."""
    fine = np.asarray(fine, dtype=float); P, C = fine.shape
    colsum = fine.sum(axis=0)
    q = np.where(colsum > 0, fine / np.where(colsum > 0, colsum, 1) * np.asarray(col_counts), 0.0)
    f = np.floor(q + 1e-9).astype(int); frac = q - f
    target = lr(fine.sum(axis=1), int(np.sum(col_counts)))        # balls each member should end with
    rows = f.sum(axis=1)
    for c in np.argsort(-(np.asarray(col_counts) - f.sum(axis=0)), kind="stable"):
        for _ in range(int(col_counts[c] - f[:, c].sum())):
            cand = [p for p in range(P) if f[p, c] == int(np.floor(q[p, c] + 1e-9))]   # one extra per member per column
            p = max(cand, key=lambda p: (target[p] - rows[p] > 0, frac[p, c], target[p] - rows[p]))
            f[p, c] += 1; rows[p] += 1
    assert (f.sum(axis=0) == np.asarray(col_counts)).all()
    return f


def assign(counts, absent, cost):
    """counts: {year: balls per cell}; absent: code for 'no ball in this slot';
    cost(c_from, c_to): sort key, smaller = a moving ball prefers that cell.
    returns {year: cell code per ball slot}"""
    years = sorted(counts); ncell = len(counts[years[0]])
    nmax = max(int(np.sum(counts[y])) for y in years)
    res, prev = {}, None
    for y in years:
        need = {c: int(counts[y][c]) for c in range(ncell)}; n = sum(need.values())
        if prev is None:
            asg = [c for c in range(ncell) for _ in range(need[c])] + [absent] * (nmax - n)
        else:
            asg = [None] * nmax
            for i, c in enumerate(prev):                 # stay in the same group where possible
                if c != absent and need[c] > 0:
                    asg[i] = c; need[c] -= 1
            pool = [c for c in range(ncell) for _ in range(need[c])]
            for i, c in enumerate(prev):                 # movers keep what they can
                if c != absent and asg[i] is None:
                    if pool:
                        j = min(range(len(pool)), key=lambda k: cost(c, pool[k]))
                        asg[i] = pool.pop(j)
                    else:
                        asg[i] = absent                  # population fell: the ball leaves
            for i in range(nmax):                        # population grew: new balls
                if asg[i] is None:
                    asg[i] = pool.pop(0) if pool else absent
        assert sum(1 for c in asg if c != absent) == n
        prev = asg; res[y] = asg
    return res


def dump(out, pop_total, counts, res, unit, sizes, extra=None):
    years = sorted(counts)
    d = {"years": years, "pop": [int(round(float(pop_total[y]))) for y in years],
         "n": [int(np.sum(counts[y])) for y in years], "unit": int(unit), "sizes": list(sizes),
         "cells": {str(y): "".join(chr(33 + c) for c in res[y]) for y in years}}
    d.update(extra or {})
    json.dump(d, open(out, "w"))


def write(out, pop_by_year, sizes, unit, prio):
    """simple case: three dimensions, every cell rounded on its own level.
    prio: dimension indexes, most important first, that a moving ball tries to keep"""
    ncell = int(np.prod(sizes)); years = sorted(pop_by_year)
    parts = lambda c: (c // (sizes[1] * sizes[2]), (c // sizes[2]) % sizes[1], c % sizes[2])
    counts = {y: lr(pop_by_year[y], int(round(float(np.sum(pop_by_year[y])) / unit))) for y in years}
    res = assign(counts, ncell, lambda a, b: tuple(parts(a)[d] != parts(b)[d] for d in prio))
    dump(out, {y: np.sum(pop_by_year[y]) for y in years}, counts, res, unit, sizes)
    for y in years:
        k = counts[y].reshape(sizes)
        print(y, int(round(float(np.sum(pop_by_year[y])))), int(k.sum()), k.sum(axis=(1, 2)).tolist(), k.sum(axis=(0, 2)).tolist(), k.sum(axis=(0, 1)).tolist())
