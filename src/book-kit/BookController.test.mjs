import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controller = await readFile(new URL("./BookController.js", import.meta.url), "utf8");

// Gesture priority: decided once, at pointerdown, from a hit test against
// the book — not re-evaluated as the pointer moves, and not decided by any
// UI toggle. This is the property the whole request rests on: a drag begun
// on the book can never become a rotation, and vice versa.
test("gesture mode is decided once at pointerdown by a hit test, not a mode toggle", () => {
  assert.match(controller, /const overBook = this\.#hitTestBook\(event\.clientX, event\.clientY\)/);
  assert.match(controller, /if \(!overBook\) \{/);
  assert.doesNotMatch(controller, /rotateMode/);
  assert.doesNotMatch(controller, /aria-pressed/);

  // pointermove and pointerup branch on state captured at pointerdown
  // (#orbitDrag / #pointerStart); pointerup never re-hit-tests.
  const up = controller.slice(controller.indexOf("#onPointerUp ="), controller.indexOf("#onPointerCancel"));
  assert.doesNotMatch(up, /#hitTestBook/);
});

// A hit test built from a flat screen rectangle sized to the book's
// un-rotated footprint only matches what's on screen while the book faces
// the camera square-on. The moment a 360° drag turns it, the rectangle's
// size and position go stale relative to the book's true (shrunk, skewed)
// silhouette, so points well outside the visible book keep reading as "on
// it" — exactly the bug where dragging beside a tilted book still turns a
// page. Raycasting the real meshes has no rest state to fall out of sync
// with: it is whatever the book actually looks like right now.
test("the hit test raycasts the book's actual meshes, not a flat screen rectangle", () => {
  assert.match(controller, /import \{ Raycaster, Vector2, Vector3 \} from "three"/);
  assert.match(controller, /#hitTestBook\(clientX, clientY\) \{/);
  assert.match(controller, /this\.#raycaster\.setFromCamera\(this\.#pointerNDC, this\.#camera\)/);
  // The book's envelope (two boards, spine), not its full leaf stack — the
  // full stack is ~45x the triangles for a hit test that runs every pointer
  // move while hovering.
  assert.match(controller, /this\.#raycaster\.intersectObjects\(this\.#book\.hullMeshes, false\)\.length > 0/);
  assert.doesNotMatch(controller, /isPointerOverBook/);
});

// Measured on the real scene: one world unit along the page covers 581 screen
// pixels with the book square-on, 314 at a radian of spin, 99 at 1.4, and
// -581 at half a turn. A gesture that reads raw screen X therefore asks for
// nearly twice the travel it should at a radian, six times at 1.4, and runs
// the page backwards past a right angle — the crooked flip. Every part of the
// gesture is measured along the book's own spine→fore-edge axis instead.
test("a page drag is measured along the page, not along the screen", () => {
  assert.match(controller, /#pageFrame\(\) \{/);
  assert.match(controller, /acrossLength: Math\.hypot\(acrossX, acrossY\)/);
  // The screen-space rectangle this replaced is gone, not merely unused.
  assert.doesNotMatch(controller, /#screenMetrics/);

  // Travel and the off-axis reject are both projections onto that axis.
  assert.match(controller, /const along = deltaX \* start\.axisX \+ deltaY \* start\.axisY/);
  assert.match(controller, /const across = deltaY \* start\.axisX - deltaX \* start\.axisY/);
  assert.match(controller, /dragFraction\(along, start\.direction, start\.pageWidth/);

  // Which half of the book was grabbed comes from the gutter in the book's
  // own frame, never from the screen's midline.
  assert.match(controller, /chooseDragDirection\(sheet, maxSheet, grab\.along, 0\)/);
  assert.match(controller, /start\.grabAlong < 0 \? this\.previousPage\(\) : this\.nextPage\(\)/);
  assert.doesNotMatch(controller, /clientX < metrics\.centerX/);
});

test("the axis a drag is measured along is frozen when the drag starts", () => {
  // Re-reading the rotation mid-drag would let a page the pointer is already
  // holding change which way it answers to; the gesture is locked to the book
  // anyway, so nothing can turn it underneath.
  const down = controller.slice(controller.indexOf("#onPointerDown ="), controller.indexOf("#onPointerMove ="));
  assert.match(down, /axisX: frame\.acrossX \/ \(frame\.acrossLength \|\| 1\)/);
  const move = controller.slice(controller.indexOf("#onPointerMove ="), controller.indexOf("#onPointerUp ="));
  assert.doesNotMatch(move, /#pageFrame\(\)/);
});

test("a book turned too near edge-on offers no page to grab", () => {
  // A page a few pixels wide is not something a hand can take hold of, and
  // letting those few pixels of travel snap a whole page over is the opposite
  // of physical — so the pointer goes to the rotation it visually sits in.
  assert.match(controller, /const MIN_GRABBABLE_PAGE_PIXELS = \d+/);
  assert.match(controller, /const grabbable = pageWidth >= MIN_GRABBABLE_PAGE_PIXELS/);
  assert.match(controller, /const overBook = grabbable && this\.#hitTestBook\(/);
});

test("a rotation drag and a page drag are mutually exclusive per pointer", () => {
  // Both handlers gate on the same pointerId that started the gesture, so a
  // second pointer (or the same pointer wandering) cannot hijack the other
  // mode mid-drag.
  assert.match(controller, /this\.#orbitDrag\.pointerId !== event\.pointerId/);
  assert.match(controller, /start\.pointerId !== event\.pointerId/);
});

test("released rotation settles physically instead of springing back to front", () => {
  // No orbit target is ever reset to 0 on pointerup — a real object stays
  // wherever it was set down.
  const pointerUp = controller.slice(
    controller.indexOf("#onPointerUp = "),
    controller.indexOf("#onPointerCancel"),
  );
  assert.doesNotMatch(pointerUp, /\.target = 0/);
  assert.doesNotMatch(pointerUp, /shortestAngleTo/);
});

// Turning a shut book over re-seats it at the other end so it opens from the
// cover now facing you, instead of unwinding the way it came.
test("a shut book turned over opens from the cover now on top", () => {
  const reseat = controller.slice(
    controller.indexOf("#reseatIfTurnedOver() {"),
    controller.indexOf("#takeEdgePreviewForDrag() {"),
  );

  // Fires exactly when the far face has come round. The rule itself lives in
  // orbit.js with the rest of the pure maths, where it is properly tested;
  // what matters here is that the controller asks it rather than re-deriving.
  assert.match(reseat, /facing\(this\.#orbitSpin\.value\) === 1\) return/);

  // Instant re-seat via the progress setter, which clears the engine's step —
  // not currentPage, which would send the book travelling to the far end.
  assert.match(reseat, /this\.#book\.progress = at === 0 \? end : 0/);
  assert.doesNotMatch(reseat, /currentPage =/);

  // The half turn comes out of value and target together, so a spin still in
  // flight keeps both its speed and its distance left to run.
  assert.match(reseat, /this\.#orbitSpin\.value -= half/);
  assert.match(reseat, /this\.#orbitSpin\.target -= half/);
  assert.match(reseat, /const half = reseatHalfTurn\(this\.#orbitSpin\.value\)/);

  // Runs before the spin reaches the rig, so the frame that swaps ends also
  // draws the corrected rotation — otherwise the book would show one frame
  // half a turn out.
  const tick = controller.slice(controller.indexOf("#tick = "));
  assert.ok(
    tick.indexOf("#reseatIfTurnedOver()") < tick.indexOf("rotation.z = this.#orbitSpin.value"),
    "re-seat must run before the rotation is written",
  );
});

test("only a shut, settled, untouched book is ever re-seated", () => {
  const reseat = controller.slice(
    controller.indexOf("#reseatIfTurnedOver() {"),
    controller.indexOf("#takeEdgePreviewForDrag() {"),
  );
  // Mid-spread is still being read.
  assert.match(reseat, /if \(at !== 0 && at !== end\) return/);
  // A turn already asked for parks currentPage at its goal while progress is
  // still at the end it is leaving; re-seating then would hijack it.
  assert.match(reseat, /this\.#book\.currentPage !== at \* 2\) return/);
  // And never out from under a gesture, a load, or a lifted hover preview.
  assert.match(reseat, /this\.#pointerStart \|\| this\.#loading \|\| this\.#edgePreview\.baseSheet !== null/);
});

test("cursor state is scoped to the canvas, not the document", () => {
  // A component meant to be dropped in anywhere on a page must not reach
  // outside its own element for something as visible as the cursor.
  assert.doesNotMatch(controller, /document\.body\.style\.cursor/);
  assert.match(controller, /this\.#canvas\.style\.cursor/);
});

test("the controller owns a single render loop, not two independent RAF chains", () => {
  const rafCalls = controller.match(/requestAnimationFrame/g) ?? [];
  assert.equal(rafCalls.length, 2, "one in requestRender, one in the tick's continuation");
});

test("dispose removes every listener it added and cancels any pending frame", () => {
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"]) {
    assert.match(controller, new RegExp(`removeEventListener\\("${type}"`));
  }
  assert.match(controller, /cancelAnimationFrame/);
});

test("nothing here imports from the app it will be dropped into", () => {
  const imports = [...controller.matchAll(/^import .* from "([^"]+)"/gm)].map((match) => match[1]);
  for (const source of imports) {
    // "three" is a legitimate peer dependency for a Three.js interaction
    // package, the same way main.js itself depends on it — the property
    // this guards is "no knowledge of this app", not "no dependencies".
    assert.ok(
      source === "three" || /^\.\//.test(source),
      `${source} should be a sibling import or the "three" peer dependency`,
    );
  }
});
