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

The test runner is Node's built-in `node:test`, run straight over TypeScript with no
transpile step and no test dependency. `logic/` is the only workspace with real
logic so far, so it is the only one with a `test` script; the root `npm test` fans
out to whichever workspaces have one.

Three more workflows run on pull requests: `contract-guard` (blocks an unannounced
change to the shared types in `logic/src/types.ts`), `labeler` (labels a PR by the
area it touches) and `stale` (nudges anything idle for 3 days, never closes it).
`AGENTS.md` explains what to do when one of them fires.

## Secrets & env vars

One secret, one place: `FIRMS_MAP_KEY` in `.env` at the repo root (gitignored).
Get a free key from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/) —
there's a short signup lag, so request it early.

`logic/` never reads the environment itself — it has to run on Workers, where secrets
arrive on the request `env` and there is no `process`. The caller reads the key and
passes it: `fetchHotspots(region, mapKey)`. Still never hardcoded.

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

The two live fetchers in `logic/` are real. Everything else under `frontend/` and
`logic/` is still a typed stub with a `// TODO` body. The signatures are the contract; fill in the bodies, don't reshape them
without telling whoever builds against them.

## Stack

TypeScript end to end, deliberately, so where this deploys stayed a deployment choice
rather than a rewrite. It deploys to the **Cloudflare Workers free tier**
(`docs/MASTER.md` §5.1, settled 2026-09-21). Keep `logic/` free of Node-only APIs and
runtime filesystem access — the free tier's budget is 10ms CPU per request, so keep
the per-request work to fetching and cheap parsing.

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
