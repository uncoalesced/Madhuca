# Jammy — Work Brief

Read `docs/MASTER.md` first for the full project context, settled architecture, and the open questions list. Read `delegation/joel.md` and `delegation/rahul.md` for context on what the other two are building. **Do not edit `joel.md` or `rahul.md` — read-only for context.** Edit only this file (to check off tasks) and `docs/log/jammy.md` (to log finished work).

## Your area: the science/logic core + TTS

This is the part that decides what gets shown, not how it looks. It should be pure, testable functions wherever possible — given the same input, always the same output. That makes it the easiest part of this project to prove actually works, which matters a lot given the antigravity note below.

## Tasks

- [x] **Dispersion module (`logic/src/dispersion.ts`, `computeDispersion`)** — given a hotspot (lat, lon, FRP) and live wind data (speed + direction, from Open-Meteo) for that coordinate, compute a simplified Gaussian-puff plume. This is explicitly *not* real HYSPLIT (see `docs/MASTER.md` §4) — a physically-reasonable simplification is the goal, not scientific publication accuracy. The output shape already exists in `logic/src/types.ts` as `Plume { bearingDeg, distanceKm, spreadDeg }` — that's the minimum contract Rahul is building his overlay renderer against right now, so start from it rather than inventing a new shape. It's marked as yours to finalize: extend it if the model genuinely needs more (a polygon footprint, say), but tell Rahul before you change it, and remember `bearingDeg` is where smoke travels *to* — `Wind.directionDeg` is where it blows *from*, 180° apart, and there's already a test in `wind.test.ts` pinning that `fetchWind` does not apply that flip, so it has to happen here. Must degrade gracefully on calm/missing wind — never throw.
- [x] **Classification module (`logic/src/classify.ts`, `classifyHotspot`)** — the land-cover pipeline is done; read `pipeline/README.md` before writing this, it has three things that will bite you if you skip it:
  - The mask only contains `cropland` and `forest` polygons. A hotspot that hits neither is `other` — that's the third value, not an error. **Do not throw on a miss.**
  - Only tree cover maps to `forest`. Grassland and shrubland both read as `other`, which means Telangana scrub fires — the origin story this whole project is named after (`docs/MASTER.md` §1) — will land in `other`, not `forest`. **`other` must not default toward "likely crop-burning."** Combine it with FRP magnitude and time-of-year (stubble season ≈ Oct–Nov) the same way you would for a genuine ambiguous case, leaning wildfire unless the crop-burning signature (right season, right region, moderate/characteristic FRP) actually matches — getting this backwards misclassifies the exact fire this product exists to catch.
  - Masks are **published and on `main` now** at `frontend/public/landcover/<region>.json`, shaped as `LandCoverMask` in `types.ts` (a GeoJSON `FeatureCollection`, each feature's `properties.landCover` one of `cropland | forest`). ~1.6 MB gzipped across all four regions — read them directly, no mock data or artifact-pulling needed.
  - A fire classified as likely crop-burning still gets shown and reported — it's tagged differently, never hidden or dropped.
  - Keep the point-in-polygon check itself cheap: plain ray-casting over the mask's coordinates, no geometry library. `docs/MASTER.md` §5.1 settled on the Cloudflare Workers **free tier** — 10ms CPU covers the *whole region's hotspot loop*, not one hotspot, so this and the dispersion module are the two places that budget actually bites.
- [x] **AI4Bharat Indic-TTS integration (`logic/src/tts.ts`, `synthesizeSpeech`)** — self-hosted, open-source. Takes an alert text string + language code, returns audio. Start with Hindi and Punjabi (matches the Punjab/Bihar/Delhi region focus); add more if time allows. Wrap it as a small, clean function/API that Rahul's frontend can call — agree the input/output contract with him before he wires the play button to it.
- [x] **Unit tests for the above** — dispersion and classification are both pure math/logic, which means they're the easiest thing in this whole project to test properly. Write real test cases: a hotspot with a known wind direction should produce a plume pointed the right way; a hotspot planted inside a known cropland polygon during stubble season should classify as likely crop-burning; one inside a forest polygon outside that season should classify as likely wildfire; one that hits `other` should not crash and should not default to crop-burning. Edge cases worth covering: zero/calm wind, a hotspot exactly on a land-cover boundary, missing/null wind data (don't crash — degrade gracefully). `wind.test.ts` and `hotspots.test.ts` in `logic/test/` are the existing pattern to follow — same `node:test` runner, no new dependency.

## Definition of done (per task — this matters, read it)

Antigravity has a known habit of reporting things done when they aren't. For every task above:
1. Write the module.
2. Write the test file *first or alongside* — not after, and not skipped. Given this module is pure logic, there's no excuse for an untested version being called "done."
3. Write down the exact command to run the tests in your log entry, with what passing output looks like, so anyone can re-run it and verify for themselves.
4. Only then check the box above and log it in `docs/log/jammy.md`.

## Open items that affect you

- `docs/MASTER.md` §5.2 (what the dispatch layer is) doesn't block anything of yours — none of your tasks depend on it.
- `logic/src/types.ts` is the shared contract all three of you build against. If `Plume` needs to change shape beyond what's there, that's a **Contract change** issue per `AGENTS.md`, not a quiet edit — `contract-guard.yml` will fail the PR otherwise, and Rahul's already building against the current shape.
