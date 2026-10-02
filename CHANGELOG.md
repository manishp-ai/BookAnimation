# Changelog

## 2026-10-02 — The pale band beside a rotated book was the table's shadow

Role: Frontend Engineer (Three.js) + QA Engineer

Status: Fixed, Verified

Reason:
Boss reported a wide pale band down the side of the book, and on being asked
which moment showed it, answered: rotating the open book. Reproduced, and it
is not geometry. The band is the key light's cast shadow landing on the
table.

Two earlier sessions looked for this in the binding and found nothing,
correctly: there are no leaf vertices outside a cover board and no crossings
between the two cover skins across 185 poses, and the square added on
2026-10-01 was a real defect fixed but not this one. The reason it was never
found is that it is not in the book at all. An A/B that changed one thing —
hiding the table — removed the band and left the book pixel-identical.

The table is a plane fixed in the world at y = -0.035, and the book rotates
about the origin above it. Lying flat the book's shadow falls underneath
itself and only a rim of it shows: 716 background pixels for an open book.
Spun up on edge the book is no longer on the table at all, and the key light
at (-2.8, 5.2, 2.7) throws its silhouette clear of it, where ShadowMaterial
draws a flat hard-edged 28% grey quadrilateral on a white page — 17277 pixels
at a third of a turn, a 24x growth. That slab is the band.

Rejected, with the measurements that rejected them:
- Moving the key nearer overhead. The slab's area is very nearly linear in
  the light's horizontal/vertical ratio (0.748 -> 16705px, 0.405 -> 9229,
  0.242 -> 5684, 0.141 -> 3448), so even a move far enough to visibly change
  the art direction still leaves ~5x the resting shadow.
- Giving the table its own near-overhead caster and keeping the key for the
  book's self-shadowing, separated by `Object3D.layers`. Light layers do not
  filter shadow *receiving*: measured identical (slightly worse, both lights
  summing). A zero-intensity caster does leave the book pixel-identical
  (0 pixels changed), so the idea is sound and only the masking is missing.
- A contact-shadow pass. The camera is already orthographic straight down, so
  a shadow projected straight down is exactly the book's own silhouette and
  invisible. The offset is what sells the table; it cannot be removed.

Changes:
- `src/book-kit/orbit.js`: `groundShadowStrength(spin)` — how much of the
  ground shadow the attitude has earned, 1 lying flat down to 0 edge-on, for
  the consumer to scale its own opacity by. Keyed to the spin and never the
  tilt, because they are different gestures: tilting is the reader leaning
  over a book still on the table, which still owns its shadow, while spinning
  is the book picked up, turned over, and set back down the other way up.
  Cosine gives that shape for free — full either way up, nothing in between —
  and is smooth at rest, so nudging a settled book cannot snap the shadow off.
- `src/main.js`: `updateGroundShadow()` on the controller's `onBeforeRender`,
  which runs after the rig's rotation is written for the frame. Scales
  `TABLE_SHADOW_OPACITY` (0.28, previously an inline literal) and skips the
  draw once the result is below a colour step.
- `src/book-kit/index.js`: `groundShadowStrength` exported with the rest of
  the orbit maths.

The sixth power is the cheapest curve meeting the rule that the shadow may
never put more ink on the table than the book does lying still.

Removed/Reverted:
- None. No geometry, lighting, or material was touched; the book renders
  pixel-for-pixel as before in every pose.

Verification:
- `npm test` 99/99 (3 new in `orbit.test.mjs`, 5 new contract assertions in
  `quick-flipbook-contract.test.mjs`), `npm run build` clean.
- Mutation-checked: making the function return 1 fails 3 of the new tests;
  dropping the exponent to 2 fails the one tied to the measurement. Neither
  is vacuous.
- Measured in a browser harness built on the app's exact lighting, camera,
  table and materials, importing the shipped `groundShadowStrength` rather
  than a copy, over 66 poses (tilt 0/0.3/0.62 x a full turn in 0.3 steps).
  Worst cast shadow falls from 13990 ink (17277px, tilt 0.62 spin 1.2 — a
  detached slab) to 8857 (tilt 0.62 spin 3.3 — the book lying flat the other
  way up, where a shadow belongs). The shut book at rest is untouched:
  716px / 413 ink both before and after.
- Driven live through the real app with pointer and keyboard events — RAF now
  fires in this preview sandbox, which it did not in the two prior sessions.
  Opened to a spread and spun to edge-on and to a partial turn: no band, and
  the resting contact shadow still reads under the shut book.

Known Issues:
- Between about a tenth and a third of a turn the shadow is fading while the
  slab is still growing, so a little of it is still visible there. It is
  bounded by the resting shadow and was judged better than a harder cut-off,
  which would read as the shadow snapping off mid-drag.

## 2026-10-02 — A shut book turned over opens from the cover now on top

Role: Frontend Engineer (Three.js) + QA Engineer

Status: Added, Verified

Reason:
Boss: read the book to the end, shut it, turn it over, and opening it should
open from the cover now facing you — not unwind the way it came. Only when
the book is fully shut, never mid-spread. Confirmed with Boss that it should
apply at both ends, and that the read restarting from page one is wanted.

The geometry makes this almost free. The two shut poses are the same book
half a turn apart: every angle in the shut-at-the-end pose is the
shut-at-the-start pose plus π, and every joint sits at the negation of where
it started — and (x, y) -> (-x, -y) IS a half turn about world Z, the very
axis `rig.rotation.z` spins. So seating the book at its other end and taking
that same half turn back out of the spin lands on a pose identical to the one
already on screen: same silhouette, same hinge side, same cover facing you.
The swap is invisible, and the ordinary forward controls then do the rest.

Changes:
- `src/book-kit/orbit.js`: `facing(spin)` — which way up the book is, +1 while
  the face it started with is toward the camera, -1 once a turn has brought
  the other round. The crossing is at a quarter turn, which is exactly where
  the book is edge-on and there is least to see change. `reseatHalfTurn(spin)`
  — the half turn to give back, signed so it comes off the near side instead
  of winding the long way round.
- `src/book-kit/BookController.js`: `#reseatIfTurnedOver()`, called from the
  tick after the spin springs update and before the rotation reaches the rig,
  so the frame that swaps ends also draws the corrected rotation. Re-seats via
  the `progress` setter, which clears the engine's step — `currentPage` would
  have sent the book travelling to the far end instead. Guarded to shut
  (`progress` exactly 0 or `steps`), settled (`currentPage === progress * 2`,
  which is false on the frame a turn has been asked for but not yet stepped),
  and untouched by a gesture, a load or a lifted hover preview.
- Self-stabilising: after the swap the book is no longer turned over, so it
  cannot fire twice. Keep spinning and it fires again every half turn, which
  is correct — every half turn genuinely does turn the book over.

Verification:
- `npm test` 96/96, `npm run build` clean, no console errors on load.
- `src/binding-geometry.test.mjs`: a new test pins the mirror property the
  whole thing rests on — the two shut poses are half a turn apart in every
  angle, every joint negated, the span and the centring offset mirrored. If
  that ever stops holding, the invisible swap becomes a visible jump.
- `src/book-kit/orbit.test.mjs`: `facing` flips at the edge-on quarter turn;
  and swept across the whole range `normalizeTurns` can produce, re-seating
  always leaves the book the right way up in one move, by the shorter way
  round, never further from rest than it started.
- `src/book-kit/BookController.reseat.test.mjs` (new): drives the real
  controller in node — real class, real spring, real frames, real pointer
  events through the listeners it registers, with only a canvas and a book
  stood in. Covers both ends, the invisibility (the pose the viewer sees runs
  on through the swap by one ordinary frame of spin, not half a turn), that
  idling does not oscillate, that a part-open book at 0.5/1/45/91.5 is left
  alone, and that a turn already asked for is not hijacked.
- Those six were mutation-checked: with the `#reseatIfTurnedOver()` call
  commented out, five of the six fail. The sixth is the part-open case, which
  correctly passes either way.

Known Issues:
- Not verified in a real browser. `requestAnimationFrame` never fires in this
  session's preview sandbox (`document.visibilityState` is permanently
  `hidden`), and the re-seat lives in the render loop, so it cannot be
  exercised there at all. The node harness above is why this is being claimed
  as working; a real-browser pass is still owed and is in `TODO.md`.

## 2026-10-02 — Temporary tooling removed before merge

Role: Release Engineer

Status: Removed, Verified

Reason:
The case-binding rebuild and the fixes on top of it were built with a scene
harness that was never meant to ship: a page that exposed the live scene on
`globalThis.__binding`, offscreen render-target capture, a dev-only
middleware that wrote the PNGs to disk, and a structural-invariant checker.
All of it was tracked in `TODO.md` for removal before merge. It is out.

Removed:
- `tools/` entirely — `inspect.html`, `inspect.mjs`, `invariants.mjs`, and
  `shots.html`/`shots.mjs`, an older duplicate pair of the same harness that
  the TODO had not listed.
- `_spine-shot.html`.
- `_shots/` (216 captures) from disk; it was untracked in `42b82ee`, so the
  now-pointless `_shots/` line comes back out of `.gitignore` with it.
- The `shotSink` middleware and its `node:fs`/`node:path` imports from
  `vite.config.js`, leaving the config to `publicDir`, the chunk-size limit
  and the dev server's host/port.
- The `__BINDING_HARNESS__` block at the foot of `src/main.js` — its only
  consumers were the harness pages. Its comment pointed at
  `tools/invariants.html`, a file that never existed.
- The `reference-flipbook` entry in `.claude/launch.json`, which started a
  dev server from an unrelated directory outside this repo.
- `public/books/world-passport/spine.jpg`, orphaned. Verified unreferenced
  first: `edition.json`'s `spine` key is the lettering config, not an image
  path, and the spine strip is cropped from the front artwork. Loading the
  app afterwards requests no such file. `page-02.jpg` was checked at the same
  time and kept — `src/books.js` alternates it with `page-01.jpg` for the
  leaf materials.

Changes:
- `src/quick-flipbook-contract.test.mjs`: the square test's comment cited the
  offscreen detector by file path. Reworded to describe the method and point
  at the CHANGELOG, so deleting the harness does not leave the test
  explaining itself by reference to a file that is gone.
- `TODO.md`: the whole "Before merge" section is closed and removed. Added
  the unreproduced pale band from Boss's report, and a note on what the
  harness did in case deeper geometry work ever wants it back — it was
  deleted because none of it ships, not because it was wrong.

Verification:
- `npm test` 85/85, `npm run build` clean. No test depended on any of this:
  the only assertion against `vite.config.js` is `publicDir: "public"`.
- Grepped the whole tree for every removed name — `tools/`,
  `__BINDING_HARNESS__`, `__binding`, `shotSink`, `_spine-shot`, `spine.jpg`,
  `reference-flipbook`, `_shots` — across js/mjs/json/html/css and in the
  docs. Nothing dangling outside the dated CHANGELOG entries, which are a
  record of what happened and correctly describe a past state.
- App loaded on the dev server: no console errors, every request 200, no 404
  for the deleted asset, all four page images and the subset font present.
- Production bundle contains zero occurrences of `BINDING_HARNESS`, `__shot`
  or `shot-sink`.

Result:
Nothing but product in the tree. The repo root is down to source, public
assets, config, licences and the four Markdown records.

Known Issues:
- The 216 capture blobs remain in git history from before `42b82ee`
  untracked them. Purging those needs a history rewrite, which is not worth
  doing for this.

## 2026-10-01 — The case gets a square, so pages stop showing through the cover

Role: Frontend Engineer (Three.js) + QA Engineer

Status: Fixed, Verified

Reason:
Boss reported pages passing through the cover, with a screenshot of the open
book seen from its underside. `caseDimensions` cut the text block flush with
the boards on all three free edges — the source said so outright
(`leafWidth: boardWidth`, `// Leaves are cut flush with the boards' fore
edge`, and leaves scaled to the full `caseHeight`). Measured on the live
scene, the cover overhung the pages by exactly 0.0000 at the head and the
tail and 0.0034 at the fore edge. Flush means a leaf's edge and a board's
edge are the same line in space, so the moment a leaf takes up any curl — and
every leaf here carries some — its vertices cross outside the board's
silhouette and the text block shows through the cover.

A real case is not built that way: the boards are cut larger than the block
and overhang it by a square on the fore edge, head and tail. This book had
none.

Changes:
- `src/binding-geometry.js`: `caseDimensions` takes a `square` (defaulting to
  `SQUARE_RATIO`, 1.4% of page height — about 2mm on a 125mm passport, 3mm on
  a 240mm book) and returns `square`, `leafWidth` and `leafHeight`. The hinge
  edge stays flush, because that edge is the binding. The square is clamped so
  an absurd value cannot eat the text block.
- `src/binding.js`: leaves are scaled to `leafHeight`, not `caseHeight`. The
  plane is hinged on its left edge and centred in z, so the width change takes
  the square off the fore edge alone and the height change splits it between
  head and tail. The boards, spine and soft-cover sheets keep `caseHeight`.
- `tools/inspect.mjs` (temporary): `__throughCover(progress, tilt)` renders the
  covers alone, then the whole book, from the cover side, and counts cover
  pixels a page replaced. Shadows are disabled for both renders — the leaf
  casts onto the cover, and a shadow appearing when the text block is shown is
  not a page drawing through it. (Without that, the detector reported 5.4%
  "penetration" at p=1.5 that was entirely the standing leaf's own shadow.)

Verification:
- `npm test` 85/85 (3 new: the square exists and is one deep on the fore edge
  and one each on head and tail; an absurd or zero square is handled; the
  binding scales leaves to the block rather than the boards). `npm run build`
  clean. No console errors on load.
- Live overhang measurement across progress 0→92: head and tail went from
  exactly 0.0000 to 0.0140 at every step; the fore edge from 0.0034 to 0.0174
  open. The only remaining zeros are the hinge edge, which is correct — flush
  there is what being bound means.
- `__throughCover` across 132 poses (progress × tilt, from the cover side):
  flush-cut leaves broke 1310 cover pixels across 13 poses; with the square,
  241 across 5. Worst pose went from 1.93% of cover pixels to 0.64%.

Known Issues:
- 241 pixels across 5 poses remain, all at the ±0.62 tilt limit and worst at
  progress 91.9 (0.64% of cover pixels) — a case that has not finished
  shutting, where a sliver of fore edge is legitimately in view. Not chased
  further: it is a fifth of a percent in one frame, and an earlier blind fix
  in this exact area is what caused the `0f47067` regression.
- The wide pale band down the right of Boss's screenshot was **not**
  reproduced. The square is a real defect and fixing it measurably helped, but
  an A/B of the exact view in the report (open spread, underside, with and
  without tilt) looks the same before and after, so that band may have another
  cause. Boss needs to say which moment shows it.

## 2026-10-01 — Page turns follow the page, not the screen

Role: Frontend Engineer (Three.js) + QA Engineer

Status: Fixed, Changed, Removed, Verified

Reason:
Boss reported page flipping was crooked. Two separate defects, both
introduced while fixing the rotation boundary bug earlier in the same
session, and both only visible once the book had been rotated at all.

First, `CaseBinding.hullMeshes` returned the two cover **Groups** and the
spine mesh, and the controller handed that list to a deliberately
non-recursive raycast. Groups carry no geometry, so the only thing on the
book a pointer could actually hit was the thin spine strip — every grab
anywhere else read as empty space and spun the book instead of turning a
page.

Second, every part of a page gesture was measured in screen X: the travel,
the completion threshold, the "is this a page drag or a scroll?" reject, the
choice of which half of the book was grabbed, and the hover preview's edge
zones. Screen X only matches the page while the book faces the camera
square-on. Measured on the live scene, one world unit along the page covers
581 screen pixels square-on, 314 at a radian of spin, 99 at 1.4, and −581 at
half a turn — so a drag was asking for up to six times the travel it should
(the page crawling behind the finger), and past a right angle it ran the
page backwards.

Changes:
- `src/binding.js`: `hullMeshes` now flattens to actual meshes (5, not 3
  entries of which 2 were empty Groups), memoised because it is read on
  every pointer move and invalidated in `#disposeCase` where the case that
  produced it is torn down.
- `src/book-kit/BookController.js`: new `#pageFrame()` measures the book's
  own spine→fore-edge and head→tail axes in canvas pixels from the rig's
  world matrix; `#toPageSpace()` puts a client point in that frame. Drag
  travel, the off-axis reject, the grabbed half, tap-to-turn and the hover
  preview's edge zones are all measured there now. The axis is frozen at
  `pointerdown` for the gesture's lifetime (free: the gesture is locked to
  the book, so nothing can rotate it underneath) which also keeps per-move
  work to two multiplies. `#screenMetrics()` deleted.
- `src/book-kit/BookController.js`: a book turned so near edge-on that a
  page is under 44px wide offers no page to grab; the pointer goes to the
  rotation it visually sits in rather than letting a few pixels of travel
  snap a whole page over.
- `src/book-kit/BookController.js`: `setPointerCapture` is allowed to fail
  (the browser throws if the pointer went up between the event being queued
  and the handler running) and is now attempted last, after the gesture is
  set up and rendering. Previously a throw there would abandon the handler
  part-way through, leaving a rotation started with no render loop running.
- `src/book-kit/orbit.js`: `OrbitSpring.update` integrates in fixed
  substeps. The old single step clamped to 1/30s and threw the surplus time
  away, so every dropped frame left the rotation running slower than the
  hand that started it. Now 144fps, 60fps and a dropped-to-20fps frame land
  within 0.5% of each other after a second.
- `src/book-kit/orbit.js`: new `normalizeTurns()` takes whole turns off the
  spin spring's value and target together — same pose, same speed, same
  distance left to travel — so a long session of dragging cannot drift out
  to angles where float spacing coarsens the motion.

Removed:
- `isPointerOverBook` and its test, from `src/book-kit/drag.js` and the
  package's public exports. It is the flat screen rectangle the raycast
  replaced; correct only square-on, and leaving it exported would hand the
  next consumer of this package the same bug it just cost two fixes to get
  rid of. A test now asserts it stays gone.

Verification:
- `npm test` 82/82 (6 new: the page-frame measurement, the frozen axis, the
  edge-on guard, the flattened hull, the frame-rate-independent spring, the
  turn normalisation). `npm run build` clean. No console errors on load.
- Measured against the live scene through synthetic pointer events: a drag
  across 40% of the page completes the turn at spin 0, 1.0 and 1.3, where
  the old constant 387px footprint would have read the same gesture as 0.40,
  0.22 and 0.11 — the latter two below the 0.32 completion threshold, so the
  page would have sprung back. A drag along the page turns it at every spin
  from 0 to π; a drag that only knows about screen-left stops working past
  1.9 rad, which is the inversion Boss was seeing. On a book turned to 1.52
  rad (page 20px wide) a grab starts a rotation, not a flip.
- Hull: 5 meshes, all `isMesh`, memoised (`hullMeshes === hullMeshes`).
- Flip geometry itself inspected head-on at progress 0.25/0.5/0.75 and
  2.3/2.5/2.7 — square, vertical gutter, no skew. The crookedness was
  entirely in the gesture mapping, not the geometry.

Known Issues:
- `requestAnimationFrame` never fires in this session's preview sandbox
  (`document.visibilityState` is permanently `hidden`), so the orbit spring
  and the drag *animation* could not be driven end-to-end in a browser. The
  gesture decisions above were verified because they land as direct property
  writes; the spring changes were verified by unit test only. A real-browser
  pass on rotation feel is still outstanding, as it was before this change.
- `shortestAngleTo` in `src/book-kit/orbit.js` now has no caller. It is
  correct and plausibly useful to a consumer, so it was left rather than
  removed unasked — logged in `TODO.md`.

## 2026-09-28 — Gesture-only interaction, extracted into a reusable package

Role: Frontend Engineer (Three.js) + Accessibility

Status: Added, Changed, Removed, Refactored

Reason:
Boss asked for the on-screen prev/next/rotate buttons to be removed entirely
and replaced with direct, physical interaction — drag the book to turn a
page, drag the space around it to rotate it, with gesture priority locked to
whichever the pointer started on so one can never turn into the other
mid-drag. Boss also asked for the whole interaction system to be a
self-contained, reusable component rather than logic wired into this one
page.

Changes:
- `src/book-kit/` (new package): `BookController.js` owns every pointer
  listener, the orbit spring, the edge-hover preview, and a single unified
  render loop (previously main.js ran two independent
  `requestAnimationFrame` chains — one for page-turn animation, one for
  orbit — that could drift out of sync with each other). Gesture mode is
  decided once, at `pointerdown`, by a screen-space hit test against the
  book (`isPointerOverBook`, already existing pure logic); nothing later in
  a gesture re-checks which side of that line the pointer is on. A released
  rotation no longer springs back to front-on — like setting down a real
  object, it stays where the drag left it. Cursor state is scoped to the
  canvas element, not `document.body`, so the component doesn't reach
  outside itself when dropped into a page with other content. `drag.js` and
  `orbit.js` (pure math, pre-existing) moved into the package unchanged.
- `src/binding.js`: added a `get caseWidth()` accessor — the one piece of
  the binding's construction the interaction layer needs (to size the
  book's on-screen hit box) that wasn't already public.
- `index.html`, `src/style.css`: removed the `#previous-page`, `#next-page`,
  `#rotate-view` buttons and their `.page-button`/`.reader-controls` styles.
  The screen-reader status live region (`#page-state`) stays.
- `src/main.js`: now ~470 lines shorter. Owns scene/camera/renderer/lighting
  setup and book-loading as before; all pointer/keyboard/orbit/edge-preview
  code moved out into `book-kit`, replaced with one `BookController`
  instance wired to `binding`/`bookRig` and `controller.bindKeyboard(window)`
  for the arrow-key fallback.
- `package.json`: `test` script now globs both `src/*.test.mjs` and
  `src/**/*.test.mjs` — plain `sh` globbing doesn't do `**` recursively, so
  moving `drag.test.mjs`/`orbit.test.mjs` into `book-kit/` had silently
  dropped them from the suite (55 tests ran, believed clean, while 12 of
  them weren't executing at all). Caught before it shipped; both patterns
  are needed since neither alone covers root-level and nested files.
- `README.md`: describes the gesture-only interaction and the `book-kit`
  package as a drop-in component for other books on the site.

Removed/Reverted:
- The `#previous-page`, `#next-page`, `#rotate-view` buttons and all
  button-specific CSS and ARIA wiring (`aria-pressed`, `rotateMode`).
- The window-wide "tap left/right half turns a page" fallback, which used to
  fire for taps anywhere on the canvas including outside the book. Tap-to-
  turn is unchanged for taps that land on the book (hit-tested the same way
  as a drag start); a tap outside the book now starts a rotation instead.

Verification:
- `npm test`: 75/75 (up from 55 visibly-run — see the test-script fix
  above). New `src/book-kit/BookController.test.mjs` asserts the
  architectural properties this feature rests on: gesture mode decided once
  and not re-evaluated mid-drag, page-drag and orbit-drag mutually exclusive
  per pointer, no snap-back on release, cursor scoped to the canvas, a
  single render loop, full listener cleanup on `dispose()`, and no imports
  reaching outside the package.
- `npm run build`: clean, 613 kB bundle (gzip 154 kB), no new warnings.
- Live check via `tools/inspect.html`'s existing harness: a synthetic drag
  starting just inside the book's cover moved `currentPage` 0 → 2 (a forward
  page turn); an otherwise-identical drag starting 12px from the canvas edge
  (outside the book) left `currentPage` unchanged, confirming the two
  gestures route correctly and don't bleed into each other. Full pixel-level
  visual confirmation was not possible in this session's browser-preview
  sandbox — `requestAnimationFrame` doesn't reliably drive when that pane
  isn't frontmost, which was confirmed to be a pre-existing sandbox
  limitation (the unmodified prior commit shows the identical blank canvas
  under the same tool), not a regression from this change.

Result:
The reader has no on-screen navigation chrome. Every documented gesture
(drag the book, drag around it, tap a page, arrow keys) routes through
`src/book-kit`, independently testable and reusable without this app.

Known Issues:
- Visual/pixel-level confirmation of the drag and rotation gestures in a
  live browser is still owed — blocked on the sandbox limitation above, not
  on the implementation. Recommend a manual check in a real browser tab
  before merge.

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
