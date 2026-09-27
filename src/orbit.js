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

// The spine is nothing but the front cover's own art, cropped to a sliver
// exactly as wide as the book's own measured thickness — not a separate
// designed object. `bounds` is the closed book's measured extent in the flip
// book's own local space (the hinge sits at min-X; PassportBook opens toward
// +X, so that's the fixed edge the spine sits flush against). `scaleX` is
// the flip book's own X-axis scale (the page aspect ratio) — it only
// stretches the book's width, not its thickness.
//
// The two cross-axes read very differently: Y is the book's real, honest
// page-stack thickness (how many leaves are inside — it should stay exactly
// that, unshrunk). X is only ever seen edge-on, standing in for "how wide is
// the flat wrap of cover material" — sizing it to equal the real thickness
// made the two axes equal, which reads as a chunky square rod instead of a
// thin flat sheet the pages are glued to. Keeping X a small fraction of the
// real thickness is what makes it read as flat.
const SPINE_FLATNESS = 0.2; // X-width as a fraction of the real Y-thickness

export function spineGeometryFromBounds({ minX, minY, maxY, minZ, maxZ }, scaleX) {
  const thickness = maxY - minY;
  const widthLocal = (thickness * SPINE_FLATNESS) / scaleX;
  // Y is this scene's top-down camera's own viewing axis, and the open
  // pages' own geometry reaches all the way to the hinge at Y values inside
  // this same envelope — so a box with the same span ties in the depth test
  // almost everywhere and the opaque page wins, hiding the spine under
  // itself. The fix is a hairline of overhang at the *top* only, winning
  // that tie — not floating the whole box above the envelope, which would
  // detach it from the cover's real position and read as misplaced in the
  // closed/rotated exterior view. The bottom face stays flush at the real
  // minY, exactly where the cover's own edge is.
  const clearance = thickness * 0.05;
  const boxHeight = thickness + clearance;
  return {
    thickness,
    widthLocal,
    boxHeight,
    depth: maxZ - minZ,
    centerX: minX + widthLocal / 2,
    centerZ: (minZ + maxZ) / 2,
    centerY: minY + boxHeight / 2,
  };
}
