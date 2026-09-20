> **CLOSED — 21 Sept 2026.** The bootstrap described below is done and committed.
> This file is kept as the record of what was asked for; it is **not a live set of
> instructions** any more. Outcome per item is at the bottom under
> [What actually happened](#what-actually-happened).
>
> If you are an agent picking this repo up now: read **`AGENTS.md`** instead, then
> `docs/MASTER.md`, then your own `delegation/<name>.md`. Remaining work is in
> GitHub issues, not here.

# Handoff — Madhuca (for Opus)

Read this file first. Then read `docs/MASTER.md` for the full project rundown (what the product is, why, settled architecture, data sources), and skim `delegation/joel.md`, `delegation/rahul.md`, `delegation/jammy.md` so whatever you scaffold matches the contracts Rahul and Jammy are already building against — don't invent a different folder structure than the one their briefs assume.

## What you're doing right now

Bootstrap the actual repo: folder structure, base configs, stub files. You're building the skeleton everyone else fills in, not the features themselves. Keep it minimal — this is a 10-day hackathon build, not a platform.

## Non-negotiable context (settled — don't re-litigate)

- **Deadline:** 30 Sept 2026 (IST). Deliverables required: live/online demo, GitHub repo, video, pitch deck.
- **Repo:** https://github.com/uncoalesced/Madhuca — Joel, Rahul, Jammy all have access.
- **Trigger model:** on-demand, not always-on. The whole pipeline (fetch hotspots → fetch wind → dispersion → classification) runs when a user opens the site. Nothing polls in the background.
- **Regions (v1 only):** Punjab, Bihar, Delhi, Telangana. Not nationwide.
- **Dropped from scope:** SAM2/OpenCV segmentation (ESA WorldCover already ships pre-computed land-cover classification — no need to run our own model). Real NOAA HYSPLIT (needs a native binary + multi-GB meteorological archives — replaced with a simplified Gaussian-puff dispersion model driven by live wind data, honestly labeled as such, not claimed to be real HYSPLIT). Automated outbound calls/SMS to officials (TRAI DLT registration for automated voice calls to Indian numbers is a multi-day paperwork process the team doesn't have time for, and the product direction shifted to a self-serve informational tool rather than a push-alert system anyway).
- **Stack:** TypeScript everywhere — React frontend, and the logic/backend layer also TypeScript, specifically so the deployment-target decision below is a deployment choice, not a rewrite.
- **TTS:** AI4Bharat Indic-TTS, self-hosted/open-source. Start with Hindi + Punjabi.
- **Data sources (all free, already confirmed working):**
  - NASA FIRMS (`https://firms.modaps.eosdis.nasa.gov/api/area/`) — active fire hotspots (MODIS/VIIRS). Needs a free `MAP_KEY` — request one if it doesn't exist yet, there's a short signup lag.
  - Open-Meteo (`https://open-meteo.com/en/docs/gfs-api`) — wind speed/direction, no API key, 10,000 free calls/day.
  - ESA WorldCover (`s3://esa-worldcover/v200/2021/map`, `--no-sign-request`) — 10m land cover (cropland/forest/other), no login. CC-BY 4.0, needs attribution in the UI.
- **Openness:** codebase is fully open source; individual dependencies don't have to be, as long as their use is disclosed (e.g. README stack section).

## Two decisions still open when this was written — check `docs/MASTER.md` §5 for whatever's newest before assuming these

1. **Deployment target.** Cloudflare Workers free tier (10ms CPU/request, tight for the dispersion+classification loop) vs. Workers Paid ($5/mo, 30s CPU — the recommended default) vs. a Cloudflare Tunnel to a real server. If Joel hasn't updated `docs/MASTER.md` with a final answer, default to building for Workers Paid, and keep the logic layer free of Node-only APIs / filesystem access at runtime so it isn't locked to one target.
2. **What the "dispatch layer" concretely is**, now that automated calls are off — an in-page alert banner, a self-serve opt-in subscription, something else. Don't scaffold this beyond a placeholder until `docs/MASTER.md` §5.2 has an answer.

## What to actually scaffold

1. **`/frontend`** — Vite + React + TypeScript. Add a map library — MapLibre GL recommended (no API key required, unlike Mapbox). Create real but empty component stubs for: map view, region selector, hotspot detail panel, TTS play button. These names/shapes should match what `delegation/rahul.md` describes, so he's filling in real files, not building his own structure from nothing.
2. **`/logic`** — a TypeScript module with stub function signatures (not full implementations — that's Joel's and Jammy's job per their briefs):
   - `fetchHotspots(region)` — FIRMS
   - `fetchWind(lat, lon)` — Open-Meteo
   - `computeDispersion(hotspot, wind)` — Gaussian-puff approximation
   - `classifyHotspot(hotspot, landCoverMask)` — cropland vs. forest/other + FRP/season heuristic
   - `synthesizeSpeech(text, langCode)` — AI4Bharat Indic-TTS wrapper
   Each gets a typed signature, a `// TODO` body, and a one-line comment on expected input/output shape — the point is to lock the contract so Rahul's frontend and Jammy's implementations don't drift apart.
3. **`/pipeline`** — `.github/workflows/landcover.yml` stub (will eventually run the ESA WorldCover clip-and-export job for the four regions) plus a placeholder script with the S3 sync command and a `// TODO: clip to region boundaries, export GeoJSON`. Stub only — finishing this is Joel's task per his brief.
4. **Root level:** `README.md` (quickstart: how to run the frontend locally, where secrets/env vars go), `.env.example` (`FIRMS_MAP_KEY=`), `.gitignore` (node_modules, .env, build output, `dist/`), and a root `package.json` using npm workspaces to tie `/frontend` and `/logic` together — don't reach for a heavier monorepo tool than that.
5. **Do not touch** `docs/` or `delegation/` — those are the team's decision/task records, already finalized for now, not code for you to scaffold around.

## Ground rules

- Nothing counts as "done" without a runnable test proving it — same rule everyone else on this project is held to (see the Definition of Done in each `delegation/<name>.md`). Stubs are fine to leave untested; anything with real logic in it needs a test.
- No speculative abstraction, no config for values that never change, no dependency beyond what's named above. This ships in 10 days.


---

# What actually happened

Bootstrap finished 21 Sept 2026. Full write-up with verification commands is in
`docs/log/joel.md`.

| Asked for | Outcome |
|---|---|
| `/frontend` — Vite + React + TS, map lib, component stubs | Done. MapLibre GL. `MapView`, `RegionSelector`, `HotspotDetailPanel`, `TtsButton`, named to match `delegation/rahul.md` |
| `/logic` — five typed stubs, contracts locked | Done. Plus `types.ts` holding the shared contract |
| `/pipeline` — workflow + script stub | Done. `landcover.sh` with the real S3 sync line, `landcover.yml` on `workflow_dispatch` |
| Root — README, `.env.example`, `.gitignore`, npm workspaces | Done |
| Don't touch `docs/` or `delegation/` | Honoured. The eight files were sitting flat at the repo root under mangled names; they were **moved** into the layout `docs/MASTER.md` §6 already describes, contents byte-identical. No edits |

Added beyond the brief, because the coordination risk it names ("so Rahul's frontend
and Jammy's implementations don't drift apart") needed something stronger than a
convention:

- **`AGENTS.md`**, imported by a one-line `CLAUDE.md`. Second half is a literal
  ordered working procedure rather than principles.
- **Issue templates** (Task / Bug / Contract change) and a **PR template** built
  around the Definition of Done — it asks for the command *and its pasted real
  output*.
- **`ci.yml`** — typecheck, build, `test --if-present` on every PR and push to main.
- **`contract-guard.yml`** — fails any PR editing `logic/src/types.ts` without the
  `contract` label and a linked issue. This is the brief's "lock the contract"
  instruction made mechanical.
- **`labeler.yml`**, **`stale.yml`** (nudges at 3 days, never closes).
- **`.gitattributes`** pinning `*.sh` to LF, so `landcover.sh` doesn't hit
  "bad interpreter" on Linux CI from a Windows CRLF checkout.

## Deliberately not done

- **No deploy workflow.** `docs/MASTER.md` §5.1 is still open; building one would
  settle that decision by accident. Built for Workers Paid as this brief says to
  default, and `logic/tsconfig.json` sets `"types": []` so a Node-only API fails
  `typecheck` rather than failing on deploy day.
- **No dispatch-layer scaffolding.** §5.2 still unanswered, as instructed.
- **No tests.** Everything is a stub with a `// TODO` body — there is no logic to
  test yet. The CI test step no-ops until someone adds a `test` script, then starts
  enforcing itself. First person to write a real body picks the runner.

## Decisions taken while scaffolding

- **maplibre-gl pinned `^6.10.0`, not v5.** v5 carries a critical XSS advisory
  (GHSA-jrc7-96c5-q579). `npm audit` reports 0. Build against the v6 API.
- **`Plume` shaped as `{ bearingDeg, distanceKm, spreadDeg }`** — the minimum that
  unblocks Rahul's overlay renderer. **Jammy owns finalising it**
  (`delegation/jammy.md` task 1) and the doc comment says so. Changing it now goes
  through the contract procedure in `AGENTS.md`.

## Open, and owned by a person — not by this file

1. **`FIRMS_MAP_KEY` has not been requested.** Still the one external dependency
   with signup lag, exactly as this brief warned. `.env.example` has the slot.
2. **Deployment topology** — `docs/MASTER.md` §5.1.
3. **What the dispatch layer is** — §5.2. Blocks Rahul's alert UI, nothing else.
4. **Branch protection is not set.** It is a repo setting, not an Action, so the
   workflows report but nothing blocks a red merge. Steps are in `AGENTS.md` →
   "Branch protection". Status checks only become selectable after they have run
   once, so push, open one throwaway PR, then add `check` and `guard`.

Seed these as issues with `.github/seed-issues.sh` once the repo push has settled.
