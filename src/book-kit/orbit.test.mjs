import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_TILT_LIMIT,
  OrbitSpring,
  clamp,
  nextOrbitTarget,
  normalizeTurns,
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

test("the spring moves at the same rate however long the frame was", () => {
  // The old single-step integrator clamped its step and threw the surplus
  // time away, so a stutter left the rotation running slower than the hand
  // that started it — and the slower the frame rate, the further behind it
  // fell. Stepping over the whole elapsed time makes 144fps, 60fps and a
  // dropped-to-20fps frame all land in the same place after a second.
  const poses = [1 / 144, 1 / 60, 1 / 20].map((frame) => {
    const spring = new OrbitSpring();
    spring.target = 1;
    for (let elapsed = 0; elapsed < 1; elapsed += frame) spring.update(frame);
    return spring.value;
  });
  // Within 0.5% of each other — residual substep quantisation, not drift. The
  // clamped integrator spent only two thirds of a 20fps frame, which put it a
  // different part of the overshoot away, not a rounding error away.
  for (const pose of poses) assert.ok(Math.abs(pose - poses[0]) < 5e-3, `${pose} vs ${poses[0]}`);
});

test("a long spin is wound back whole turns at a time, invisibly", () => {
  const turn = Math.PI * 2;
  const spring = new OrbitSpring();
  spring.value = turn * 3 + 0.4;
  spring.target = turn * 3 + 0.9;
  spring.velocity = 0.25;
  normalizeTurns(spring);

  // Same pose, same distance left to travel, same speed — only the bookkeeping
  // changed, so there is nothing for the viewer to see.
  assert.ok(Math.abs(spring.value - 0.4) < 1e-9);
  assert.ok(Math.abs(spring.target - spring.value - 0.5) < 1e-9);
  assert.equal(spring.velocity, 0.25);

  // Inside a turn, nothing is touched at all.
  const settled = new OrbitSpring();
  settled.value = -2;
  settled.target = 1;
  normalizeTurns(settled);
  assert.equal(settled.value, -2);
  assert.equal(settled.target, 1);
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
