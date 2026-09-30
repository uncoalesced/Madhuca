# Madhuca: Project Documentation

**Autonomous Stubble and Biomass Fire Early-Warning Radar**

| | |
|---|---|
| Event | Build with AI: Code for Communities, Track 2 (Clean Air and Climate Resilience) |
| Team | Joel, Aaron and Rahul |
| Live site | https://madhuca.uncoalesced.com |
| Repository | https://github.com/uncoalesced/Madhuca |
| Submission date | 30 September 2026 |

---

## 1. Summary

Madhuca is a public web application that shows active fires across India and estimates
where their smoke is going. Visitors pick North, South, West or East India, or all of it.
When a visitor opens the site, Madhuca fetches the latest satellite fire detections and the
current wind at each fire. It then estimates the direction and reach of each smoke plume
and where the fire itself may spread, labels each fire as likely crop-residue burning or
likely wildfire, and draws the result on a map of India drawn with its official boundary.
Each fire comes with a plain-language alert in Hindi, Kannada, Telugu or English that can
be read aloud, and a large compass badge showing where the smoke is heading.

It is meant for farmers, hikers and residents who want to know about fire and smoke near
them before they can see it or smell it. It is an on-demand lookup tool. It does not run
in the background, and it does not send alerts to officials.

## 2. Background and motivation

The project began with a real incident. A forest fire in Telangana damaged property
belonging to a friend of the team. The fire started in broad daylight, and nobody had any
warning. That is why Telangana and Andhra Pradesh were among the four launch regions, next
to the regions best known for stubble burning (Punjab and Bihar) and the city that sits
downwind of them (Delhi). On 29 September 2026 the four regions were replaced by national
coverage in five views (North, South, West, East and All India), each built from whole
states.

India already runs a national forest-fire alert system: Van Agni, from the Forest Survey
of India. It uses MODIS and SNPP-VIIRS satellite data, and people can register for SMS
alerts. It covers forest fires only, though. It does not tell crop burning apart from
wildfire, it does not estimate where the smoke goes, and it has no public map in Indic
languages. Madhuca was designed to fill exactly those three gaps.

## 3. The team and their contributions

The team split the work by where it runs, not by feature. Each member owns their own area
and keeps a dated work log of what they built and how they verified it
(`docs/log/<name>.md`).

### Joel: architecture, data pipeline, frontend, integration and deployment

Joel defined the product and its architecture and set up the repository conventions the
team works by, then carried the system from its first data source through to the live
deployment.

- Wrote the product specification and decision record (`docs/MASTER.md`), the day-by-day
  roadmap, and the coding standards.
- Chose Cloudflare Workers free tier as the deployment target and set the performance
  budget that follows from it: 10 ms of CPU for each request.
- Built the offline land-cover pipeline. It uses GDAL in GitHub Actions to clip ESA
  WorldCover down to cropland and forest masks for each region.
- Wrote the live NASA FIRMS and Open-Meteo data fetchers, including the filter that drops
  detections outside India's border.
- Reworked the frontend after the first end-to-end browser tests: error states,
  map rendering, layout, the nearest-town description, and a labelled demo mode.
- Integrated the frontend with the server API and fixed a production basemap failure.
- Deployed the site and added per-IP rate limiting and a human check to the API.
- Built the fire-risk map layer and the final visual design.
- Drew the map with India's official boundary (Jammu and Kashmir and Ladakh including
  PoK, Gilgit-Baltistan and Aksai Chin), replacing the basemap's de-facto lines, and made
  water blue.
- Replaced the unreachable hosted voice with free, open-source speech that runs in the
  browser (Piper voices for Hindi and Telugu; Kannada read by the Telugu voice).
- Added the smoke-direction compass badge, translated the whole detail panel, and drew
  separate fire and smoke overlays, including a labelled "possible spread" estimate.
- Clipped the fire-risk layer to state lines and the coast, and added a national
  farmland layer from ESA WorldCover.
- Moved the app from four regions to national coverage: a state grid and a national
  land-cover grid replaced the per-region masks, and wind requests are batched so an
  all-India scan fits the free tier.
- Set up continuous integration, the contract-guard workflow and the issue templates.

### Aaron: science and logic core, server path and machine learning

Aaron built the part of the system that decides what is shown: pure, tested functions
that turn raw detections into plumes and classifications, and then the server that
runs them.

- Wrote the dispersion model (`logic/src/dispersion.ts`). It is a simplified
  Gaussian-puff approximation driven by live wind, and it degrades safely when wind data
  is calm or missing.
- Wrote the fire classifier (`logic/src/classify.ts`). It combines land cover, season,
  region and fire radiative power, and it deliberately leans towards "wildfire" rather
  than "crop burning" when the evidence is ambiguous.
- Hardened the classifier against edge cases: polygon boundaries and holes,
  multi-polygons, and all four regional masks. Its rules carried over unchanged when the
  masks were replaced by national grids.
- Wrote the Indic text-to-speech wrapper (`logic/src/tts.ts`).
- Built the Cloudflare Worker behind `GET /api/radar`, with parallel wind requests
  deduplicated by grid cell.
- Measured the Worker's CPU use against the free-tier budget, found that the land-cover
  masks exceeded it on a cold start, and fixed that with a prebuilt binary index, loading in
  under 1 ms. That measurement shaped the national grids that replaced it.
- Added Cloudflare Turnstile verification to the API.
- Built the experimental 14-day fire-risk model for Telangana and Andhra Pradesh, with a
  held-out evaluation against simple baselines.

### Rahul: frontend foundations, quality assurance and pitch

Rahul built the first working version of every frontend component, then took on
quality assurance on real devices and the pitch material.

- Built the original map view, region selector, smoke-plume geometry, per-fire detail
  panel, text-to-speech button, and the loading, empty and error states, together with
  their unit tests. These components became the base of the current frontend.
- Wrote the plain-language alert text in four languages and the fire-intensity scale
  shown in the detail panel.
- Wrote the phone QA checklist covering every region and interface state, and ran an
  early pass that found two defects in how calm-wind plumes are described.
- Wrote the README disclosure of every dependency and external service.
- Drafted the pitch deck content and the demo video script.

## 4. How it works

```
Visitor opens the site
        |
        v
Cloudflare Worker  GET /api/radar?region=north|south|west|east|india
  1. NASA FIRMS        active fire detections in the region's box
  2. State grid        keep fires in the region's states (drops Pakistan, Nepal, sea)
  3. Open-Meteo        wind, batched: 100 locations per request, 0.5 degree cells
  4. Dispersion        simplified Gaussian-puff plume: bearing, reach, spread, wind speed
  5. Classification    ESA WorldCover land cover + season + state + fire power
        |
        v
Browser (React + MapLibre GL)
  markers, fire footprint and possible-spread haze, dotted smoke plume,
  detail panel with compass badge, alert text and voice in four languages
```

**Heavy work runs offline.** Geographic processing runs once, offline, and publishes static
files: India's state and country boundaries, a grid saying which state every point is in
(about 110 m), a national land-cover grid (about 550 m) and a farmland image. Looking a
fire up in either grid is a single array read. Training the
fire-risk model is also offline. Neither of them runs while a visitor is waiting.

**Light work runs per request.** The Worker does only network fetches and cheap
arithmetic. Everything a region needs has to fit in the free tier's 10 ms CPU budget;
3000 fires across all of India measured about 4 ms.

**Voice runs on the phone.** The device's own voice is used when it has the language.
Otherwise a Piper voice model runs in the browser, downloaded once. No server and no paid
service is involved.

**The dispersion model is an approximation.** It is a simplified Gaussian-puff
calculation, not NOAA HYSPLIT. It estimates which direction smoke travels and roughly how
far. It does not forecast concentrations.

## 5. Data sources

| Purpose | Source | Terms |
|---|---|---|
| Active fire detections | NASA FIRMS (VIIRS and MODIS) | Free, API key required |
| Wind | Open-Meteo (GFS) | Free, no key |
| Land cover | ESA WorldCover 2021, 10 m | CC-BY 4.0, attribution shown in the app |
| Country borders | Natural Earth 1:10m, India point of view | Public domain |
| State boundaries | DataMeet States/Admin2 (Survey of India outline) | Attribution shown in the app |
| Places | Natural Earth 1:10m populated places | Public domain |
| Alert voices | Piper voices (rhasspy/piper-voices), onnxruntime-web | Open source, loaded on first use |
| Basemap | CARTO Positron, OpenStreetMap data | Attribution shown on the map |

## 6. Design principles

The team agreed on these rules early, and they apply to every change:

1. **No false all-clear.** "No fires detected" appears only after NASA FIRMS actually
   returned zero results. A missing key, a failed request or a timeout is shown as an
   error.
2. **Crop burning is tagged, never hidden.** Every detected fire is shown on the map.
3. **Approximations are labelled.** The dispersion model is described as "simplified
   Gaussian-puff, not HYSPLIT" in the interface, the documentation and the pitch.
4. **Ambiguity leans towards safety.** Grassland and scrub fires are never presumed to be
   crop burning. The fire that inspired the project was one of these.
5. **Secrets stay on the server.** The FIRMS key is a Worker secret and never reaches the
   browser.
6. **Built for low-end phones.** No model runs on the device, and the page does as little
   work as it can.
7. **Accessible language.** Alerts are written for non-specialists, in the language of
   the fire's state, with compass directions translated too.
8. **India as it is.** The map shows India's official boundary, and fires in
   Gilgit-Baltistan and Aksai Chin are Indian fires.

## 7. Repository layout

| Path | Contents |
|---|---|
| `frontend/` | Vite, React and MapLibre GL web application |
| `logic/` | Framework-free TypeScript: fetchers, dispersion, classification, TTS |
| `worker/` | Cloudflare Worker that serves the site and `/api/radar` |
| `pipeline/` | Offline boundary and land-cover processing (Node, Python) |
| `ml/` | Offline fire-risk model (Python, NumPy, scikit-learn) |
| `docs/` | Decision record, roadmap, coding standards, and each member's work log |
| `delegation/` | Each member's work brief |

## 8. Running and testing

```bash
npm install
npm run dev                          # frontend at http://localhost:5173
npm run typecheck                    # type checks across all workspaces
npm run build                        # production build
npm test --workspaces --if-present   # unit tests (Node's built-in test runner)
```

Adding `?demo` to the development URL loads clearly labelled demo hotspots, so the
interface can be tried without a FIRMS key. Production builds cannot load demo data.

Continuous integration runs the same type check, build and tests on every pull request.
It also runs a check that keeps emoji out of the code, and a guard that blocks unannounced
changes to the shared data types in `logic/src/types.ts`.

## 9. Development workflow and tooling

The team worked in parallel against a shared type contract (`logic/src/types.ts`), with
a written brief for each member and a dated log of what they had verified. Work was
tracked in GitHub issues, and every change went through a pull request that had to pass CI.
Before any work counted as done, it needed a check that someone else could re-run, logged
with its real output.

AI-assisted development tools were part of the workflow. The engineers used them under
their own direction and reviewed and tested what they produced:

- **Google Antigravity.** Antigravity is Google's agentic development platform. It has an
  editor view for hands-on coding, and an Agent Manager for dispatching and supervising
  agents that plan, write and test code across the workspace. Aaron and Rahul used it,
  with Gemini models. `GEMINI.md` points its agents at the shared repository guidance.
- **Claude Code.** Joel used Claude Code, Anthropic's agentic coding tool, in the Claude
  desktop app, for implementation, verification in a built-in browser, and
  documentation.
- **Shared agent guidance.** `AGENTS.md` and `docs/CODING_STANDARDS.md` give every tool
  the same instructions: the architecture, the domain rules, and the definition of done.
  Because of these files, the team's own standards applied to AI-assisted changes too.

These tools sped up implementation. The product decisions, the architecture, the
safety rules and the final review of every change stayed with the team.

## 10. Known limitations

- The dispersion model estimates direction and reach, not smoke concentration.
- Land cover is resolved at about 550 m. Grassland, scrub and mangrove are grouped as
  "other".
- Satellites can miss small, short-lived or cloud-covered fires.
- "Possible spread" is a rule of thumb (10% of wind speed over three hours), not a
  fire-spread model.
- On a phone without its own voice for the language, the first alert read aloud downloads
  about 80 MB. Kannada is read by the Telugu voice, so it has a Telugu accent.
- Alerts exist in four languages only; fires in other states default to English.
- The fire-risk layer is experimental, covers Telangana and Andhra Pradesh only, and a
  low value is never an all-clear.

## 11. Attribution

Contains modified Copernicus Sentinel data, © ESA WorldCover project 2021 (CC-BY 4.0).
Fire data from NASA FIRMS. Wind data from Open-Meteo. Map data © OpenStreetMap
contributors, basemap by CARTO. Border and place data from Natural Earth. State boundaries
from DataMeet. Voices from the Piper project.

The source code is open. Every dependency and external service the project uses,
including the closed-source ones, is listed in `README.md`.
