# Roadmap to submission (26 to 30 Sept 2026)

Hard deadline: **30 Sept**. Target a live, working madhuca.uncoalesced.com on the 29th,
so the 30th is buffer, not build time.

Joel owns the frontend, integration and deploy. Jammy owns the server path (the
Worker that runs the pipeline). Rahul owns QA and pitch support, and does not commit
to `frontend/src` or `logic/src`.

Every item follows `AGENTS.md` "Finishing a piece of work" and
`docs/CODING_STANDARDS.md`. Nothing is done without a logged, re-runnable check.

## Where things stand (26 Sept)

Done and verified:
- land-cover pipeline and masks
- FIRMS and wind fetchers
- dispersion
- classification
- TTS wrapper
- the deployment decision (Workers free tier)

The frontend was reworked on 26 Sept (`docs/log/joel.md`). These now work in the browser:
- The basemap and markers render. Before this, the MapLibre CSS was missing and Vite pre-bundling broke the map worker (404).
- The layout fits the screen, and the ESA attribution footer is visible.
- A missing FIRMS key shows an **error**, never "Clean Skies".
- `npm run dev` with `?demo` loads labelled fake hotspots for testing.
- The detail panel shows "About N km <direction> of <town>", and the React hook-order bug is fixed.
- Wind is fetched in parallel and deduped per 0.25 degree cell.
- The code has zero emoji, and the CI `No emoji` step enforces it.

Still open:
- TTS playback has not been tested against the live endpoint.
- The compass word is English inside Hindi/Punjabi/Telugu alert text.
- The favicon returns 404, and one failed name lookup in the console is unexplained.
- No tests yet for no-key → error, 3 hotspots → 3 markers, or panel close/reopen.
- There is no Worker yet. The FIRMS key exists but only in local gitignored env files.

**Key handling:** the FIRMS key goes in a Worker secret, never in a `VITE_` variable,
because Vite ships those to every visitor. The Worker runs the pipeline and the
frontend calls it.

## Joel: frontend, integration, deploy

| When | Task | Check |
|---|---|---|
| 26 Sept | ~~Get the FIRMS MAP_KEY~~ **done** (local only, gitignored) | Live run: 33 Punjab hotspots |
| 26 Sept | ~~Drop hotspots outside India (the Punjab box reached into Pakistan, Bihar into Nepal)~~ **done** | `npm test`: Amritsar kept, Lahore and Birgunj dropped; live Punjab 33 to 16 |
| 26 Sept | ~~Frontend rework: honest error state, map, layout, hook order, nearest town, emoji, `?demo`~~ **done** | `docs/log/joel.md` 2026-09-26 |
| 27 Sept | Frontend leftovers: localized compass words, favicon, the missing tests above | `npm test` covers each one |
| 28 Sept | Wire the frontend to Jammy's `/api/radar` | Browser run: markers appear for a region with live fires |
| 29 Sept | Deploy Pages + Worker to madhuca.uncoalesced.com | Live URL loads all 4 regions on a phone |
| 30 Sept | Final pitch review, then submit | Submitted |

## Jammy: server path

| When | Task | Check |
|---|---|---|
| 26 to 27 Sept | Worker entry `GET /api/radar?region=`: FIRMS key from `env`, then hotspots, wind, dispersion, classify; returns `{hotspots, plumes, classifications}` | `wrangler dev` + curl returns JSON for each region |
| 27 Sept | Move the parallel, deduped wind fetch from `frontend/src/App.ts` into the Worker | Test: N hotspots in one cell make 1 wind call |
| 27 Sept | Worker reads land-cover masks from static assets | Test: classify a known cropland point in Punjab |
| 28 Sept | Measure CPU against the 10ms free-tier budget with the Bihar/Telangana masks (5 to 6 MB) | Logged CPU time per region. If over budget, say so on the 28th |
| 28 Sept | Check the default Indic-TTS endpoint actually answers. If not, fall back to text-only and label it | Logged live call result |
| 29 Sept | Support the deploy: Worker secrets, routes | Live `/api/radar` answers |

## Rahul: QA and pitch support

| When | Task | Check |
|---|---|---|
| 27 Sept | Write a phone QA checklist (4 regions x loading / error / demo / detail panel / TTS) | Checklist in `docs/log/rahul.md` |
| 28 to 29 Sept | Run the checklist on 2 real phones against local (`?demo`) and then live builds. File each failure as a Bug issue | Issues filed with screenshots |
| 28 Sept | Draft pitch deck content and a demo video script (text) for Joel to review. Keep the "simplified Gaussian-puff, not HYSPLIT" wording | Draft in `docs/log/rahul.md` |
| 29 Sept | README stack-disclosure accuracy pass | Diff reviewed by Joel |

## Gates before deploy (29 Sept)

```bash
npm run typecheck
npm run build
npm test --workspaces --if-present
```

Plus: the CI `No emoji` step passes, and a browser run of all 4 regions shows real
FIRMS requests in the network log.
