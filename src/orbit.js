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
