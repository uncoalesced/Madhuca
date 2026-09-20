<!--
  Fill every section. Delete nothing.
  If a section does not apply, write "n/a" and one line saying why — do not remove the heading.
-->

## What changed

<!-- Plain description. One or two sentences. -->

Closes #

## Proof it works

<!--
  The Definition of Done. A PR without real proof here does not get merged,
  regardless of what any agent claims about the work being complete.

  Paste BOTH:
    1. The exact command, copy-pasteable, that anyone else can run.
    2. The real output from actually running it. Not a description of the output,
       not "tests pass" — the actual terminal text.
-->

```
$ <command>
<paste the real output here>
```

Logged in `docs/log/<name>.md`: <!-- yes / no. Required for finished work. -->

## Checks

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] The proof above is real output I actually ran, in this branch, just now
- [ ] I edited only my own `delegation/*.md` and `docs/log/*.md`

## Contract impact

- [ ] This does **not** touch `logic/src/types.ts`

<!-- If the box above is UNTICKED, all three of these are required: -->
- [ ] There is a `[contract]` issue for the change
- [ ] Everyone who builds against that type has acked it on that issue
- [ ] Every caller broken by the change is fixed in this same PR

## Scope

- [ ] No new dependency (or: it is named below, with why nothing already installed does the job)
- [ ] No abstraction added for a case that does not exist yet
- [ ] Nothing built against an open question in `docs/MASTER.md` §5

<!-- New dependency, if any: -->
