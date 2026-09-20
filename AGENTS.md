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
to write real logic picks the runner, adds a `test` script to that workspace, and
records the exact command in their `docs/log/<name>.md` entry.

`.github/workflows/ci.yml` runs `typecheck`, `build` and
`npm test --workspaces --if-present` on every pull request and every push to `main`.
It runs exactly the commands above — nothing CI-only — so local green means CI
green. The test step no-ops until a `test` script exists, then enforces itself with
no workflow change.

CI is a backstop, not the check. Run the commands yourself before opening a PR;
finding out from a red tick ten minutes later wastes everyone's runway.

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

---

# Working procedure

Follow these literally. Do not improvise around them, do not skip a step because it
looks unnecessary, and do not mark anything complete before the step that proves it.

## Before you write any code

1. Read `docs/MASTER.md`. If what you are about to build touches anything listed in
   its **§5 open questions**, stop and say so. Do not pick an answer yourself.
2. Read your own `delegation/<yourname>.md`. Build what is in there. If the task you
   were given is not in there, say so before starting rather than after.
3. Check there is an open issue for the work. If there is not, open one
   (see below) so the PR has something to close.

## Opening an issue

Go to Issues → New issue and pick the template. There is no blank issue option —
pick one of the three:

| Situation | Template |
|---|---|
| Work someone is going to build | **Task** |
| Something already built is behaving wrong | **Bug** |
| You need to change a type in `logic/src/types.ts` | **Contract change** |

Fill in every required field. They are required because the issue is useless without
them, not as a formality. Two that people get wrong:

- **"How we will know it works"** — write the actual check, with the command. Not
  "it should work". If you cannot describe the check, you do not yet understand the
  task well enough to start it.
- **"Blocked by"** — write `nothing` if it is ready. Leaving it vague is how a task
  sits untouched for three days.

Never file a Bug against an unimplemented stub. Every `// TODO` body throwing
`not implemented` is the intended current state.

## Changing a shared type

`logic/src/types.ts` is the seam between three people working in parallel. Editing it
without telling anyone is the single most expensive mistake available in this repo,
because it surfaces at integration time when there is no runway left.

The order is fixed:

1. Open a **Contract change** issue. Paste the current shape and the proposed shape.
2. `grep -rn "<TypeName>" frontend/src logic/src` and tick everyone whose code
   appears in the results.
3. Wait for them to reply agreeing. Do not start on a "they'll probably be fine".
4. Only then change the type, and fix every broken caller in the same PR.

## Finishing a piece of work

Do all seven, in order:

1. Write the code.
2. Write the check that proves it — a test file, or a script that runs it with sample
   data and asserts something real. "Given 3 mock hotspots, the map renders 3
   markers" is a real assertion. "It renders" is not.
3. **Actually run it.** Run the command. Read the output.
4. If it fails, go back to step 1. Do not proceed with a failing or skipped check.
5. Run `npm run typecheck` and `npm run build`. Both must pass. CI runs these too,
   so a red tick on the PR means you skipped this step.
6. Add a dated entry to `docs/log/<yourname>.md` with what you built, the exact
   command to re-run the check, and what passing looks like.
7. Tick the box in your own `delegation/<yourname>.md`.

Then open the PR. The template asks you to paste the command **and its real output**.
Paste the actual terminal text. Do not write "tests pass", do not summarise it, and
do not write output you expect the command to produce — paste what it printed when
you ran it.

## What "done" means here

Done means someone else can re-run your command and watch it pass. Nothing else
counts, whatever an agent reports about its own work. A checked box with no logged
command behind it is treated as not started.

If you could not finish something, say which part and why, and leave the box
unticked. An honest partial is useful. A task reported complete that is not costs
more time than the task itself, because the next person builds on top of it before
finding out.

## What runs automatically

Four workflows in `.github/workflows/`. None of them replace running the checks
yourself — they exist to catch the case where someone didn't.

| Workflow | When | What it does |
|---|---|---|
| `ci.yml` | every PR, every push to `main` | `typecheck`, `build`, `test --if-present` |
| `contract-guard.yml` | every PR | **Fails** if the PR edits `logic/src/types.ts` without the `contract` label and a linked issue |
| `labeler.yml` | every PR | Labels by area: `frontend`, `logic`, `pipeline`, `docs`, `repo-config`, `contract` |
| `stale.yml` | daily, 09:00 IST | Comments on issues/PRs idle 3+ days. Never closes anything |
| `landcover.yml` | manual only | The offline WorldCover clip-and-export. Stub |

If `contract-guard` fails on your PR, the failure message tells you the exact steps.
Do not try to get around it by reverting the label check — the guard is the whole
point, and the thing it prevents costs days at integration time.

If `stale` nudges something you are genuinely parking, label it `backlog` and it
stops. If it is blocked, label it `blocked` and say on the issue what by.

## Branch protection (Joel — one-time, needs admin)

The workflows report, but nothing forces a red PR to stay unmerged until `main` is
protected. On github.com/uncoalesced/Madhuca:

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset.**
2. Name it `main`. Set **Enforcement status** to **Active**.
3. **Target branches → Add target → Include default branch.**
4. Tick **Require a pull request before merging**. Set required approvals to **1**
   (three people; anything higher just blocks on availability).
5. Tick **Require status checks to pass**. Search and add **`check`** (the job in
   `ci.yml`) and **`guard`** (the job in `contract-guard.yml`). Also tick
   **Require branches to be up to date before merging**.
6. Tick **Block force pushes**.
7. Leave **Require signed commits** off — it will only cost the team time here.
8. **Create**.

Status checks only appear in that search once they have run at least once, so open
one throwaway PR first if the list is empty.

Do not add yourself to a bypass list. The point is that the rule applies to whoever
is moving fastest at 2am on the 29th, which will be you.

## Things that are never "cleanup"

Do not remove these while tidying or restyling:

- The ESA WorldCover attribution in the frontend footer — CC-BY 4.0 requires it.
- The "simplified Gaussian-puff, not HYSPLIT" wording anywhere it appears.
- Crop-burning hotspots from the rendered output — they are tagged, never hidden.
- `"types": []` in `logic/tsconfig.json` — it is what makes a Node-only API fail the
  typecheck instead of failing on deploy day.
