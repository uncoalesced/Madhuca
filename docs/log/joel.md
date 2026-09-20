# Joel — Work Log

Log finished, *tested* work here, newest entry on top. Format: date (IST), what was built, how it was verified.

---

## 2026-09-21 — Repo bootstrap: skeleton, templates, CI, coordination workflows

Scaffolded the repo from nothing per `HANDOFF.md`. Everything below is structure and
tooling — no feature logic was written, so there is nothing here to unit-test yet.

**Restructured the docs.** `docs/`, `docs/log/` and `delegation/` did not exist; the
eight markdown files were sitting flat at the root with mangled names (`joel_1.md`
was this file). Moved them into the layout `docs/MASTER.md` §6 already describes.
Contents untouched — verified byte-identical against the copies in the Heafod vault
before moving.

**`/frontend`** — Vite + React + TypeScript + MapLibre GL. Component stubs named to
match `delegation/rahul.md`: `MapView`, `RegionSelector`, `HotspotDetailPanel`,
`TtsButton`. ESA WorldCover attribution is in the footer from day one, since CC-BY
4.0 requires it and it is the kind of thing that gets deleted during a restyle.

**`/logic`** — typed signatures with `// TODO` bodies for `fetchHotspots`,
`fetchWind`, `computeDispersion`, `classifyHotspot`, `synthesizeSpeech`, plus the
shared contract types. `logic/tsconfig.json` sets `"types": []` deliberately: it
makes a Node-only API fail `typecheck` rather than fail on deploy day, which keeps
§5.1 a deployment choice instead of a rewrite.

`Plume` is shaped as `{ bearingDeg, distanceKm, spreadDeg }` — the minimum that
unblocks Rahul's overlay renderer. **Jammy owns finalising it** (`delegation/jammy.md`
task 1); the doc comment says so.

**`/pipeline`** — `landcover.sh` with the real `aws s3 sync` line and a TODO for the
clip-and-export, plus a `workflow_dispatch` stub. CI-side only.

**Root** — `README.md`, `.env.example` (`FIRMS_MAP_KEY`), `.gitignore`, and npm
workspaces tying `frontend` and `logic` together.

**`AGENTS.md`**, imported by a one-line `CLAUDE.md` so the two cannot drift. Covers
the contract discipline, which §5 questions are unanswered and must not be built
against, and the domain rules that are easy to get wrong. Second half is a literal
ordered Working Procedure — written as steps rather than principles because
Antigravity needs it that way.

**Issue and PR templates.** Task / Bug / Contract change forms, blank issues
disabled. The PR template demands the command *and its pasted real output*, not a
claim that tests pass.

**Workflows.** `ci.yml` (typecheck, build, `test --if-present` on every PR and push
to main), `contract-guard.yml` (fails a PR editing `logic/src/types.ts` without the
`contract` label and a linked issue), `labeler.yml`, `stale.yml` (nudges at 3 days,
never closes). No deploy workflow — §5.1 is still open and building one would settle
that decision by accident.

### How it was verified

```bash
npm ci                              # clean, 0 vulnerabilities
npm run typecheck                   # tsc --noEmit, both workspaces, passes
npm run build                       # produces frontend/dist
npm test --workspaces --if-present  # exits 0 as a no-op, as intended
```

Workflow and template YAML was parsed, every issue-form field checked against
GitHub's allowed keys per block type, and the inline `github-script` body checked
with `node --check`.

### Things found along the way

- **maplibre-gl v5 carries a critical XSS advisory** (GHSA-jrc7-96c5-q579). Pinned
  `^6.10.0` instead; `npm audit` reports 0. Rahul should build against the v6 API.
- The issue-form field check caught a real error before it shipped: a `validations`
  block on a `checkboxes` field, which GitHub rejects at template-load time.
- `.gitattributes` pins `*.sh` to LF. This repo is developed on Windows with
  `core.autocrlf=true`, and `pipeline/landcover.sh` runs on Linux in CI, where a
  CRLF shebang fails as "bad interpreter".

### Still open / not done

- **Branch protection is not set** — it is a repo setting, not an Action, and needs
  admin access on github.com/uncoalesced/Madhuca. Exact ruleset steps are in
  `AGENTS.md` → "Branch protection". Until that is done the workflows report but
  nothing blocks a red merge.
- **`FIRMS_MAP_KEY` has not been requested.** Still the one external dependency with
  signup lag. `.env.example` has the slot; the key does not exist yet.
- **§5.1 (deployment target) and §5.2 (what the dispatch layer is) are untouched.**
  Built for Workers Paid as `HANDOFF.md` says to default, and scaffolded nothing for
  the dispatch layer.
- Unrelated: the Heafod vault repo has a **GitHub PAT in plaintext** in its
  `.git/config` remote URL. Not this repo, not touched — worth rotating.

---

*(empty — log your first completed task above this line)*
