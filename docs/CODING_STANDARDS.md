# Coding standards

House rules for everyone working in this repo, human or agent. These sit on top of
`AGENTS.md`; where they overlap, both apply.

## 1. No emoji in code

Zero emoji anywhere in the repo's code: source, UI strings, comments, tests, CSS,
and commit messages. Use a plain text label, or an inline SVG icon if a symbol is
genuinely needed. Status meaning (loading, error, wildfire, crop-burning) belongs in
a CSS class and the wording, not in a pictograph.

Why: emoji render differently (or not at all) across the low-end Android phones our
users carry, screen readers read them out as noise ("fire, fire, fire"), and they
make UI copy look unfinished in the demo.

Enforced by the `No emoji` step in `.github/workflows/ci.yml`, which fails on any
`Extended_Pictographic` character under `frontend/src`, `frontend/test`, `logic/src`,
`logic/test` and `pipeline/`. Run it locally with the same command before pushing.

## 2. Documentation is accurate and honest

- A log entry pastes the **real** command output from a run you did. Never output you
  expect it to produce.
- Do not write "no defects", "fully working", or "100%" unless a check proves exactly
  that. A test proves only what it asserts, so say what it does **not** cover (e.g.
  "unit tests only; not run in a browser").
- Unfinished or partly working work stays unticked, with one line saying which part
  and why. An honest partial beats a false done.
- Approximations are labelled as approximations everywhere they appear: the
  dispersion model is a simplified Gaussian-puff, not HYSPLIT.
- Comments describe what the code does now, not what it will do once someone else
  finishes their part.

## 3. Never claim a safe state you did not measure

"No fires detected" may only be shown after a real FIRMS response returned zero rows.
A missing key, a failed fetch, or skipped data is an **error** state, shown as one.
This is a safety tool; a false all-clear is the worst bug it can have.

## 4. Already in `AGENTS.md`, restated because they get broken

- No new dependencies, no speculative abstraction, no config for constants.
- `logic/src/types.ts` changes go through a Contract change issue first.
- Secrets never reach the client bundle. Anything in a `VITE_` variable is public.
- Crop-burning fires are tagged, never hidden. ESA WorldCover attribution stays visible.
