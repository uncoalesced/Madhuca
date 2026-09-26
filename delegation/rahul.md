# Rahul — Work Brief

Read `docs/MASTER.md` first for the full project context, settled architecture, and the open questions list. Read `delegation/joel.md` and `delegation/jammy.md` for context on what the other two are building, so your frontend is built against the *intended* shape of their output, not a guess. **Do not edit `joel.md` or `jammy.md` — read-only for context.** Edit only this file (to check off tasks) and `docs/log/rahul.md` (to log finished work).

## Your area: frontend & UX

This is the part users actually see, on a phone, when they open madhuca.uncoalesced.com to check if there's a fire risk near them. Mobile-first — the primary users (farmers, hikers) are checking this on a phone, not a desktop.

## Tasks

- [x] **Map view (`frontend/src/components/MapView`)** — MapLibre GL is already the chosen library and already in the repo (pinned `^6.10.0` — v5 has a critical XSS advisory, so build against the v6 API, not v5 examples you might find online) showing live hotspot markers for the selected region. Color-code by classification once Jammy's classification module is ready (wildfire vs. likely crop-burning) — until then, stub with a single marker style and a visible `// TODO: color by classification` note.
- [x] **Region selector (`frontend/src/components/RegionSelector`)** — toggle between Punjab / Bihar / Delhi / Telangana. Each region change re-triggers the fetch-and-render cycle (this app doesn't pre-load all four regions at once). `REGION_BBOX` is already exported from `logic/src/hotspots.ts` — use it directly for MapView's "fit bounds to region," no need to redefine the boxes.
- [x] **Dispersion plume overlay** — render the `Plume` shape from `logic/src/types.ts`: `{ bearingDeg, distanceKm, spreadDeg }` — a downwind bearing, a rough reach in km, and a lateral spread half-angle. That's the current contract Jammy's building `computeDispersion` against; it's marked as his to finalize, so if it changes shape he'll tell you, but you can start building the overlay renderer against this now instead of waiting.
- [x] **Per-hotspot detail panel** — tapping/clicking a hotspot shows: classification (wildfire / likely crop-burning), approximate FRP, rough distance/direction to the nearest town, and a plain-language "what this means for you" line. This is the part that has to read clearly to someone who isn't a data scientist.
- [x] **TTS playback button** — wires to Jammy's Indic-TTS output; plays the alert text aloud in the selected language. Needs a clear play/pause/loading state.
- [x] **Loading / empty / error states** — because there's no backend pre-warming (everything computes when the page opens), the first load has real latency. Build an honest loading state, not a blank screen. Handle "no fires currently detected in this region" as a real, non-broken state, not an error.
- [x] ~~**Attribution footer**~~ — already scaffolded in the repo bootstrap, since CC-BY 4.0 requires it and it's the kind of thing that gets deleted during a restyle. Nothing to build here — just don't remove it while you're on the map/UI work, per `AGENTS.md`'s "never cleanup" list.

## Definition of done (per task — this matters, read it)

Antigravity has a known habit of reporting things done when they aren't. For every task above:
1. Write the component/feature.
2. Add a test file alongside it (component test, or at minimum a script that renders it with sample data and asserts something real — e.g. "given 3 mock hotspots, the map renders 3 markers"). No test file = not done, whatever the agent claims.
3. Write down the exact command to run that test in your log entry, so anyone (including Joel) can re-run it and see it pass, not just take your word for it.
4. Only then check the box above and log it in `docs/log/rahul.md`.

## Open items that affect you

- `docs/MASTER.md` §5.2 — what the "dispatch layer" concretely is isn't settled yet. Don't build alert-subscription UI until that's answered; the map/detail-panel/TTS work above doesn't depend on it, so there's plenty to do in the meantime.
- Color palette / visual design is coming from Joel separately — build with a plain, functional style for now (don't invest in final visual polish yet), structure components so restyling later is a CSS/token change, not a rebuild.
