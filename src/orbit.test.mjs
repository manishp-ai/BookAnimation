import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_TILT_LIMIT,
  OrbitSpring,
  clamp,
  nextOrbitTarget,
  shortestAngleTo,
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
