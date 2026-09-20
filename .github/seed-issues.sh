#!/usr/bin/env bash
# Seeds the labels and the opening backlog, taken straight from the three
# delegation briefs and the open questions in docs/MASTER.md.
#
# Run ONCE, after the repo push has settled. NOT idempotent: running it twice
# gives you every issue twice.
#
#   gh auth status              # must be logged in with repo scope
#   ./.github/seed-issues.sh
#
# Issue forms (.github/ISSUE_TEMPLATE/*.yml) only apply in the web UI, so these
# bodies mirror the Task template's fields by hand.
set -euo pipefail

REPO="${REPO:-uncoalesced/Madhuca}"

label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
issue() { gh issue create --repo "$REPO" --title "$1" --label "$2" --body-file -; }

echo "Creating labels..."
label "task"        0366d6 "A unit of work someone is going to build"
label "bug"         d73a4a "Something already built, behaving wrong"
label "contract"    b60205 "Changes a shared type in logic/src/types.ts"
label "needs-ack"   fbca04 "Waiting on the affected people to agree"
label "blocked"     e11d21 "Cannot start until something else lands"
label "backlog"     ededed "Parked on purpose - exempt from the stale nudge"
label "stale"       795548 "No activity for 3+ days"
label "frontend"    1d76db "frontend/"
label "logic"       0e8a16 "logic/"
label "pipeline"    5319e7 "pipeline/"
label "docs"        c5def5 "docs/ or delegation/"
label "repo-config" bfd4f2 "CI, build, deploy config"

echo "Creating issues..."

issue "[task] Request the NASA FIRMS MAP_KEY" "task,blocked" <<'BODY'
**Owner:** Joel
**Area:** repo config

## What to build
Request a free `MAP_KEY` from https://firms.modaps.eosdis.nasa.gov/api/map_key/ and
put it in a local `.env` (the slot is already in `.env.example`).

## How we will know it works
A curl against the FIRMS area endpoint with the key returns CSV rows for a Punjab
bounding box, pasted into `docs/log/joel.md`.

## Blocked by
Nothing. This is the one external dependency with signup lag - HANDOFF.md flagged it
twice as the thing most likely to quietly eat a day. Do it first.

Blocks the hotspot fetcher, and therefore the entire demo path.
BODY

issue "[task] Resolve the deployment topology (MASTER 5.1)" "task,docs" <<'BODY'
**Owner:** Joel
**Area:** docs

## What to build
Pick one: Cloudflare Workers free tier, Workers Paid ($5/mo, 30s CPU), or a
Cloudflare Tunnel to a real server. Record it as a dated one-liner in the
`docs/MASTER.md` decision log and strike it from section 5.

## How we will know it works
5.1 no longer lists it as open, and the decision log has the dated line.

## Blocked by
Nothing. The repo builds for Workers Paid as HANDOFF.md says to default, and
`logic/tsconfig.json` sets `"types": []` so this stays a deployment choice rather
than a rewrite - but integration and deploy both wait on the real answer.
BODY

issue "[task] Decide what the dispatch layer is (MASTER 5.2)" "task,docs" <<'BODY'
**Owner:** Joel
**Area:** docs

## What to build
Now that automated calls/SMS are off: in-page alert banner, self-serve opt-in
subscription, both, or something else. One line in `docs/MASTER.md`.

## How we will know it works
5.2 answered, dated line in the decision log.

## Blocked by
Nothing - but this blocks Rahul's alert UI, and nothing else. He has the map, detail
panel and TTS work to get on with meanwhile.
BODY

issue "[task] Turn on branch protection for main" "task,repo-config" <<'BODY'
**Owner:** Joel
**Area:** repo config

## What to build
The ruleset described in AGENTS.md under "Branch protection". Requires admin.

## How we will know it works
A PR with a deliberately failing typecheck cannot be merged.

## Blocked by
One CI run. Status checks only become selectable once they have run at least once -
open a throwaway PR first, then add `check` and `guard` to the ruleset.

Until this is on, the workflows report but nothing stops a red merge.
BODY

issue "[task] Offline land-cover pipeline (GitHub Actions)" "task,pipeline" <<'BODY'
**Owner:** Joel
**Area:** pipeline/

## What to build
Finish `pipeline/landcover.sh`: clip the synced ESA WorldCover tiles to Punjab,
Bihar, Delhi and Telangana, reduce to a cropland/forest/other GeoJSON mask per
region, publish where the live app can read it. Stays CI-side, never in the request
path.

## How we will know it works
The workflow run produces four GeoJSON files, and a point known to sit in Punjab
cropland resolves to `cropland` against the output.

## Blocked by
Partly on 5.1 - where the masks get published depends on the deploy target. The
clip-and-export itself can start now.

Schema must match `LandCoverMask` in `logic/src/types.ts`. If it cannot, that is a
contract change, not a quiet edit - tell Jammy.
BODY

issue "[task] FIRMS hotspot fetcher" "task,logic" <<'BODY'
**Owner:** Joel
**Area:** logic/

## What to build
Implement `fetchHotspots(region)` in `logic/src/hotspots.ts`. Fetch-only, no Node
APIs - it has to run on Workers.

## How we will know it works
A test with a recorded FIRMS CSV response parses to the expected `Hotspot[]`.

This is the first real logic in the repo, so this task also picks the test runner
and adds the `test` script. CI already runs `npm test --workspaces --if-present`, so
it starts enforcing itself with no workflow change.

## Blocked by
The MAP_KEY issue.
BODY

issue "[task] Open-Meteo wind fetcher" "task,logic" <<'BODY'
**Owner:** Joel
**Area:** logic/

## What to build
Implement `fetchWind(lat, lon)` in `logic/src/wind.ts`. No API key needed.

## How we will know it works
A test with a recorded Open-Meteo response parses to the expected `Wind`.

Remember `directionDeg` is meteorological - the direction wind blows FROM, not the
direction it travels.

## Blocked by
Nothing.
BODY

issue "[task] Dispersion module and finalise the Plume contract" "task,logic" <<'BODY'
**Owner:** Jammy
**Area:** logic/

## What to build
Implement `computeDispersion(hotspot, wind)`. Simplified Gaussian-puff, explicitly
not HYSPLIT. `Plume` is currently `{ bearingDeg, distanceKm, spreadDeg }` - the
minimum shape that unblocked Rahul's overlay. **You own finalising it.**

## How we will know it works
Tests: a known wind direction produces a plume pointing the right way (bearing is
wind direction + 180); calm wind and null wind degrade gracefully rather than
throwing.

## Blocked by
Nothing.

If you change the `Plume` shape, open a Contract change issue first - Rahul builds
his overlay against it, and `contract-guard` will fail the PR otherwise.
BODY

issue "[task] Classification module" "task,logic" <<'BODY'
**Owner:** Jammy
**Area:** logic/

## What to build
Implement `classifyHotspot(hotspot, landCoverMask)`. Point-in-polygon against the
mask, combined with FRP magnitude and month (stubble season is roughly Oct-Nov).

## How we will know it works
Tests: a hotspot inside a known cropland polygon during stubble season classifies as
likely crop-burning; one in forest outside that season as likely wildfire; one
exactly on a boundary does something defined rather than crashing.

## Blocked by
Joel's land-cover pipeline for the real mask - but not for starting. Build against a
hand-made mock GeoJSON with two fake polygons and tell Joel what schema you assumed.

A crop-burning fire is still shown, tagged differently. Never filtered out.
BODY

issue "[task] AI4Bharat Indic-TTS integration" "task,logic" <<'BODY'
**Owner:** Jammy
**Area:** logic/

## What to build
Implement `synthesizeSpeech(text, langCode)`. Self-hosted, Hindi and Punjabi first.
Returns `ArrayBuffer` - fetch-only, no Node `Buffer` or `fs`, so it still runs on
Workers.

## How we will know it works
A test asserting a known Hindi string returns non-empty audio bytes of a plausible
length.

## Blocked by
Nothing. Agree the contract with Rahul before he wires the play button.
BODY

issue "[task] Map view with live hotspot markers" "task,frontend" <<'BODY'
**Owner:** Rahul
**Area:** frontend/

## What to build
Fill in `MapView`. MapLibre GL is installed and **pinned to v6**, because v5 carries
a critical XSS advisory (GHSA-jrc7-96c5-q579) - build against the v6 API, not v5
examples you find online.

One marker per hotspot, fit bounds to the selected region. Single marker style until
Jammy's classification lands; keep the `// TODO: color by classification` note.

## How we will know it works
Given 3 mock hotspots, the map renders 3 markers. Asserted in a test, not eyeballed.

## Blocked by
Nothing - use mock data.
BODY

issue "[task] Region selector" "task,frontend" <<'BODY'
**Owner:** Rahul
**Area:** frontend/

## What to build
Fill in `RegionSelector`. Toggle between the four regions; each change re-triggers
the whole fetch-and-render cycle. Mobile-first - the users are on phones.

## How we will know it works
A test asserting that selecting a different region calls the fetch callback once
with that region.

## Blocked by
Nothing.
BODY

issue "[task] Dispersion plume overlay" "task,frontend" <<'BODY'
**Owner:** Rahul
**Area:** frontend/

## What to build
Render each `Plume` as a cone on the map from `bearingDeg`, `distanceKm` and
`spreadDeg`.

## How we will know it works
Given a plume with a known bearing, the rendered cone points that way.

## Blocked by
Confirm the final `Plume` shape with Jammy before building - the current shape is a
placeholder he owns. Get his agreement written on the issue, not in passing.
BODY

issue "[task] Per-hotspot detail panel" "task,frontend" <<'BODY'
**Owner:** Rahul
**Area:** frontend/

## What to build
Fill in `HotspotDetailPanel`: classification, approximate FRP, rough
distance/direction to the nearest town, and one plain-language "what this means for
you" line. That same line is what gets passed to `TtsButton`.

## How we will know it works
Given a mock hotspot and classification, the panel renders the expected text.

The plain-language line has to read clearly to someone who is not a data scientist.
That is the actual bar here, not the markup.

## Blocked by
Nothing - use mock data.
BODY

issue "[task] TTS playback button" "task,frontend" <<'BODY'
**Owner:** Rahul
**Area:** frontend/

## What to build
Fill in `TtsButton`. Call `synthesizeSpeech`, feed the `ArrayBuffer` to an `<audio>`
element via a blob URL. Explicit loading / play / pause states.

## How we will know it works
A test with a stubbed `synthesizeSpeech` asserting the button moves through loading
into playing.

## Blocked by
Agree the contract with Jammy. Not blocked on his implementation - stub it.
BODY

issue "[task] Loading, empty and error states" "task,frontend" <<'BODY'
**Owner:** Rahul
**Area:** frontend/

## What to build
Nothing is pre-warmed - the whole pipeline runs when the page opens, so first load
has real latency. An honest loading state, not a blank screen. "No fires currently
detected in this region" is a normal state, not an error.

## How we will know it works
Tests for all three: pending, empty result, failed fetch.

## Blocked by
Nothing.
BODY

issue "[task] Integration: wire frontend to logic to the mask" "task,blocked" <<'BODY'
**Owner:** Joel
**Area:** repo config

## What to build
Wire Rahul's frontend to Jammy's modules to the live fetchers and the land-cover
mask. This is where contract mismatches actually surface.

## How we will know it works
Opening the app for one region renders real hotspots with real plumes and real
classifications, screenshotted into `docs/log/joel.md`.

## Blocked by
Most of the above. Check both their logs as you go rather than only at the end.
BODY

issue "[task] Deploy madhuca.uncoalesced.com" "task,blocked" <<'BODY'
**Owner:** Joel
**Area:** repo config

## What to build
Get it live on the resolved topology, well before the 30th - the live demo is a
required deliverable and demo-day surprises are the expensive kind.

## How we will know it works
The public URL loads and renders real hotspots from a machine that never ran the dev
server.

## Blocked by
5.1, and integration.
BODY

issue "[task] Pitch deck and demo video script" "task,docs" <<'BODY'
**Owner:** Joel
**Area:** docs

## What to build
Deck content and demo video script. Work in the FSI/Van Agni differentiation
(`docs/MASTER.md` section 2) explicitly - dispersion direction, the crop-burning vs
wildfire distinction, and an accessible Indic-language UI - so judges do not read
this as a clone of an existing government system.

Label the dispersion model as "HYSPLIT-inspired simplified dispersion" in the deck.
Claiming real HYSPLIT would be a false claim about what the system does.

## How we will know it works
Deck and script exist, and a dry run of the demo fits the time limit.

## Blocked by
Something real to show.
BODY

echo
echo "Done. Deliberately NOT filed as a public issue:"
echo "  - the junk commit on the remote (03462da). Handle that directly."
