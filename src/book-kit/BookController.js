import { Raycaster, Vector2, Vector3 } from "three";
import {
  chooseDragDirection,
  dragFraction,
  edgePreviewDirection,
  edgePreviewPose,
  isActivePointer,
  shouldCompleteDrag,
} from "./drag.js";
import { facing, nextOrbitTarget, normalizeTurns, OrbitSpring, reseatHalfTurn } from "./orbit.js";

const EDGE_PREVIEW_AMOUNT = 0.055;
const EDGE_PREVIEW_ZONE = 28;
const EDGE_PREVIEW_EPSILON = 0.0005;

// Once a rotation has turned the book far enough towards edge-on that a page
// is narrower than this on screen, there is no page left to take hold of: a
// pointer there belongs to the rotation it visually sits in, and letting a
// few pixels of travel snap a whole page over is the opposite of physical.
const MIN_GRABBABLE_PAGE_PIXELS = 44;

// A self-contained gesture layer for a flip-book scene: drag/swipe a page
// where the book is, drag the empty space around it to spin the book in the
// round, and never let one gesture turn into the other once it has started.
//
// `book` is any object shaped like a CaseBinding: get/set `progress`,
// get/set `currentPage`, get `totalPages`, get `caseWidth`, get `hullMeshes`
// (a short list of meshes approximating the book's outer envelope, cheap to
// raycast every pointer move — not its full, possibly-hundreds-of-meshes
// detail), `nextPage()`, `previousPage()`, `animate(delta)`, and iteration
// over its sheets (each sheet exposing `.flip(pageProgress, direction,
// curveIntensity)`) for the edge-hover preview. `rig` is the THREE.Object3D
// whose rotation the 360° drag drives — a plain group the book sits inside,
// not the book itself, so the book's own local transform is left alone.
export class BookController {
  #canvas;
  #renderer;
  #scene;
  #camera;
  #rig;
  #book;
  #reducedMotion;
  #edgePreviewEnabled;
  #onBeforeRender;

  #loading = false;
  #pointerStart = null;
  #orbitDrag = null;
  #orbitSpin = new OrbitSpring();
  #orbitTilt = new OrbitSpring();
  #edgePreview = { baseSheet: null, direction: 0, amount: 0, target: 0 };

  #frame = null;
  #lastFrameTime = 0;

  #raycaster = new Raycaster();
  #pointerNDC = new Vector2();
  #frameOrigin = new Vector3();
  #frameAcross = new Vector3();
  #frameDown = new Vector3();

  constructor({
    canvas,
    renderer,
    scene,
    camera,
    rig,
    book,
    reducedMotion = false,
    edgePreview = true,
    onBeforeRender = null,
  }) {
    this.#canvas = canvas;
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;
    this.#rig = rig;
    this.#book = book;
    this.#reducedMotion = reducedMotion;
    this.#edgePreviewEnabled = edgePreview;
    this.#onBeforeRender = onBeforeRender;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.#onPointerDown);
    canvas.addEventListener("pointermove", this.#onPointerMove);
    canvas.addEventListener("pointerup", this.#onPointerUp);
    canvas.addEventListener("pointercancel", this.#onPointerCancel);
    canvas.addEventListener("pointerleave", this.#onPointerLeave);
  }

  get loading() { return this.#loading; }

  setLoading(value) {
    this.#loading = value;
  }

  // The sheet a hover preview is lifting, or null — lets a host announce the
  // page a preview is showing rather than the page that is still current.
  get previewSheet() { return this.#edgePreview.baseSheet; }

  nextPage() {
    if (this.#loading || this.#book.currentPage >= this.#book.totalPages) return;
    this.#clearEdgePreview(true);
    this.#book.nextPage();
    this.requestRender();
  }

  previousPage() {
    if (this.#loading || this.#book.currentPage <= 0) return;
    this.#clearEdgePreview(true);
    this.#book.previousPage();
    this.requestRender();
  }

  goToStart() {
    this.#clearEdgePreview(true);
    this.#book.currentPage = 0;
    this.requestRender();
  }

  goToEnd() {
    this.#clearEdgePreview(true);
    this.#book.currentPage = this.#book.totalPages;
    this.requestRender();
  }

  // For a host to call after it mutates the book directly (loading a new
  // edition, resetting progress) so the change actually reaches the screen.
  requestRender() {
    if (this.#frame !== null) return;
    this.#lastFrameTime = performance.now();
    this.#frame = requestAnimationFrame(this.#tick);
  }

  // Drops any in-flight gesture and hover preview without animating — for a
  // host switching books out from under an interaction in progress.
  resetInteraction() {
    this.#clearEdgePreview(true);
    this.#pointerStart = null;
    this.#orbitDrag = null;
    this.#canvas.style.cursor = "";
  }

  // Optional convenience: arrow keys / space / Home / End drive the same
  // nextPage/previousPage/goToStart/goToEnd a touch would. Not wired by
  // default — a page embedding several books, or other keyboard-driven UI,
  // should decide for itself what owns the keyboard. Returns an unbind fn.
  bindKeyboard(target = globalThis.window) {
    const handler = (event) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        this.nextPage();
      } else if (event.key === "ArrowLeft") {
        this.previousPage();
      } else if (event.key === "Home") {
        this.goToStart();
      } else if (event.key === "End") {
        this.goToEnd();
      }
    };
    target.addEventListener("keydown", handler);
    return () => target.removeEventListener("keydown", handler);
  }

  dispose() {
    this.#canvas.removeEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.removeEventListener("pointermove", this.#onPointerMove);
    this.#canvas.removeEventListener("pointerup", this.#onPointerUp);
    this.#canvas.removeEventListener("pointercancel", this.#onPointerCancel);
    this.#canvas.removeEventListener("pointerleave", this.#onPointerLeave);
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
  }

  // The book's own page frame as it currently appears on screen: where the
  // gutter sits, and how many canvas pixels one world unit covers along the
  // spine→fore-edge direction (`across`) and the head→tail direction (`down`).
  //
  // Every part of a page gesture is measured in this frame rather than in
  // screen X and Y, because the two only agree while the book faces the
  // camera square-on. Measured here: turned one radian the page covers 314
  // screen pixels per unit instead of 581, so a drag read as raw screen
  // pixels demands nearly twice the travel it should and the page crawls
  // behind the finger; turned past a right angle the axis points the other
  // way (-581 at half a turn), so the same drag runs the page backwards.
  #pageFrame() {
    const bounds = this.#canvas.getBoundingClientRect();
    this.#rig.updateWorldMatrix(true, false);
    const matrix = this.#rig.matrixWorld;
    const halfWidth = bounds.width / 2;
    const halfHeight = bounds.height / 2;

    const origin = this.#frameOrigin.set(0, 0, 0).applyMatrix4(matrix).project(this.#camera);
    const originX = bounds.left + (origin.x + 1) * halfWidth;
    const originY = bounds.top + (1 - origin.y) * halfHeight;

    const across = this.#frameAcross.set(1, 0, 0).applyMatrix4(matrix).project(this.#camera);
    const acrossX = (across.x - origin.x) * halfWidth;
    const acrossY = -(across.y - origin.y) * halfHeight;

    const down = this.#frameDown.set(0, 0, 1).applyMatrix4(matrix).project(this.#camera);
    const downX = (down.x - origin.x) * halfWidth;
    const downY = -(down.y - origin.y) * halfHeight;

    return {
      originX,
      originY,
      acrossX,
      acrossY,
      acrossLength: Math.hypot(acrossX, acrossY),
      downX,
      downY,
      downLength: Math.hypot(downX, downY),
    };
  }

  // A client point in the book's page frame: `along` runs from the gutter out
  // across the pages, `down` from head to tail. The sign of `along` carries
  // what screen X used to — which half of the book the pointer is on — and
  // keeps carrying it at any angle the book has been turned to.
  #toPageSpace(frame, clientX, clientY) {
    const dx = clientX - frame.originX;
    const dy = clientY - frame.originY;
    const acrossLength = frame.acrossLength || 1;
    const downLength = frame.downLength || 1;
    return {
      along: (dx * frame.acrossX + dy * frame.acrossY) / acrossLength,
      down: (dx * frame.downX + dy * frame.downY) / downLength,
    };
  }

  // Whether (clientX, clientY) lands on the book, by asking the scene rather
  // than guessing from a flat screen rectangle. A rectangle sized from the
  // book's un-rotated footprint is only right while the book faces the
  // camera square-on; the moment a 360° drag turns it even a little, the
  // rectangle keeps its old size and shape while the book's true silhouette
  // shrinks and skews inside it — so a point well outside the visible book
  // still reads as "on it". Raycasting has no such rest state to fall out of
  // sync with: it is exactly what's on screen, at whatever angle the book
  // currently sits.
  //
  // Tested against `book.hullMeshes` (the boards and spine), not every mesh
  // under `rig`. This runs on every pointer move while hovering, so it has
  // to be cheap: the full leaf stack is ~45x the triangles of the two boards
  // and spine for a result they already give, since a leaf never reaches
  // outside what the covers bound.
  #hitTestBook(clientX, clientY) {
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return false;
    this.#pointerNDC.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointerNDC, this.#camera);
    return this.#raycaster.intersectObjects(this.#book.hullMeshes, false).length > 0;
  }

  #onPointerDown = (event) => {
    if (!event.isPrimary || this.#loading) return;

    const frame = this.#pageFrame();
    const pageWidth = frame.acrossLength * this.#book.caseWidth;
    const grabbable = pageWidth >= MIN_GRABBABLE_PAGE_PIXELS;
    const overBook = grabbable && this.#hitTestBook(event.clientX, event.clientY);
    const previewActive = this.#edgePreview.baseSheet !== null && this.#edgePreview.target !== 0;

    // Empty space starts a rotation, the book starts a page turn — decided
    // once, here, for the life of this pointer. Nothing later in the
    // gesture re-checks which side of that line the pointer is on, so a
    // drag begun on one can never hand off to the other mid-motion.
    if (!overBook) {
      if (previewActive) this.#clearEdgePreview(true);
      this.#orbitDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      this.#canvas.style.cursor = "grabbing";
      this.requestRender();
      this.#capture(event.pointerId);
      return;
    }

    const sheet = previewActive ? this.#edgePreview.baseSheet : Math.round(this.#book.progress);
    const maxSheet = Math.ceil(this.#book.totalPages / 2);
    const preview = this.#takeEdgePreviewForDrag();
    if (!preview) this.#clearEdgePreview(true);
    const settled = preview !== null || Math.abs(this.#book.progress - sheet) < 0.001;
    const grab = this.#toPageSpace(frame, event.clientX, event.clientY);

    this.#pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      sheet,
      maxSheet,
      pageWidth,
      // The page axis is frozen for the gesture's lifetime, which costs
      // nothing in accuracy: a gesture that began on the book is locked to
      // the page, so no rotation can turn the book under it mid-drag.
      axisX: frame.acrossX / (frame.acrossLength || 1),
      axisY: frame.acrossY / (frame.acrossLength || 1),
      grabAlong: grab.along,
      direction: preview?.direction ?? chooseDragDirection(sheet, maxSheet, grab.along, 0),
      dragReady: settled,
      dragging: false,
      startFraction: preview?.fraction ?? 0,
      fraction: preview?.fraction ?? 0,
      pendingFraction: null,
    };
    this.#capture(event.pointerId);
  };

  // Capture is an optimisation — it keeps a drag alive when the pointer wanders
  // off the canvas — and it is allowed to fail: the browser throws if the
  // pointer went up between the event being queued and this running. Letting
  // that escape would abandon the handler part-way through, so the gesture is
  // always fully set up and rendering before this is attempted.
  #capture(pointerId) {
    try {
      this.#canvas.setPointerCapture?.(pointerId);
    } catch {
      /* pointer already gone; the gesture still works, just uncaptured */
    }
  }

  #release(pointerId) {
    try {
      if (this.#canvas.hasPointerCapture?.(pointerId)) this.#canvas.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
  }

  #onPointerMove = (event) => {
    if (this.#orbitDrag) {
      if (this.#orbitDrag.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.#orbitDrag.x;
      const dy = event.clientY - this.#orbitDrag.y;
      this.#orbitDrag.x = event.clientX;
      this.#orbitDrag.y = event.clientY;
      const next = nextOrbitTarget(
        { spin: this.#orbitSpin.target, tilt: this.#orbitTilt.target },
        dx,
        dy,
      );
      this.#orbitSpin.target = next.spin;
      this.#orbitTilt.target = next.tilt;
      this.requestRender();
      return;
    }

    const start = this.#pointerStart;
    if (!start) {
      const overBook = this.#hitTestBook(event.clientX, event.clientY);
      if (this.#edgePreviewEnabled) this.#updateEdgePreview(event, overBook);
      this.#canvas.style.cursor = overBook ? "" : "grab";
      return;
    }
    if (start.pointerId !== event.pointerId || !start.dragReady || this.#loading) return;

    // Along and across the page, not across the screen — so the test for "is
    // this a page drag or a scroll?" asks about the page the pointer is on.
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const along = deltaX * start.axisX + deltaY * start.axisY;
    const across = deltaY * start.axisX - deltaX * start.axisY;
    if (!start.dragging) {
      if (Math.abs(along) < 6) return;
      if (Math.abs(across) > Math.abs(along) * 1.15) {
        start.dragReady = false;
        return;
      }
    }

    const fraction = dragFraction(along, start.direction, start.pageWidth, start.startFraction);
    if (!start.dragging && fraction === 0) return;

    start.dragging = true;
    start.fraction = fraction;
    start.pendingFraction = fraction;
    event.preventDefault();
    this.requestRender();
  };

  #onPointerUp = (event) => {
    if (this.#orbitDrag) {
      if (this.#orbitDrag.pointerId !== event.pointerId) return;
      this.#release(event.pointerId);
      this.#orbitDrag = null;
      this.#canvas.style.cursor = "";
      return;
    }

    const start = this.#pointerStart;
    if (!isActivePointer(start, event.pointerId)) return;

    this.#pointerStart = null;
    this.#release(event.pointerId);
    if (this.#loading) return;

    if (start.dragging) {
      start.fraction = dragFraction(
        (event.clientX - start.x) * start.axisX + (event.clientY - start.y) * start.axisY,
        start.direction,
        start.pageWidth,
        start.startFraction,
      );
      const elapsed = performance.now() - start.time;
      const complete = shouldCompleteDrag(start.fraction, elapsed);
      const targetSheet = start.sheet + (complete ? start.direction : 0);
      this.#book.currentPage = targetSheet * 2;
      this.requestRender();
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const along = deltaX * start.axisX + deltaY * start.axisY;
    const across = deltaY * start.axisX - deltaX * start.axisY;
    const elapsed = performance.now() - start.time;

    if (Math.abs(along) > 36 && Math.abs(along) > Math.abs(across)) {
      along < 0 ? this.nextPage() : this.previousPage();
    } else if (elapsed < 500 && Math.abs(across) < 20) {
      // Tap-to-turn reads which half of the book was tapped, measured from
      // the gutter in the book's own frame and recorded at pointerdown — so
      // it stays the half you touched however the book has been turned.
      start.grabAlong < 0 ? this.previousPage() : this.nextPage();
    } else if (start.startFraction > 0) {
      this.#book.currentPage = start.sheet * 2;
      this.requestRender();
    }
  };

  #onPointerCancel = (event) => {
    if (this.#orbitDrag) {
      if (this.#orbitDrag.pointerId === event.pointerId) {
        this.#orbitDrag = null;
        this.#canvas.style.cursor = "";
      }
      return;
    }
    if (!isActivePointer(this.#pointerStart, event.pointerId)) return;

    // Also restores a consumed hover pose when the pointer is cancelled
    // before the drag threshold is crossed.
    this.#book.currentPage = this.#pointerStart.sheet * 2;
    this.#pointerStart = null;
    this.requestRender();
  };

  #onPointerLeave = () => {
    if (this.#orbitDrag) return;
    if (!this.#pointerStart) this.#clearEdgePreview();
  };

  #clearEdgePreview(immediate = false) {
    if (this.#edgePreview.baseSheet === null) return;
    this.#edgePreview.target = 0;
    if (!immediate) {
      this.requestRender();
      return;
    }

    this.#book.progress = this.#edgePreview.baseSheet;
    this.#edgePreview.baseSheet = null;
    this.#edgePreview.direction = 0;
    this.#edgePreview.amount = 0;
    this.requestRender();
  }

  #updateEdgePreview(event, overBook) {
    if (
      this.#reducedMotion
      || this.#loading
      || this.#pointerStart
      || event.pointerType === "touch"
      || !overBook
    ) return;

    const previewActive = this.#edgePreview.baseSheet !== null;
    const sheet = previewActive ? this.#edgePreview.baseSheet : Math.round(this.#book.progress);
    if (!previewActive && Math.abs(this.#book.progress - sheet) >= 0.001) return;

    const frame = this.#pageFrame();
    const pageWidth = frame.acrossLength * this.#book.caseWidth;
    if (pageWidth < MIN_GRABBABLE_PAGE_PIXELS) {
      this.#clearEdgePreview();
      return;
    }

    const point = this.#toPageSpace(frame, event.clientX, event.clientY);
    const maxSheet = Math.ceil(this.#book.totalPages / 2);
    const direction = edgePreviewDirection({
      sheet,
      maxSheet,
      // Page space: the fore-edge the preview lifts is a fixed distance from
      // the gutter along the page, wherever the rotation has put it on screen.
      pointerX: point.along,
      pointerY: point.down,
      centerX: 0,
      centerY: 0,
      pageWidth,
      pageHeight: frame.downLength,
      edgeZone: EDGE_PREVIEW_ZONE,
    });

    if (direction === 0) {
      this.#clearEdgePreview();
      return;
    }

    if (previewActive && this.#edgePreview.direction !== direction) this.#clearEdgePreview(true);
    this.#edgePreview.baseSheet = sheet;
    this.#edgePreview.direction = direction;
    this.#edgePreview.target = EDGE_PREVIEW_AMOUNT;
    this.requestRender();
  }

  #animateEdgePreview(delta) {
    if (this.#edgePreview.baseSheet === null) return false;

    const easing = this.#edgePreview.target > this.#edgePreview.amount ? 18 : 14;
    const blend = 1 - Math.exp(-easing * delta);
    this.#edgePreview.amount += (this.#edgePreview.target - this.#edgePreview.amount) * blend;

    if (Math.abs(this.#edgePreview.target - this.#edgePreview.amount) < EDGE_PREVIEW_EPSILON) {
      this.#edgePreview.amount = this.#edgePreview.target;
    }

    if (this.#edgePreview.target === 0 && this.#edgePreview.amount === 0) {
      this.#book.progress = this.#edgePreview.baseSheet;
      this.#edgePreview.baseSheet = null;
      this.#edgePreview.direction = 0;
      this.#edgePreview.amount = 0;
      return false;
    }

    const maxSheet = Math.ceil(this.#book.totalPages / 2);
    const pose = edgePreviewPose(
      this.#edgePreview.baseSheet,
      this.#edgePreview.direction,
      this.#edgePreview.amount,
      maxSheet,
    );
    if (!pose) {
      this.#clearEdgePreview(true);
      return false;
    }

    // Once the lift reaches its target, keep the already-deformed geometry
    // and stop feeding the modifier stack identical poses on every frame.
    if (
      this.#edgePreview.target > 0
      && this.#edgePreview.amount === this.#edgePreview.target
      && Math.abs(this.#book.progress - pose.progress) < EDGE_PREVIEW_EPSILON
    ) {
      if (this.#book.progress !== pose.progress) this.#book.progress = pose.progress;
      return false;
    }

    this.#book.progress = pose.progress;
    if (this.#edgePreview.target === 0) {
      let sheetIndex = 0;
      for (const sheet of this.#book) {
        if (sheetIndex === pose.sheetIndex) {
          // The engine derives bend direction from progress velocity. During
          // a hover return that would invert the curl, so preserve the
          // lift's bend.
          sheet.flip(pose.pageProgress, this.#edgePreview.direction, pose.curveIntensity);
          break;
        }
        sheetIndex += 1;
      }
    }
    return this.#edgePreview.amount !== this.#edgePreview.target;
  }

  // A book you have read to the end, shut, and then turned over should open
  // from the cover now facing you — not unwind the way it came.
  //
  // The two shut poses are the same book half a turn apart: every angle in the
  // closed-at-the-end pose is the closed-at-the-start pose plus π, and every
  // joint sits at the negation of where it started. (x, y) -> (-x, -y) IS a
  // half turn about the axis the 360° drag spins, so seating the book at the
  // other end and taking that same half turn back out of the spin lands on a
  // pose identical to the one already on screen — same silhouette, same hinge
  // side, same cover facing you. Nothing moves; the book is simply now the
  // right way round to open, and the ordinary forward controls do the rest.
  //
  // It costs one comparison per frame and it is self-stabilising: after the
  // swap the book is no longer turned over, so it cannot fire twice. Keep
  // spinning and it fires again every half turn, which is correct, because
  // every half turn genuinely does turn the book over.
  #reseatIfTurnedOver() {
    // Shut, at one end or the other. A book caught mid-spread is still being
    // read — Boss was explicit that this is only for a book that is closed.
    const end = this.#book.totalPages / 2;
    const at = this.#book.progress;
    if (at !== 0 && at !== end) return;
    // A turn already under way parks `currentPage` at its goal while
    // `progress` is still at the end it is leaving; re-seating on that frame
    // would hijack the turn the reader just asked for.
    if (this.#book.currentPage !== at * 2) return;
    if (this.#pointerStart || this.#loading || this.#edgePreview.baseSheet !== null) return;
    if (facing(this.#orbitSpin.value) === 1) return;

    // Instant, not animated: the progress setter clears the engine's step, so
    // this re-seats the book rather than sending it travelling to the far end.
    this.#book.progress = at === 0 ? end : 0;
    // Out of the value and the target together, so a spin still in flight
    // keeps both its speed and its distance left to run. Signed, so the half
    // turn comes off the near side rather than winding the long way round.
    const half = reseatHalfTurn(this.#orbitSpin.value);
    this.#orbitSpin.value -= half;
    this.#orbitSpin.target -= half;
  }

  #takeEdgePreviewForDrag() {
    if (this.#edgePreview.baseSheet === null || this.#edgePreview.target === 0) return null;

    const preview = {
      sheet: this.#edgePreview.baseSheet,
      direction: this.#edgePreview.direction,
      fraction: this.#edgePreview.amount,
    };
    // Keep book.progress and the current curl exactly where the hover left
    // them; pointer movement takes ownership of that pose on the next frame.
    this.#edgePreview.baseSheet = null;
    this.#edgePreview.direction = 0;
    this.#edgePreview.amount = 0;
    this.#edgePreview.target = 0;
    return preview;
  }

  #applyDragFrame() {
    const start = this.#pointerStart;
    if (!start?.dragging) return false;
    if (start.pendingFraction === null) return true;

    this.#book.progress = start.sheet + start.direction * start.pendingFraction;
    start.pendingFraction = null;
    return true;
  }

  #tick = (timestamp) => {
    this.#frame = null;
    const delta = Math.min((timestamp - this.#lastFrameTime) / 1000, 0.04);
    this.#lastFrameTime = timestamp;

    this.#orbitSpin.update(delta);
    this.#orbitTilt.update(delta);
    normalizeTurns(this.#orbitSpin);
    this.#reseatIfTurnedOver();
    this.#rig.rotation.z = this.#orbitSpin.value;
    this.#rig.rotation.x = this.#orbitTilt.value;

    const previousProgress = this.#book.progress;
    const dragOwnsFrame = this.#applyDragFrame();
    if (!dragOwnsFrame) this.#book.animate(delta);
    const previewNeedsFrame = this.#edgePreviewEnabled ? this.#animateEdgePreview(delta) : false;

    this.#onBeforeRender?.(delta);
    this.#renderer.render(this.#scene, this.#camera);

    const progressChanged = Math.abs(previousProgress - this.#book.progress) > 1e-7;
    // No spring ever forces the book back to front-on when a rotation drag
    // ends — like setting down a real object, it stays where it was left.
    // This keeps the loop alive only while the spring is still catching up
    // to wherever the pointer last put it.
    const orbitSettling = this.#orbitDrag !== null || !this.#orbitSpin.settled || !this.#orbitTilt.settled;
    if (previewNeedsFrame || (!dragOwnsFrame && progressChanged) || orbitSettling) {
      this.#frame = requestAnimationFrame(this.#tick);
    }
  };
}
