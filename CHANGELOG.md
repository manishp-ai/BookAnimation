# Changelog

## 2026-09-27 — Spine lies base-down on the hinge instead of standing on edge

Role: Frontend / 3D Graphics Engineer (Three.js) + QA Engineer

Status: Fixed

Reason:
Opening the passport put a hard black rectangular wall in the gutter, with
what read as an extra fold between the sheet and the spine. The cause was an
axis swap in the spine's own measurements: `spineGeometryFromBounds` put the
cover-board thickness on X (0.0072 world, 1.1% of a page width) and the full
page-block thickness on Y (0.038, 5.7%). That is a cuboid standing on its
long edge. Floated above the page plane by a `clearance` hack and textured by
stretching one 1.1%-wide crop across all six `BoxGeometry` faces, it was left
standing alone at the gutter once the cover swung past roughly 60°, with
razor-straight silhouette edges on both sides and front-cover art that only
lined up in the closed state. Confirmed by rendering the same frames with
`coverSpine.visible = false`: the bar disappears and the gutter is clean, so
the slab was the sole source.

The cover's hinge was never the problem. Each `FlipPage` already offsets its
page mesh by `position.x = 0.5` inside a 1×1 plane, so the sheet's origin is
the hinge and `flip()` rotates about that single axis. No pivot change was
needed or made.

Changes:
- `src/orbit.js` — `spineGeometryFromBounds` now returns an arc rather than a
  box. The two cross-axis measurements are swapped to match a real binding:
  width across the book is the page block's measured thickness (what a binder
  actually cuts a spine to), and the round rises `SPINE_ROUND_RATIO` (0.2) of
  that width above its joints. Returns `radius`/`thetaStart`/`thetaLength`
  for a circular cross-section through both joints and the crown, plus
  `cropFraction` (the arc's developed length, so art wraps without stretch)
  and `scaleX` (cancels the flip book's page-aspect stretch, which applies to
  widths and not to thicknesses).
- `src/orbit.js` — the arc straddles the hinge line (`centerX: minX`) instead
  of sitting entirely inboard of it, so a sheet swinging off either side
  leaves the joint in the same place at every angle.
- `src/orbit.js` — both joints, not just the crown, now clear the cover plane
  (`centerY: maxY + clearance + rise - radius`). Hanging them below it buries
  whichever half the page stack lies over: a flipped sheet drops to the
  bottom of the stack while unflipped leaves stay at the top, so the round
  was occluded unequally and read as half a strip. Found during verification,
  after a first attempt placed only the crown proud.
- `src/main.js` — `coverSpine` is a `CylinderGeometry` shell (24 segments,
  open-ended, `rotation.x = -π/2`, `scale.x` counter-scaled) instead of a
  `BoxGeometry`. Its normal turns continuously across the gutter, so it
  shades as one curve rather than stepping at a hard edge.
- `src/main.js` — `makeSpineStripTexture` mirrors the cover's hinge-side crop
  about the joint. The half lying over the cover therefore reproduces exactly
  the pixels the cover shows underneath it, at the cover's own scale, so the
  seam cannot step or stretch at any opening angle.
- `src/orbit.test.mjs` — the four spine tests asserted the old model
  ("top-down width is a small fraction of its real thickness", "bottom face
  flush at minY"), i.e. the bug written down as a contract. Replaced with six
  tests covering the corrected contract: joint-to-joint span equals the real
  block thickness, the round rises well under half its own span, the joints
  straddle the hinge line, `scaleX` counter-scaling, both joints clearing the
  cover plane, and the crop following the developed arc length.

Removed/Reverted:
- The `SPINE_FLATNESS` constant and its comment, which documented the
  standing-on-edge model as intentional.
- The `clearance = thickness * 0.05` float that lifted the whole box above
  the page envelope, and the `boxHeight = thickness + clearance` overhang.
- No separate fold or strip element existed to delete — the extra fold the
  bug report described was this slab's own second silhouette edge.
- The temporary `window.__passportDebug` scaffold and `_spine-shot.html`
  verification harness used during this work.

Verification:
- `npm test` — 33/33 pass (was 29/33 with the four rewritten tests failing
  against the new geometry).
- `npm run build` — clean, 13 modules, 599 kB / 149 kB gzip.
- Headless Chromium captures at 0 / 25 / 50 / 75 / 100% open, before and
  after, plus a 14× zoom on the gutter and on the closed bound edge.
- Closing direction (progress approached from above, which flips the engine's
  bend sign) at 50%.
- Deep interior (spread 45 of 91).
- Orbit view at spin −28° / tilt +24°.
- Mobile viewport 390×844 at 75% open.
- Closed state pixel-diffed before vs after: differences confined to
  x ∈ [226, 272], 1.53% of pixels — the bound edge itself. The cover art is
  untouched.
- `prefers-reduced-motion: reduce` forced via Chromium: open state is
  pixel-identical to the normal render (diff bbox `None`).
- Console errors and warnings: 0 in closed, mid and open states.

Result:
The spine lies base-down across the hinge as a rounded bound edge the sheets
swing off. No wall, no intermediate strip, no backward fold, and the art runs
continuously across the joint at every opening angle.

Known Issues:
- The page block's own curve lifts the leaves up out of the gutter faster
  than the round rises, so the sheets overlap the outer thirds of the round
  and the visible strip is narrower than the book's true thickness, slightly
  more so on the unflipped side. This reads correctly (pages do arch over a
  spine in a real open book) but it is an occlusion, not a designed width.
- The closed state is not pixel-identical to the previous build, by the
  1.53% measured above. The bound edge is now a rounded spine standing proud
  of the cover rather than a flat 1.1% sliver; a flat sliver and a real round
  cannot occupy the same silhouette.

## 2026-09-27 — Drag-to-orbit view and a bound spine

Role: Frontend Engineer (Three.js)

Status: Added

Reason:
The book had no way to show it was a real bound object — from the fixed
top-down camera a closed book's own thickness is invisible by construction,
and the edition itself was thin (4 pages) with no room for the passport's
intended use (stamps/seals across many interior pages).

Changes:
- `src/orbit.js` (new): pure, tested logic for the orbit interaction — an
  `OrbitSpring` and drag-target mapping adapted from `~/AshenPress/index.html`
  (same spring constants and tilt clamp), `shortestAngleTo` for easing the
  unbounded spin axis back to flat without a multi-turn wind-back, and
  `spineBoxFromBounds` for sizing a spine from a closed book's measured
  bounds.
- `src/main.js`: a `⟲` toggle hands the closed book's rotation to the
  pointer — horizontal drag spins without limit, vertical drag tilts within
  ±0.62 rad, both spring-smoothed. Wired as an interaction gate: every canvas
  pointer handler early-returns into the orbit path while the mode is on, so
  the existing page-flip drag logic is untouched when it's off. A
  `rebuildCoverSpine` step measures the loaded book's true bounds and builds
  a cloth-bound spine — a thin ribbon from directly above, carrying the real
  page-count-driven thickness on the axis rotation reveals, textured with a
  cropped clone of the back cover's own art, hidden while the book is mid-flip
  (a real book's spine colour isn't visible from inside the open gutter).
  `yBetweenPages` raised 0.0012 → 0.0016 (page-stack spacing only, not the
  flip animation).
- `src/books.js`: interior leaves raised from 2 blank pages to 180 (90
  sheets) — the same two existing blank-leaf textures repeated, no new
  content invented. `main.js` caches materials by source URL, so the repeats
  cost one extra texture load, not one per leaf.
- `index.html`, `src/style.css`: added the `#rotate-view` toggle button and
  its pressed-state style (no new `cursor` rule — cursor changes are set via
  inline JS, matching the existing contract test's expectation that
  `style.css` declares exactly one `cursor` rule).
- `src/orbit.test.mjs` (new): 8 tests covering the spring, the clamp/spin
  split, the wind-back-free return-to-flat, and the spine's bounds math
  (including that a thicker page block only changes the hidden height, not
  the top-down width).

Removed/Reverted:
- An earlier version of the spine sized its on-screen width directly from
  the measured page-stack thickness, so more pages produced a wider strip
  even in the resting top-down view. Reverted: that isn't how a real book's
  spine reads from above (its round is always narrow; the page count only
  shows once you rotate it), and it produced a spine that looked pasted on
  rather than bound to the book.
- A hand-drawn canvas cloth texture (linen grain + edge vignette) for the
  spine. Reverted in favor of a cropped clone of the back cover's own
  texture, so the spine reads as the same designed object rather than an
  unrelated flat-color slab.

Verification:
- `npm test`: 28/28 passing, including every pre-existing assertion (the
  flip-mechanics contract test, the cursor-rule count, the forbidden-string
  checks) — the new code was additive, nothing pre-existing was edited to
  make it pass.
- `npm run build`: clean production build.
- Manual, in-browser: opened the dev server, toggled orbit on, dragged past
  90° and confirmed both the spine face and the fore-edge page-block read as
  a genuinely thick bound book; toggled off and confirmed the spring eases
  back to flat; paged forward into the interior and confirmed the spine is
  hidden mid-flip (not visible from inside the gutter) and reappears on
  return to the cover.

Known Issues:
- The spine and page-block thickness are only two of a real book's six
  visible faces — the head/tail (top/bottom of the page block) have no
  equivalent treatment. Not attempted this session; flagged rather than
  silently left inconsistent.
- Orbit tilt is clamped to the reference implementation's ±0.62 rad; not
  re-tuned for this scene's different (top-down, orthographic) camera beyond
  confirming it reveals the spine and fore-edge convincingly.
