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

// Geometry of the arc these tests describe, in the flip book's own local
// space: a circular cross-section of `radius` centred at (centerX, centerY),
// swept from thetaStart through thetaLength, with theta measured from the
// crown (+Y) toward +X. The crown is the highest point; the two joints are
// its ends, and they are where the sheets hinge.
const spinePoint = (spine, theta) => ({
  x: spine.centerX + spine.radius * Math.sin(theta),
  y: spine.centerY + spine.radius * Math.cos(theta),
});
const spineJoints = (spine) => [
  spinePoint(spine, spine.thetaStart),
  spinePoint(spine, spine.thetaStart + spine.thetaLength),
];
const spineCrown = (spine) => spinePoint(spine, spine.thetaStart + spine.thetaLength / 2);

test("the spine's width across the book is the page block's real measured thickness", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  assert.ok(Math.abs(spine.thickness - 0.036) < 1e-9, "thickness is the book's real page-stack extent, not a constant");
  assert.ok(Math.abs(spine.depth - 1.0) < 1e-9, "depth reaches head to tail, ending exactly at the cover's top and bottom");
  // A binder cuts a spine to the width of the block it binds. The previous
  // build put the board thickness on this axis and the block thickness on
  // Y, which stood the strip on its long edge as a wall facing the camera.
  const [left, right] = spineJoints(spine);
  assert.ok(
    Math.abs((right.x - left.x) - spine.thickness) < 1e-9,
    "joint to joint spans the real page-stack thickness, not a sliver of it",
  );
});

test("the spine lies base-down: its round rises far less than it spans", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  const [left] = spineJoints(spine);
  const rise = spineCrown(spine).y - left.y;
  assert.ok(rise > 0, "the round crowns above its joints rather than lying dead flat");
  assert.ok(
    rise < spine.width * 0.5,
    "base toward the pages: the round rises well under half its own span, so it never presents a wall",
  );
});

test("the sheets hinge off the spine's two joints, one on each side of the hinge line", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  const [left, right] = spineJoints(spine);
  assert.ok(left.x < bounds.minX, "one joint sits outboard of the hinge line");
  assert.ok(right.x > bounds.minX, "the other sits inboard of it");
  assert.ok(
    Math.abs((left.x + right.x) / 2 - bounds.minX) < 1e-9,
    "the round straddles the hinge line, so the joint lands in the same place whichever way a sheet swings",
  );
});

test("scaleX only stretches the book's width, so the spine counter-scales it back out", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const scaleX = 0.6667;
  const stretched = spineGeometryFromBounds(bounds, scaleX);
  const square = spineGeometryFromBounds(bounds, 1);
  assert.ok(
    Math.abs(stretched.width - square.width) < 1e-9,
    "the width is a thickness, so the page aspect ratio must not change it",
  );
  assert.ok(
    Math.abs(stretched.scaleX * scaleX - 1) < 1e-9,
    "the mesh's own X scale cancels the flip book's page-aspect stretch exactly",
  );
  assert.ok(
    Math.abs(stretched.cropFraction * scaleX - square.cropFraction) < 1e-9,
    "the art crop is taken in page-width units, so it counter-scales with it",
  );
});

test("both joints clear the cover plane, so neither half of the round is buried by the page stack", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  const [left, right] = spineJoints(spine);
  // A flipped sheet drops to the bottom of the stack while unflipped leaves
  // stay at the top. A round hanging below the cover plane is therefore
  // occluded unequally on its two sides and reads as half a strip, so both
  // joints — not just the crown — have to win the depth test.
  assert.ok(left.y > bounds.maxY, "the outboard joint is proud of the cover plane");
  assert.ok(right.y > bounds.maxY, "so is the inboard one");
  assert.ok(
    spineCrown(spine).y - bounds.maxY < spine.thickness * 0.5,
    "the whole round still hugs the cover: its crown is a fraction of the block, not a bump on top of it",
  );
});

test("the art is cropped to the arc's developed length, so it wraps the round without stretching", () => {
  const bounds = { minX: 0, minY: -0.036, maxY: 0, minZ: -0.5, maxZ: 0.5 };
  const spine = spineGeometryFromBounds(bounds, 1);
  const arcLength = spine.radius * spine.thetaLength;
  assert.ok(
    Math.abs(spine.cropFraction - arcLength) < 1e-9,
    "the crop follows the surface the texture actually covers, not the chord beneath it",
  );
  assert.ok(arcLength > spine.width, "a curved surface is longer than the straight line across it");
});

test("page count changes the spine's thickness, since it's a real measurement, not a fixed hinge", () => {
  const thin = spineGeometryFromBounds({ minX: 0, minY: -0.02, maxY: 0, minZ: -0.5, maxZ: 0.5 }, 1);
  const thick = spineGeometryFromBounds({ minX: 0, minY: -0.2, maxY: 0, minZ: -0.5, maxZ: 0.5 }, 1);
  assert.ok(thick.thickness > thin.thickness, "more leaves in the stack means a thicker, honestly-measured spine");
});
