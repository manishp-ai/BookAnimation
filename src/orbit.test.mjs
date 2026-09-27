import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_TILT_LIMIT,
  OrbitSpring,
  clamp,
  nextOrbitTarget,
  shortestAngleTo,
  spineGeometryFromBounds,
} from "./orbit.js";

test("clamp bounds a value to a range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(50, 0, 10), 10);
});

test("horizontal drag spins without limit, vertical drag tilts within Ashen Press's clamp", () => {
  const target = nextOrbitTarget({ spin: 0, tilt: 0 }, 1000, 0);
  assert.ok(target.spin > Math.PI * 2, "a long horizontal drag should carry past one full turn");
  assert.equal(target.tilt, 0);

  const tilted = nextOrbitTarget({ spin: 0, tilt: 0 }, 0, 400);
  assert.equal(tilted.tilt, ORBIT_TILT_LIMIT);

  const tiltedNegative = nextOrbitTarget({ spin: 0, tilt: 0 }, 0, -400);
  assert.equal(tiltedNegative.tilt, -ORBIT_TILT_LIMIT);
});

test("the orbit spring settles on its target", () => {
  const spring = new OrbitSpring();
  spring.target = 1;
  assert.equal(spring.settled, false);
  for (let i = 0; i < 240; i += 1) spring.update(1 / 60);
  assert.ok(spring.settled);
  assert.ok(Math.abs(spring.value - 1) < 1e-3);
});

test("set() snaps the spring immediately with no residual velocity", () => {
  const spring = new OrbitSpring();
  spring.target = 5;
  spring.update(1 / 60);
  spring.set(2);
  assert.equal(spring.value, 2);
  assert.equal(spring.target, 2);
  assert.equal(spring.velocity, 0);
});

test("returning to flat takes the short way, not a multi-turn wind-back", () => {
  const turn = Math.PI * 2;
  for (const current of [turn * 2 + 0.2, -turn * 1.5 - 0.3, 0.1, -7, 20]) {
    const result = shortestAngleTo(current, 0);
    const stepsFromZero = result / turn;
    assert.ok(
      Math.abs(stepsFromZero - Math.round(stepsFromZero)) < 1e-9,
      `${result} should be a whole number of turns away from the target`,
    );
    assert.ok(
      Math.abs(result - current) <= Math.PI + 1e-9,
      `${result} should be within half a turn of ${current}`,
    );
  }
  assert.ok(Math.abs(shortestAngleTo(0.1, 0)) < 1e-9, "a small offset settles exactly at the target");
});

test("the spine's thickness is the book's real measured page-stack extent, flush at the hinge", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  assert.ok(Math.abs(spine.thickness - 0.036) < 1e-9, "thickness is the book's real page-stack extent, not a constant");
  assert.ok(Math.abs(spine.depth - 1.0) < 1e-9, "depth reaches head to tail, ending exactly at the cover's top and bottom");
  assert.equal(spine.centerX - spine.widthLocal / 2, 0, "the outer face sits flush at the hinge, never past it");
});

test("the spine reads as a flat sheet, not a square rod: its top-down width is a small fraction of its real thickness", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  assert.ok(spine.widthLocal < spine.thickness * 0.5, "flat, not square: width is well under half the thickness");
});

test("scaleX only stretches the book's width, so the spine's top-down width is counter-scaled to keep its true fraction of the side thickness", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const scaleX = 0.6667;
  const narrowed = spineGeometryFromBounds(bounds, scaleX);
  const flat = spineGeometryFromBounds(bounds, 1);
  assert.ok(
    Math.abs(narrowed.widthLocal * scaleX - flat.widthLocal) < 1e-9,
    "the local width, once scaled back down by scaleX, reads as the same on-screen flatness regardless of the page aspect ratio",
  );
});

test("the spine's bottom face is flush with the real cover edge, with only a hairline of overhang at the top to win the top-down depth test", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  const bottom = spine.centerY - spine.boxHeight / 2;
  const top = spine.centerY + spine.boxHeight / 2;
  assert.ok(Math.abs(bottom - bounds.minY) < 1e-9, "flush at the real minY, not floating above the cover");
  assert.ok(top > bounds.maxY, "a hairline proud of maxY, enough to win the depth test against the opaque page");
  assert.ok(top - bounds.maxY < spine.thickness * 0.5, "the overhang is a sliver, not a visible bump");
});

test("page count changes the spine's thickness, since it's a real measurement, not a fixed hinge", () => {
  const thin = spineGeometryFromBounds({ minX: 0, minY: -0.02, maxY: 0, minZ: -0.5, maxZ: 0.5 }, 1);
  const thick = spineGeometryFromBounds({ minX: 0, minY: -0.2, maxY: 0, minZ: -0.5, maxZ: 0.5 }, 1);
  assert.ok(thick.thickness > thin.thickness, "more leaves in the stack means a thicker, honestly-measured spine");
});
