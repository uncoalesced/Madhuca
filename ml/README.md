# ml/ — offline fire-risk model

Issue #21, owned by Jammy. Offline only: nothing here runs on the request path or on
a schedule (`docs/MASTER.md`, 2026-09-28 ML decision). Python is allowed here the
same way GDAL is in `pipeline/`. `logic/` and `frontend/` gain no dependency.

## What the risk grid is

For each 0.1 degree cell (about 11 km) of a region box, the model's estimated
probability of **at least one VIIRS satellite fire detection in the cell within the
14 days** from the forecast date.

That covers **any** vegetation fire VIIRS sees, crop-residue burning included, not only wildfire. In October the highest cells are cropland around Nellore. Telling the two apart is the classifier's job (model 2), not this grid's.

It is an **experimental statistical estimate** built from past detections and land
cover. It is not a validated fire-danger index, and it knows nothing about today's
weather. **A low value is never an all-clear**: fires start in cells with no history,
and VIIRS misses small, short or cloud-covered fires.

Encoding (the `RiskGrid` shape proposed in contract issue #20):
- `risk[i]` is 0 for cells outside India, which means no data, not safe.
- Otherwise `risk[i]` is `1 + round(254 * p)`, where `p` is the probability.

## Run it

```bash
pip install -r ml/requirements.txt
node ml/export_cells.ts telangana                                   # box, India mask, land-cover shares per cell
FIRMS_MAP_KEY=... python ml/fetch_firms.py telangana 2019-01-01 2026-09-28
python ml/train_risk.py telangana 2026-09-29                        # metrics, then ml/out/telangana.json
```

Or use the manual `ml-risk` workflow (`.github/workflows/ml-risk.yml`). It needs a `FIRMS_MAP_KEY` repository secret, and it can publish the grid to `frontend/public/risk/` when run with `publish=true`.

## Data sources

| Data | Source | Licence / terms |
|---|---|---|
| Fire detections | NASA FIRMS, VIIRS S-NPP 375m. Standard archive (`VIIRS_SNPP_SP`) to 2026-06-30, near-real-time (`VIIRS_SNPP_NRT`) after | NASA open data; cite "NASA FIRMS" |
| Land cover | ESA WorldCover 2021 via our masks (`frontend/public/landcover/`) | CC-BY 4.0, attributed in the app footer |
| India border | Natural Earth 1:10m (`logic/src/india-border.ts`) | Public domain |

Filters:
- Low-confidence detections are dropped.
- Archive detections of `type` other than 0 (non-vegetation) are dropped.
- Near-real-time data has no `type` column, so every archived type-2 (static industrial) location is collected on a ~1 km grid, and any detection within ~1 km of one is dropped, archive or NRT. Without this, the first forecast ranked the Ballari steel works, Visakhapatnam and the Ennore power plants as the top fire risks. Industrial sites that never appear in the archive as type 2 can still slip through.

## How it is evaluated

- The model is trained on forecast dates in 2020-2023 and scored on 2024 to mid-2026, a period it never saw.
- ROC-AUC and PR-AUC are printed next to two baselines, climatology alone and last-30-days alone, so the model is only credited with what it adds over simple rules.
- The numbers from each run are logged in `docs/log/jammy.md`.
