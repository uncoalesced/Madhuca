# Joel — Work Log

Log finished, *tested* work here, newest entry on top. Format: date (IST), what was built, how it was verified.

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
