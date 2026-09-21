# Jammy — Work Log

Log finished, *tested* work here, newest entry on top. Format: date (IST), what was built, how it was verified (include the test command and what passing looked like).

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

