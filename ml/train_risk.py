"""Fire-risk forecast for one region: train, evaluate on later data, export a RiskGrid.

    python ml/train_risk.py telangana 2026-09-29

What it predicts: for each 0.1 degree cell, the probability of at least one VIIRS
(Suomi NPP) fire detection in the 14 days starting on the forecast date. An
experimental statistical estimate from past detections and land cover. It is not
a validated fire-danger index, and a low value is never an all-clear.

Model: logistic regression on seven per-cell features, all computed from data
strictly before the window it predicts:
    clim       share of past years with a detection in this cell in the same season
    hist       detections per year in this cell, all seasons (log)
    recent30   detections in this cell in the last 30 days (log)
    nbr30      detections in the 8 neighbouring cells in the last 30 days (log)
    forest     share of the cell the land-cover mask calls forest
    cropland   share of the cell the land-cover mask calls cropland
    doy_sin/cos  time of year

Evaluation: trained on forecast dates in 2020-2023, scored on 2024 to mid-2026,
which it never saw. Printed next to two baselines (climatology alone, last-30-days
alone), so the model is only credited with what it adds. Then refit on all dates
and run once for the forecast date. Inputs come from ml/fetch_firms.py and
ml/export_cells.ts; outputs go to ml/out/.
"""

import csv
import datetime as dt
import glob
import json
import math
import os
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
EPOCH = dt.date(2019, 1, 1)
HORIZON = 14  # days forecast
STEP = 7  # days between training/eval forecast dates
SP_LAST = dt.date(2026, 6, 30)
FEATURES = ["clim", "hist", "recent30", "nbr30", "forest", "cropland", "doy_sin", "doy_cos"]
MODEL_NAME = "madhuca-risk-logreg-v1"


def day(d: dt.date) -> int:
    return (d - EPOCH).days


def load(region: str):
    with open(os.path.join(HERE, "data", f"{region}-cells.json"), encoding="utf-8") as f:
        cells = json.load(f)
    w, s, e, n = cells["bbox"]
    cols, rows, cell_deg = cells["cols"], cells["rows"], cells["cellDeg"]
    india = np.array(cells["india"]) > 0
    files = sorted(glob.glob(os.path.join(HERE, "data", "firms", region, "*.csv")))
    if not files:
        sys.exit(f"no FIRMS data: run ml/fetch_firms.py {region} first")
    # Chunks must tile the dates exactly: an overlapping one (say, a stray manual test
    # download) would count its detections twice and quietly inflate the labels.
    spans = sorted(
        (dt.date.fromisoformat(os.path.basename(p).split("_")[3]), int(os.path.basename(p).split("_")[4][:-4])) for p in files
    )
    expect = spans[0][0]
    for start, length in spans:
        if start != expect:
            sys.exit(f"FIRMS chunks overlap or leave a gap at {start} (expected {expect}); remove stray files and re-fetch")
        expect = start + dt.timedelta(days=length)
    last = expect - dt.timedelta(days=1)
    ndays = day(last) + 1
    counts = np.zeros((cols * rows, ndays), dtype=np.int32)
    # Static industrial heat sources (steel works, refineries, power plants) are marked
    # type 2 in the archive, but near-real-time rows carry no type at all. So collect every
    # archived type-2 location on a ~1 km (0.01 deg) grid, and drop any detection, archive
    # or NRT, that falls on or next to one. Without this the forecast's last-30-days
    # feature scored Ballari, Visakhapatnam and Ennore factories as the top fire risks.
    static = set()
    for path in files:
        with open(path, encoding="utf-8") as f:
            for rec in csv.DictReader(f):
                if rec.get("type") == "2":
                    static.add((round(float(rec["longitude"]) * 100), round(float(rec["latitude"]) * 100)))

    def industrial(lon: float, lat: float) -> bool:
        x, y = round(lon * 100), round(lat * 100)
        return any((x + dx, y + dy) in static for dx in (-1, 0, 1) for dy in (-1, 0, 1))

    kept = dropped = dropped_static = 0
    for path in files:
        with open(path, encoding="utf-8") as f:
            for rec in csv.DictReader(f):
                # type (archive only): 0 = presumed vegetation fire; 2 = static land
                # source, 1 volcano, 3 offshore. Low-confidence detections are dropped too.
                if rec.get("type", "0") not in ("0", "") or rec["confidence"] == "l":
                    dropped += 1
                    continue
                lon, lat = float(rec["longitude"]), float(rec["latitude"])
                if industrial(lon, lat):
                    dropped_static += 1
                    continue
                c = math.floor((lon - w) / cell_deg)
                r = math.floor((lat - s) / cell_deg)
                if not (0 <= c < cols and 0 <= r < rows) or not india[r * cols + c]:
                    dropped += 1
                    continue
                counts[r * cols + c, day(dt.date.fromisoformat(rec["acq_date"]))] += 1
                kept += 1
    print(
        f"{region}: {len(files)} files, {kept} detections kept, {dropped} dropped (type, low confidence, outside India), "
        f"{dropped_static} dropped near {len(static)} known industrial sources, {EPOCH}..{last}"
    )
    return cells, india, counts, last


class Features:
    def __init__(self, cells, india, counts):
        self.cols, self.rows = cells["cols"], cells["rows"]
        self.idx = np.flatnonzero(india)  # cells scored: those touching India
        # cum[:, d] = detections before day d, so a window [a, b) sums as cum[b] - cum[a].
        self.cum = np.zeros((counts.shape[0], counts.shape[1] + 1), dtype=np.int32)
        np.cumsum(counts, axis=1, out=self.cum[:, 1:])
        self.ndays = counts.shape[1]
        self.forest = np.array(cells["forest"])[self.idx]
        self.cropland = np.array(cells["cropland"])[self.idx]
        # 8-neighbour lists as a sparse sum, via padded grid shifts.
        self.nbr = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr or dc:
                    self.nbr.append((dr, dc))

    def window(self, a: int, b: int) -> np.ndarray:
        a, b = max(a, 0), min(b, self.ndays)
        return self.cum[:, b] - self.cum[:, a] if b > a else np.zeros(self.cum.shape[0], dtype=np.int32)

    def at(self, d: dt.date) -> np.ndarray:
        t = day(d)
        recent_all = self.window(t - 30, t)
        grid = recent_all.reshape(self.rows, self.cols)
        padded = np.pad(grid, 1)
        nbr = sum(padded[1 + dr : 1 + dr + self.rows, 1 + dc : 1 + dc + self.cols] for dr, dc in self.nbr).ravel()
        years = [y for y in range(EPOCH.year, d.year) if day(d.replace(year=y)) - 7 >= 0]
        clim = np.zeros(self.cum.shape[0])
        for y in years:
            ty = day(d.replace(year=y))
            clim += self.window(ty - 7, ty + HORIZON + 7) > 0
        clim = clim / max(len(years), 1)
        hist = np.log1p(self.window(0, t) / max(t / 365.25, 0.5))
        doy = 2 * math.pi * (d.timetuple().tm_yday / 365.25)
        i = self.idx
        return np.column_stack(
            [
                clim[i],
                hist[i],
                np.log1p(recent_all[i]),
                np.log1p(nbr[i]),
                self.forest,
                self.cropland,
                np.full(len(i), math.sin(doy)),
                np.full(len(i), math.cos(doy)),
            ]
        )

    def label(self, d: dt.date) -> np.ndarray:
        t = day(d)
        return (self.window(t, t + HORIZON) > 0)[self.idx].astype(np.int8)


def dates(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        yield d
        d += dt.timedelta(days=STEP)


def stack(feat: Features, ds):
    xs, ys = zip(*[(feat.at(d), feat.label(d)) for d in ds])
    return np.vstack(xs), np.concatenate(ys)


def main() -> None:
    region, forecast = sys.argv[1], dt.date.fromisoformat(sys.argv[2])
    cells, india, counts, last = load(region)
    feat = Features(cells, india, counts)

    # Labels must lie inside the archive: the last scored window ends by SP_LAST.
    train_ds = list(dates(dt.date(2020, 1, 1), dt.date(2023, 12, 31) - dt.timedelta(days=HORIZON)))
    test_ds = list(dates(dt.date(2024, 1, 1), SP_LAST - dt.timedelta(days=HORIZON - 1)))
    Xtr, ytr = stack(feat, train_ds)
    Xte, yte = stack(feat, test_ds)

    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
    model.fit(Xtr, ytr)
    p = model.predict_proba(Xte)[:, 1]

    def scores(name, score):
        return {
            "name": name,
            "roc_auc": round(float(roc_auc_score(yte, score)), 4),
            "pr_auc": round(float(average_precision_score(yte, score)), 4),
        }

    results = [
        scores("model (logistic regression)", p),
        scores("baseline: climatology only", Xte[:, FEATURES.index("clim")]),
        scores("baseline: last 30 days only", Xte[:, FEATURES.index("recent30")]),
    ]
    metrics = {
        "region": region,
        "target": f"at least one VIIRS SNPP detection in the cell within {HORIZON} days",
        "train": f"{train_ds[0]}..{train_ds[-1]} every {STEP} days, {len(ytr)} cell-windows, positive rate {ytr.mean():.4f}",
        "test": f"{test_ds[0]}..{test_ds[-1]} every {STEP} days, {len(yte)} cell-windows, positive rate {yte.mean():.4f}",
        "results": results,
        "model_brier": round(float(brier_score_loss(yte, p)), 5),
        "baseline_brier_constant_rate": round(float(brier_score_loss(yte, np.full(len(yte), ytr.mean()))), 5),
    }
    print(f"train: {metrics['train']}")
    print(f"test:  {metrics['test']}")
    print(f"{'scorer':34} {'ROC-AUC':>8} {'PR-AUC':>8}")
    for r in results:
        print(f"{r['name']:34} {r['roc_auc']:8.4f} {r['pr_auc']:8.4f}")
    print(f"Brier: model {metrics['model_brier']}, constant base rate {metrics['baseline_brier_constant_rate']}")

    # Refit on every labelled date, then forecast once.
    X_all, y_all = np.vstack([Xtr, Xte]), np.concatenate([ytr, yte])
    model.fit(X_all, y_all)
    if day(forecast) > feat.ndays:
        sys.exit(f"forecast date {forecast} is after the last FIRMS data ({last}); fetch up to the day before it")
    prob = model.predict_proba(feat.at(forecast))[:, 1]

    # RiskGrid (contract issue #20): 0 = no data (cell outside India), else 1-255 scaled probability.
    risk = np.zeros(cells["cols"] * cells["rows"], dtype=int)
    risk[feat.idx] = 1 + np.rint(254 * np.clip(prob, 0, 1)).astype(int)
    grid = {
        "region": region,
        "bbox": cells["bbox"],
        "cellDeg": cells["cellDeg"],
        "cols": cells["cols"],
        "rows": cells["rows"],
        "risk": risk.tolist(),
        "validFrom": forecast.isoformat(),
        "validTo": (forecast + dt.timedelta(days=HORIZON - 1)).isoformat(),
        "model": f"{MODEL_NAME} (VIIRS {EPOCH.year}-{last.year}; experimental statistical estimate)",
    }
    lr = model.named_steps["logisticregression"]
    metrics["coefficients_standardised"] = dict(zip(FEATURES, [round(float(c), 4) for c in lr.coef_[0]]))
    metrics["forecast"] = {
        "validFrom": grid["validFrom"],
        "validTo": grid["validTo"],
        "cells_scored": int(len(feat.idx)),
        "probability_min_median_max": [round(float(v), 4) for v in (prob.min(), np.median(prob), prob.max())],
        "recent30_data_through": last.isoformat(),
    }

    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    out = os.path.join(HERE, "out", f"{region}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(grid, f, separators=(",", ":"))
    with open(os.path.join(HERE, "out", f"{region}-metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"coefficients (standardised): {metrics['coefficients_standardised']}")
    print(f"forecast {grid['validFrom']}..{grid['validTo']}: probability min/median/max {metrics['forecast']['probability_min_median_max']}")
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
