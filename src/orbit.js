// Drag-to-orbit mechanics for inspecting the closed book in the round, adapted
// from Ashen Press (~/AshenPress/index.html:963-970, 1477-1483): a critically
// damped spring smooths the pose, one axis is clamped to a tilt range and the
// other spins freely so every side of the book — spine included — comes into
// view.
export const ORBIT_SPIN_SENSITIVITY = 0.0090; // Ashen Press's DRAG.ry coefficient
export const ORBIT_TILT_SENSITIVITY = 0.0062; // Ashen Press's DRAG.rx coefficient
export const ORBIT_TILT_LIMIT = 0.62; // Ashen Press's DRAG.rx clamp, radians

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// The shortest equivalent of `target`, reached by continuing from `current`
// rather than unwinding every full turn accumulated during a long spin — used
// to ease the unbounded spin axis back to flat without a multi-turn wind-back.
export function shortestAngleTo(current, target) {
  const turn = Math.PI * 2;
  const wrapped = (((target - current) % turn) + turn + Math.PI) % turn - Math.PI;
  return current + wrapped;
}

// dx drives the unbounded spin axis (a full 360 turn); dy drives the clamped
// tilt axis. Returns the next {spin, tilt} target pair.
export function nextOrbitTarget({ spin, tilt }, dx, dy) {
  return {
    spin: spin + dx * ORBIT_SPIN_SENSITIVITY,
    tilt: clamp(tilt + dy * ORBIT_TILT_SENSITIVITY, -ORBIT_TILT_LIMIT, ORBIT_TILT_LIMIT),
  };
}

// Same tension/friction/mass as Ashen Press's Spring (index.html:963-970).
export class OrbitSpring {
  constructor(tension = 80, friction = 6, mass = 1) {
    this.tension = tension;
    this.friction = friction;
    this.mass = mass;
    this.value = 0;
    this.velocity = 0;
    this.target = 0;
  }

  set(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  update(dt) {
    const step = Math.min(dt, 1 / 30);
    const acceleration = (this.tension * (this.target - this.value) - this.friction * this.velocity)
      / this.mass;
    this.velocity += acceleration * step;
    this.value += this.velocity * step;
  }

  get settled() {
    return Math.abs(this.target - this.value) < 1e-4 && Math.abs(this.velocity) < 1e-4;
  }
}

// The spine is the flat base the covers hinge off, carrying the front
// cover's own art wrapped around the bound edge — not a separate designed
// object. `bounds` is the closed book's measured extent in the flip book's
// own local space (every sheet hinges on the line at min-X; PassportBook
// opens toward +X). `scaleX` is the flip book's own X-axis scale (the page
// aspect ratio) — it only stretches the book's width, not its thickness.
//
// Which axis carries which measurement is the whole of it. A spine's width
// across the book *is* the page block's thickness — that is what the binder
// cuts it to — and its own height is only the cover board glued to it. The
// previous build had those two swapped: the board thickness went on X and
// the full block thickness on Y, so the strip stood on its long edge at the
// gutter and presented a flat rectangular wall to a camera looking straight
// down at it. Base toward the pages: board on Y, block on X.
// How far the spine's round rises above the joints it runs between, as a
// fraction of its own width — a bound spine is rounded, not a flat plate, and
// that curve is what reads as structure rather than a rectangle pasted into
// the gutter.
const SPINE_ROUND_RATIO = 0.2;

export function spineGeometryFromBounds({ minX, minY, maxY, minZ, maxZ }, scaleX) {
  const thickness = maxY - minY;
  // A spine's width across the book *is* the page block's thickness. Both are
  // unscaled measurements, so the mesh counter-scales `scaleX` back out (see
  // `scaleX` below) rather than pre-dividing here.
  const width = thickness;
  const rise = width * SPINE_ROUND_RATIO;
  // The circular arc through both joints and the crown: chord `width`,
  // sagitta `rise`. Sweeping it along the book's head-to-tail axis gives a
  // surface whose normal turns continuously from one sheet to the other, so
  // the round shades as one curve instead of stepping at a hard edge.
  const radius = ((width * width) / 4 + rise * rise) / (2 * rise);
  const halfSweep = Math.asin(Math.min(1, width / 2 / radius));
  // Both joints — not just the crown — clear the closed cover's own plane by
  // a hairline, so the whole round sits on top of the block and wins the
  // depth test along its full width. Hanging the joints below that plane
  // instead buries whichever half of the round the page stack happens to lie
  // over: the flipped cover drops to the bottom of the stack while the
  // unflipped leaves stay at the top, so the two halves would be occluded
  // unequally and the spine would read as half a strip.
  const clearance = rise * 0.02;
  return {
    thickness,
    width,
    rise,
    radius,
    thetaStart: -halfSweep,
    thetaLength: halfSweep * 2,
    depth: maxZ - minZ,
    // The wrap is textured across its developed arc length, not its chord, so
    // the art runs over the round at the cover's own scale without stretch.
    cropFraction: (radius * halfSweep * 2) / scaleX,
    // Cancels the flip book's page-aspect stretch, which applies to widths
    // and not to thicknesses.
    scaleX: 1 / scaleX,
    // Straddling the hinge line, so a sheet swinging off either side leaves
    // the joint in the same place at every angle — one continuous transition
    // from base into sheet, with nothing standing between them.
    centerX: minX,
    centerZ: (minZ + maxZ) / 2,
    centerY: maxY + clearance + rise - radius,
  };
}
