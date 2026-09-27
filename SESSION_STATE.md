# Session State — updated 2026-09-28 01:20

Status: IN PROGRESS
Task: Fix the two faults Boss reported in the last spread — the book going
stiff at the final cover, and the book never shutting again at the end.
Branch / worktree: `fix/passport-spine-hinge`   Recovery point: `d85e938`

Done:
- The last leaf no longer fades its curl out. `#apply()` sets
  `this.#curve.intensity = pose.openAmount` with no tail term, so the wave
  holds to the end. Verified numerically at progress 91 (block reaches
  y 0.0408, both covers 0.0211 — no punch-through). Committed `d85e938`.
- Closing phase: `bindingPose` grew a third leg (`closeAmount`), the back
  cover swings on it, the spine rolls its second quarter, `caseLift` keeps
  the case on the table past upright, and `centringOffset` slides the
  composition back. Verified in the live scene: at the last step the case's
  world bounds are `[[-0.3333,-0.036,-0.5],[0.3333,0,0.5]]` — identical to
  the shut state at progress 0.
- `steps` was still `1 + leafCount` while the pose counted `2 + leafCount`,
  so `progress` clamped one step short and the closing leg was unreachable.
  Both now call `bindingSteps(leafCount)`. Verified through the reader's own
  controls: the last `nextPage()` animates 91 → 92 in ~1s, `nextPage()` past
  the end is a no-op, `previousPage()` reopens to 91.
- `npm test` 53/53, `npm run build` clean. Invariant harness unchanged at
  8 of 9 (#6 still reports 5 grazing rays at open=0.4 — the board's own
  joint edge, correct case-binding behaviour, pre-existing).

In flight:
- Nothing. Tree builds and tests clean; commit pending for the closing fix.

Not started:
- Mobile (max-width 620px) and reduced-motion passes on the closing step.
- CHANGELOG entry for the case-binding rebuild.

Blocked on:
- Nothing.

Danger:
- Temporary tooling still in the tree and partly committed: `_shots/`,
  `_spine-shot.html`, `tools/inspect.*`, `tools/invariants.mjs`, the
  `shotSink` middleware in `vite.config.js`, the `reference-flipbook` entry
  in `.claude/launch.json`. All must come out before merge.
- `public/books/world-passport/spine.jpg` is orphaned (nothing loads it).

Resume by:
- Mobile and reduced-motion check on the closing step, then the cleanup pass.
