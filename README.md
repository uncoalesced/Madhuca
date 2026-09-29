# Madhuca

<<<<<<< HEAD
Autonomous stubble & biomass fire early-warning radar for India: North, South, West or
East India, or all of it. Open the site and it pulls live NASA FIRMS fire hotspots, pulls live wind,
computes a rough smoke-dispersion direction per hotspot, tags each one as likely
wildfire vs. likely crop/stubble burning, and renders it on a map.
=======
Madhuca is an early-warning radar for stubble and biomass fires in Punjab, Bihar, Delhi
and Telangana / Andhra Pradesh. When you open the site, it pulls live NASA FIRMS fire
hotspots and live wind, works out a rough smoke-dispersion direction for each hotspot,
tags each one as likely wildfire or likely crop/stubble burning, and puts them on a map.
>>>>>>> origin/main

It only runs when someone opens it. Nothing polls in the background.

Full context, the settled architecture and the open decisions are in
[`docs/MASTER.md`](docs/MASTER.md).

## Quickstart

```bash
npm install
cp .env.example .env    # then fill in FIRMS_MAP_KEY
npm run dev             # frontend on http://localhost:5173
```

`npm run typecheck` checks both workspaces.

## Checks

```bash
npm run typecheck   # tsc --noEmit, both workspaces
npm run build       # typecheck + vite build -> frontend/dist
npm test --workspaces --if-present
```

`.github/workflows/ci.yml` runs all three on every pull request and every push to
`main`. CI uses the same commands you run locally, so a PR that passes on your machine
passes there, and a PR that claims to be green without having been run gets caught.

Tests use Node's built-in `node:test`, which runs TypeScript directly, so there is no
transpile step and no test dependency. `logic/` is the only workspace with real logic
so far and the only one with a `test` script. The root `npm test` runs whichever
workspaces have one.

Three more workflows run on pull requests. `contract-guard` blocks an unannounced change
to the shared types in `logic/src/types.ts`, `labeler` labels a PR by the area it
touches, and `stale` nudges anything idle for 3 days without closing it. `landcover`
only runs manually (see `pipeline/README.md`). `AGENTS.md` explains what to do when
one of them fires.

## Secrets and env vars

There is one secret, `FIRMS_MAP_KEY`, and it lives in `.env` at the repo root, which is
gitignored. Get a free key from
[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Signup takes a little
while, so request it early.

`logic/` never reads the environment itself. It has to run on Workers, where secrets
arrive on the request `env` and there is no `process`, so the caller reads the key and
passes it in: `fetchHotspots(region, mapKey)`. It is still never hardcoded.

Open-Meteo needs no key. ESA WorldCover's S3 bucket is read with `--no-sign-request`,
so it needs no credentials either.

## Layout

| Path | What |
|---|---|
| `frontend/` | Vite + React + TypeScript + MapLibre GL. The map, region selector, hotspot detail panel, TTS button. |
| `logic/` | Plain TypeScript, no framework assumptions. Fetchers, dispersion, classification, TTS wrapper. |
<<<<<<< HEAD
| `pipeline/` | Offline generators for India's boundaries, the state grid, the national land-cover grid, the farmland image and the town list. Output is committed under `frontend/public/` and served as static assets. See `pipeline/README.md` for formats and the cropland/forest/other semantics. |
| `worker/` | The Cloudflare Worker: serves the built site and `GET /api/radar`. |
| `ml/` | Offline fire-risk model (Python), published as a grid and a map image. |
=======
| `pipeline/` | Offline ESA WorldCover clip-and-export, run in CI only (`workflow_dispatch`). Done and verified for all four regions. The output is committed at `frontend/public/landcover/<region>.json` and served as a static asset; re-run the workflow with `publish=true` to refresh it. See `pipeline/README.md` for the schema and the cropland/forest/other semantics. |
>>>>>>> origin/main
| `docs/` | `MASTER.md` (decisions) and `log/` (per-person work logs). |
| `delegation/` | Per-person work briefs. Edit only your own. |

npm workspaces tie `frontend` and `logic` together, and that is all the tooling there is.

<<<<<<< HEAD
Everything described here is implemented and tested. The shared types in
`logic/src/types.ts` are the contract between the three of us; don't reshape them without
a contract issue (see `AGENTS.md`).
=======
The two live fetchers in `logic/` are real, and so is the offline land-cover pipeline.
Everything else under `frontend/` and `logic/` is still a typed stub with a `// TODO`
body. The signatures are the contract: fill in the bodies, and tell whoever builds
against them before you reshape one.
>>>>>>> origin/main

## Stack

We picked TypeScript end to end so that where the app deploys would stay a deployment
choice and never force a rewrite. It deploys to the Cloudflare Workers free tier
(`docs/MASTER.md` §5.1, settled 2026-09-21). Keep `logic/` free of Node-only APIs and
runtime filesystem access. The free tier allows 10ms of CPU per request, so the
per-request work should be fetching and cheap parsing.

Below is everything the app or its build talks to. Closed-source parts are marked
**closed source**.

Frontend (runs in the visitor's browser):

- [React](https://react.dev/) + [Vite](https://vite.dev/)
<<<<<<< HEAD
- [MapLibre GL](https://maplibre.org/) (`^6.10.0` — v5 carries a critical XSS advisory) — no API key required
- [CARTO Positron](https://carto.com/basemaps) basemap style and tiles, OpenStreetMap data — loaded from `basemaps.cartocdn.com`, credited in the map's attribution control. CARTO's tile service is **closed source**; the OpenStreetMap data is ODbL.
- [Google Fonts](https://fonts.google.com/) — IBM Plex Sans and JetBrains Mono (both SIL OFL), loaded from `fonts.googleapis.com` / `fonts.gstatic.com`. The fonts are open; the Google Fonts service is **closed source** and sees each visitor's request.
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) — the human check in front of `/api/radar`, loaded from `challenges.cloudflare.com`. **Closed source.**
- Browser speech synthesis ([Web Speech API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)) — first choice for reading alerts aloud when the phone has a voice for the language. The voices come from the phone's own OS (Google, Apple, Samsung, Microsoft) and are usually **closed source**.
- [Piper](https://github.com/rhasspy/piper) voices ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) on Hugging Face), run in the browser with [onnxruntime-web](https://onnxruntime.ai/) (cdnjs) and the espeak-ng based [piper-phonemize](https://github.com/rhasspy/piper-phonemize) WASM (jsDelivr) — open source; the voice when the phone has none. Hindi and Telugu; Punjabi is read by the Hindi voice. Downloaded once, on first use.

Server (Cloudflare Worker, `worker/`):

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) free tier, with its static assets and Rate Limiting binding. The platform is **closed source**; [Wrangler](https://github.com/cloudflare/workers-sdk) (dev and deploy CLI) is open source.
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) — active fire hotspots (VIIRS/MODIS), free `MAP_KEY`, kept as a Worker secret
- [Open-Meteo](https://open-meteo.com/en/docs/gfs-api) — wind (GFS), no key
- Cloudflare Turnstile siteverify (`challenges.cloudflare.com`) — checks the human-check token. **Closed source.**

Data baked into the build:

- [ESA WorldCover](https://esa-worldcover.org/en/data-access) — 10m land cover, CC-BY 4.0
- [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-0, India point of view, and populated places — public domain; country borders and the town list (`pipeline/boundaries.mjs`, `pipeline/towns.mjs`)
- [DataMeet](https://github.com/datameet/maps) States/Admin2 — India's states and UTs on the Survey of India outline; state lines and `states.bin`, which drops FIRMS hotspots outside India and outside the chosen zone
=======
- [MapLibre GL](https://maplibre.org/) (`^6.10.0`, because v5 carries a critical XSS advisory). No API key required.
- [CARTO Positron](https://carto.com/basemaps) basemap style and tiles, with OpenStreetMap data, loaded from `basemaps.cartocdn.com` and credited in the map's attribution control. CARTO's tile service is **closed source**; the OpenStreetMap data is ODbL.
- [Google Fonts](https://fonts.google.com/): IBM Plex Sans and JetBrains Mono (both SIL OFL), loaded from `fonts.googleapis.com` / `fonts.gstatic.com`. The fonts are open, but the Google Fonts service is **closed source** and sees each visitor's request.
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/), the human check in front of `/api/radar`, loaded from `challenges.cloudflare.com`. **Closed source.**
- Browser speech synthesis ([Web Speech API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)), used as the voice fallback when Indic-TTS does not answer. The voices come from the phone's own OS (Google, Apple, Samsung, Microsoft) and are usually **closed source**. If the phone has no voice for the language, the app says so instead of speaking.

Server (Cloudflare Worker, `worker/`):

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) free tier, with its static assets and Rate Limiting binding. The platform is **closed source**; [Wrangler](https://github.com/cloudflare/workers-sdk), the dev and deploy CLI, is open source.
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) for active fire hotspots (VIIRS/MODIS). Free `MAP_KEY`, kept as a Worker secret.
- [Open-Meteo](https://open-meteo.com/en/docs/gfs-api) for wind (GFS). No key.
- Cloudflare Turnstile siteverify (`challenges.cloudflare.com`) checks the human-check token. **Closed source.**
- [AI4Bharat Indic-TTS](https://github.com/AI4Bharat/Indic-TTS): `logic/src/tts.ts` calls a hosted Indic-TTS endpoint (`tts.indicnlp.org`) for Hindi, Punjabi, Telugu and English. That hostname has not resolved since 2026-09-26, so in practice the browser voice above is what plays.

Data baked into the build:

- [ESA WorldCover](https://esa-worldcover.org/en/data-access), 10m land cover, CC-BY 4.0
- [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-0, India point of view, public domain. This is the India border that drops FIRMS hotspots in Pakistan and Nepal (`pipeline/india-border.mjs`).
>>>>>>> origin/main

Offline only (GitHub Actions and manual runs, never on the request path):

<<<<<<< HEAD
- [GitHub Actions](https://docs.github.com/actions) — CI and the manual `landcover` and `ml-risk` workflows. **Closed source.**
- [rasterio](https://rasterio.readthedocs.io/) (GDAL) — reads ESA WorldCover for the national land-cover grid and farmland image (`pipeline/landcover_india.py`)
- Python with [NumPy](https://numpy.org/) and [scikit-learn](https://scikit-learn.org/) — trains the experimental Telangana / AP fire-risk grid (`ml/`), from the FIRMS VIIRS archive
=======
- [GitHub Actions](https://docs.github.com/actions) runs CI and the manual `landcover` and `ml-risk` workflows. **Closed source.**
- [GDAL](https://gdal.org/) clips ESA WorldCover into the land-cover masks (`pipeline/`).
- Python with [NumPy](https://numpy.org/) and [scikit-learn](https://scikit-learn.org/) trains the experimental Telangana / AP fire-risk grid (`ml/`) from the FIRMS VIIRS archive.
>>>>>>> origin/main

The dispersion model is a simplified Gaussian-puff approximation driven by live wind,
**not** real NOAA HYSPLIT. It is labelled that way everywhere, including the pitch.

The codebase is open source. Its dependencies don't have to be, as long as we disclose
them here.

## Attribution

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data.
Boundaries: DataMeet (Survey of India outline), Natural Earth.

## Ground rule

Nothing is done until a runnable test proves it and it is logged in
`docs/log/<name>.md` with the exact command to re-run. Stubs are exempt; anything with
real logic is not.
