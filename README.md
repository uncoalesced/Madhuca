![Madhuca: autonomous stubble & biomass fire early-warning radar](assets/banner/madhuca-banner.png)

# Madhuca

Madhuca is an early-warning radar for stubble and biomass fires across India. You pick
North, South, West or East India, or all of it. When you open the site, it pulls live
NASA FIRMS fire hotspots and live wind, works out a rough smoke-dispersion direction for
each hotspot, tags each one as likely wildfire or likely crop/stubble burning, and puts
them on a map of India drawn with its official boundary.

It only runs when someone opens it. Nothing polls in the background.

Full context, the settled architecture and the open decisions are in
[`docs/MASTER.md`](docs/MASTER.md). A plain-language overview of the project is in
[`DOCUMENTATION.md`](DOCUMENTATION.md).

## Quickstart

```bash
npm install
cp .env.example .env    # then fill in FIRMS_MAP_KEY
npm run dev             # frontend on http://localhost:5173
```

`npm run typecheck` checks every workspace. Add `?demo` to the dev URL to see labelled
fake fires without a FIRMS key.

## Checks

```bash
npm run typecheck   # tsc --noEmit, every workspace
npm run build       # typecheck + vite build -> frontend/dist
npm test --workspaces --if-present
```

`.github/workflows/ci.yml` runs all three on every pull request and every push to
`main`. CI uses the same commands you run locally, so a PR that passes on your machine
passes there, and a PR that claims to be green without having been run gets caught.

Tests use Node's built-in `node:test`, which runs TypeScript directly, so there is no
transpile step and no test dependency. The root `npm test` runs every workspace that
has a `test` script (`logic`, `worker`, `frontend`).

Three more workflows run on pull requests. `contract-guard` blocks an unannounced change
to the shared types in `logic/src/types.ts`, `labeler` labels a PR by the area it
touches, and `stale` nudges anything idle for 3 days without closing it. `landcover`
and `ml-risk` only run manually (see `pipeline/README.md` and `ml/README.md`).
`AGENTS.md` explains what to do when one of them fires.

## Secrets and env vars

There is one secret, `FIRMS_MAP_KEY`, and it lives in `.env` at the repo root, which is
gitignored. Get a free key from
[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Signup takes a little
while, so request it early.

`logic/` never reads the environment itself. It has to run on Workers, where secrets
arrive on the request `env` and there is no `process`, so the caller reads the key and
passes it in: `fetchHotspots(region, mapKey)`. It is still never hardcoded.

Open-Meteo needs no key. ESA WorldCover's S3 bucket is read without signing requests,
so it needs no credentials either.

## Layout

| Path | What |
|---|---|
| `frontend/` | Vite + React + TypeScript + MapLibre GL. The map, region tabs, hotspot detail panel, voice button. |
| `logic/` | Plain TypeScript, no framework assumptions. Fetchers, the state and land-cover grids, dispersion, classification. |
| `worker/` | The Cloudflare Worker. Serves the built site and `GET /api/radar`. |
| `pipeline/` | Offline scripts that build India's boundaries, the state grid, the national land-cover grid, the farmland image and the town list. Their output is committed under `frontend/public/` and served as static assets. See `pipeline/README.md` for the formats and the cropland/forest/other semantics. |
| `ml/` | The offline fire-risk model (Python), published as a grid and a map image. |
| `docs/` | `MASTER.md` (decisions) and `log/` (per-person work logs). |
| `delegation/` | Per-person work briefs. Edit only your own. |

npm workspaces tie the TypeScript workspaces together, and that is all the tooling there is.

Everything described here is implemented and tested. The shared types in
`logic/src/types.ts` are the contract between the three of us: open a contract issue
before you reshape one (see `AGENTS.md`).

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
- [MapLibre GL](https://maplibre.org/) (`^6.10.0`, because v5 carries a critical XSS advisory). No API key required.
- [CARTO Positron](https://carto.com/basemaps) basemap style and tiles, with OpenStreetMap data, loaded from `basemaps.cartocdn.com` and credited in the map's attribution control. CARTO's tile service is **closed source**; the OpenStreetMap data is ODbL. The basemap's own country and state lines are hidden and replaced with ours (below).
- [Google Fonts](https://fonts.google.com/): IBM Plex Sans and JetBrains Mono (both SIL OFL), loaded from `fonts.googleapis.com` / `fonts.gstatic.com`. The fonts are open, but the Google Fonts service is **closed source** and sees each visitor's request.
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/), the human check in front of `/api/radar`, loaded from `challenges.cloudflare.com`. **Closed source.**
- Browser speech synthesis ([Web Speech API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)), the first choice for reading alerts aloud when the phone has a voice for the language. The voices come from the phone's own OS (Google, Apple, Samsung, Microsoft) and are usually **closed source**.
- [Piper](https://github.com/rhasspy/piper) voices ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) on Hugging Face), run in the browser with [onnxruntime-web](https://onnxruntime.ai/) (from cdnjs) and the espeak-ng based [piper-phonemize](https://github.com/rhasspy/piper-phonemize) WASM (from jsDelivr). All open source. This is the voice when the phone has none: Hindi and Telugu, with Kannada read by the Telugu voice. It downloads once, the first time it is needed.

Server (Cloudflare Worker, `worker/`):

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) free tier, with its static assets and Rate Limiting binding. The platform is **closed source**; [Wrangler](https://github.com/cloudflare/workers-sdk), the dev and deploy CLI, is open source.
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) for active fire hotspots (VIIRS/MODIS). Free `MAP_KEY`, kept as a Worker secret.
- [Open-Meteo](https://open-meteo.com/en/docs/gfs-api) for wind (GFS), 100 locations per request. No key.
- Cloudflare Turnstile siteverify (`challenges.cloudflare.com`) checks the human-check token. **Closed source.**

Data baked into the build:

- [ESA WorldCover](https://esa-worldcover.org/en/data-access), 10m land cover, CC-BY 4.0. Turned into a national cropland/forest grid and a farmland image.
- [DataMeet](https://github.com/datameet/maps) States/Admin2, India's states and UTs on the Survey of India outline. This gives the state lines and `states.bin`, which drops FIRMS hotspots outside India and outside the chosen zone.
- [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-0 (India point of view) and populated places, public domain. Country borders and the town list.

Offline only (GitHub Actions and manual runs, never on the request path):

- [GitHub Actions](https://docs.github.com/actions) runs CI and the manual `landcover` and `ml-risk` workflows. **Closed source.**
- [rasterio](https://rasterio.readthedocs.io/) (GDAL) reads ESA WorldCover for the national land-cover grid (`pipeline/landcover_india.py`).
- Python with [NumPy](https://numpy.org/) and [scikit-learn](https://scikit-learn.org/) trains the experimental fire-risk grid (`ml/`) from the FIRMS VIIRS archive.

The dispersion model is a simplified Gaussian-puff approximation driven by live wind,
**not** real NOAA HYSPLIT. It is labelled that way everywhere, including the pitch.

The codebase is open source. Its dependencies don't have to be, as long as we disclose
them here.

## Attribution

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data.
Boundaries: DataMeet (Survey of India outline), Natural Earth.

## License

The code is under the [MIT License](LICENSE). The data files under `frontend/public/`
keep their sources' terms, listed at the end of `LICENSE`.
