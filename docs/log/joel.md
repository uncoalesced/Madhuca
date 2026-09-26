# Joel — Work Log

Log finished, *tested* work here, newest entry on top. Format: date (IST), what was built, how it was verified.

---

## 2026-09-26 — Hotspots clipped to the India border

The first live FIRMS run (key now in gitignored `frontend/.env.local` and `.env`)
returned 33 "Punjab" hotspots. 16 of them were in Pakistan, because FIRMS is queried
by bounding box and the Punjab box reaches past Wagah; the Bihar box likewise reaches
into Nepal. The live CSV has no `country_id` column, so the border has to come from us.

- `pipeline/india-border.mjs` (one-off, plain Node): Natural Earth 1:10m admin-0,
  India point of view, clipped to each `REGION_BBOX` + 0.2 deg (Sutherland-Hodgman),
  simplified at 0.001 deg. Writes `logic/src/india-border.ts`: punjab 171 vertices,
  bihar 402, delhi 4, telangana 134.
- `fetchHotspots` filters with `insideIndia(region, lon, lat)`, an even-odd ray cast.
  `parseHotspotCsv` is unchanged.
- First attempt simplified at 0.005 deg. Checked against the unsimplified polygon, it
  put a real fire at 31.10034 N, 74.63828 E (about 500 m from the border) on the wrong
  side. At 0.001 deg: 0 disagreements on the 33 live points and on 20,000 random points
  in the Punjab box; one region check over 33 hotspots takes 0.05 ms.

### How to re-run

```bash
npm test --workspaces --if-present
```

New tests in `logic/test/hotspots.test.ts`: Amritsar, Raxaul, Patna, New Delhi and
Hyderabad inside; Lahore, Sialkot and Birgunj (Nepal) outside; `fetchHotspots` given
Amritsar + Lahore returns only Amritsar.

Output (26 Sept):

```
ℹ tests 57
ℹ pass 57
ℹ fail 0
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

`npm run typecheck` clean, `npm run build` "built in 2.85s", emoji scan exit 0.
Browser, live key, Punjab: banner went from 33 to 17 hotspots at 0.005 deg, and to 16
at 0.001 deg ("16 Active Fire Hotspots in Punjab", 16 markers on the map).

### Not covered

- Bihar returned 0 live hotspots today, so the Nepal side is proven by the unit test only.
- The border is Natural Earth's, accurate to a few hundred metres; a fire right on the
  line can still land on the wrong side.
- The land-cover masks are still clipped by box, not border. Nothing outside India
  reaches the classifier now, so this has no effect.

---

## 2026-09-26 — Frontend rework after a browser test run

The frontend from commit 0119bea typechecked, built and passed its unit tests, but a
run in the browser showed it did not work end to end. Fixed in `frontend/`:

- **False all-clear.** `App.ts` called `runRadarPipeline(region, undefined, ...)`, so
  FIRMS was never queried and every region said "Clean Skies". A missing key is now an
  error: "FIRMS key not configured, so no fire data was fetched. This is not an
  all-clear." In `npm run dev` only, the key can come from `VITE_FIRMS_MAP_KEY` for
  local testing; the branch is compiled out of production builds.
- **Blank map.** Two causes: `maplibre-gl.css` was never imported (now in `main.tsx`,
  not `MapView.ts`, so node tests can still import the component), and Vite's dep
  pre-bundling moved maplibre into `.vite/deps` without its worker file, so the worker
  404'd and no tiles loaded (`optimizeDeps.exclude` in `vite.config.ts`). The map
  `load` handler also read a stale closure, so plumes arriving before `load` never
  drew; it now reads a ref.
- **Layout.** The map canvas was 4096px tall and pushed the ESA attribution footer off
  screen. The app is now a viewport-height flex column; the footer stays visible.
- **Detail panel.** `useState` ran after an early return (hook-order bug), now fixed.
  The title is "About N km <direction> of <town>" instead of a raw satellite ID, which
  also delivers the brief's nearest-town item (`distanceAndBearing` in
  `utils/plumeGeometry.ts`, fixed town list in the panel).
- **Wind** is fetched in parallel, one call per 0.25 degree cell. The try/catch that
  forced any classification failure to "likely-wildfire" is gone.
- **Emoji:** all 16 lines removed (issue #5).
- **`?demo`** (dev only) loads fake hotspots from `frontend/src/demoHotspots.ts`,
  labelled "DEMO DATA, not real fires". A Telangana demo point first landed on
  cropland; the classifier was right, the point was moved onto forest (16.2, 78.7).

### How it was verified

Browser (Claude Code preview, `npm run dev`):
- `http://localhost:5173/` shows the red no-key error banner, basemap tiles, and the footer inside the viewport.
- `http://localhost:5173/?demo` (Punjab): 4 markers (2 stubble, 2 wildfire), plume wedges, and tapping a marker opened the panel reading "About 15 km West of Ludhiana". No console errors from app code.
- Prod bundle: `grep "DEMO DATA\|VITE_FIRMS" frontend/dist/assets/*.js` finds nothing. The fake coordinate array is still in the bundle but unreachable.

Commands:

```bash
npm run typecheck
npm run build
npm test --workspaces --if-present
```

Output (26 Sept, this branch):

```
> @madhuca/frontend@0.0.0 typecheck
> tsc --noEmit

✓ built in 2.84s
ℹ tests 55
ℹ pass 55
ℹ fail 0
ℹ tests 25
ℹ pass 25
ℹ fail 0
emoji scan exit=0
```

### Not covered / still open

- TTS playback not tested against the live endpoint.
- Compass words are English inside Hindi/Punjabi/Telugu alert text.
- Favicon 404, and one unexplained failed name lookup in the console.
- No automated tests yet for no-key → error, 3 hotspots → 3 markers, or panel close/reopen. Those were checked by hand in the browser only.

---

## 2026-09-21 — Land-cover masks published, and a bug in the publish step

All four masks are now committed at `frontend/public/landcover/<region>.json` and
served as static assets. 13 MB raw, about 1.6 MB total over the wire once gzipped.
`.git` is 2.7 MB, so the repo cost is small — git compresses GeoJSON about as well as
gzip does.

**The first `publish=true` run reported success and published nothing.** The step
checked for changes with `git diff --quiet -- frontend/public/landcover` *before*
staging. `git diff` does not look at untracked files, so on the very first publish —
when nothing under that path is tracked yet — it saw no change and took the
"masks unchanged, nothing to commit" branch. Green tick, empty directory.

Caught by looking for the directory afterwards rather than trusting the tick, which is
the whole reason this repo's rule is to check the thing rather than the report. Fixed by
staging first and comparing against the index (`git diff --cached --quiet`), then
re-running.

### How it was verified

```bash
git pull --ff-only
ls -la frontend/public/landcover/
npm run build
```

```
644  bihar.json  5.8M
644  delhi.json  93.7K
644  punjab.json  1.3M
644  telangana.json  4.9M
```

The build is the part worth checking, because a 13 MB directory in the wrong place gets
bundled into the JS:

```
✓ 40 modules transformed.
dist/index.html                   0.42 kB │ gzip:  0.29 kB
dist/assets/index-Bupx-HIY.css    0.16 kB │ gzip:  0.15 kB
dist/assets/index-BxQZSXnu.js   223.15 kB │ gzip: 69.60 kB
✓ built in 583ms
```

The JS bundle is byte-identical to the build before the masks existed, which is the
proof that Vite copied `public/` through untouched instead of bundling it. They land in
`dist/landcover/` and parse:

```
punjab     region=punjab features=3727 type=FeatureCollection
bihar      region=bihar features=21339 type=FeatureCollection
delhi      region=delhi features=367 type=FeatureCollection
telangana  region=telangana features=15847 type=FeatureCollection
```

So the app fetches one region's mask on demand, not all four up front.

Published by https://github.com/uncoalesced/Madhuca/actions/runs/35600240871.

### Still open / not done

- **`delegation/jammy.md` and `delegation/rahul.md` both still say the masks are not
  committed.** That was true when they were written an hour ago and is not any more.
  Not corrected here, because `delegation/joel.md` says those two files are read-only
  to me — someone who owns them should fix the line, or say it is fine for me to.
- Re-running the workflow with `publish=true` after a region or class-mapping change is
  now the refresh path. Once branch protection is on it will need a bypass or a PR,
  since the step pushes to the branch it ran from.

---

## 2026-09-21 — Offline land-cover pipeline

`pipeline/landcover.sh` is real. All four masks build in about 32 seconds, and the
workflow asserts on a known answer rather than on having run.

**The stub would not have worked.** Two things in it were wrong in ways that only
show up on a real run: it opened with `aws s3 sync s3://esa-worldcover/v200/2021/map`,
which is terabytes and would have filled the runner disk, and the script was committed
`100644`, so `./pipeline/landcover.sh` would have died with "Permission denied" before
reaching any of it.

**No syncing at all now.** `gdalwarp` reads the Cloud-Optimized GeoTIFFs straight off
S3 over `/vsis3/` with `AWS_NO_SIGN_REQUEST=YES`, so it fetches only the byte ranges it
needs and, because the output is heavily downsampled, reads a prebuilt overview level
rather than 10m pixels it is about to throw away. That is why Punjab — four 3°×3°
tiles — takes five seconds instead of an hour.

**Three decisions worth knowing, all documented in `pipeline/README.md`:**

- **390m output (0.0035°).** Roughly one VIIRS pixel. There is no point resolving land
  cover finer than the hotspot it is being used to classify, and every step finer
  multiplies both the polygon count and what a farmer's phone downloads.
- **Only `cropland` and `forest` polygons are written; a miss is `other`.** That is the
  third value, not an error. It is most of the file size gone for information nobody
  reads. **Jammy: a lookup that throws on a miss will classify half of Delhi as a
  failure.**
- **Grassland and shrubland are `other`, not `forest`.** Class 10 (tree cover) alone
  maps to `forest`, so scrub fires in Telangana land in `other`. One-line change here
  if that turns out to matter for classification — say so rather than working around it.

**Publishing was the half of this task blocked on §5.1.** With the Workers free tier
settled, the answer is static assets in `frontend/public/landcover/`: Vite copies
`public/` through untouched rather than bundling it, so the app fetches only the region
the user picked instead of shipping all four in the JS. The workflow has a `publish`
input, off by default, that commits them there.

### How it was verified

The bbox-to-tile arithmetic is the one piece of real logic, and the one that is
silently wrong when it is wrong — a missing tile does not fail the run, it produces a
mask with a blank strip down one side and every hotspot in that strip classifies as
`other`. It has its own check, which needs no GDAL:

```bash
./pipeline/test-tiles.sh
```

```
ok   punjab -> N27E072 N27E075 N30E072 N30E075
ok   bihar -> N24E081 N24E084 N24E087 N27E081 N27E084 N27E087
ok   delhi -> N27E075
ok   telangana -> N15E075 N15E078 N15E081 N18E075 N18E078 N18E081
ok   an unknown region is refused

all tile checks passed
```

Everything downstream of that is GDAL doing GDAL's job, so it is checked by actually
running the workflow. Two dispatches on `dev-joel`, `publish=false`:

- Punjab only — https://github.com/uncoalesced/Madhuca/actions/runs/35598580851
- All four — https://github.com/uncoalesced/Madhuca/actions/runs/35598712810

```
==> punjab: 4 tile(s), bbox 73.8 29.5 76.95 32.55
    pipeline/out/punjab.json — 3727 features, 1.4M
==> bihar: 6 tile(s), bbox 83.3 24.2 88.3 27.55
    pipeline/out/bihar.json — 21339 features, 5.8M
==> delhi: 1 tile(s), bbox 76.8 28.4 77.4 28.9
    pipeline/out/delhi.json — 367 features, 96K
==> telangana: 6 tile(s), bbox 77.2 15.8 81.85 19.95
    pipeline/out/telangana.json — 15847 features, 5.0M

landCover at 75.60E 30.70N: cropland
PASS: known Punjab cropland point resolves to cropland
```

That last pair is the check the task was written around — a point known to sit in
Punjab cropland, farmland between Ludhiana and Jagraon, resolving to `cropland`. It
runs inside the workflow, so it cannot be skipped and then reported as passing.

**5.8M for Bihar looked far too heavy for the users we actually have**, so I measured
what goes over the wire rather than guessing, since Cloudflare serves static assets
compressed:

```
bihar.json       raw    5.77 MB   gzip   0.73 MB   8.0x
delhi.json       raw    0.09 MB   gzip   0.01 MB   8.2x
punjab.json      raw    1.31 MB   gzip   0.19 MB   6.9x
telangana.json   raw    4.92 MB   gzip   0.68 MB   7.3x
```

GeoJSON is repetitive text and compresses about 8x, so the worst region is 0.73 MB
transferred. That is acceptable on a phone, and it is why the resolution stays at 390m
instead of being coarsened.

Last check: the output shape, and whether the class codes are the right way round. If
40 and 10 had been swapped, every region would still build and still look plausible, so
I compared area share against what these states are actually like — counts alone do not
show it, because contiguous cropland merges into a few huge polygons while scattered
tree cover fragments into thousands of small ones.

```
punjab.json     region=punjab | top-level keys: region,features | fc.type=FeatureCollection
punjab.json     cropland 84.0%  forest 16.0%
bihar.json      cropland 72.9%  forest 27.1%
delhi.json      cropland 85.4%  forest 14.6%
telangana.json  cropland 67.4%  forest 32.6%
```

Punjab at 84% cropland matches its real agricultural share, and every file is
`{ region, features }` with a `FeatureCollection` inside — `LandCoverMask` from
`logic/src/types.ts`, unchanged, so this is not a contract change. Percentages are of
mapped area only, since `other` is deliberately absent.

### Still open / not done

- ~~The masks are not committed anywhere yet.~~ **Published 2026-09-21** — see the
  entry above.
- Publishing pushes to whichever branch the run started from, so once branch protection
  is on it will need a bypass or a PR.
- The region bounding boxes now exist twice — `bbox_for` in `pipeline/landcover.sh` and
  `REGION_BBOX` in `logic/src/hotspots.ts`. Both carry a comment pointing at the other.
  Nothing enforces it, because one side is shell that only runs in CI and the other is
  TypeScript that ships to Workers; a mask narrower than the box the hotspots came from
  would silently classify the edges as `other`.
- The 2021 WorldCover release is the newest one, so these masks are not going to drift.
  This workflow should not need running again unless a region or a class mapping changes.

---

## 2026-09-21 — Live data fetchers, test runner, and §5.1 settled

First real logic in the repo. `fetchHotspots` and `fetchWind` have bodies; everything
else in `logic/` is still a stub.

**`fetchWind(lat, lon)`** — Open-Meteo GFS, no key. Returns `{ speedMs, directionDeg,
observedAt }`. Two things worth knowing:

- Open-Meteo sends `"time":"2026-09-21T11:45"` — no seconds, no `Z` — in the
  request's timezone, which defaults to GMT. `Wind.observedAt` is specified as ISO
  8601 UTC, so the parser marks it rather than leaving a naive timestamp that
  `new Date()` would read as local time on a phone in IST.
- `directionDeg` is passed through untouched. It is meteorological — the direction
  wind blows *from*. The 180° flip to `Plume.bearingDeg` belongs in Jammy's
  dispersion module, and there is a test asserting this function does not do it, so
  the two do not both apply it and cancel out.

**`fetchHotspots(region, mapKey)`** — FIRMS VIIRS_SNPP_NRT area CSV, 1-day range.
Three decisions in here:

- **The signature gained a `mapKey` argument.** `logic/` has to run on Workers, where
  there is no `process` and secrets arrive on the request `env` — and
  `logic/tsconfig.json`'s `"types": []` makes reading `process.env` a typecheck
  failure by design. So the caller reads the key and passes it. Not a `types.ts`
  change, so `contract-guard` does not fire, and nobody was calling it yet either:
  `grep -rn "fetchHotspots" frontend/src logic/src` returned only the definition and
  the barrel export.
- **FIRMS answers a bad key with HTTP 200 and the plain sentence `Invalid MAP_KEY.`**,
  not an error status. Confirmed live against the real endpoint. So `response.ok` is
  not enough; the parser checks for the `latitude`/`longitude` header columns and
  throws with the body prefix if they are absent. Columns are looked up by *name*
  rather than by position, because MODIS and VIIRS differ in their brightness columns.
- **The key travels in the URL path** — that is FIRMS's API design, not a choice. No
  error message in that module includes the URL, and a test asserts the key does not
  appear in the thrown message on a non-OK response.

`REGION_BBOX` is exported alongside it: `[west, south, east, north]` for the four
regions, which is both the FIRMS area-query format and what `MapView`'s "fit bounds
to `region`" TODO needs, so Rahul does not have to redefine it.

**Test runner: Node's built-in `node:test`.** First real logic picks the runner, per
`AGENTS.md`. It runs TypeScript directly on Node 24+, so it adds no dependency and no
transpile step. The test files sit in `logic/test/`, outside `logic/tsconfig.json`'s
`include`, which means they can use `node:` built-ins without weakening the
`"types": []` guard on `src/`. `.github/workflows/ci.yml` moved from Node 22 to 24 —
`node --test` only discovers `.ts` files on a Node with type stripping on by default.

**§5.1 is settled: the Cloudflare Workers free tier.** Recorded in `docs/MASTER.md`
§4, §5.1 and the decision log. The 10ms CPU budget is a real constraint on Jammy's
modules — it covers the whole region loop, not one hotspot — so it is written into
`AGENTS.md` rather than left in the decision log where nobody would read it. It is
also why the CSV parser sorts on the ISO string instead of parsing dates, and why
there is no CSV library.

### How it was verified

```bash
npm test          # node:test over logic/test/, 16 tests
npm run typecheck # tsc --noEmit, both workspaces
npm run build     # typecheck + vite build -> frontend/dist
```

`npm test`:

```
✔ parses a recorded FIRMS CSV into hotspots (8.2111ms)
✔ orders hotspots newest first (0.2538ms)
✔ keeps FIRMS confidence raw rather than normalising it (0.123ms)
✔ zero-pads a three-digit acq_time (0.109ms)
✔ throws when FIRMS answers a bad key with HTTP 200 and plain text (0.4642ms)
✔ treats an empty result set as zero hotspots, not an error (0.1047ms)
✔ rejects an empty map key before making a request (0.6754ms)
✔ queries the selected region bbox and never leaks the key in an error (21.0085ms)
✔ every v1 region has a west,south,east,north bbox (0.1854ms)
✔ parses a recorded Open-Meteo response into Wind (1.1023ms)
✔ leaves the direction meteorological — the direction wind blows FROM (0.1097ms)
✔ marks the timestamp as UTC (0.1155ms)
✔ keeps a dead calm as a real reading rather than an error (0.0858ms)
✔ throws when the response carries no current wind block (0.2923ms)
✔ requests m/s and current 10m wind for the given coordinate (22.4814ms)
✔ surfaces a non-OK HTTP status (0.5298ms)
ℹ tests 16
ℹ pass 16
ℹ fail 0
```

`npm run build`:

```
> @madhuca/frontend@0.0.0 build
> tsc --noEmit && vite build

vite v7.3.6 building client environment for production...
✓ 40 modules transformed.
dist/index.html                   0.42 kB │ gzip:  0.29 kB
dist/assets/index-Bupx-HIY.css    0.16 kB │ gzip:  0.15 kB
dist/assets/index-BxQZSXnu.js   223.15 kB │ gzip: 69.60 kB
✓ built in 713ms
```

The unit tests are hermetic — recorded responses, stubbed `fetch`. To prove the wind
fetcher works against the live API rather than against my idea of it, I also ran it
for real, once, over the centroid of each region bbox:

```
punjab     {"speedMs":3.62,"directionDeg":28,"observedAt":"2026-09-21T11:45:00Z"}
bihar      {"speedMs":2.32,"directionDeg":173,"observedAt":"2026-09-21T11:45:00Z"}
delhi      {"speedMs":3.95,"directionDeg":351,"observedAt":"2026-09-21T11:45:00Z"}
telangana  {"speedMs":2.82,"directionDeg":354,"observedAt":"2026-09-21T11:45:00Z"}
```

To re-run that live check, save this as `logic/smoke-tmp.ts`, run `node smoke-tmp.ts`
from `logic/`, and delete it afterwards — it is a one-off probe, not a test:

```ts
import { fetchWind } from './src/wind.ts';
import { REGION_BBOX } from './src/hotspots.ts';

for (const [region, [w, s, e, n]] of Object.entries(REGION_BBOX)) {
  const wind = await fetchWind((s + n) / 2, (w + e) / 2);
  console.log(region.padEnd(10), JSON.stringify(wind));
}
```

### Still open / not done

- **`fetchHotspots` has never made a successful live call.** There is still no
  `FIRMS_MAP_KEY`; it is the one external dependency with signup lag and it has now
  been outstanding for two days. The parser is proven against a recorded CSV and
  against the real `Invalid MAP_KEY.` response, which is the bar the task set, but
  the column names in that recorded header come from the FIRMS docs, not from a
  response I actually received. **First thing to do once the key exists:** call
  `fetchHotspots('punjab', key)` the same way as the wind probe above, and diff the
  real header line against the one in `logic/test/hotspots.test.ts`. Requesting the
  key needs a human at a signup form.
- Land-cover pipeline, integration and deploy are untouched — `pipeline/landcover.sh`
  is still the stub with a real `aws s3 sync` line and a TODO loop.
- **§5.2 (what the dispatch layer is) is still open.** Rahul stays blocked on one
  line from Joel before building any alert UI.
- **Branch protection is still not set**, and the backlog is still unseeded —
  `.github/seed-issues.sh` has not been run, so the repo has 0 issues and this work
  has no issue to close. Both are one-time Joel tasks that need the web UI.

---

## 2026-09-21 — Repo bootstrap: skeleton, templates, CI, coordination workflows

Scaffolded the repo from nothing per `HANDOFF.md`. Everything below is structure and
tooling — no feature logic was written, so there is nothing here to unit-test yet.

**Restructured the docs.** `docs/`, `docs/log/` and `delegation/` did not exist; the
eight markdown files were sitting flat at the root with mangled names (`joel_1.md`
was this file). Moved them into the layout `docs/MASTER.md` §6 already describes.
Contents untouched — verified byte-identical against the copies in the Heafod vault
before moving.

**`/frontend`** — Vite + React + TypeScript + MapLibre GL. Component stubs named to
match `delegation/rahul.md`: `MapView`, `RegionSelector`, `HotspotDetailPanel`,
`TtsButton`. ESA WorldCover attribution is in the footer from day one, since CC-BY
4.0 requires it and it is the kind of thing that gets deleted during a restyle.

**`/logic`** — typed signatures with `// TODO` bodies for `fetchHotspots`,
`fetchWind`, `computeDispersion`, `classifyHotspot`, `synthesizeSpeech`, plus the
shared contract types. `logic/tsconfig.json` sets `"types": []` deliberately: it
makes a Node-only API fail `typecheck` rather than fail on deploy day, which keeps
§5.1 a deployment choice instead of a rewrite.

`Plume` is shaped as `{ bearingDeg, distanceKm, spreadDeg }` — the minimum that
unblocks Rahul's overlay renderer. **Jammy owns finalising it** (`delegation/jammy.md`
task 1); the doc comment says so.

**`/pipeline`** — `landcover.sh` with the real `aws s3 sync` line and a TODO for the
clip-and-export, plus a `workflow_dispatch` stub. CI-side only.

**Root** — `README.md`, `.env.example` (`FIRMS_MAP_KEY`), `.gitignore`, and npm
workspaces tying `frontend` and `logic` together.

**`AGENTS.md`**, imported by a one-line `CLAUDE.md` so the two cannot drift. Covers
the contract discipline, which §5 questions are unanswered and must not be built
against, and the domain rules that are easy to get wrong. Second half is a literal
ordered Working Procedure — written as steps rather than principles because
Antigravity needs it that way.

**Issue and PR templates.** Task / Bug / Contract change forms, blank issues
disabled. The PR template demands the command *and its pasted real output*, not a
claim that tests pass.

**Workflows.** `ci.yml` (typecheck, build, `test --if-present` on every PR and push
to main), `contract-guard.yml` (fails a PR editing `logic/src/types.ts` without the
`contract` label and a linked issue), `labeler.yml`, `stale.yml` (nudges at 3 days,
never closes). No deploy workflow — §5.1 is still open and building one would settle
that decision by accident.

### How it was verified

```bash
npm ci                              # clean, 0 vulnerabilities
npm run typecheck                   # tsc --noEmit, both workspaces, passes
npm run build                       # produces frontend/dist
npm test --workspaces --if-present  # exits 0 as a no-op, as intended
```

Workflow and template YAML was parsed, every issue-form field checked against
GitHub's allowed keys per block type, and the inline `github-script` body checked
with `node --check`.

### Things found along the way

- **maplibre-gl v5 carries a critical XSS advisory** (GHSA-jrc7-96c5-q579). Pinned
  `^6.10.0` instead; `npm audit` reports 0. Rahul should build against the v6 API.
- The issue-form field check caught a real error before it shipped: a `validations`
  block on a `checkboxes` field, which GitHub rejects at template-load time.
- `.gitattributes` pins `*.sh` to LF. This repo is developed on Windows with
  `core.autocrlf=true`, and `pipeline/landcover.sh` runs on Linux in CI, where a
  CRLF shebang fails as "bad interpreter".

### Still open / not done

- **Branch protection is not set** — it is a repo setting, not an Action, and needs
  admin access on github.com/uncoalesced/Madhuca. Exact ruleset steps are in
  `AGENTS.md` → "Branch protection". Until that is done the workflows report but
  nothing blocks a red merge.
- **`FIRMS_MAP_KEY` has not been requested.** Still the one external dependency with
  signup lag. `.env.example` has the slot; the key does not exist yet.
- **§5.1 (deployment target) and §5.2 (what the dispatch layer is) are untouched.**
  Built for Workers Paid as `HANDOFF.md` says to default, and scaffolded nothing for
  the dispatch layer.
- Unrelated: the Heafod vault repo has a **GitHub PAT in plaintext** in its
  `.git/config` remote URL. Not this repo, not touched — worth rotating.

---

*(empty — log your first completed task above this line)*
