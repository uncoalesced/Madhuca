# Rahul — Work Brief

Read `docs/MASTER.md` first for the full project context, settled architecture, and the open questions list. Read `delegation/joel.md` and `delegation/jammy.md` for context on what the other two are building, so your frontend is built against the *intended* shape of their output, not a guess. **Do not edit `joel.md` or `jammy.md` — read-only for context.** Edit only this file (to check off tasks) and `docs/log/rahul.md` (to log finished work).

## Your area: frontend & UX

This is the part users actually see, on a phone, when they open madhuca.uncoalesced.com to check if there's a fire risk near them. Mobile-first — the primary users (farmers, hikers) are checking this on a phone, not a desktop.

## Tasks

- [ ] **Map view** — React + a mapping library (MapLibre GL or Leaflet; either is fine, pick one and note the choice in your log) showing live hotspot markers for the selected region. Color-code by classification once Jammy's classification module is ready (wildfire vs. likely crop-burning) — until then, stub with a single marker style and a visible `// TODO: color by classification` note.
- [ ] **Region selector** — toggle between Punjab / Bihar / Delhi / Telangana. Each region change re-triggers the fetch-and-render cycle (this app doesn't pre-load all four regions at once).
- [ ] **Dispersion plume overlay** — render whatever plume/direction output Jammy's dispersion module returns (confirm the exact shape with him before building this — a polygon? a direction + distance? get the contract in writing in his log or a quick note back to you before you build against it).
- [ ] **Per-hotspot detail panel** — tapping/clicking a hotspot shows: classification (wildfire / likely crop-burning), approximate FRP, rough distance/direction to the nearest town, and a plain-language "what this means for you" line. This is the part that has to read clearly to someone who isn't a data scientist.
- [ ] **TTS playback button** — wires to Jammy's Indic-TTS output; plays the alert text aloud in the selected language. Needs a clear play/pause/loading state.
- [ ] **Loading / empty / error states** — because there's no backend pre-warming (everything computes when the page opens), the first load has real latency. Build an honest loading state, not a blank screen. Handle "no fires currently detected in this region" as a real, non-broken state, not an error.
- [ ] **Attribution footer** — ESA WorldCover requires attribution (`© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data`). Add it, small, in the footer or an About panel.

## Definition of done (per task — this matters, read it)

Antigravity has a known habit of reporting things done when they aren't. For every task above:
1. Write the component/feature.
2. Add a test file alongside it (component test, or at minimum a script that renders it with sample data and asserts something real — e.g. "given 3 mock hotspots, the map renders 3 markers"). No test file = not done, whatever the agent claims.
3. Write down the exact command to run that test in your log entry, so anyone (including Joel) can re-run it and see it pass, not just take your word for it.
4. Only then check the box above and log it in `docs/log/rahul.md`.

## Open items that affect you

- `docs/MASTER.md` §5.2 — what the "dispatch layer" concretely is isn't settled yet. Don't build alert-subscription UI until that's answered; the map/detail-panel/TTS work above doesn't depend on it, so there's plenty to do in the meantime.
- Color palette / visual design is coming from Joel separately — build with a plain, functional style for now (don't invest in final visual polish yet), structure components so restyling later is a CSS/token change, not a rebuild.
