# Contributing to Madhuca

Thank you for wanting to help. Madhuca is a free, open-source fire and smoke radar for India, and it gets better when people who know things we do not (a language, a region, a dataset, a phone we have never tested on) take part.

This guide covers what to read first, how to run the project, what a good contribution looks like, and the few rules we hold firmly. Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Before you start](#before-you-start)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Making a change](#making-a-change)
- [The rules that matter most](#the-rules-that-matter-most)
- [Changing a shared type](#changing-a-shared-type)
- [Working on the machine learning or the data pipeline](#working-on-the-machine-learning-or-the-data-pipeline)
- [Reporting bugs](#reporting-bugs)
- [Reporting a security problem](#reporting-a-security-problem)
- [Using AI tools](#using-ai-tools)
- [Licensing](#licensing)
- [Getting in touch](#getting-in-touch)

## Ways to contribute

You do not have to write code.

- **Test on a real phone.** Madhuca is built for low-end Android devices. Telling us what breaks on your device, with a screenshot, is valuable.
- **Fix or add a language.** Alerts exist in Hindi, Kannada, Telugu and English. Native speakers who can check wording, compass directions and tone are especially welcome, as are new languages and voices.
- **Check the science.** If you work in remote sensing, fire ecology, atmospheric science or agronomy and something in the classifier, the dispersion approximation or the risk model looks wrong, tell us. That is a real contribution.
- **Replace a closed-source dependency.** The [README](README.md#built-on) lists every service we rely on and marks the closed ones (the basemap tiles, Google Fonts, Cloudflare Turnstile). Self-hosting the fonts or moving to open tiles would be a welcome change. Open an issue first so we can agree on the approach.
- **Improve the documentation.** If something confused you, it will confuse the next person.
- **Write code.** Bug fixes, tests, accessibility improvements, performance work on the frontend, and the directions in the README's "What it could become" section.

## Before you start

Please read these first. They are short, and they will save you from building something we have already decided against.

1. [`README.md`](README.md): what the app is and why it exists.
2. [`docs/MASTER.md`](docs/MASTER.md): the decision record. Several plausible ideas were deliberately dropped (for example SAM2 segmentation, running real HYSPLIT, and automated calls or SMS to officials), so please do not re-propose them without new information. Its section 5 lists open questions. Do not build against those without discussing them first.
3. [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md): the house rules, summarised below.

If you are about to do something large, open an issue and describe it first. A short conversation beats a rejected pull request.

## Development setup

You need **Node.js 24 or newer** (the tests run TypeScript directly through Node's built-in type stripping, so there is no transpile step and no test framework to install). Python 3 is only needed for the offline machine-learning and pipeline scripts.

```bash
git clone https://github.com/uncoalesced/Madhuca.git
cd Madhuca
npm install
```

### Try the interface without any keys

```bash
npm run dev
```

Open `http://localhost:5173/?demo`. Demo mode loads clearly labelled fake fires that still go through the real dispersion, land-cover and classification code. Every scan in demo mode says it is demo data, and production builds compile demo mode out so fake fires can never appear as real ones.

### Run against live data

Live scans go through the Cloudflare Worker, exactly as in production, so you need a free [NASA FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Request it early, because signup can take a little while. Open-Meteo and ESA WorldCover need no key.

1. Create `worker/.dev.vars` (it is gitignored) with:

   ```
   FIRMS_MAP_KEY=your-key
   TURNSTILE_SECRET=1x0000000000000000000000000000000AA
   ```

   The Turnstile value above is Cloudflare's published always-pass test secret, for local use only.

2. Build the frontend once (the Worker serves it), then start the Worker:

   ```bash
   VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
   npm run dev --workspace worker
   ```

   The matching always-pass test site key is `1x00000000000000000000AA`. On Windows PowerShell, set the variable first with `$env:VITE_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"`.

3. In a second terminal, run `npm run dev`. The frontend proxies `/api` to the Worker on port 8787.

**Never put a real key in a `VITE_` variable.** Vite ships every `VITE_` value to every visitor. The FIRMS key lives only in a Worker secret (`npx wrangler secret put FIRMS_MAP_KEY` when deploying) and in gitignored local files.

The root `.env.example` documents the one key the offline machine-learning scripts read (`FIRMS_MAP_KEY`).

## Project layout

| Path | What lives there |
|---|---|
| `frontend/` | Vite, React, TypeScript and MapLibre GL: the map, region tabs, detail panel, voice button |
| `logic/` | Framework-free TypeScript: data fetchers, dispersion, classification, grid lookups, text-to-speech wrapper |
| `worker/` | The Cloudflare Worker that serves the site and `GET /api/radar`, with rate limiting and the human check |
| `pipeline/` | Offline scripts that build India's boundaries, the state grid, the land-cover grid and the town list |
| `ml/` | The offline fire-risk model (Python, NumPy, scikit-learn) |
| `docs/` | Decision record, roadmap and coding standards |
| `.github/` | CI, issue forms, pull request template |

The split is by *where the work runs*, not by feature. That matters because of the one hard constraint in the project: the live request runs on Cloudflare's free tier, which allows **10 ms of CPU per request**. So `logic/` must stay free of Node-only APIs and runtime filesystem access (its `tsconfig.json` sets `"types": []` so a violation fails the typecheck), and the request path must not gain a date library, a CSV library, a GeoJSON library or a general-purpose geometry library. Heavy processing belongs in `pipeline/` or `ml/`, offline.

## Making a change

1. **Open or find an issue.** Use the issue forms: *Task* for work someone will build, *Bug* for something behaving wrongly, *Contract change* for a change to `logic/src/types.ts`. Fill in every required field. The most useful one is "how we will know it works": write the actual check and the command, not "it should work".
2. **Fork the repository and create a branch** off `main`. We use short prefixes: `feat/`, `fix/`, `docs/`, `chore/`.
3. **Make the change.** Keep it focused. A pull request that does one thing is reviewed faster than one that does five.
4. **Write a check that proves it works**, such as a test, or a script that runs your code on sample data and asserts something real. "Given 3 mock hotspots, the map renders 3 markers" is a real assertion. "It renders" is not.
5. **Actually run the checks:**

   ```bash
   npm run typecheck                    # tsc --noEmit across every workspace
   npm run build                        # typecheck + production build
   npm test --workspaces --if-present   # unit tests with Node's built-in runner
   ```

   Continuous integration runs exactly these commands on every pull request, plus a check that keeps emoji out of the code. CI is the backstop. The real check is you running them first.
6. **Open a pull request** and fill in the [pull request template](.github/pull_request_template.md) (GitHub loads it automatically). It asks you to paste the exact command you ran and its **real output**, copied from your terminal. Not "tests pass", and not the output you expect. A maintainer will review it, and it needs to pass CI and get a review before it merges.
7. **Respond to review.** Reviews are about the work, not the person. See the [Code of Conduct](CODE_OF_CONDUCT.md).

Madhuca was built quickly by three people, and we review on a best-effort basis. If a pull request has been quiet for a few days, a polite nudge is welcome.

## The rules that matter most

These protect people who may act on what the map shows. They are not negotiable, and a pull request that breaks one will not merge however good the rest of it is.

- **Never show a false all-clear.** "No fires detected" may appear only after NASA FIRMS actually returned zero rows. A missing key, a failed request, a timeout or a rate limit is an *error* and must be shown as one, with the words "This is not an all-clear" or equivalent.
- **Crop-burning fires are tagged, never hidden.** Every detected fire appears on the map. The classifier changes the label, never the visibility.
- **Ambiguity leans toward wildfire.** Grassland and scrub fires must not be presumed to be crop burning. A land-cover lookup that finds nothing is `other`, which is a valid value and not an error, and `other` is not evidence of crop burning.
- **Label approximations as approximations.** The smoke model is a *simplified Gaussian-puff-style approximation, not HYSPLIT*, and the spread estimate is a rule of thumb. Keep that wording everywhere it appears, including code comments and interface text. Claiming more than we measured is a correctness bug, not a wording preference.
- **Secrets never reach the browser.** Anything in a `VITE_` variable is public.
- **Keep the attributions.** ESA WorldCover (CC-BY 4.0) requires visible credit, and so do DataMeet and Natural Earth. The credits button over the map and the README attribution must survive any restyling.
- **India as it is.** The map shows India's official boundary, including Jammu and Kashmir and Ladakh with Gilgit-Baltistan and Aksai Chin. This is a settled project decision, so please do not reopen it in issues or pull requests.
- **No emoji in code**: not in source, interface strings, comments, tests, CSS or commit messages. They render inconsistently on low-end Android phones, and screen readers read them out as noise. CI fails on them. Use a plain text label or an inline SVG icon.
- **Write honest documentation.** Do not write "fully working", "no defects" or "100%" unless a check proves exactly that, and say what a test does *not* cover (for example, "unit tests only, not run in a browser"). If work is partial, say which part and why. An honest partial beats a false "done".
- **No new dependencies and no speculative abstractions** unless you can say why nothing already installed does the job. The pull request template has a place to name one.

## Changing a shared type

`logic/src/types.ts` is the contract between the frontend, the logic core and the Worker. Changing a shape there breaks everyone building against it, so edits follow a fixed order:

1. Open a **Contract change** issue, pasting the current shape and the proposed shape.
2. Search for the type (`grep -rn "<TypeName>" frontend/src logic/src worker/src`) and tag whoever's code appears.
3. Wait for them to agree.
4. Only then change the type, label the pull request `contract`, link the issue, and fix every broken caller in the same pull request.

A workflow called `contract-guard` fails any pull request that edits `logic/src/types.ts` without the `contract` label and a linked issue. Please do not work around it.

## Working on the machine learning or the data pipeline

Both run **offline only**, never on the request path and never on a schedule.

```bash
# Fire-risk model (ml/)
pip install -r ml/requirements.txt
node ml/export_cells.ts south                                        # box, India mask, land-cover shares per cell
FIRMS_MAP_KEY=... python ml/fetch_firms.py south 2019-01-01 2026-09-28
python ml/train_risk.py south 2026-09-29                             # metrics, then ml/out/south.json
```

The manual `ml-risk` and `landcover` GitHub Actions workflows do the same in CI, and can publish their output to `frontend/public/` when run with `publish=true`. Read [`ml/README.md`](ml/README.md) and [`pipeline/README.md`](pipeline/README.md) before changing either, because both document the exact data formats and what each value means.

If you improve or add a model, hold out a later period, report it **next to simple baselines**, and describe it as an experimental statistical estimate. A model is only credited with what it adds over simple rules, and a low risk value must never read as "safe".

## Reporting bugs

Open a **Bug** issue and include what you did, what you expected, what happened, the region and fire you were looking at, and your device and browser. A screenshot helps a great deal. Please check first that it is not one of the known limits listed in the README.

## Reporting a security problem

Please do **not** open a public issue for a security problem, for example a leaked key, a way around the rate limit or human check, or anything that could expose the FIRMS key. Email **mail@uncoalesced.com** with the details and we will respond as soon as we can. Please give us a reasonable chance to fix it before you disclose it publicly.

## Using AI tools

AI-assisted contributions are welcome. Parts of Madhuca were built that way, and the repository includes shared agent guidance in [`AGENTS.md`](AGENTS.md). The rule is the same as for any code: you are responsible for what you submit. Read it, run it, and paste the *real* output of the checks in your pull request. A tool saying a task is finished is not proof that it is.

## Licensing

Madhuca's code is released under the [MIT License](LICENSE). By opening a pull request you agree that your contribution may be distributed under that license. The data files under `frontend/public/` are derived from public datasets and keep their sources' terms, listed at the end of `LICENSE`. If you add a dataset, add its terms there too.

## Getting in touch

- **Questions, ideas and bugs:** open an issue.
- **Security problems, Code of Conduct reports, or anything private:** **mail@uncoalesced.com**

Thank you for helping make a fire warning something a person can actually use.
