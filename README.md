# Madhuca

Autonomous stubble & biomass fire early-warning radar for Punjab, Bihar, Delhi and
Telangana. Open the site and it pulls live NASA FIRMS fire hotspots, pulls live wind,
computes a rough smoke-dispersion direction per hotspot, tags each one as likely
wildfire vs. likely crop/stubble burning, and renders it on a map.

On-demand, not always-on — nothing polls in the background.

Full context, settled architecture and open decisions: [`docs/MASTER.md`](docs/MASTER.md).

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

`.github/workflows/ci.yml` runs all three on every pull request and on every push
to `main`. It runs the same commands you run locally, so a PR that passes on your
machine passes there — and a PR that self-reports green without having been run
gets caught.

There is no test runner configured yet, because nothing has a real body to test.
The test step above no-ops until someone adds a `test` script to a workspace, then
starts enforcing itself with no CI change needed.

Three more workflows run on pull requests: `contract-guard` (blocks an unannounced
change to the shared types in `logic/src/types.ts`), `labeler` (labels a PR by the
area it touches) and `stale` (nudges anything idle for 3 days, never closes it).
`AGENTS.md` explains what to do when one of them fires.

## Secrets & env vars

One secret, one place: `FIRMS_MAP_KEY` in `.env` at the repo root (gitignored).
Get a free key from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/) —
there's a short signup lag, so request it early.

Open-Meteo needs no key. ESA WorldCover's S3 bucket is read with `--no-sign-request`,
so it needs no credentials either.

## Layout

| Path | What |
|---|---|
| `frontend/` | Vite + React + TypeScript + MapLibre GL. The map, region selector, hotspot detail panel, TTS button. |
| `logic/` | Plain TypeScript, no framework assumptions. Fetchers, dispersion, classification, TTS wrapper. |
| `pipeline/` | Offline ESA WorldCover clip-and-export, run in CI only. |
| `docs/` | `MASTER.md` (decisions) and `log/` (per-person work logs). |
| `delegation/` | Per-person work briefs. Edit only your own. |

npm workspaces ties `frontend` and `logic` together — nothing heavier.

Almost everything under `frontend/` and `logic/` is a typed stub with a `// TODO`
body. The signatures are the contract; fill in the bodies, don't reshape them
without telling whoever builds against them.

## Stack

TypeScript end to end, deliberately — where this deploys (Cloudflare Workers vs. a
tunnelled server, `docs/MASTER.md` §5.1) stays a deployment choice, not a rewrite.
Keep `logic/` free of Node-only APIs and runtime filesystem access.

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [MapLibre GL](https://maplibre.org/) — no API key required
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) — active fire hotspots
- [Open-Meteo](https://open-meteo.com/en/docs/gfs-api) — wind, no key
- [ESA WorldCover](https://esa-worldcover.org/en/data-access) — 10m land cover, CC-BY 4.0
- [AI4Bharat Indic-TTS](https://github.com/AI4Bharat/Indic-TTS) — self-hosted, Hindi + Punjabi first

The dispersion model is a simplified Gaussian-puff approximation driven by live wind,
**not** real NOAA HYSPLIT. Labelled that way everywhere, including the pitch.

The codebase is open source. Dependencies don't have to be, as long as their use is
disclosed here.

## Attribution

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data.

## Ground rule

Nothing is "done" without a runnable test proving it, logged in `docs/log/<name>.md`
with the exact command to re-run. Stubs are exempt; anything with real logic is not.
