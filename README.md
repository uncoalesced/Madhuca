![Madhuca: autonomous stubble & biomass fire early-warning radar](assets/banner/madhuca-banner.png)

# Madhuca

**A free, open-source fire and smoke radar for India. Open the page, see where the fires are, and which way their smoke is heading.**

Live at **[madhuca.uncoalesced.com](https://madhuca.uncoalesced.com)** · MIT licensed · Built for Google's *Build with AI: Code for Communities* hackathon (Track 2, Clean Air & Climate Resilience)

---

## What it does

You open Madhuca and pick a view of the country: North, South, West or East India, or all of it. At that moment the app goes and gets the latest satellite fire detections from NASA, looks up the current wind at each fire, and puts the result on a map of India drawn with its official boundary.

For every fire it shows you:

- **Where it is**, and about how far it is from the nearest town.
- **Which way the smoke is going.** A compass badge points downwind, and the map draws a dotted smoke plume from the fire showing its direction, rough reach and spread.
- **What kind of fire it probably is.** Each detection is tagged *likely crop-residue burning* or *likely wildfire*, with a plain-language reason.
- **How strong it is**, on a simple low, moderate and high scale.
- **A short alert in Hindi, Kannada, Telugu or English**, which can be read aloud, written for someone who is not a specialist.
- **A rough "possible spread" estimate** for the next three hours, clearly labelled as a rule of thumb.

Two optional map layers sit behind toggles: a farmland layer (where the land is cropland) and an experimental 14-day fire-risk layer.

Madhuca is deliberately *on demand*. Nothing runs in the background, nothing watches the sky 24/7, and nothing sends alerts to officials. It does its work when someone opens it.

## Why we made it

The project started with a real fire. A friend of ours had property in Telangana damaged by a forest fire that started in broad daylight. Nobody had any warning. A fire like that is visible from space within hours, but that information never reaches the person standing downwind of it.

The gap is not a lack of satellites. India already has a national forest-fire alert system, Van Agni, run by the Forest Survey of India. It is good at what it does, but it covers forest fires only. It does not tell crop burning apart from wildfire, it does not estimate where the smoke is going, and it has no public map in Indic languages. Those three things are exactly what a farmer, a hiker or a family in a smoky town actually needs to know, so those are what Madhuca is built around.

Every autumn, stubble burning across North India sends smoke over cities hundreds of kilometres away. Knowing *where the fires are* is only half of it. Knowing *who is downwind* is the other half.

## Who it is for

- **Farmers and rural residents**, who want to know about a fire near their land or village before they can see or smell it.
- **Hikers, trekkers and forest-edge communities**, who are the people a wildfire reaches first.
- **Anyone in a smoke-affected town or city**, who wants to know whether the smoke they are breathing has a source, and where it is.
- **Developers, researchers and civic groups**, who can read, fork and adapt the whole thing.

It is built mobile-first for the phones these people actually carry, including low-end Android devices. No machine-learning model runs on the phone, and the page does as little work as it can.

## What using it is like

1. Open the site. A short human check (Cloudflare Turnstile) keeps bots from draining the free data quota.
2. Pick North, South, West, East or All India.
3. The radar scans. Fires appear as markers on the map.
4. Tap a fire. The panel shows the smoke compass, the fire's type and intensity, the nearest town, and the alert in your language. Tap the speaker button and it reads the alert aloud.
5. Close the tab and it stops. There is nothing to install, no account to make and nothing to keep running.

If the data source is down, the key is missing or the request times out, Madhuca says so. It never shows "no fires detected" unless NASA actually answered with zero fires. A scan that failed is an error, not an all-clear. This is the single most important rule in the project.

## How it works

```
Visitor opens the site
        |
        v
Cloudflare Worker   GET /api/radar?region=north|south|west|east|india
  1. NASA FIRMS      active fire detections (VIIRS and MODIS) in the region's box
  2. State grid      keep only fires inside India and the chosen zone
  3. Open-Meteo      wind at each fire, batched into half-degree cells
  4. Dispersion      smoke bearing, reach and spread from wind and fire power
  5. Classification  land cover + season + state + fire power -> crop burning or wildfire
        |
        v
Browser (React + MapLibre GL)
  markers, fire footprint, smoke plume, detail panel, compass badge,
  alert text and voice in four languages
```

The heavy geographic work happens **once, offline**, and ships as small static files: India's state and country boundaries, a grid saying which state every point is in (about 110 m resolution), and a national land-cover grid from ESA WorldCover (about 550 m resolution, roughly one satellite pixel). Looking a fire up in either grid is a single array read. The live request only fetches data and does cheap arithmetic.

## Why it does not need to be scaled

Most apps with a map and live data end up needing a database, a job queue, a cache layer and someone on call. Madhuca was designed to need none of that, and the reasons are structural rather than lucky:

- **No database and no accounts.** There is no user state to store, sync or protect.
- **No background jobs.** Nothing polls, nothing is scheduled. Work happens only when a visitor opens the site, so idle cost is zero.
- **The heavy work is precomputed.** Boundaries, land cover and the risk grid are built offline and served as static files, the cheapest thing a web host can serve.
- **The per-request work is tiny.** The Worker fetches two public data sources and does arithmetic. Everything a region needs has to fit Cloudflare's free-tier budget of 10 ms of CPU per request, and a benchmark of 3,000 fires across all of India measured about 4 ms.
- **No model runs at request time.** The one machine-learning model is trained offline and published as a static grid.
- **Stateless by design.** Each request is independent, so Cloudflare's edge can run as many in parallel as visitors need.

The whole site runs on Cloudflare's free tier. That is also an honest limit: the free tier allows 100,000 requests a day, NASA's key allows 5,000 transactions per 10 minutes, and the API is rate-limited to 20 requests per minute per visitor. "No scaling needed" means there is nothing for us to provision or babysit. It does not mean unlimited traffic.

In the hosted edition at madhuca.uncoalesced.com, fetching fire and wind data and computing the smoke and classification happens in the Worker on Cloudflare's network, not on your device. What runs on your device is the map, the panel and the voice. The FIRMS key has to stay on the server, because anything shipped to the browser is public.

**The local edition.** We have also built a fully local edition of Madhuca. It fetches the code and the algorithms from our Cloudflare domain, and then everything runs on your own device, so there is no per-visitor computation on a server at all, and nothing to scale by design. It is a working prototype, currently in internal testing, and it is not in this repository yet. The hosted edition described above is what is live and open in this repository today.

## The machine learning, and what is not machine learning

We would rather be exact about this than impressive. Madhuca uses **one** machine-learning model today. The rest is transparent rules and simple physics-style formulas, which is a deliberate choice for a safety tool: you can read them, test them and argue with them.

**1. Fire-risk forecast (machine learning, offline).** A logistic regression model (scikit-learn) estimates, for every 0.1 degree cell (about 11 km), the probability of at least one satellite fire detection in the next 14 days. It learns from past NASA VIIRS detections and land cover, using a handful of features:

- how often that cell had fires in the same season in past years
- its overall fire history, and its detections in the last 30 days
- detections in the eight neighbouring cells in the last 30 days
- the share of the cell that is forest and the share that is cropland
- time of year

It is trained on 2020 to 2023 and scored on 2024 to mid-2026, a period it never saw. It is printed next to two simple baselines (season history alone, and last 30 days alone), so the model only gets credit for what it adds over simple rules. Known industrial heat sources such as steel works and power plants are filtered out so factories are not ranked as fire risks. Training is offline only and is never run on a schedule or per request.

It is an **experimental statistical estimate**, not a validated fire-danger index, and **a low value is never an all-clear**. In the hosted edition it is published for Telangana and Andhra Pradesh only, off by default behind a toggle. The local edition extends the same model to North, South, East, West and All India. That is a working prototype, currently in internal testing, and it is not in this repository yet.

**2. Crop burning versus wildfire (rules, not machine learning).** The classifier reads the land cover under the fire, the month, the state and the fire's radiative power:

- Forest land cover: likely wildfire.
- Cropland with very high power (over 150 MW): likely wildfire, because that is more intense than residue burning.
- Other cropland: likely crop burning, with the reason tied to the stubble season (October to November for paddy, April to May for wheat).
- Anything else (grassland, scrub, built-up, unmapped): likely wildfire by default. It is only called crop burning in a stubble-belt state (Punjab, Haryana, Delhi, Uttar Pradesh, Bihar) in October to November with moderate power.

When the evidence is ambiguous it leans toward "wildfire", because grassland and scrub fires are the ones people are least prepared for, and the fire that inspired this project was one of them. A fire tagged as crop burning is still shown. It is tagged, never hidden.

A *learned* version of this classifier is planned but not built, because the honest blocker is labels: there is no ground truth for "this detection was a wildfire". Training a model on the current rules' own output would only teach it to copy them.

**3. Smoke dispersion (simplified approximation).** Direction is straight downwind. Reach grows with wind speed and with the square root of fire power, capped at 80 km, and the spread cone narrows as wind strengthens. In calm or missing wind, smoke is shown pooling close to the fire instead of pointing anywhere. This is a **simplified Gaussian-puff-style approximation, not NOAA HYSPLIT**. It says which way smoke travels and roughly how far. It does not forecast how much smoke you will breathe.

**4. Possible spread (rule of thumb).** Ten percent of wind speed over three hours (Cruz & Alexander, 2019), labelled as exactly that. It is not a fire-spread model.

## Open source, all the way down

The Madhuca code is **100% open source under the [MIT License](LICENSE)**: the frontend, the Worker, the science and logic core, the offline pipeline, the machine-learning scripts, the CI workflows and the documentation. Nothing in this repository is hidden, proprietary or held back. You can read exactly how a fire becomes a tag and a plume, run it yourself, fork it for another country, or change how it behaves.

The data files under `frontend/public/` are derived from public datasets and keep their sources' terms, listed at the end of [`LICENSE`](LICENSE).

The honest caveat is that *running* the public site means talking to services that are not all open source. We do not hide that. Every one of them is listed in [Built on](#built-on), marked when it is closed, and replacing them with open alternatives is one of the most useful things a contributor can do (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

## What it could become

These are directions, not promises. Some are noted in our decision record as open questions, and none of them is committed.

- **Opt-in alerts.** A way for a person to subscribe themselves to alerts for their own area. Automated calls to officials were ruled out (legal paperwork and a change in direction toward self-serve), so this would be something a user sets up for themselves.
- **A learned crop-burning classifier**, if we can get trustworthy labels, evaluated against the current rules and shipped only if it beats them.
- **A real fire-spread model**, replacing the three-hour rule of thumb.
- **More languages and more voices**, including a native Kannada voice and alerts beyond the current four languages.
- **Village names and boundaries** on the map, as a labelling improvement.
- **Other regions and countries.** NASA FIRMS covers the whole world. The India-specific parts are the boundaries, the state grid, the land-cover grid and the stubble-season rules, and all of them are replaceable data.

## What Madhuca is not

Madhuca is an information tool built on satellite data, not an emergency service. Satellites can miss small, short-lived or cloud-covered fires, and detections arrive with a delay. The smoke estimate is an approximation. If you are in danger, call **112**.

Other known limits:

- Land cover is resolved at about 550 m. Grassland, scrub and mangrove are grouped as "other".
- On a phone with no built-in voice for your language, the first alert read aloud downloads about 80 MB. Kannada is read by the Telugu voice and has a Telugu accent.
- Alerts exist in four languages, and fires in other states default to English.

## The team

Madhuca was built by three people who have known each other since school.

- **Joel** (engineering handle **uncoalesced**, [github.com/uncoalesced](https://github.com/uncoalesced)): architecture, the offline data pipeline, the live data fetchers, the frontend and final design, integration and deployment.
- **Aaron** ([github.com/jammy-007](https://github.com/jammy-007)): the science and logic core (dispersion, classification, the text-to-speech layer), the Cloudflare Worker behind `/api/radar`, and the machine-learning fire-risk model.
- **Rahul** ([github.com/ZapCannonYT](https://github.com/ZapCannonYT)): the first version of the frontend components, phone QA across regions and states, and the pitch.

A more detailed account of who built what is in [`DOCUMENTATION.md`](DOCUMENTATION.md).

## Contributing

Contributions are welcome, from a typo fix to a new language. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), which covers how to run the project, how to check your work, and what we will and will not merge. When you open a pull request, the [pull request template](.github/pull_request_template.md) lists exactly what we need to see. Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

To run Madhuca on your own machine, see [Development setup](CONTRIBUTING.md#development-setup).

For the decisions behind the project, read [`docs/MASTER.md`](docs/MASTER.md). For a plain-language overview, read [`DOCUMENTATION.md`](DOCUMENTATION.md).

---

## Built on

Everything the app or its build talks to is listed here, with closed-source parts marked. The codebase is open source. Its dependencies do not all have to be, as long as we disclose them.

### Frontend (runs in the visitor's browser)

| Component | Used for | Open source? |
|---|---|---|
| [React](https://react.dev/) + [Vite](https://vite.dev/) | The app and its build | Yes |
| [MapLibre GL](https://maplibre.org/) (`^6.10.0`, because v5 carries a critical XSS advisory) | The map. No API key required | Yes |
| [CARTO Positron](https://carto.com/basemaps) basemap style and tiles, with OpenStreetMap data, loaded from `basemaps.cartocdn.com` and credited in the map's attribution control | The basemap. Its own country and state lines are hidden and replaced with ours | Tile service is **closed source**; OpenStreetMap data is ODbL |
| [Google Fonts](https://fonts.google.com/): IBM Plex Sans and JetBrains Mono, loaded from `fonts.googleapis.com` and `fonts.gstatic.com` | Typography | Fonts are SIL OFL; the Google Fonts service is **closed source** and sees each visitor's request |
| [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/), loaded from `challenges.cloudflare.com` | The human check in front of `/api/radar` | **Closed source** |
| Browser speech synthesis ([Web Speech API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)) | First choice for reading alerts aloud, using the phone's own voice for the language | The voices come from the phone's OS (Google, Apple, Samsung, Microsoft) and are usually **closed source** |
| [Piper](https://github.com/rhasspy/piper) voices ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) on Hugging Face), run with [onnxruntime-web](https://onnxruntime.ai/) (from cdnjs) and the espeak-ng based [piper-phonemize](https://github.com/rhasspy/piper-phonemize) WASM (from jsDelivr) | The voice when the phone has none: Hindi and Telugu, with Kannada read by the Telugu voice. Downloaded once, the first time it is needed | Yes |

### Server (Cloudflare Worker, `worker/`)

| Component | Used for | Open source? |
|---|---|---|
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) free tier, with its static assets and Rate Limiting binding | Hosting the site and `/api/radar` | The platform is **closed source**; [Wrangler](https://github.com/cloudflare/workers-sdk), the dev and deploy CLI, is open source |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) | Active fire hotspots (VIIRS and MODIS). Free `MAP_KEY`, kept as a Worker secret | Open NASA data |
| [Open-Meteo](https://open-meteo.com/en/docs/gfs-api) | Wind (GFS), 100 locations per request. No key | Open |
| Cloudflare Turnstile siteverify (`challenges.cloudflare.com`) | Checking the human-check token | **Closed source** |

### Data baked into the build

| Data | Used for | Terms |
|---|---|---|
| [ESA WorldCover](https://esa-worldcover.org/en/data-access), 10 m land cover | A national cropland and forest grid, and a farmland image | CC-BY 4.0 |
| [DataMeet](https://github.com/datameet/maps) States/Admin2 (Survey of India outline) | State lines and the state grid, which drops fires outside India and outside the chosen zone | Attribution required |
| [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-0 (India point of view) and populated places | Country borders and the town list | Public domain |

### Offline only (never on the request path)

| Component | Used for | Open source? |
|---|---|---|
| [GitHub Actions](https://docs.github.com/actions) | CI and the manual `landcover` and `ml-risk` workflows | **Closed source** |
| [rasterio](https://rasterio.readthedocs.io/) (GDAL) | Reading ESA WorldCover into the national land-cover grid | Yes |
| Python with [NumPy](https://numpy.org/) and [scikit-learn](https://scikit-learn.org/) | Training the experimental fire-risk grid from the FIRMS VIIRS archive | Yes |

## Attribution

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (CC-BY 4.0).
Fire data from NASA FIRMS. Wind data from Open-Meteo. Map data © OpenStreetMap contributors, basemap by CARTO. Boundaries: DataMeet (Survey of India outline) and Natural Earth. Voices from the Piper project.

These attributions are licence conditions. Please do not remove them while restyling.

## License

The code is under the [MIT License](LICENSE). The data files under `frontend/public/` keep their sources' terms, listed at the end of `LICENSE`.
