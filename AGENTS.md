# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Madhuca — an on-demand fire & smoke radar for four Indian regions (Punjab, Bihar,
Delhi, Telangana). Opening the site is what triggers the whole pipeline: fetch
FIRMS hotspots → fetch wind → compute dispersion → classify → render. Nothing polls
in the background, and there is no server-side scheduler. Hackathon build with a
hard deadline of 30 Sept 2026 — scope discipline matters more than extensibility.

**The repo is currently a skeleton.** Almost every function and component is a typed
stub with a `// TODO` body. The signatures *are* the deliverable so far.

## Commands

```bash
npm install            # npm workspaces: frontend + logic
npm run dev            # frontend on localhost:5173
npm run typecheck      # tsc --noEmit across both workspaces
npm run build          # typecheck + vite build -> frontend/dist
```

No test runner is configured yet — nothing has real logic to test. The first person
to write real logic picks the runner and records the exact command in their
`docs/log/<name>.md` entry.

## Where the important reading is

`docs/MASTER.md` is the single source of truth for what the product is and what has
been decided. Read it before proposing architecture — several plausible-sounding
ideas (SAM2 segmentation, real HYSPLIT, automated calls/SMS to officials) were
deliberately dropped and should not be re-suggested. Its **§5 is a list of open
questions: do not build against those.**

`delegation/{joel,rahul,jammy}.md` are per-person work briefs and define who owns
what. Each person edits only their own brief and their own `docs/log/` file.

## Architecture

Three workspaces, split by where the work runs, not by feature:

- **`logic/`** — plain TypeScript, no framework. The fetchers, dispersion,
  classification and TTS wrapper. Runs per-request.
- **`frontend/`** — Vite + React + MapLibre GL. Mobile-first; the users are farmers
  and hikers on phones.
- **`pipeline/`** — the only real GIS processing, run **offline in CI only**. Clips
  ESA WorldCover to the four regions and emits static GeoJSON land-cover masks that
  the live app reads. Nothing here may creep into the request path.

### `logic/src/types.ts` is the seam

Three people build against these types in parallel, so the types are a contract, not
an implementation detail. Changing a shape there breaks someone else's in-flight
work. Treat edits to it as a coordination event, not a refactor — the owner named in
the doc comment decides, and whoever builds against it gets told.

`Plume` in particular is Jammy's to finalize; the current shape is the minimum that
unblocks Rahul's overlay renderer.

### Deployment target is still open

`docs/MASTER.md` §5.1 (Cloudflare Workers Paid vs. a tunnelled server) is unresolved.
TypeScript was chosen end-to-end specifically to keep that a deployment choice rather
than a rewrite. **Keep `logic/` free of Node-only APIs and runtime filesystem
access** — `fetch` and pure computation only. Its tsconfig sets `"types": []` to make
violations fail the typecheck.

### The dispatch layer does not exist

Automated outbound calls/SMS were dropped (TRAI DLT paperwork, and the product
shifted to self-serve). What replaces it is `docs/MASTER.md` §5.2, unanswered. Do not
scaffold alert-subscription UI.

## Domain rules that are easy to get wrong

- **The dispersion model is not HYSPLIT.** It is a simplified Gaussian-puff
  approximation. Label it that way in code comments, UI copy and pitch material —
  claiming otherwise is a correctness problem, not a wording preference.
- **A fire classified as likely crop-burning is still shown**, just tagged
  differently. Never filter or hide it.
- **Wind direction is meteorological** — `Wind.directionDeg` is the direction wind
  blows *from*; `Plume.bearingDeg` is where smoke travels *to*. They differ by 180°.
- **Dispersion must degrade gracefully** on calm or missing wind rather than throwing.
- **ESA WorldCover is CC-BY 4.0** and requires visible attribution. It is in the
  frontend footer and the README — do not remove it while restyling.

## Definition of done

Nothing counts as done without a runnable check proving it, logged in
`docs/log/<name>.md` with the exact command to re-run it. This exists because one
team member's agent has a history of reporting work complete when it is not. Stubs
are exempt; anything with a real body is not.

No speculative abstraction, no config for values that never change, no dependencies
beyond those already named in `docs/MASTER.md` §3 and the README stack section.
