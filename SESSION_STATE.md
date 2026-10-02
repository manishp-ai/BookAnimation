# Session State — updated 2026-10-01 (crooked flips, then the square)

Status: COMPLETE
Task: Fix crooked page flipping; make the page-turn gesture and the book's
360° rotation aware of each other; then stop pages showing through the cover.
Branch / worktree: `fix/passport-spine-hinge`   Recovery point: `3e68dbf`
Stale `PassportBook-spine-v2` worktree pruned (its directory was already
gone); the `fix/passport-spine-hinge-v2` branch it pointed at is untouched
and still holds its two commits.

Done:
- `src/binding.js` — `hullMeshes` flattened to real meshes and memoised. It
  was returning the two cover Groups, which the controller's non-recursive
  raycast could not hit, so only the thin spine strip was grabbable and every
  grab on the book spun it instead of turning a page. Verified live: 5 meshes,
  all `isMesh`, memoised.
- `src/book-kit/BookController.js` — every part of a page gesture is now
  measured in the book's own page frame (`#pageFrame`, `#toPageSpace`) instead
  of in screen X: travel, the off-axis reject, which half was grabbed,
  tap-to-turn, and the hover preview's edge zones. `#screenMetrics` deleted.
  Axis frozen at pointerdown. Verified live: a 40%-of-page drag completes at
  spin 0 / 1.0 / 1.3, where the old constant footprint read it as 0.40 / 0.22 /
  0.11 and would have sprung back for the last two.
- `src/book-kit/BookController.js` — edge-on guard (page under 44px wide
  offers no page to grab), and `setPointerCapture` made non-fatal and moved
  after the gesture is set up and rendering.
- `src/book-kit/orbit.js` — spring integrates in fixed substeps (frame-rate
  independent), new `normalizeTurns` bounds the accumulating spin.
- Removed `isPointerOverBook` from `drag.js` and the package exports — the
  flat screen rectangle the raycast replaced, kept out by a test.
- `npm test` 82/82, `npm run build` clean, no console errors on load.
- `CHANGELOG.md` entry written; `TODO.md` created with the carried-over items.

Done (second request — pages through the cover):
- `src/binding-geometry.js` — `caseDimensions` now cuts a square: the boards
  overhang the text block on the fore edge, head and tail (hinge stays flush).
  There was none before; the cover overhung the pages by exactly 0.0000 at
  head and tail.
- `src/binding.js` — leaves scaled to `leafHeight`, not `caseHeight`.
- `tools/inspect.mjs` — temporary `__throughCover` detector (renders covers
  alone vs whole book from the cover side, shadows off, counts replaced cover
  pixels). Across 132 poses: 1310 broken pixels over 13 poses before, 241 over
  5 after.
- `npm test` 85/85, `npm run build` clean, no console errors.

In flight:
- Nothing. Committed as `cfa0cf3` on `fix/passport-spine-hinge`.

Not started:
- A real-browser pass on rotation *feel*. See Blocked on.

Blocked on:
- The wide pale band down the right of Boss's screenshot was not reproduced.
  The missing square was a real defect and fixing it measurably helped, but an
  A/B of that exact view (open spread, underside, tilted and not) looks the
  same before and after. Need Boss to say which moment shows it before
  changing anything else — a blind fix in this exact area is what caused the
  `0f47067` regression.

Danger:
- Temporary tooling still in the tree (`tools/inspect.*`, `_shots/`,
  `_spine-shot.html`, the `shotSink` middleware in `vite.config.js`, the
  `reference-flipbook` launch entry). Listed in `TODO.md`; must come out
  before merge.
- `requestAnimationFrame` never fires in this preview sandbox
  (`document.visibilityState` is permanently `hidden`). The gesture decisions
  were verified because they land as direct property writes; the orbit spring
  changes are covered by unit test only, not by watching the book move.

Resume by:
- Either answering the blocked question above (which moment shows the pale
  band), or starting the tooling cleanup pass in `TODO.md` before merge.

<!-- machine-record: written by session-state hook, do not edit -->
## Machine record — 2026-10-02 14:26:23

Session ended here. Facts at that moment, recorded by hook:

- Branch: `fix/passport-spine-hinge`  HEAD: `3e68dbf`
- Uncommitted files: 93
```
  M CHANGELOG.md
   M README.md
   D _shots/ab-fill-15.png
   D _shots/ab-fill-under45.png
   D _shots/ab-graze-00.png
   D _shots/ab-graze-15.png
   D _shots/ab-graze-under45.png
   D _shots/ab-nofill-15.png
   D _shots/ab-nofill-under45.png
   M _shots/after-cover-open.png
  ... and 83 more
```

If the narrative above disagrees with this, trust this block and the tree.
