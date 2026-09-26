# Rahul — Work Brief

Read `docs/MASTER.md` first for the full project context, settled architecture, and the open questions list. `docs/ROADMAP.md` is the day-by-day plan to the 30th, and `docs/CODING_STANDARDS.md` has the house rules. Read it before your next log entry: zero emoji anywhere in code (CI fails on it), and log entries paste real output and say what a check does *not* cover. Read `delegation/joel.md` and `delegation/jammy.md` for context. **Do not edit `joel.md` or `jammy.md`, they are read-only for you.** Edit only this file (to check off tasks) and `docs/log/rahul.md` (to log finished work).

## Your area: QA and pitch support

From 26 Sept the frontend (`frontend/src`) is owned by Joel, and the server path by Jammy. Your job is to be the person who checks what they ship on real phones, and to draft the pitch material. **Do not commit to `frontend/src` or `logic/src`.** If you find something broken, file a Bug issue with a screenshot; the owner fixes it.

## Tasks

- [ ] **Phone QA checklist** — write it before running it. Cover all four regions, and for each one: the loading state, the error state (no FIRMS key), `?demo` mode (markers, plume wedges, legend), tapping a marker (detail panel, nearest-town line, close and reopen), each TTS language button, and whether the ESA attribution footer is visible without scrolling. Commit it to `docs/log/rahul.md`.
- [ ] **Run the checklist on 2 real phones** — first against `npm run dev` with `?demo` over your LAN (`npx vite --host` from `frontend/`), then against the live site once Joel deploys on the 29th. Every failure becomes a **Bug** issue with the phone model, browser, region, steps and a screenshot. Do not fix it yourself.
- [ ] **Pitch deck content draft** — text only, for Joel to review and finalize. Lead with the Van Agni / FSI differentiation (`docs/MASTER.md` §2): who's downwind, crop-burning vs. wildfire, Indic-language UI. The dispersion model is always "simplified Gaussian-puff, not HYSPLIT". Never claim otherwise.
- [ ] **Demo video script draft** — about 90 seconds, walking through one region in `?demo` mode and saying on screen that the hotspots are demo data.
- [ ] **README stack-disclosure pass** — check that every dependency and external service the app actually uses is listed in the README's stack section, including closed-source ones (`docs/MASTER.md` §4, "Openness"). Open a PR; Joel reviews.

## Completed and handed over

These were built by Rahul in commit 0119bea and are now owned by Joel. The 26 Sept rework that got them working end-to-end in the browser is logged in `docs/log/joel.md`.

- [x] Map view (`frontend/src/components/MapView.ts`)
- [x] Region selector (`frontend/src/components/RegionSelector.ts`)
- [x] Dispersion plume overlay (`frontend/src/utils/plumeGeometry.ts`)
- [x] Per-hotspot detail panel (`frontend/src/components/HotspotDetailPanel.ts`)
- [x] TTS playback button (`frontend/src/components/TtsButton.ts`)
- [x] Loading / empty / error states
- [x] ~~Attribution footer~~ — was already scaffolded; it stays in place per `AGENTS.md`.

## Definition of done (per task)

1. Do the work.
2. Leave behind something anyone can re-check: the checklist itself, the filed issues, the draft text.
3. Log it in `docs/log/rahul.md` with where to find it, following `docs/CODING_STANDARDS.md` §2.
4. Only then check the box above.

## Open items that affect you

- `docs/MASTER.md` §5.2 — the dispatch layer is still unsettled. Nothing in the pitch should promise alert subscriptions or SMS.
