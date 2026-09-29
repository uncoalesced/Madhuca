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
node ml/export_cells.ts south                                       # box, India mask, land-cover shares per cell
FIRMS_MAP_KEY=... python ml/fetch_firms.py south 2019-01-01 2026-09-28
python ml/train_risk.py south 2026-09-29                            # metrics, then ml/out/south.json
```

Or use the manual `ml-risk` workflow (`.github/workflows/ml-risk.yml`). It needs a `FIRMS_MAP_KEY` repository secret, and it can publish the grid to `frontend/public/risk/` when run with `publish=true`.

## Data sources

| Data | Source | Licence / terms |
|---|---|---|
| Fire detections | NASA FIRMS, VIIRS S-NPP 375m. Standard archive (`VIIRS_SNPP_SP`) to 2026-06-30, near-real-time (`VIIRS_SNPP_NRT`) after | NASA open data; cite "NASA FIRMS" |
| Land cover | ESA WorldCover 2021 via our masks (`frontend/public/landcover/`) | CC-BY 4.0, attributed in the app footer |
| India and state borders | DataMeet States/Admin2 via `frontend/public/boundaries/states.bin` (`pipeline/boundaries.mjs`) | CC-BY / MIT, attributed in the app footer |

Filters:
- Low-confidence detections are dropped.
- Archive detections of `type` other than 0 (non-vegetation) are dropped.
- Near-real-time data has no `type` column, so every archived type-2 (static industrial) location is collected on a ~1 km grid, and any detection within ~1 km of one is dropped, archive or NRT. Without this, the first forecast ranked the Ballari steel works, Visakhapatnam and the Ennore power plants as the top fire risks. Industrial sites that never appear in the archive as type 2 can still slip through.

## How it is evaluated

- The model is trained on forecast dates in 2020-2023 and scored on 2024 to mid-2026, a period it never saw.
- ROC-AUC and PR-AUC are printed next to two baselines, climatology alone and last-30-days alone, so the model is only credited with what it adds over simple rules.
- The numbers from each run are logged in `docs/log/jammy.md`.

## Model 2: learned crop-burning vs wildfire classifier (plan, not built)

Decided on issue #20 (2026-09-29): for 30 Sept this is a plan only. `classifyHotspot` keeps its rule-based path (land cover, stubble-belt state, season, FRP), and no labels are invented. What exists is the `ClassifierWeights` type in `logic/src/types.ts`, which a trained model will be exported as.

The blocker is labels. There is no ground truth for "this detection was a wildfire" versus "this was crop burning", and training on the current rules' own output would only teach a model to copy them. The plan:

1. **Labels.** Match FIRMS detections to Forest Survey of India Van Agni forest-fire alerts (same place and day) as wildfire positives. Negatives would be cropland detections in stubble-belt states during Oct-Nov and Apr-May that no Van Agni alert matches. That is still an assumption, and it would be recorded in `labelSource`. First check that the alerts can be obtained in bulk and what their terms allow.
2. **Model.** Logistic regression over a handful of per-detection features the Worker already has: FRP, land cover, month, day/night, and the cell's fire history from the risk features. It would be exported as `ClassifierWeights` (a few numbers), so evaluating it in `classifyHotspot` stays plain arithmetic inside the 10ms budget.
3. **Evaluation.** Hold out a later season, report precision and recall for each class next to the current rules, and ship only if it beats them. The rules stay the fallback whenever weights are missing, and a fire is never hidden whichever path tags it.

## Model 3: spread prediction (scaffold)

`estimateSpread` in `logic/src/spread.ts` is a stub. It returns distance 0 over 0 hours, meaning "not estimated", with the bearing downwind when wind is usable. It never throws on missing or calm wind. It is not a validated spread model, and nothing displays it.
