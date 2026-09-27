# Session State — updated 2026-09-28 04:05

Status: IN PROGRESS
Task: Fix the faults Boss reported — the book going stiff at the final
cover, never shutting again at the end, pages escaping the covers during a
turn, and a grey shadow slab lying across the sheets.
Branch / worktree: `fix/passport-spine-hinge`   Recovery point: `0f47067`

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
- `npm test` 54/54, `npm run build` clean. Invariant harness unchanged at
  8 of 9 (#6 still reports 5 grazing rays at open=0.4 — the board's own
  joint edge, correct case-binding behaviour, pre-existing).

- Pages escaping the covers (`ddfd4e4`). The leaf node scaled its width by
  leafWidth but left its out-of-plane axis at 1, so the droop was measured in
  a different unit from the page and came out 1/leafWidth too deep: a bent
  leaf reached ~9% further from its anchor than it is long, and at the
  quarter turn that excess rotated into the horizontal and threw the
  fore-edge past the board. Scaling that axis with the width fixes it;
  GutterFlex converts the world-unit structural rise back through
  `unitScale` so the piles still land where binding-geometry puts them.
  Measured over 27 samples: worst overhang 0.0639 -> 0 against a cover
  half-width of 0.6815; resting pile top 0.0382 -> 0.0204 against a cover
  face at 0.0215, so the leaves tuck under the board instead of standing
  proud. Page size unchanged (half-width 0.6781, half-height 0.5).
- The grey slab across the sheets (`1e1d6a2`). Not lighting — the shadow map
  off removed it, each light off did not. Ninety leaves 0.4mm apart in a
  shadow map resolving 2.3mm per texel acne against each other. Only a leaf
  lifted off its pile casts now. Leaves casting: 0 at every settled
  position, exactly 1 mid-turn. The remaining mid-turn shadow is the raised
  page's own on the pile below (5.5% of frame, no self-acne) and is real.

- Covers drawing over the pages (`0f47067`) — my own regression from
  ddfd4e4, which Boss caught. Scaling the leaf node's out-of-plane axis was
  too blunt: it carries the bend, the curl and the gutter flex alike, and
  only the bend needed shrinking. Reverted the node scale and the unitScale
  plumbing; scaled the bend alone via `#BEND_DEPTH = 0.58`, bisected against
  the live scene (0.5969 fails by 0.0001, 0.5953 is clean). Overhang still
  0; resting pile back to 0.0382 above the pastedown's 0.0215.
- Creases down the spread (`43297c1`). A resting leaf curves out to ratio
  0.813 — quick_flipbook's own effectRange — and is flat beyond. At 16
  subdivisions that tail is four vertices and the facets read as two hard
  lines. Upstream runs the same 16 and the same curl but hides it under
  photographs; these pages are near-white. PAGE_SUBDIVISIONS 16 -> 24, soft
  covers with them. 40 chokes the renderer at ninety leaves; 24 holds 6.9ms
  median / 7.1ms p95 frames and a 44ms first paint. Both earlier fixes
  re-verified at the finer mesh.

In flight:
- Nothing. Tree builds and tests clean, all work committed.

Not started:
- Mobile (max-width 620px) and reduced-motion passes on the closing step.
- Whether the soft covers want the same out-of-plane unit fix as the leaves.
  They cannot overhang anything, so it is cosmetic and was left alone
  deliberately rather than changed unasked.
- CHANGELOG entry for the case-binding rebuild.

Blocked on:
- "Pages going behind the cover on a turn." Could not reproduce anything
  significant. Comparing leaf height against the cover's height at matching
  x, across the first, middle and last turns, the cover stands above the
  leaves by 0.0004 almost everywhere — that is PASTEDOWN_LIFT, by design —
  and by at most 0.0060 near the gutter as the very last leaf turns. Nothing
  at the fore-edge. Need Boss to say which moment shows it before changing
  anything; an earlier blind fix here is exactly what caused the 0f47067
  regression.

Danger:
- Temporary tooling still in the tree and partly committed: `_shots/`,
  `_spine-shot.html`, `tools/inspect.*`, `tools/invariants.mjs`, the
  `shotSink` middleware in `vite.config.js`, the `reference-flipbook` entry
  in `.claude/launch.json`. All must come out before merge.
- `public/books/world-passport/spine.jpg` is orphaned (nothing loads it).

Resume by:
- Mobile and reduced-motion check, then the cleanup pass.
