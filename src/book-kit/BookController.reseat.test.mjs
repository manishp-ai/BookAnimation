import assert from "node:assert/strict";
import test from "node:test";
import { Object3D, OrthographicCamera } from "three";

// The re-seat lives in the render loop, which the browser preview used in
// these sessions cannot reach — it never fires requestAnimationFrame. So the
// controller is driven here instead: the real class, the real orbit spring,
// real frames, and real pointer events through the listeners it registers.
// Nothing is reached into; the only stand-ins are a canvas and a book.
//
// The rest of BookController.test.mjs checks the shape of the source. This
// checks that turning the book over actually does something.

const ORBIT_SPIN_SENSITIVITY = 0.0090; // orbit.js, per pixel dragged

// Mirrors CaseBinding's two setters, which is the part that matters here:
// `progress` re-seats instantly and drags `currentPage` with it, `currentPage`
// is an animation goal and leaves `progress` where it is until it is stepped.
// Telling those two apart is exactly what guards the re-seat.
function fakeBook(leafCount = 90) {
  const end = 2 + leafCount;
  let progress = 0;
  let page = 0;
  return {
    get progress() { return progress; },
    set progress(value) {
      progress = Math.max(0, Math.min(end, value));
      page = Math.floor(progress * 2);
    },
    get currentPage() { return page; },
    set currentPage(value) { page = Math.ceil(value); },
    get totalPages() { return end * 2; },
    get caseWidth() { return 0.6667; },
    get hullMeshes() { return []; }, // nothing to hit: every drag is a rotation
    nextPage() {},
    previousPage() {},
    animate() {},
    [Symbol.iterator]() { return [][Symbol.iterator](); },
  };
}

async function harness() {
  const queue = [];
  globalThis.requestAnimationFrame = (callback) => queue.push(callback);
  globalThis.cancelAnimationFrame = () => {};

  const { BookController } = await import("./BookController.js");

  const listeners = new Map();
  const canvas = {
    style: {},
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  const camera = new OrthographicCamera(-1.1, 1.1, 0.62, -0.62, 0.1, 20);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const book = fakeBook();
  const rig = new Object3D();
  const controller = new BookController({
    canvas, renderer: { render() {} }, scene: {}, camera, rig, book, edgePreview: false,
  });

  let clock = 0;
  const frame = () => {
    const next = queue.shift();
    if (!next) return false;
    clock += 16;
    next(clock);
    return true;
  };
  // Run the loop until it stops asking for frames, recording what each one
  // left behind, so a change can be pinned to the frame that made it.
  const run = (limit = 4000) => {
    const trace = [];
    for (let i = 0; i < limit && frame(); i += 1) {
      trace.push({ progress: book.progress, spin: rig.rotation.z });
    }
    return trace;
  };

  const pointer = (type, x, y) => listeners.get(type)?.({
    type, pointerId: 1, isPrimary: true, pointerType: "mouse",
    clientX: x, clientY: y, preventDefault() {},
  });

  // A rotation drag of `pixels`, which the empty hull guarantees is a rotation
  // and never a page turn.
  const turnBy = (pixels) => {
    pointer("pointerdown", 10, 360);
    for (let i = 1; i <= 10; i += 1) pointer("pointermove", 10 + (pixels * i) / 10, 360);
    pointer("pointerup", 10 + pixels, 360);
    return run();
  };

  const radiansToPixels = (radians) => radians / ORBIT_SPIN_SENSITIVITY;
  return { controller, book, rig, run, turnBy, radiansToPixels };
}

test("a book read to the end, shut and turned over re-seats to open from the top", async () => {
  const { book, turnBy, radiansToPixels } = await harness();
  const end = book.totalPages / 2;

  book.progress = end; // read through, case shut again
  assert.equal(book.currentPage, book.totalPages, "shut at the far cover");

  turnBy(radiansToPixels(Math.PI));
  assert.equal(book.progress, 0, "re-seated at the near cover");
  assert.equal(book.currentPage, 0, "and the page count came with it");
});

test("the same happens at the start, so a shut book always opens from the top", async () => {
  const { book, turnBy, radiansToPixels } = await harness();
  assert.equal(book.progress, 0, "unread");

  turnBy(radiansToPixels(Math.PI));
  assert.equal(book.progress, book.totalPages / 2, "re-seated at the far cover");
});

test("the swap is invisible: the half turn of geometry comes back out of the spin", async () => {
  const { book, turnBy, radiansToPixels } = await harness();
  book.progress = book.totalPages / 2;

  const end = book.totalPages / 2;
  const trace = turnBy(radiansToPixels(Math.PI));
  const swap = trace.findIndex((f, i) => i > 0 && f.progress !== trace[i - 1].progress);
  assert.ok(swap > 0, "the book should have re-seated somewhere in the turn");

  // What the viewer sees is the spin plus whatever half turn the book's own
  // seating contributes — binding-geometry.test.mjs pins down that the shut
  // end pose is the shut start pose half a turn on. If the re-seat is really
  // invisible, that total has to run on smoothly through the swap.
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const seen = (f) => f.spin + (f.progress === end ? Math.PI : 0);
  const jump = Math.abs(wrap(seen(trace[swap]) - seen(trace[swap - 1])));

  // One ordinary frame of a fast spin, not half a turn. The neighbouring
  // frames say what "ordinary" is worth here.
  const ordinary = Math.abs(wrap(seen(trace[swap - 1]) - seen(trace[swap - 2])));
  assert.ok(jump < 0.4, `pose should not leap across the swap, moved ${jump.toFixed(3)}`);
  assert.ok(
    Math.abs(jump - ordinary) < 0.1,
    `the swap frame should move like any other: ${jump.toFixed(3)} vs ${ordinary.toFixed(3)}`,
  );

  // And it lands while the book is edge-on, where there is least to see.
  assert.ok(
    Math.abs(Math.cos(trace[swap].spin)) < 0.35,
    `should swap near edge-on, cos was ${Math.cos(trace[swap].spin).toFixed(3)}`,
  );
});

test("it fires once per half turn, and idling never flips it back and forth", async () => {
  const { controller, book, turnBy, run, radiansToPixels } = await harness();
  book.progress = book.totalPages / 2;

  turnBy(radiansToPixels(Math.PI));
  assert.equal(book.progress, 0);

  controller.requestRender();
  run();
  assert.equal(book.progress, 0, "settled, not oscillating");
});

test("a book caught part-open is left alone, however it is turned", async () => {
  const { book, turnBy, radiansToPixels } = await harness();

  for (const progress of [0.5, 1, 45, 91.5]) {
    book.progress = progress;
    turnBy(radiansToPixels(Math.PI));
    assert.equal(book.progress, progress, `mid-read at ${progress} must not re-seat`);
  }
});

test("a turn the reader already asked for is not hijacked", async () => {
  const { controller, book, turnBy, run, radiansToPixels } = await harness();
  book.progress = book.totalPages / 2;

  turnBy(radiansToPixels(Math.PI));
  assert.equal(book.progress, 0, "turned over, seated at the near cover");

  // Now the reader opens it. `currentPage` jumps to the goal while `progress`
  // is still exactly 0 — the one frame on which a careless re-seat would fling
  // the book to the far end instead of letting the page turn.
  book.currentPage = 2;
  controller.requestRender();
  run();
  assert.equal(book.progress, 0, "progress left where the turn starts from");
  assert.equal(book.currentPage, 2, "and the goal it was given survives");
});
