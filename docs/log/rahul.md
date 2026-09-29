# Rahul — Work Log

Log finished, *tested* work here, newest entry on top. Format: date (IST), what was built, how it was verified (include the test command and what passing looked like).

---

## 2026-09-29 (IST) — README stack-disclosure pass (branch pushed, PR for Joel to review)

Branch `docs/readme-stack-disclosure`, one commit, README only. The stack section now
lists everything the app and its build actually talk to, grouped by where it runs, and
marks the closed-source parts (`docs/MASTER.md` §4 "Openness").

Added, because the code uses them and the README did not say so:
- Cloudflare Workers (platform, static assets, Rate Limiting binding) and Wrangler.
- Cloudflare Turnstile, both the browser widget and the Worker's siteverify call.
- Google Fonts (IBM Plex Sans, JetBrains Mono), loaded from `fonts.googleapis.com`.
- The browser's own speech voices, which are what actually plays today.
- GitHub Actions, GDAL, and Python with NumPy and scikit-learn (the offline `pipeline/` and `ml/`).

Corrected: Indic-TTS was "Hindi + Punjabi first". The code covers Hindi, Punjabi, Telugu
and English, and `tts.indicnlp.org` has not resolved since 26 Sept (`docs/log/jammy.md`).

How I built the list, so anyone can re-check it:

```bash
grep -rnoE "https?://[a-zA-Z0-9./_-]+" frontend/src logic/src worker/src frontend/index.html | sort -u
cat frontend/package.json worker/package.json ml/requirements.txt
grep -nE "uses:|apt-get install|pip install" .github/workflows/*.yml
```

Every hostname in the first command's output now appears in the stack section. The
two links in `HumanCheck.ts` both point at Cloudflare (the Turnstile script and its
error-code docs page).

Not covered:
- Transitive npm dependencies. Only direct dependencies are listed.
- The README has stale text outside the stack section, which I left for Joel: the Layout
  table has no `worker/` or `ml/` row, and "Everything else under `frontend/` and
  `logic/` is still a typed stub" is no longer true.

Stays unticked until Joel reviews and merges it.

---

## 2026-09-29 (IST) — Demo video script draft (about 90 seconds, for Joel to review)

Text only. Joel owns the final version. Recorded against `npm run dev` with `?demo`, so
every hotspot on screen is fake and the script says so twice, out loud and in a caption.

Region: Punjab. It has the most demo points (4: 2 stubble, 2 wildfire), and its town
names ("About 12 km South-East of Amritsar") read well on screen.

**Blocker for the plume shot, flag for Joel.** Since the move to `/api/radar`, `demoRadar`
in `frontend/src/App.ts` calls `computeDispersion(hs, null)`, so every demo plume is a
calm-wind pool of 0.5 to 5 km instead of a downwind wedge. At the region zoom they are
invisible. Joel's 26 Sept log saw wedges in `?demo`, so this changed since then. Beat 3
below needs either a fixed demo wind in `demoRadar` or live footage from the deployed
site for that one shot. If it is live footage, the caption must change to say it is real
data, and the region needs real fires that day.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00-0:10 | Title card: "Madhuca. Who is downwind of the fire, right now." | "Every autumn, stubble fires across Punjab and Bihar send smoke over millions of people. In Telangana and Andhra Pradesh, forest fires start with no warning at all." |
| 0:10-0:18 | The app loading on a phone. Caption, held for the whole video: "DEMO DATA: the hotspots shown are not real fires." | "This is Madhuca. What you are about to see uses demo data, not real fires, so we can show every feature at once." |
| 0:18-0:30 | Punjab selected. Banner: "DEMO DATA, not real fires. 4 Active Fire Hotspots in Punjab. 2 Stubble Burning, 2 Wildfire." | "Open the site and it pulls satellite fire detections from NASA FIRMS for your region. Each fire is tagged as likely crop burning or likely wildfire, from ESA land-cover data and the season. Crop fires are tagged, never hidden." |
| 0:30-0:45 | Zoom towards a wildfire marker; the smoke plume (see blocker above). | "For every fire it fetches live wind and estimates where the smoke is going. That is a simplified Gaussian-puff model, not HYSPLIT. It answers one question: who is downwind." |
| 0:45-1:05 | Tap the marker. Panel: badge, "About 12 km South-East of Amritsar", the Punjabi alert. Tap Hindi, then Telugu, then English. | "Tap a fire and you get a plain-language alert: where it is, relative to the nearest town, and what to do. In Punjabi, Hindi, Telugu or English." |
| 1:05-1:12 | Tap "Listen Alert". Only if the recording phone actually speaks the language; otherwise cut this row. | "It can read the alert aloud, using the phone's own voice for that language." |
| 1:12-1:20 | Switch to Telangana / AP, press "Show fire risk (14 days)". Hold on the note under the toggle. | "For Telangana and Andhra Pradesh there is an experimental 14-day fire-risk layer. It is a statistical estimate, and a low value is never an all-clear." |
| 1:20-1:30 | End card: madhuca.uncoalesced.com, repo URL, "Open source. Data: NASA FIRMS, Open-Meteo, ESA WorldCover." | "No sign-up, no app to install. Just open the page. Madhuca." |

Rules this script keeps, so a later edit does not drop them:
- The demo-data caption stays on screen the whole time, not only at the start.
- The dispersion line says "simplified Gaussian-puff, not HYSPLIT".
- No mention of SMS, alert subscriptions or notifications (`docs/MASTER.md` §5.2 is open).
- The TTS line does not name AI4Bharat. That endpoint is down, and what plays is the phone's voice.

Not covered: nothing is recorded yet, and the timings are estimates from reading the lines aloud, not a timed take.

---

## 2026-09-29 (IST) — Pitch deck content draft (for Joel to review)

Text only, one block per slide. Joel owns the final deck. Every number below is copied
from a logged check, with its source in brackets, so it can be verified before it goes
on a slide.

**1. Title**
Madhuca: fire and smoke radar for Punjab, Bihar, Delhi and Telangana / Andhra Pradesh.
"Who is downwind of the fire, right now?"
Build with AI: Code for Communities, Track 2 (Clean Air and Climate Resilience).

**2. Why we built it**
- A forest fire in Telangana damaged the property of a friend of the team, in broad daylight, with no warning.
- Each autumn, crop-residue burning in Punjab and Bihar sends smoke across the plains, Delhi included.
- By the time people see or smell the smoke, it has already reached them.

**3. What already exists: Van Agni (Forest Survey of India)**
- A national forest-fire alert portal (fsiforestfire.gov.in), using MODIS (1 km) and SNPP-VIIRS (375 m), with public SMS registration.
- It covers forest fires only. It does not classify crop burning, does not model where the smoke goes, and has no consumer map in Indic languages.
- Madhuca is not a copy of it. It fills those three gaps. [`docs/MASTER.md` §2]

**4. What Madhuca adds**
1. Who is downwind: a smoke direction and reach for every fire, from live wind.
2. Crop burning vs wildfire: every fire is tagged. Crop fires are tagged, never hidden.
3. A public map in your language: region names in Gurmukhi, Devanagari and Telugu script; alerts in Punjabi, Hindi, Telugu and English, with compass words translated too.

**5. How it works (one diagram)**
Open the page, then:
NASA FIRMS hotspots, then Open-Meteo wind (fetched in parallel, one call per 0.25 degree cell), then a simplified Gaussian-puff plume (not HYSPLIT), then ESA WorldCover land cover and season, then the map.
- It runs on demand, when someone opens the page. Nothing polls in the background.
- Hotspots outside India are dropped: the Punjab box reaches into Pakistan (a live run went from 33 to 16). [`docs/log/joel.md` 2026-09-26]

**6. Built for cheap phones and a free tier**
- One Cloudflare Worker (free tier) serves the page and the API. The FIRMS key stays on the server, never in the browser.
- Land cover is a prebuilt binary index: 0.03 to 0.92 ms to load cold, and 100 hotspots classify in under 0.6 ms warm, against a 10 ms CPU budget. [`docs/log/jammy.md` 2026-09-28]
- No model runs on the phone.
- Rate limited (20 requests/min per IP), with a human check in front of the API.

**7. Honest by design**
- "No fires detected" is shown only after NASA answered with zero rows. A failed fetch or missing key is an error, never an all-clear.
- Every approximation is labelled: the plume model is "simplified Gaussian-puff, not HYSPLIT", on screen and in this deck.
- Demo data says "DEMO DATA, not real fires" on every scan, and production builds cannot load it.

**8. Experimental: 14-day fire risk, Telangana / AP**
- A logistic-regression model trained on 2020-2023 and scored on 2024 to mid-2026, which it never saw.
- ROC-AUC 0.870, against 0.849 for climatology alone. [`docs/log/jammy.md` 2026-09-29]
- Off by default. Labelled "experimental statistical estimate", and "low is not an all-clear".
- It predicts any fire, crop burning included. Telling the two apart is the classifier's job.

**9. What it does not do (yet)**
- Not HYSPLIT. The plume is a direction and a reach, not a concentration forecast.
- Land cover is at 390 m. Grassland and scrub read as "other", so the classifier leans towards wildfire there on purpose, rather than crop burning.
- Satellites miss small, short or cloud-covered fires.
- Four regions, not the whole country.
- Voice: the AI4Bharat Indic-TTS endpoint we built against is offline, so alerts are read by the phone's own voice where it has one, and shown as text otherwise.

**10. Open and free**
- Code: open source (github.com/uncoalesced/Madhuca).
- Data: NASA FIRMS, Open-Meteo, ESA WorldCover (CC-BY 4.0), Natural Earth. All free.
- Every closed-source service we use is disclosed in the README.
- Team: Joel, Jammy, Rahul.
- Live: madhuca.uncoalesced.com

Do not add, per `docs/MASTER.md` §5.2 and `AGENTS.md`:
- alert subscriptions, SMS or push notifications, "alerts officials", "dispatch";
- "real-time monitoring" or "24/7" (it runs on demand);
- "HYSPLIT" without "not";
- carbon or wildlife-impact metrics (§5.4, backlog);
- "AI-powered voice" (see slide 9).

Not covered: the Van Agni facts come from `docs/MASTER.md` §2. I did not re-check fsiforestfire.gov.in itself, and I did not re-run the ML or CPU numbers.

---

## 2026-09-29 (IST) — Phone QA checklist, and a desktop pre-pass of it

### Why there was a pre-pass

I ran the demo parts of the checklist once in a desktop browser at a 375 x 812 phone
viewport before writing the final version, so the "expected" column matches what the
app actually does. **This is not the real-phone run.** A desktop browser at phone size
proves nothing about touch, real network speed, fonts or speech voices on a phone. The
real-phone run (task 2 in `delegation/rahul.md`) is still open.

What the pre-pass saw (`main` at `a3be912`, `npx vite` in `frontend/`, no Worker running):
- `/?demo`, Punjab: banner "DEMO DATA, not real fires. 4 Active Fire Hotspots in Punjab, 2 Stubble Burning, 2 Wildfire"; 4 markers; basemap tiles loaded after a few seconds; ESA footer visible without scrolling.
- Tapping the 160 MW marker opened the panel: "Likely Wildfire / Forest Fire", "About 12 km South-East of Amritsar", Punjabi selected by default.
- Close, then tap the same marker again: the panel class went `hotspot-panel-empty`, then `hotspot-panel-active`.
- Telangana / AP: 4 markers, the "Show fire risk (14 days)" toggle is present.
- `/` without `?demo` and no Worker: "Radar service responded 500. This is not an all-clear." with a Retry button. That is the error state, not "Clean Skies".
- No console errors from app code.

### Two defects found, for Joel (frontend owner), not fixed by me

I could not file these as Bug issues from this machine: `gh` is not installed here.
They are written below in the Bug template's fields, ready to paste into
Issues, New issue, Bug. Area: `frontend/` for both.

**Bug A. Calm wind: the alert says smoke is going north.**
- What happened: with calm or missing wind, `computeDispersion` returns `bearingDeg: 0` (`logic/src/dispersion.ts`, `downwindBearing`). `generatePlainLanguageAlert` turns that into a compass word, so the Punjabi alert for the 160 MW demo fire read "ਧੂੰਆਂ ਉੱਤਰ ਵੱਲ 3.2 km ਤੱਕ ਜਾ ਰਿਹਾ ਹੈ" ("smoke is going north for 3.2 km"). There is no wind, so there is no direction.
- What should have happened: for a calm or missing-wind plume (`spreadDeg >= 180`), the alert says the smoke is lingering around the fire, in every language, with no compass word.
- How to reproduce: 1. `npm install` 2. `cd frontend && npx vite` 3. open `http://localhost:5173/?demo` 4. tap the "Fire hotspot FRP 160 MW" marker (Punjab). 5. Read the alert under "What this means for you".
- Why it matters: it tells people north of the fire that smoke is heading their way, and people south that it is not. With live data this happens for every hotspot whose wind fetch failed.

**Bug B. Calm wind: the panel gives two different radii.**
- What happened: for the same fire, the "Smoke Dispersion (Wind)" card says "< 1 km radius", while the alert text above it says 3.2 km. `getPlumeSummary` in `frontend/src/utils/plumeGeometry.ts` hard-codes "< 1 km" for every calm plume, but the calm-wind model returns 0.5 to 5 km, scaled by FRP.
- What should have happened: the card shows the plume's own `distanceKm`.
- How to reproduce: same steps as Bug A, then scroll the panel to "Smoke Dispersion (Wind)".

Also a note, not a bug: in `?demo` every plume is a calm-wind pool, so no wedges appear
(see the video script entry above). Checklist row D3 below expects that, so it does not
fail on it.

### The checklist

Run it once per phone. Two phones, ideally one low-end Android (Redmi Note 8 class,
Chrome) and one other (iPhone Safari, or a second Android browser). Fill the results
table at the end. Every FAIL becomes a Bug issue with phone model, browser, region,
steps and a screenshot. Do not fix anything yourself.

**Setup, local (`?demo`) run**
1. PC and phones on the same Wi-Fi.
2. From `frontend/`: `npx vite --host`. Note the `Network:` URL it prints (for example `http://192.168.1.20:5173`).
3. For the no-key error (E2), run `npm run build` at the repo root (the Worker serves `frontend/dist`), then start the Worker without a FIRMS key: `worker/.dev.vars` containing only `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`, then `npx wrangler dev` from `worker/`. Vite proxies `/api` to it.

**Setup, live run**
- `https://madhuca.uncoalesced.com/` on mobile data, not Wi-Fi, on at least one of the phones. That is how most users will reach it.

**G. Global (once per phone per build)**
- G1. Page loads, and the header, region tabs and map all fit the screen with no sideways scroll.
- G2. The ESA footer ("© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data" and the "not HYSPLIT" line) is visible without scrolling, in portrait. Also check landscape.
- G3. The region tab labels are readable at phone width, native script included. On the desktop pre-pass "తెలంగాణ / ఏపీ" wrapped over two lines; check it is still legible on the phone.
- G4. The CARTO / OpenStreetMap credit is visible at the bottom of the map.
- G5. Pinch zoom and pan work on the map without zooming the whole page.
- G6. Live only: the human check (Turnstile) appears, passes, and the scan then starts by itself. Note how long it took.
- G7. Live only: switch regions quickly 5 times, then wait. The banner and markers match the last region tapped, never an earlier one.

**Per region: run all of these for Punjab, Bihar, Delhi and Telangana / AP**

Loading
- L1. While scanning, a banner "Scanning <region> for active fires..." with a spinner. Note roughly how many seconds until it ends.
- L2. The scan ends in error, empty or ready. It never spins for more than about 25 s (the client timeout).

Error
- E1. Local, `/` without `?demo` and no Worker: "Radar service responded 500. This is not an all-clear." and a "Retry scan" button.
- E2. Local, Worker running without a FIRMS key: after the human check, "FIRMS key not configured, so no fire data was fetched. This is not an all-clear."
- E3. Tap "Retry scan": it goes back to loading, then shows the same error. At no point does it show "Clean Skies".
- E4. Live, aeroplane mode on, tap Retry: an error saying it could not reach the service, not "Clean Skies".

Empty (live only, only if the region really has no fires that day)
- M1. "Clean Skies: No active thermal fire hotspots detected in <region> right now." Note the time. Only a real zero-row answer may show this, so if it appears while offline, that is a FAIL.

Demo (`?demo`, local only)
- D1. Banner starts with "DEMO DATA, not real fires." Marker count matches: Punjab 4, Bihar 3, Delhi 2, Telangana / AP 4.
- D2. Legend shows "Likely Stubble Burning" (orange) and "Likely Wildfire" (red), and the marker colours match the counts in the banner.
- D3. Plumes: in `?demo` they are calm-wind pools (0.5 to 5 km), visible only when zoomed in close to a marker. No wedges expected (see the note above). On the live run, check wedges point away from where the wind comes from.
- D4. Telangana / AP only: "Show fire risk (14 days)" draws a coloured grid; the note under it says "Low is not an all-clear"; "Hide fire risk" removes it. Other regions have no toggle.

Detail panel (tap a marker, in demo and live)
- P1. The panel opens and is readable without zooming. The badge matches the marker colour.
- P2. The title reads "About N km <direction> of <town>" (or "In <town>"), and the town is plausible for where the marker is on the map.
- P3. The default language is Punjabi for Punjab, Telugu for Telangana / AP, Hindi for Bihar and Delhi.
- P4. The panel scrolls to its bottom (the "Fire Intensity & Power" card) without scrolling the map.
- P5. The close (X) button closes it. Tapping the same marker reopens it. Tapping a different marker shows that fire's details.
- P6. The alert text and the "Smoke Dispersion (Wind)" card agree on direction and distance (see Bugs A and B; FAIL while those are open).

TTS (in the panel, for each of the 4 language buttons)
- T1. Tapping हिंदी, ਪੰਜਾਬੀ, తెలుగు, English changes the alert text to that language, compass word included.
- T2. "Listen Alert in <language>": note exactly what happens. Expected: either the phone speaks in that language, or the button reads "Retry audio (voice unavailable, read the alert text)". A FAIL is any English voice reading Indic text, silence with no message, or the button stuck on "Synthesizing voice...".
- T3. Note which of the 4 languages each phone could actually speak. Joel needs this for the video.

**Results table (copy once per phone, per build)**

```
Phone:            (model, Android/iOS version)
Browser:          (name and version)
Build:            local ?demo | live
Network:          Wi-Fi | mobile data
Date/time (IST):

Row   Punjab   Bihar   Delhi   Telangana/AP   Notes / issue #
G1-7  (once)
L1
L2
E1
E2
E3
E4
M1
D1
D2
D3
D4    n/a      n/a     n/a
P1
P2
P3
P4
P5
P6
T1
T2
T3
```

Not covered by this checklist: iOS VoiceOver or Android TalkBack, slow 2G/3G throttling, and any browser older than the phone's current default.

---

## 2026-09-26 (IST) — Full App Integration, Radar Pipeline State Machine, Loading & Empty States

Built & Verified:
- **App & Pipeline Integration (`frontend/src/App.ts`)**:
  - Implemented `runRadarPipeline` coordinating on-demand data pipeline: LandCover satellite masks -> FIRMS active thermal hotspots -> Open-Meteo wind vectors -> Gaussian-puff smoke dispersion plumes -> Point-in-polygon land-cover classification.
  - Implemented resilient state machine handling `loading` (with informative scan step progress), `ready` (with active fire breakdown summary), `empty` (friendly clean skies confirmation without error), and `error` (with scan retry trigger).
  - Preserved mandatory ESA WorldCover CC-BY 4.0 attribution and Gaussian-puff model disclaimer.
  - Added test suite `frontend/test/App.test.ts` verifying mask loading fallback, mock pipeline execution, zero-hotspots clean state, and DOM rendering.

### Defect & Test Process Log:
- No defects encountered; full pipeline execution, state machine transitions, and UI rendering verified with 100% test pass.

### Verification Command and Output:

Command:
```bash
node --test frontend/test/App.test.ts
```

Output:
```
✔ loadLandCoverMask handles fetch failures gracefully without throwing (29.1923ms)
✔ runRadarPipeline executes on-demand pipeline with mock hotspots (1197.95ms)
✔ runRadarPipeline handles zero hotspots as empty state without error (0.3149ms)
✔ App renders brand header, region selector, and mandatory ESA attribution footer (11.1842ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1253.4831
```

---

## 2026-09-25 (IST) — Per-hotspot detail panel with plain-language guidance, FRP scales, and multi-language Indic-TTS

Built & Verified:
- **HotspotDetailPanel (`frontend/src/components/HotspotDetailPanel.ts`)**:
  - Implemented mobile-responsive bottom sheet / side drawer displaying fire classification, FRP intensity level, coordinates, and smoke dispersion vector.
  - Implemented `generatePlainLanguageAlert` creating clear, human-understandable guidance ("What this means for you") in Hindi, Punjabi, Telugu, and English.
  - Implemented `getIntensityLabel` ranking Fire Radiative Power (MW) from low to severe.
  - Embedded one-tap `<TtsButton />` with regional language pill selectors.
  - Added test suite `frontend/test/HotspotDetailPanel.test.ts` with 4 passing unit tests.

### Defect & Test Process Log:
- No defects encountered; full accessibility roles (`role="dialog"`), close button triggers, and empty null-hotspot states verified.

### Verification Command and Output:

Command:
```bash
node --test frontend/test/HotspotDetailPanel.test.ts
```

Output:
```
✔ getIntensityLabel correctly ranks fire radiative power (MW) (1.2041ms)
✔ generatePlainLanguageAlert produces localized guidance across languages (0.7824ms)
✔ HotspotDetailPanel renders nothing visible when hotspot is null (13.3125ms)
✔ HotspotDetailPanel renders full details and audio section when active (9.1324ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 665.2735
```

---


Built & Verified:
- **TtsButton (`frontend/src/components/TtsButton.ts`)**:
  - Implemented one-tap audio alert synthesis using Jammy's `synthesizeSpeech` from `@madhuca/logic`.
  - Added localized voice indicators for Hindi (`hi`), Punjabi (`pa`), Telugu (`te`), and English (`en`).
  - Added explicit interactive states: `idle`, `loading` (synthesizing), `playing`, `paused`, and `error`.
  - Added client-side audio blob caching to avoid redundant network syntheses for identical alerts.
  - Added test suite `frontend/test/TtsButton.test.ts` with 3 passing unit tests.

### Defect & Test Process Log:
- No defects encountered; full accessibility markup and language labels validated.

### Verification Command and Output:

Command:
```bash
node --test frontend/test/TtsButton.test.ts
```

Output:
```
✔ TtsButton renders default idle state with localized Hindi label (7.6894ms)
✔ TtsButton renders Punjabi, Telugu, and English labels appropriately (1.4469ms)
✔ TTS_LANGUAGE_NAMES supports all core regional Indic languages (0.2458ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 213.2634
```

---


Built & Verified:
- **MapView (`frontend/src/components/MapView.ts`)**:
  - Implemented MapLibre GL v6 integration with region fitting dynamically mapped to `REGION_BBOX[region]`.
  - Implemented `getMarkerColor(classification)` mapping wildfires to urgent brick red (`#dc2626`) and stubble fires to warm amber (`#d97706`).
  - Implemented `createPlumeFeatureCollection` to construct multi-polygon GeoJSON overlay layers for downwind smoke dispersion cones.
  - Implemented interactive marker click handlers dispatching `onSelect(hotspot)`.
  - Added clean map legend with high-contrast accessibility labels.
  - Added test suite `frontend/test/MapView.test.ts` with 5 passing unit tests.

### Defect & Test Process Log:
- **Defect #2**: MapLibre GL module imported via default import failed in Node ESM test runtime (`does not provide an export named 'default'`).
  - **Fix**: Changed to namespace import `import * as maplibregl from 'maplibre-gl'`.
- **Defect #3**: `REGION_BBOX` was initially destructured as named object properties rather than `[west, south, east, north]` 4-tuple indices.
  - **Fix**: Refactored to tuple array destructuring `const [west, south, east, north] = REGION_BBOX[region]`.

### Verification Command and Output:

Command:
```bash
node --test frontend/test/MapView.test.ts
```

Output:
```
✔ getMarkerColor correctly assigns distinct high-contrast colors by classification (1.6436ms)
✔ createPlumeFeatureCollection produces valid GeoJSON for N hotspots with plumes (1.1406ms)
✔ createPlumeFeatureCollection returns empty collection when plumes is undefined (0.2223ms)
✔ MapView renders container and accessible legend markup (13.6838ms)
✔ REGION_BBOX covers valid bounds for all 4 launch regions (0.3264ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 401.9066
```

---


Built & Verified:
- **Plume Geometry (`frontend/src/utils/plumeGeometry.ts`)**:
  - Implemented spherical destination point projection using haversine/geodesic trigonometry.
  - Implemented `plumeToGeoJSONPolygon(lat, lon, plume)` translating `Plume { bearingDeg, distanceKm, spreadDeg }` into a directional cone polygon for MapLibre GL.
  - Handled calm/missing wind stagnation (`spreadDeg >= 180`) by smoothly degrading into a 360° circular smoke pool.
  - Implemented `bearingToCompass(bearingDeg)` and `getPlumeSummary(plume)` for farmer-accessible, plain-language smoke direction and safety advice.
  - Added test suite `frontend/test/plumeGeometry.test.ts` with 6 comprehensive unit tests.

### Defect & Test Process Log:
- No defects encountered; spherical arc closures and NaN handling validated with 100% test pass.

### Verification Command and Output:

Command:
```bash
node --test frontend/test/plumeGeometry.test.ts
```

Output:
```
✔ destinationPoint correctly projects coordinates North and East (1.5881ms)
✔ plumeToGeoJSONPolygon generates a valid closed directional cone polygon (0.5294ms)
✔ plumeToGeoJSONPolygon generates a 360-degree circular pool for calm wind (0.2271ms)
✔ bearingToCompass accurately converts degrees to 8-point compass names (0.1508ms)
✔ getPlumeSummary generates clear, non-technical safety guidance (0.279ms)
✔ plumeToGeoJSONPolygon handles invalid and NaN inputs gracefully without throwing (0.9182ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 160.3562
```

---


Built & Verified:
- **RegionSelector (`frontend/src/components/RegionSelector.ts`)**:
  - Implemented accessible segmented control for Punjab, Bihar, Delhi, and Telangana from `@madhuca/logic`.
  - Added localized Indic script indicators (ਪੰਜਾਬ, बिहार, दिल्ली, తెలంగాణ) for accessibility across regional user groups.
  - Implemented ARIA accessibility attributes (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`).
  - Added test suite `frontend/test/RegionSelector.test.ts` asserting 4-region label rendering, active state toggling, and tablist accessibility structure.

### Defect & Test Process Log:
- **Defect #1**: Node ESM type-stripping resolution encountered `ERR_MODULE_NOT_FOUND` when resolving bare `./types` in `@madhuca/logic` re-exports under workspace test execution.
  - **Fix**: Enabled `"allowImportingTsExtensions": true` in `logic/tsconfig.json` and added explicit `.ts` extensions to re-export paths in `logic/src/index.ts`. All 42 logic tests and 3 frontend tests pass cleanly with 0 type errors.

### Verification Command and Output:

Command:
```bash
node --test frontend/test/RegionSelector.test.ts
```

Output:
```
✔ RegionSelector renders all 4 regions with English and native names (10.0904ms)
✔ RegionSelector marks the selected region as active with aria-selected="true" (1.1192ms)
✔ RegionSelector renders proper ARIA role structure for navigation (0.6422ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 226.747
```

Full workspace validation:
```bash
npm run typecheck && npm test && npm run build
```
All typechecks pass, 45/45 tests pass, Vite build succeeds.

---
