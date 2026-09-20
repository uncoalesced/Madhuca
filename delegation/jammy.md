# Jammy — Work Brief

Read `docs/MASTER.md` first for the full project context, settled architecture, and the open questions list. Read `delegation/joel.md` and `delegation/rahul.md` for context on what the other two are building. **Do not edit `joel.md` or `rahul.md` — read-only for context.** Edit only this file (to check off tasks) and `docs/log/jammy.md` (to log finished work).

## Your area: the science/logic core + TTS

This is the part that decides what gets shown, not how it looks. It should be pure, testable functions wherever possible — given the same input, always the same output. That makes it the easiest part of this project to prove actually works, which matters a lot given the antigravity note below.

## Tasks

- [ ] **Dispersion module** — given a hotspot (lat, lon, FRP) and live wind data (speed + direction, from Open-Meteo) for that coordinate, compute a simplified Gaussian-puff plume: a rough downwind direction and distance the smoke is likely to travel. This is explicitly *not* real HYSPLIT (see `docs/MASTER.md` §4) — a physically-reasonable simplification is the goal, not scientific publication accuracy. Decide the output shape (a polygon? a bearing + distance? a small set of waypoints?) and write it down clearly — Rahul is building the overlay renderer against whatever you pick, so nail the contract down early rather than changing it after he's built against it.
- [ ] **Classification module** — given a hotspot's coordinates and the precomputed cropland/forest land-cover mask (GeoJSON, from Joel's offline pipeline — ask him for the file/schema once it exists), determine whether it falls inside cropland or forest/other. Combine with FRP magnitude and time-of-year (India's stubble-burning season is roughly Oct–Nov) to produce a "likely wildfire" vs. "likely crop/stubble burning" tag. Important: a fire classified as likely crop-burning still gets shown and reported — it's tagged differently, never hidden or dropped.
- [ ] **AI4Bharat Indic-TTS integration** — self-hosted, open-source. Takes an alert text string + language code, returns audio. Start with Hindi and Punjabi (matches the Punjab/Bihar/Delhi region focus); add more if time allows. Wrap it as a small, clean function/API that Rahul's frontend can call — agree the input/output contract with him before he wires the play button to it.
- [ ] **Unit tests for the above** — dispersion and classification are both pure math/logic, which means they're the easiest thing in this whole project to test properly. Write real test cases: a hotspot with a known wind direction should produce a plume pointed the right way; a hotspot planted inside a known cropland polygon during stubble season should classify as likely crop-burning; one inside a forest polygon outside that season should classify as likely wildfire. Edge cases worth covering: zero/calm wind, a hotspot exactly on a land-cover boundary, missing/null wind data (don't crash — degrade gracefully).

## Definition of done (per task — this matters, read it)

Antigravity has a known habit of reporting things done when they aren't. For every task above:
1. Write the module.
2. Write the test file *first or alongside* — not after, and not skipped. Given this module is pure logic, there's no excuse for an untested version being called "done."
3. Write down the exact command to run the tests in your log entry, with what passing output looks like, so anyone can re-run it and verify for themselves.
4. Only then check the box above and log it in `docs/log/jammy.md`.

## Open items that affect you

- The land-cover mask file (cropland/forest GeoJSON) comes from Joel's offline GitHub Actions pipeline — it may not exist yet when you start. Build the classification module against a small hand-made mock GeoJSON first (a couple of fake polygons) so you're not blocked, and swap in the real file once Joel's pipeline produces it — same schema, just tell him what you assumed so he can match it or tell you it's different.
- Whether the deployment ends up as a Cloudflare Worker or a small server (`docs/MASTER.md` §5.1, still open) shouldn't change how you write these modules — write them as plain TypeScript functions with no framework-specific assumptions, and they'll drop into either.
