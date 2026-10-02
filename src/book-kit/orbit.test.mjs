import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_TILT_LIMIT,
  OrbitSpring,
  clamp,
  facing,
  nextOrbitTarget,
  normalizeTurns,
  reseatHalfTurn,
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

// A shut book turned over has to open from the cover now facing you. Seating
// it at its other end is itself a half turn, so the spin gives that half turn
// back and the swap is invisible. These are the two halves of that rule.
test("which face is toward the camera flips every half turn, at the edge-on moment", () => {
  assert.equal(facing(0), 1, "square on");
  assert.equal(facing(Math.PI), -1, "turned over");
  assert.equal(facing(-Math.PI), -1, "turned over the other way");
  assert.equal(facing(2 * Math.PI), 1, "all the way round");

  // The crossing is a quarter turn out, where the book is edge-on and there
  // is nothing to see change.
  assert.equal(facing(Math.PI / 2 - 0.01), 1);
  assert.equal(facing(Math.PI / 2 + 0.01), -1);
});

test("re-seating always leaves the book the right way up, by the shorter way round", () => {
  // normalizeTurns keeps the spin inside a full turn either side, so that is
  // the range the re-seat has to cope with.
  for (let spin = -6.28; spin <= 6.28; spin += 0.01) {
    if (facing(spin) === 1) continue;           // nothing to do, not turned over
    const half = reseatHalfTurn(spin);
    const after = spin - half;

    // Self-stabilising: one swap is always enough, so it can never loop.
    assert.equal(facing(after), 1, `spin ${spin.toFixed(2)} -> ${after.toFixed(2)}`);
    // And it unwinds by exactly a half turn, taken off the near side — never
    // the long way round.
    assert.ok(Math.abs(half) - Math.PI < 1e-12, "a half turn, no more");
    assert.ok(
      Math.abs(after) <= Math.abs(spin) + 1e-12,
      `${spin.toFixed(2)} should not be sent further from rest`,
    );
  }
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
