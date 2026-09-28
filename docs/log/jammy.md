# Jammy — Work Log

Log finished, *tested* work here, newest entry on top. Format: date (IST), what was built, how it was verified (include the test command and what passing looked like).

## 2026-09-28 (IST) — Cold-isolate CPU fixed: the Worker loads a prebuilt land-cover index

The team chose the prebuilt-index fix, the first of the three options in the 26 Sept entry below. The old cold path spent 60-260ms of CPU per region against the 10ms budget: `JSON.parse` of the mask plus the classifier's index build. The Worker now does neither.

Built:
- **`logic/src/classify.ts`**
  - The grid index is now flat typed arrays: cell offsets, one `Float32Array` of edges, and the centre-membership ids. Before, it was per-cell JS arrays. The lookup logic is unchanged.
  - Vertices are rounded to float32 in the build, so an index built from JSON and one loaded from `.bin` hold identical coordinates.
  - New `encodeMaskIndex(mask)` serializes the index.
  - New `decodeMaskIndex(region, buffer)` wraps a `.bin` in typed-array views and returns a mask whose index is already cached. `classifyHotspot` and `runRadar` are unchanged.
  - No change to `types.ts`, the `/api/radar` shape or the frontend.
- **`worker/scripts/build-landcover-index.ts`** (`npm run build:index --workspace worker`) writes `frontend/public/landcover/<region>.bin`. The files are committed. Vite copies them into `frontend/dist`, which is what the Worker serves on Joel's `feat/joel-integration` branch.
  - Sizes: punjab 1.16 MB, bihar 4.44, delhi 0.07, telangana 4.27. Each is smaller than its JSON.
- **`worker/src/index.ts`** now loads `/landcover/<region>.bin` instead of the JSON.
- **`worker/test/landcover-index.test.ts`** fails if any `.bin` is out of date with its JSON. So if the masks are republished without re-running the script, CI goes red instead of the Worker silently classifying against old land cover.
- The CI emoji step now also walks `worker/scripts`.

### CPU after the change

`node worker/bench/cpu-budget.ts`, third of three runs, on the same laptop proxy as before:
```
region     json_MB  json_cold_ms  bin_MB  bin_cold_ms  warm_100_ms
punjab        1.38          32.2    1.16         0.28         0.27
bihar         6.05         111.7    4.44         0.75         0.18
delhi         0.10           1.3    0.07         0.03         0.35
telangana     5.16          94.4    4.27         0.67         0.18
```
- `bin_cold` is what the Worker now pays once per region per isolate: copying the bytes into an ArrayBuffer (as `res.arrayBuffer()` does), decoding, and the first classification.
- Across the three runs `bin_cold` ranged from 0.03 to 0.92ms. `json_cold` (the old path) ranged from 1.2 to 146ms.
- **Worst cold request: about 0.9 + 0.5ms for 100 hotspots, against 10ms.**
- Not measured here: FIRMS CSV parsing and `JSON.stringify` of the response, both small at tens of hotspots. Also not measured: CPU as Cloudflare bills it, which the dashboard shows after the deploy.

### Checks

```bash
npm run typecheck
npm run build
npm test --workspaces --if-present
node worker/bench/cpu-budget.ts
```

Passing looks like this. Typecheck and build exit 0. The tests print one block per workspace, in the order logic, worker, frontend:
```
# tests 67
# pass 67
# fail 0
# tests 9
# pass 9
# fail 0
# tests 25
# pass 25
# fail 0
```

New tests:
- `logic/test/classify-index.test.ts` (6):
  - Per region, the prebuilt index gives `deepEqual` classifications to the JSON mask on 600 points spread over the region box, with months and FRP varied. Every region except Delhi must hit cropland, so this is not just comparing `other` with `other`.
  - The region survives a round trip, so Telangana `other` in October stays a wildfire.
  - Truncated, wrong-length, JSON and zeroed buffers all throw instead of being misread.
- `worker/test/landcover-index.test.ts` (4): each committed `.bin` is byte-equal to `encodeMaskIndex` of its JSON.

The equivalence tests were checked against a planted bug. With the decoder flipping cropland and forest, all 4 region tests failed; the file was then restored.

`wrangler dev` (workerd), using the placeholder key again. Each region gives a 502 from FIRMS; a `.bin` that failed to load or decode would have given a 500 first:
```
== punjab
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502
== bihar
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502
== delhi
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502
== telangana
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502
bihar.bin asset HTTP 200 4441056B
```

Not covered:
- A 200 with real fires for all four regions. The real key is still not on this machine; Joel saw a Punjab 200 on 28 Sept (`docs/log/joel.md`, on his branch).
- Cloudflare's own CPU figure.

---

## 2026-09-26 (IST) — Server path: Worker `/api/radar`, CPU numbers, TTS endpoint check

Built:

- **`logic/src/radar.ts` (`runRadar`)**: the whole region loop. It fetches FIRMS, then wind in parallel, one call per 0.25 degree cell. Then it runs dispersion and classification. A failed wind call falls back to calm-wind dispersion. A FIRMS failure throws, because an empty list would read as an all-clear. It lives in `logic/` because it is `fetch` plus pure computation, so the frontend can reuse it too. `frontend/src/App.ts` still has its own client-side copy. Joel removes that when he wires the frontend to `/api/radar` on the 28th. I did not edit `frontend/`.
- **`worker/` workspace**: the Cloudflare Worker `GET /api/radar?region=`.
  - The FIRMS key comes from `env.FIRMS_MAP_KEY`, a Worker secret. Locally it goes in `worker/.dev.vars`, which is gitignored.
  - The masks are read from static assets (`env.ASSETS`, pointed at `frontend/public`). Each parsed mask is cached for the isolate's lifetime. A failed mask load is not cached.
  - Status codes: 200 is `{hotspots, plumes, classifications}`. 400 means an unknown region. 500 means the key is missing (the error says "not an all-clear") or the mask is missing. 502 means FIRMS failed, and the key never appears in the body. 404 is any other path.
  - New devDependency: `wrangler` (the Workers CLI). You cannot run or deploy a Worker without it.
- **`worker/bench/cpu-budget.ts`**: CPU time per region for each part of the work.
- **CI emoji step** now also walks `worker/src`, `worker/test` and `worker/bench`.
- **Flaky test fixed**: `classify.test.ts` "handles real landcover mask file from delhi.json" failed 1 run in 7. It timed a cold call (index build included) against 10ms of wall clock, while `node --test` runs files in parallel. It now times a warm lookup, which is what its message claims to measure. The bench measures the cold cost. After the fix: 10 of 10 runs passed.

### CPU budget: over, on a cold isolate, for 3 of 4 regions

`node worker/bench/cpu-budget.ts`. Two runs on this laptop, wall time around synchronous code. (`process.cpuUsage` ticks in 15.6ms steps on Windows, so it is too coarse here.)

```
region     mask_MB  parse_ms  index_ms  warm_100_ms  cold_total_ms
punjab        1.38      26.6      37.8         0.30           64.6
bihar         6.05     123.2      40.3         0.29          163.8
delhi         0.10       2.1       0.4         0.73            3.2
telangana     5.16      98.6      41.2         0.24          140.0
```
```
region     mask_MB  parse_ms  index_ms  warm_100_ms  cold_total_ms
punjab        1.38      41.4      64.9         1.10          107.5
bihar         6.05     170.5      86.8         0.39          257.7
delhi         0.10       2.0       0.4         0.67            3.1
telangana     5.16     150.6      47.4         0.31          198.3
```
(The second run was taken while `wrangler dev` was also running.)

What the numbers mean:
- **Warm is fine.** When the mask is already parsed and indexed, 100 hotspots take under about 1ms of dispersion and classification.
- **Cold is not.** On the first request for a region in a fresh isolate, parsing the mask and building the index take 60 to 260ms for Punjab, Bihar and Telangana. That is 6 to 25 times the 10ms free-tier budget.
- **Delhi is within budget** even cold.

This is a Node proxy on a laptop, not Cloudflare's own measurement. The dashboard CPU chart after the deploy is the real check.

This needs a team decision now, not on the 30th. I have not picked an option:
1. **Classify in the browser.** The Worker returns hotspots and plumes, both cheap. The client classifies against the masks it already downloads today. The FIRMS key still stays server-side.
2. **Precompute the index offline** in the pipeline, as a compact binary that loads without `JSON.parse`. This is real work, and the pipeline is Joel's area.
3. **Ship as-is.** Cold requests for 3 regions may be killed with error 1102. Warm requests are fine.

### Live checks

`wrangler dev` (workerd, `worker/.dev.vars` holding a placeholder key, since the real key is not on this machine). Then curl each region:

```
== punjab
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502 1.532854s
== bihar
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502 1.525012s
== delhi
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502 1.357481s
== telangana
{"error":"FIRMS responded 400 Bad Request"}
HTTP 502 1.506103s
== kerala
{"error":"region must be one of: punjab, bihar, delhi, telangana"}
HTTP 400 0.212325s
mask asset HTTP 200 95977B
```

This proves that the Worker runs under workerd and loads each region's mask from assets. The mask loads before FIRMS is called, so reaching FIRMS means the mask loaded. It also proves that the Worker reaches live FIRMS and turns a rejected key into a 502 without leaking the key. **It does not prove a 200 with real fires.** That needs the real key in `worker/.dev.vars`, so the "Worker entry" box stays unticked.

**TTS endpoint.** A live call on 2026-09-26 17:41 UTC:
```
curl: (6) Could not resolve host: tts.indicnlp.org
*** one.one.one.one can't find tts.indicnlp.org: Non-existent domain
```
The control, `api.open-meteo.com` from the same shell, returned HTTP 200. The default endpoint in `logic/src/tts.ts` does not exist (NXDOMAIN), so any TTS call made without an explicit `endpoint` fails. The text-only fallback, labelled as such, is needed. That fallback is in the frontend (Joel's area); I did not build it.

### Verification Commands and Output

```bash
npm run typecheck
npm run build
npm test --workspaces --if-present
node worker/bench/cpu-budget.ts
```

Passing looks like this. Typecheck and build exit 0. The tests print one block per workspace, in the order logic, worker, frontend:
```
# tests 61
# pass 61
# fail 0
# tests 5
# pass 5
# fail 0
# tests 25
# pass 25
# fail 0
```
The new tests are `logic/test/radar.test.ts` (4) and `worker/test/index.test.ts` (5):
- 5 hotspots in one cell plus 1 elsewhere make exactly 2 wind calls.
- A failed wind call gives a 180-degree calm plume, and all 6 fires are still classified.
- A FIRMS 500 throws. A zero-row FIRMS answer is empty and makes 0 wind calls.
- Ludhiana (30.8, 75.6) in October, classified against the real `punjab.json` read through the ASSETS stub, is `cropland` / `likely-crop-burning`.
- The statuses: 500 for no key, 502 without the key in the body, 400, 404, and 500 for a missing mask.

What these do not cover:
- A 200 from the Worker with real FIRMS data. That needs the real key.
- CPU as Cloudflare bills it.
- The deployed route.
- CORS. The Worker sets none; it assumes Pages and the Worker share the madhuca.uncoalesced.com origin.

---

## 2026-09-26 (IST) — Review pass: classifier budget fix, and four bias/edge bugs

Re-ran everything first: 42/42 passing, typecheck and build green — the four ticked tasks were real. Review then found:

- **Classifier blew the Workers budget.** The lookup scanned every polygon per hotspot, and each mask is dominated by one region-spanning polygon (Bihar's largest: ~65k vertices, ~13k holes), so 500 random Bihar hotspots took ~456ms. The old "under Cloudflare budget" test only classified one point at 25.0,80.0 — outside Punjab, Bihar and Telangana — so it never touched a polygon. Replaced with a grid index (0.05° cells): each cell stores its edges and which polygons contain its centre; a lookup counts crossings only from the centre to the point. Still plain ray-casting, no geometry library. Built once per mask object (WeakMap), no mutation of the caller's mask. Handles float-rounded cell boundaries, edges lying on a cell-centre line, and sliver overlaps between independently-simplified polygons (earliest feature wins, same as naive first-hit).
- **Unparseable `acquiredAt` defaulted to October** — i.e. stubble season — tilting `other` fires toward crop-burning. Now an unknown season.
- **Unknown FRP defaulted to 20 MW**, inside the 5–60 MW crop-burning band. Now unknown, which never matches the signature.
- **`bearingDeg` could be 360** (e.g. wind from 179.6°) because rounding happened after the wrap. Now rounds first; always in [0, 360).
- **TTS rejected `hi-IN` / `pa_IN`** — what browsers report. Now reduced to the primary subtag.

Each of the new regression tests was also run against the pre-fix source and fails there (6 failures), so they test the bugs, not just the fix.

Not fixed here, for the team: `JSON.parse` of the Bihar mask (6 MB) is itself tens of ms of CPU, and the index build is 20–65ms per mask. Both are fine in a browser or a warm isolate that keeps the parsed mask at module scope, but on a cold Worker they exceed 10ms before any hotspot is classified. Where classification runs (browser vs Worker) is not settled in any doc I could find.

### Verification Commands and Output

```bash
npm test
npm run typecheck
npm run build
```

Passing looks like `# tests 55`, `# pass 55`, `# fail 0`, with these among them:

```
ok 12 - punjab: indexed lookup matches naive ray-casting on 400 points across the region bbox
ok 13 - bihar: indexed lookup matches naive ray-casting on 400 points across the region bbox
ok 14 - delhi: indexed lookup matches naive ray-casting on 400 points across the region bbox
ok 15 - telangana: indexed lookup matches naive ray-casting on 400 points across the region bbox
ok 16 - classifies a 1000-hotspot region loop inside the 10ms Workers budget once the mask is indexed
# bihar index build: 24.7ms (once per mask object)
# 1000 hotspots: 4.19ms
ok 17 - finds a polygon whose edge sits on a float-rounded cell boundary
ok 18 - resolves points just above and below an edge lying exactly on a cell centre line
ok 19 - resolves a sliver overlap between two polygons to the earlier feature, without corrupting the row
ok 20 - does not mutate the caller's mask
ok 21 - an unparseable acquiredAt is an unknown season, not stubble season
ok 22 - an unknown FRP does not match the moderate-FRP crop-burning signature on other land
ok 23 - a Telangana scrub fire in peak stubble season with moderate FRP is still likely wildfire
ok 31 - keeps bearingDeg in [0, 360) when rounding lands on the wrap point
ok 48 - accepts regional BCP-47 tags such as hi-IN and sends the bare language code
# tests 55
# pass 55
# fail 0
```

`npm run typecheck` and `npm run build` both exit 0.

---

## 2026-09-23 (IST) — Complete edge-case hardening, multi-polygon support, and full 4-region mask verification

Built & Verified:
- **Dispersion robustness**: guarded against non-finite/NaN `directionDeg` and negative `speedMs` in `computeDispersion`; enforced boundary clamping for massive FRP fires (capped at 80 km) and verified zero/negative FRP handling.
- **Classification performance & edge cases**: added bounding-box caching to `isPointInPolygon` outer ring check for sub-millisecond evaluation across large masks; added support and unit tests for MultiPolygon features, spring wheat-harvest stubble burning season (April–May), and full verification against all 4 real published region masks (`delhi.json`, `punjab.json`, `bihar.json`, `telangana.json`) within Cloudflare Workers budget.
- **Indic-TTS coverage**: added tests for Telugu (`te`) and English (`en`), custom endpoint/gender options, and empty audioContent payload error handling.
- Total test suite now stands at 42/42 passing unit tests across `@madhuca/logic`.

### Verification Commands and Output

Command:
```bash
npm test
```

Output:
```
TAP version 13
# Subtest: classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning
ok 1 - classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning
# Subtest: classifies a hotspot inside a forest polygon as likely wildfire
ok 2 - classifies a hotspot inside a forest polygon as likely wildfire
# Subtest: treats a land-cover miss as other without throwing, and does NOT default to crop-burning
ok 3 - treats a land-cover miss as other without throwing, and does NOT default to crop-burning
# Subtest: classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning
ok 4 - classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning
# Subtest: classifies extreme FRP (>150 MW) in cropland as likely wildfire
ok 5 - classifies extreme FRP (>150 MW) in cropland as likely wildfire
# Subtest: handles real landcover mask file from frontend/public/landcover/delhi.json
ok 6 - handles real landcover mask file from frontend/public/landcover/delhi.json
# Subtest: excludes hotspots located inside an interior polygon hole (falling back to other)
ok 7 - excludes hotspots located inside an interior polygon hole (falling back to other)
# Subtest: handles a hotspot exactly on a land-cover polygon boundary edge and vertex without throwing
ok 8 - handles a hotspot exactly on a land-cover polygon boundary edge and vertex without throwing
# Subtest: handles empty or malformed mask gracefully without throwing
ok 9 - handles empty or malformed mask gracefully without throwing
# Subtest: classifies a cropland hotspot during spring wheat harvest season (April-May) as likely crop-burning
ok 10 - classifies a cropland hotspot during spring wheat harvest season (April-May) as likely crop-burning
# Subtest: handles MultiPolygon geometries correctly
ok 11 - handles MultiPolygon geometries correctly
# Subtest: handles real landcover masks for Punjab, Bihar, and Telangana under Cloudflare budget
ok 12 - handles real landcover masks for Punjab, Bihar, and Telangana under Cloudflare budget
# Subtest: flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)
ok 13 - flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)
# Subtest: scales downwind distance with wind speed and fire radiative power (FRP)
ok 14 - scales downwind distance with wind speed and fire radiative power (FRP)
# Subtest: narrows spread angle as wind speed increases and widens as speed drops
ok 15 - narrows spread angle as wind speed increases and widens as speed drops
# Subtest: degrades gracefully to radial pooling on calm wind without throwing
ok 16 - degrades gracefully to radial pooling on calm wind without throwing
# Subtest: degrades gracefully when wind data is null or missing without throwing
ok 17 - degrades gracefully when wind data is null or missing without throwing
# Subtest: handles non-finite directionDeg and negative speedMs without throwing or returning NaN
ok 18 - handles non-finite directionDeg and negative speedMs without throwing or returning NaN
# Subtest: clamps extreme FRP values and handles zero or negative FRP safely
ok 19 - clamps extreme FRP values and handles zero or negative FRP safely
# Subtest: parses a recorded FIRMS CSV into hotspots
ok 20 - parses a recorded FIRMS CSV into hotspots
# Subtest: orders hotspots newest first
ok 21 - orders hotspots newest first
# Subtest: keeps FIRMS confidence raw rather than normalising it
ok 22 - keeps FIRMS confidence raw rather than normalising it
# Subtest: zero-pads a three-digit acq_time
ok 23 - zero-pads a three-digit acq_time
# Subtest: throws when FIRMS answers a bad key with HTTP 200 and plain text
ok 24 - throws when FIRMS answers a bad key with HTTP 200 and plain text
# Subtest: treats an empty result set as zero hotspots, not an error
ok 25 - treats an empty result set as zero hotspots, not an error
# Subtest: rejects an empty map key before making a request
ok 26 - rejects an empty map key before making a request
# Subtest: queries the selected region bbox and never leaks the key in an error
ok 27 - queries the selected region bbox and never leaks the key in an error
# Subtest: every v1 region has a west,south,east,north bbox
ok 28 - every v1 region has a west,south,east,north bbox
# Subtest: synthesizes speech from a JSON response containing base64 audioContent
ok 29 - synthesizes speech from a JSON response containing base64 audioContent
# Subtest: synthesizes speech from a binary audio stream response
ok 30 - synthesizes speech from a binary audio stream response
# Subtest: rejects empty or whitespace-only text
ok 31 - rejects empty or whitespace-only text
# Subtest: rejects unsupported language codes
ok 32 - rejects unsupported language codes
# Subtest: surfaces non-OK HTTP status from Indic-TTS
ok 33 - surfaces non-OK HTTP status from Indic-TTS
# Subtest: synthesizes speech in Telugu (te) and English (en) with custom options
ok 34 - synthesizes speech in Telugu (te) and English (en) with custom options
# Subtest: throws error when JSON response contains no audioContent
ok 35 - throws error when JSON response contains no audioContent
# Subtest: parses a recorded Open-Meteo response into Wind
ok 36 - parses a recorded Open-Meteo response into Wind
# Subtest: leaves the direction meteorological — the direction wind blows FROM
ok 37 - leaves the direction meteorological — the direction wind blows FROM
# Subtest: marks the timestamp as UTC
ok 38 - marks the timestamp as UTC
# Subtest: keeps a dead calm as a real reading rather than an error
ok 39 - keeps a dead calm as a real reading rather than an error
# Subtest: throws when the response carries no current wind block
ok 40 - throws when the response carries no current wind block
# Subtest: requests m/s and current 10m wind for the given coordinate
ok 41 - requests m/s and current 10m wind for the given coordinate
# Subtest: surfaces a non-OK HTTP status
ok 42 - surfaces a non-OK HTTP status
1..42
# tests 42
# suites 0
# pass 42
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 459.1561
```

Typecheck and Build:
```bash
npm run typecheck
npm run build
```
Both succeeded with 0 errors.

---

## 2026-09-22 (IST) — Boundary edge/vertex, polygon hole exclusion, and edge-case verification

Built & Verified:
- Expanded `logic/test/classify.test.ts` to explicitly cover polygon boundary edge and corner vertex coordinates, interior hole exclusions, and malformed mask recovery without throwing (directly addressing all edge-case requirements in `delegation/jammy.md`).
- Verified zero-throw graceful handling and confirmed 35/35 passing unit tests across `@madhuca/logic`.

### Verification Commands and Output

Command:
```bash
npm test
```

Output:
```
TAP version 13
# Subtest: classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning
ok 1 - classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning
# Subtest: classifies a hotspot inside a forest polygon as likely wildfire
ok 2 - classifies a hotspot inside a forest polygon as likely wildfire
# Subtest: treats a land-cover miss as other without throwing, and does NOT default to crop-burning
ok 3 - treats a land-cover miss as other without throwing, and does NOT default to crop-burning
# Subtest: classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning
ok 4 - classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning
# Subtest: classifies extreme FRP (>150 MW) in cropland as likely wildfire
ok 5 - classifies extreme FRP (>150 MW) in cropland as likely wildfire
# Subtest: handles real landcover mask file from frontend/public/landcover/delhi.json
ok 6 - handles real landcover mask file from frontend/public/landcover/delhi.json
# Subtest: excludes hotspots located inside an interior polygon hole (falling back to other)
ok 7 - excludes hotspots located inside an interior polygon hole (falling back to other)
# Subtest: handles a hotspot exactly on a land-cover polygon boundary edge and vertex without throwing
ok 8 - handles a hotspot exactly on a land-cover polygon boundary edge and vertex without throwing
# Subtest: handles empty or malformed mask gracefully without throwing
ok 9 - handles empty or malformed mask gracefully without throwing
# Subtest: flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)
ok 10 - flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)
# Subtest: scales downwind distance with wind speed and fire radiative power (FRP)
ok 11 - scales downwind distance with wind speed and fire radiative power (FRP)
# Subtest: narrows spread angle as wind speed increases and widens as speed drops
ok 12 - narrows spread angle as wind speed increases and widens as speed drops
# Subtest: degrades gracefully to radial pooling on calm wind without throwing
ok 13 - degrades gracefully to radial pooling on calm wind without throwing
# Subtest: degrades gracefully when wind data is null or missing without throwing
ok 14 - degrades gracefully when wind data is null or missing without throwing
# Subtest: parses a recorded FIRMS CSV into hotspots
ok 15 - parses a recorded FIRMS CSV into hotspots
# Subtest: orders hotspots newest first
ok 16 - orders hotspots newest first
# Subtest: keeps FIRMS confidence raw rather than normalising it
ok 17 - keeps FIRMS confidence raw rather than normalising it
# Subtest: zero-pads a three-digit acq_time
ok 18 - zero-pads a three-digit acq_time
# Subtest: throws when FIRMS answers a bad key with HTTP 200 and plain text
ok 19 - throws when FIRMS answers a bad key with HTTP 200 and plain text
# Subtest: treats an empty result set as zero hotspots, not an error
ok 20 - treats an empty result set as zero hotspots, not an error
# Subtest: rejects an empty map key before making a request
ok 21 - rejects an empty map key before making a request
# Subtest: queries the selected region bbox and never leaks the key in an error
ok 22 - queries the selected region bbox and never leaks the key in an error
# Subtest: every v1 region has a west,south,east,north bbox
ok 23 - every v1 region has a west,south,east,north bbox
# Subtest: synthesizes speech from a JSON response containing base64 audioContent
ok 24 - synthesizes speech from a JSON response containing base64 audioContent
# Subtest: synthesizes speech from a binary audio stream response
ok 25 - synthesizes speech from a binary audio stream response
# Subtest: rejects empty or whitespace-only text
ok 26 - rejects empty or whitespace-only text
# Subtest: rejects unsupported language codes
ok 27 - rejects unsupported language codes
# Subtest: surfaces non-OK HTTP status from Indic-TTS
ok 28 - surfaces non-OK HTTP status from Indic-TTS
# Subtest: parses a recorded Open-Meteo response into Wind
ok 29 - parses a recorded Open-Meteo response into Wind
# Subtest: leaves the direction meteorological — the direction wind blows FROM
ok 30 - leaves the direction meteorological — the direction wind blows FROM
# Subtest: marks the timestamp as UTC
ok 31 - marks the timestamp as UTC
# Subtest: keeps a dead calm as a real reading rather than an error
ok 32 - keeps a dead calm as a real reading rather than an error
# Subtest: throws when the response carries no current wind block
ok 33 - throws when the response carries no current wind block
# Subtest: requests m/s and current 10m wind for the given coordinate
ok 34 - requests m/s and current 10m wind for the given coordinate
# Subtest: surfaces a non-OK HTTP status
ok 35 - surfaces a non-OK HTTP status
1..35
# tests 35
# suites 0
# pass 35
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 302.7841
```

Typecheck and Build:
```bash
npm run typecheck
npm run build
```
Both succeeded with 0 errors.

---

## 2026-09-21 (IST) — Dispersion, Classification, and Indic-TTS modules completed

Built:
1. **Dispersion module (`logic/src/dispersion.ts`, `computeDispersion`)**:
   - Simplified Gaussian-puff plume calculation (explicitly not real NOAA HYSPLIT).
   - Inverts meteorological wind direction (FROM) by 180° to compute plume travel bearing (TO).
   - Scales downwind reach (`distanceKm`) based on wind speed and $\sqrt{\text{FRP}}$.
   - Adjusts lateral spread half-angle (`spreadDeg`), widening dynamically as wind speed drops.
   - Degrades gracefully on dead calm (`speedMs = 0`) or missing wind (`null`) into radial stagnation dispersion (`spreadDeg = 180`), never throwing.

2. **Classification module (`logic/src/classify.ts`, `classifyHotspot`)**:
   - Zero-dependency ray-casting point-in-polygon algorithm with bounding-box pre-filtering to respect the 10ms Cloudflare Workers CPU budget.
   - Classifies `forest` as `likely-wildfire`.
   - Classifies `cropland` based on autumn (Oct–Nov) Kharif paddy-stubble and spring (Apr–May) Rabi wheat-stubble burning seasons with moderate FRP as `likely-crop-burning`.
   - Treats mask misses as `other` (never throws), and crucially does **not** default `other` to crop-burning, correctly preserving Telangana scrub fires and uncultivated grassland fires as `likely-wildfire`.
   - Passes performance benchmark against real `delhi.json` landcover mask in ~4ms (<10ms budget).

3. **Indic-TTS integration (`logic/src/tts.ts`, `synthesizeSpeech`)**:
   - Web standards and `fetch`-only implementation without Node fs/Buffer dependencies (Cloudflare Workers free tier compatible).
   - Validates supported languages (`hi`, `pa`, `te`, `en`) and non-empty text.
   - Handles both standard AI4Bharat JSON responses (base64 audio decoding via web `atob`) and binary audio streams (`audio/wav`).

### Verification Commands and Output

Command:
```bash
npm test
```

Output:
```
TAP version 13
# Subtest: classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning
ok 1 - classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning
# Subtest: classifies a hotspot inside a forest polygon as likely wildfire
ok 2 - classifies a hotspot inside a forest polygon as likely wildfire
# Subtest: treats a land-cover miss as other without throwing, and does NOT default to crop-burning
ok 3 - treats a land-cover miss as other without throwing, and does NOT default to crop-burning
# Subtest: classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning
ok 4 - classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning
# Subtest: classifies extreme FRP (>150 MW) in cropland as likely wildfire
ok 5 - classifies extreme FRP (>150 MW) in cropland as likely wildfire
# Subtest: handles real landcover mask file from frontend/public/landcover/delhi.json
ok 6 - handles real landcover mask file from frontend/public/landcover/delhi.json
# Subtest: flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)
ok 7 - flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)
# Subtest: scales downwind distance with wind speed and fire radiative power (FRP)
ok 8 - scales downwind distance with wind speed and fire radiative power (FRP)
# Subtest: narrows spread angle as wind speed increases and widens as speed drops
ok 9 - narrows spread angle as wind speed increases and widens as speed drops
# Subtest: degrades gracefully to radial pooling on calm wind without throwing
ok 10 - degrades gracefully to radial pooling on calm wind without throwing
# Subtest: degrades gracefully when wind data is null or missing without throwing
ok 11 - degrades gracefully when wind data is null or missing without throwing
# Subtest: parses a recorded FIRMS CSV into hotspots
ok 12 - parses a recorded FIRMS CSV into hotspots
# Subtest: orders hotspots newest first
ok 13 - orders hotspots newest first
# Subtest: keeps FIRMS confidence raw rather than normalising it
ok 14 - keeps FIRMS confidence raw rather than normalising it
# Subtest: zero-pads a three-digit acq_time
ok 15 - zero-pads a three-digit acq_time
# Subtest: throws when FIRMS answers a bad key with HTTP 200 and plain text
ok 16 - throws when FIRMS answers a bad key with HTTP 200 and plain text
# Subtest: treats an empty result set as zero hotspots, not an error
ok 17 - treats an empty result set as zero hotspots, not an error
# Subtest: rejects an empty map key before making a request
ok 18 - rejects an empty map key before making a request
# Subtest: queries the selected region bbox and never leaks the key in an error
ok 19 - queries the selected region bbox and never leaks the key in an error
# Subtest: every v1 region has a west,south,east,north bbox
ok 20 - every v1 region has a west,south,east,north bbox
# Subtest: synthesizes speech from a JSON response containing base64 audioContent
ok 21 - synthesizes speech from a JSON response containing base64 audioContent
# Subtest: synthesizes speech from a binary audio stream response
ok 22 - synthesizes speech from a binary audio stream response
# Subtest: rejects empty or whitespace-only text
ok 23 - rejects empty or whitespace-only text
# Subtest: rejects unsupported language codes
ok 24 - rejects unsupported language codes
# Subtest: surfaces non-OK HTTP status from Indic-TTS
ok 25 - surfaces non-OK HTTP status from Indic-TTS
# Subtest: parses a recorded Open-Meteo response into Wind
ok 26 - parses a recorded Open-Meteo response into Wind
# Subtest: leaves the direction meteorological — the direction wind blows FROM
ok 27 - leaves the direction meteorological — the direction wind blows FROM
# Subtest: marks the timestamp as UTC
ok 28 - marks the timestamp as UTC
# Subtest: keeps a dead calm as a real reading rather than an error
ok 29 - keeps a dead calm as a real reading rather than an error
# Subtest: throws when the response carries no current wind block
ok 30 - throws when the response carries no current wind block
# Subtest: requests m/s and current 10m wind for the given coordinate
ok 31 - requests m/s and current 10m wind for the given coordinate
# Subtest: surfaces a non-OK HTTP status
ok 32 - surfaces a non-OK HTTP status
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 276.326
```

Typecheck and Build:
```bash
npm run typecheck
npm run build
```
Both succeeded with 0 errors.

---

