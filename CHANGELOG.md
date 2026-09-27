# Changelog

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
