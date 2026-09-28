# Madhuca — Master Documentation

**Project:** Autonomous Stubble & Biomass Fire Early-Warning Radar
**Event:** Build with AI — Code for Communities, Track 2 (Clean Air & Climate Resilience)
**Deadline:** 30 Sept 2026 (IST)
**Team:** Joel, Rahul, Jammy
**Repo:** https://github.com/uncoalesced/Madhuca
**Live domain (planned):** madhuca.uncoalesced.com (separate frontend/UI from the main uncoalesced.com site; same domain, own subdomain, own everything else)

This is the single running record of what the system is and does. Every decision that changes the shape of the product gets logged here, dated, in one line. Day-to-day work goes in `docs/log/<name>.md` instead — this file is for decisions, not task diaries.

---

## 1. What it does

You open the site. At that moment it runs — pulls live active-fire hotspots (MODIS/VIIRS via NASA FIRMS) for the selected region, pulls live wind data, computes a rough smoke-dispersion direction for each hotspot, classifies each hotspot as likely wildfire vs. likely agricultural/stubble burning, and shows it all on a map. Nothing runs continuously in the background watching the sky — it's an on-demand lookup tool, not a 24/7 monitor. There is no automated outbound calling/dispatch to officials; this is an informational tool for farmers, hikers, and anyone who wants to check fire/smoke risk in their area before it's already visible to them.

**Origin story:** a friend of Joel's, John Reddy, had property in Telangana damaged by a forest fire that struck in broad daylight with no warning. This is why Telangana is one of the four launch regions, not just Punjab/Bihar/Delhi.

## 2. Launch regions

Punjab, Bihar, Delhi, Telangana. Chosen for a mix of stubble-burning prevalence (Punjab, Bihar, Delhi/NCR downwind) and wildfire relevance (Telangana). Not nationwide for v1 — land-cover/boundary data quality and demo scope both favor a focused region set.

**Known adjacent system:** the Forest Survey of India already runs a national forest-fire alert portal ("Van Agni" / fsiforestfire.gov.in) using MODIS (1km) + SNPP-VIIRS (375m), with public SMS registration. It is forest-fire-only — no stubble/crop-burning classification, no smoke dispersion/wind modeling, and no consumer-facing map UI in Indic languages. That gap is Madhuca's actual differentiation for the pitch: dispersion direction (who's downwind, not just where the fire is), the crop-burning-vs-wildfire distinction, and an accessible public UI. Worth stating explicitly in the pitch deck so judges don't mistake this for a Van Agni clone.

## 3. Data sources (all free, confirmed working)

| Need | Source | Notes |
|---|---|---|
| Active fire hotspots | [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/area/) | Free `MAP_KEY` required (request one — takes minutes). Near-real-time MODIS/VIIRS point data: lat/lon, confidence, fire radiative power (FRP). 5,000 transactions / 10-min window. |
| Wind vectors | [Open-Meteo](https://open-meteo.com/en/docs/gfs-api) | No API key needed. 10,000 free calls/day. Returns wind speed + direction (and pressure-level u/v) for any coordinate, including all four regions. |
| Land cover (cropland vs. forest) | [ESA WorldCover](https://esa-worldcover.org/en/data-access) | Free, no login: `aws s3 sync s3://esa-worldcover/v200/2021/map ... --no-sign-request`. 10m resolution, Cloud-Optimized GeoTIFF. CC-BY 4.0 — attribution required in the app footer/about page. |

**Decision: we are not running SAM2.** SAM2 was in the original brief as a way to segment satellite imagery into land-use classes ourselves, but ESA WorldCover already ships that classification pre-computed at 10m resolution, free, no GPU needed. Running our own segmentation model would be re-deriving something that already exists as a downloadable file. SAM2/OpenCV are dropped from the architecture unless a concrete future need for live imagery segmentation shows up (e.g., burn-scar extent from post-fire imagery) — not needed for v1.

**Land parcel / village boundaries:** true parcel-level land ownership data doesn't exist as clean open data for India at the resolution the original brief assumed. We use ESA WorldCover's land-*cover* classification (cropland/forest/built-up) for the fire-type classification logic instead of land-*ownership* parcels. Village name/boundary display on the map (a labeling nicety, not load-bearing) is a stretch goal, not core — see open questions below.

## 4. Architecture (settled parts)

- **Trigger model:** on-demand. Opening the site is what kicks off the fetch → compute → render cycle. No cron job scanning daily regardless of traffic.
- **Heavy lifting done once, offline, via GitHub Actions:** a workflow clips ESA WorldCover to the four launch regions and exports lightweight cropland/forest GeoJSON masks as static files the live site reads. This is where any real Python/GIS processing happens — it runs in CI, not in the user-facing request path, so it isn't constrained by whatever the live hosting environment can or can't run.
- **Live, per-request work is intentionally light:** fetch FIRMS hotspots, fetch wind for each hotspot's coordinates, run a Gaussian-puff dispersion approximation (not full HYSPLIT — see below), do a point-in-polygon lookup against the precomputed land-cover mask, return it to the frontend to render. All of this is simple enough to run as plain scripts rather than a heavy service.
- **Deployment:** the Cloudflare Workers **free tier** (settled 2026-09-21, see §5.1). Budget is 10ms CPU per request and 100k requests/day. Waiting on `fetch` does not count against CPU, but parsing and arithmetic do, and the 10ms covers the whole on-demand loop for a region rather than one hotspot. `logic/` therefore stays `fetch`-and-pure-computation only, with no date/CSV/GeoJSON library on the request path.
- **Dispersion model:** a simplified Gaussian-puff plume calculation driven by live wind data, not real NOAA HYSPLIT (which needs a native binary plus multi-GB meteorological archives — not worth the setup cost in a 10-day window). Labeled honestly in the pitch as "HYSPLIT-inspired simplified dispersion," not a claim of running the real thing.
- **TTS:** AI4Bharat Indic-TTS, self-hosted/open-source, for reading alerts aloud in Indic languages. Supported: Hindi, Punjabi, Telugu, English (`SUPPORTED_TTS_LANGUAGES` in `logic/src/tts.ts`). The live endpoint has not yet been confirmed reachable; if it isn't, the UI shows the alert as text only.
- **Where the pipeline runs:** in a Cloudflare Worker (`GET /api/radar?region=`), not the browser. The FIRMS key is a Worker secret and never a `VITE_` variable, because Vite inlines those into the public bundle. Until the Worker exists, `frontend/src/App.ts` runs the pipeline client-side for local development only.
- **No false all-clear:** "no fires detected" is shown only after a real FIRMS response returned zero rows. A missing key or failed fetch is an error state.
- **Demo mode:** `npm run dev` with `?demo` swaps FIRMS for labelled fake hotspots (`frontend/src/demoHotspots.ts`) so the UI can be tested without a key. Every scan using them says "DEMO DATA, not real fires", and production builds compile the mode out.
- **Openness:** the codebase is fully open source. Individual dependencies we use don't have to be open source themselves — closed-source tools/APIs are fine as long as their use is disclosed (e.g. in the README's stack section).
- **Dispatch:** no automated outbound calls/SMS to officials — ruled out for legal reasons (TRAI DLT registration for automated voice calls to Indian numbers takes 3–7 business days of paperwork the team doesn't have, with real per-call penalties for non-compliance) and because the product direction shifted to a self-serve lookup tool rather than a push-alert system anyway.

## 5. Open questions (not yet settled — do not build against these until resolved)

1. ~~**Deployment topology.**~~ **RESOLVED 2026-09-21 — Cloudflare Workers free tier.** Not Workers Paid, not a tunnelled server. The constraint that comes with it is real and is now a §4 architecture bullet: 10ms CPU per request, 100k requests/day, and the 10ms covers the whole region loop, not one hotspot. Writing the backend in TypeScript is what kept this a deployment decision rather than a rewrite; it still is, so nothing about `logic/` changes — `fetch` and pure computation only. Numbering below is left alone on purpose: §5.2 and §5.4 are referenced from `AGENTS.md`, `delegation/joel.md` and `.github/seed-issues.sh`.
2. **What "the dispatch layer, built for real" means** now that automated calls are off the table — an in-page alert banner, an opt-in email/SMS subscription a user sets up themselves, both, or something else. Needs one line from Joel before Rahul builds the alert UI around it.
3. Village-boundary/name labeling on the map — stretch goal, parked until 1–2 are resolved and there's time left.
4. Extra metrics floated (carbon emissions estimate, wildlife/habitat impact estimate) — explicitly not committed yet, backlog only. Don't build against these unless someone says otherwise in this file.

## 6. Folder map

- `delegation/` — who's doing what (`joel.md`, `rahul.md`, `jammy.md`). Each person edits only their own file.
- `docs/log/` — a running log per person of what was actually built and tested, dated. Update your own after finishing each task.
- `docs/MASTER.md` — this file. Decisions only.
- `docs/ROADMAP.md` — day-by-day plan to the 30 Sept submission, who does what.
- `docs/CODING_STANDARDS.md` — house rules for everyone: zero emoji in code (CI-enforced), honest documentation, no unmeasured all-clear.

---
*Log of decisions to this file (newest first):*
- **2026-09-28** — Rate limiting on `/api/radar`: the Workers Rate Limiting binding, 20 requests/min per IP (`cf-connecting-ip`), checked before any FIRMS or wind work. Chosen over precomputing an edge cache or a zone WAF rule for now — cheapest to ship and needs no separate team decision on caching semantics. A short edge cache (option 2 in `madhuca-cloudflare-handoff.md`) is still open if traffic during judging warrants it; revisit only with a team decision, since it changes the on-demand-per-open semantics in §4.
- **2026-09-28** — The frontend calls `GET /api/radar` instead of running the pipeline in the browser. One Worker serves both the built SPA (static assets from `frontend/dist`, masks included) and `/api/*`, so there is no separate Pages project and no CORS. The Indic-TTS endpoint does not resolve; the voice button falls back to the browser's own voice for that language, or says voice is unavailable, never an English voice reading Indic text.
- **2026-09-26** — Hotspots outside India are dropped. The first live FIRMS run returned 33 "Punjab" fires, 16 of them in Pakistan, because regions are queried as bounding boxes. `fetchHotspots` now filters against India's border (Natural Earth 1:10m, India point of view), clipped per region in `logic/src/india-border.ts`. The land-cover masks are still box-clipped; that does not matter, since nothing outside India reaches them now.
- **2026-09-26** — The frontend is now owned by Joel; Rahul moves to QA and pitch support. A 26 Sept browser run found the frontend showing "Clean Skies" without ever calling FIRMS, a blank map and an off-screen attribution footer; all three are fixed (`docs/log/joel.md`).
- **2026-09-26** — The pipeline moves into a Cloudflare Worker (`/api/radar`) so the FIRMS key stays a secret; Jammy owns it. Wind fetches are parallel and deduped per 0.25 degree cell.
- **2026-09-26** — A missing key or failed fetch is an error, never an all-clear. Added a dev-only `?demo` mode with fake hotspots that are always labelled as such.
- **2026-09-26** — `docs/CODING_STANDARDS.md` adopted: zero emoji in code, enforced by a CI step; log entries must paste real output and state what a check does not cover.
- **2026-09-21** — Land-cover masks carry **only `cropland` and `forest` polygons**; a point that matches nothing is `other`. That is the third value, not an error — a classifier that throws on a miss would treat most of Delhi as a failure. Output is 390m (about one VIIRS pixel), and tree cover alone is `forest`, so grassland and shrubland read as `other`. Masks are published as static assets in `frontend/public/landcover/`, which §5.1 unblocked. Details in `pipeline/README.md`.
- **2026-09-21** — §5.1 settled: deploying to the **Cloudflare Workers free tier**. Accepts a 10ms CPU budget per request for the whole region loop, which constrains dispersion and classification to cheap arithmetic — no request-path libraries for dates, CSV or GeoJSON.
- **2026-09-21** — Live fetchers landed (`fetchHotspots`, `fetchWind`). `fetchHotspots` takes the FIRMS key as an argument instead of reading the environment, because Workers has no `process` and passes secrets on the request `env`.
- **2026-09-20** — Dropped SAM2/OpenCV segmentation in favor of ESA WorldCover's pre-computed land cover. Confirmed regions: Punjab, Bihar, Delhi, Telangana. Confirmed dispatch = no automated calls, informational tool only. Confirmed dispersion = simplified Gaussian-puff, not real HYSPLIT.
