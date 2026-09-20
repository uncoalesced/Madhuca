# Joel — Work Brief

Read `docs/MASTER.md` for full context — you wrote most of it, but keep it current as the source of truth. Read `delegation/rahul.md` and `delegation/jammy.md` for what they're building and what contracts (data shapes, file formats) they're expecting from you. **Do not edit `rahul.md` or `jammy.md` — read-only for context.** Edit only this file and `docs/log/joel.md`.

## Your area: architecture, data pipeline, integration, deployment, docs/pitch

You're the one holding the whole shape of the system, so your slice is less "one feature" and more "make sure the other two people's pieces actually fit together and the thing is live before the 30th."

## Tasks

- [ ] **Offline land-cover pipeline (GitHub Actions)** — a workflow that pulls ESA WorldCover tiles (`aws s3 sync s3://esa-worldcover/v200/2021/map ... --no-sign-request`) for Punjab, Bihar, Delhi, Telangana, clips to state boundaries, reduces to a cropland/forest/other GeoJSON mask, and publishes it as a static file the live app (and Jammy's classification module) reads. This is the one piece of real Python/GIS processing in the whole project — keep it entirely offline/CI-side, never in the live request path.
- [ ] **Live data fetchers** — FIRMS hotspot fetcher (needs a free `MAP_KEY`, request one early — it's the one external dependency with any signup lag) and Open-Meteo wind fetcher. These are the two calls that fire when someone opens the site.
- [ ] **Resolve the deployment topology** (`docs/MASTER.md` §5.1) — Cloudflare Workers free tier vs. Workers Paid ($5/mo, 30s CPU) vs. Cloudflare Tunnel to a real server. This blocks nothing else right now (Rahul and Jammy are both building deploy-target-agnostic code deliberately), but it needs to land before final integration/deploy work starts, ideally in the next day or two given the runway.
- [ ] **Integration** — wire Rahul's frontend to Jammy's dispersion/classification/TTS modules to your own live fetchers and the offline land-cover mask. This is where contract mismatches between the two of them will actually surface — check both their logs regularly rather than only at the end.
- [ ] **Deploy** — get madhuca.uncoalesced.com live, pointed at whatever the resolved topology is, well before the 30th so there's real buffer for the live/online demo requirement.
- [ ] **Keep `docs/MASTER.md` current** — any decision that changes the shape of the product (not routine task completion — that's `docs/log/joel.md`) gets a dated one-liner in MASTER's decision log.
- [ ] **Pitch assets** — deck content and demo video script, once there's something real to show. Worth explicitly working in the FSI/Van Agni differentiation angle (`docs/MASTER.md` §2) so judges immediately understand why this isn't a duplicate of an existing government system.

## Definition of done (per task)

Same bar as Rahul and Jammy, even though you're not on Antigravity: no task counts as done without something that actually proves it works (a script run, a test, a real screenshot of the live pipeline output) logged in `docs/log/joel.md` — not just a checked box.

## Notes to self

- The FIRMS `MAP_KEY` signup and the Cloudflare deployment-plan decision are the two things most likely to quietly eat a day if left until late — worth doing first, even before the pipeline code.
- Carbon-emissions / wildlife-impact metrics are explicitly backlog (`docs/MASTER.md` §5.4) — don't let them creep into anyone's task list until the core loop (hotspot → dispersion → classification → map) is solid and demoable.
