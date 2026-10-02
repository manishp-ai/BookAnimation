import assert from "node:assert/strict";
import test from "node:test";
import {
  bindingPose,
  bindingSteps,
  caseDimensions,
  caseExtent,
  caseLift,
  centringOffset,
  frontCoverAngle,
  gutterDisplacement,
  gutterProfile,
  gutterRange,
  gutterRise,
  jointPosition,
  leafAnchor,
  leafAnchorHeight,
  leafLift,
  restHeight,
  spineRollAngle,
  turnedHeight,
} from "./binding-geometry.js";

// The passport's own measurements, so the numbers below are the shipped ones.
const EDITION = {
  caseWidth: 0.6667,
  caseHeight: 1,
  thickness: 0.036,
  coverThickness: 0.0032,
  leafCount: 90,
};
const dimensions = caseDimensions(EDITION);
const OPEN = Math.PI / 2;
const near = (a, b, tolerance = 1e-12) => Math.abs(a - b) < tolerance;

test("spine width is the text block plus both covers, and the case keeps its finished thickness", () => {
  assert.equal(dimensions.spineWidth, EDITION.thickness);
  assert.ok(
    near(dimensions.textBlockThickness + 2 * EDITION.coverThickness, dimensions.spineWidth),
    "spine width == text block + 2 x cover thickness",
  );
  assert.ok(
    dimensions.textBlockThickness < dimensions.spineWidth,
    "adding covers takes room from the text block rather than growing the case",
  );
});

test("the case is exactly as wide overall as the edition's page ratio", () => {
  assert.ok(near(EDITION.coverThickness + dimensions.boardWidth, EDITION.caseWidth));
});

// The square: the lip of board that overhangs the text block on the three
// edges that are not the hinge. Leaves used to be cut flush with the boards,
// which meant a leaf's edge and a board's edge were the same line in space —
// so any curl at all (and every leaf here carries some) put leaf vertices
// outside the board's silhouette and the pages showed through the cover.
test("the boards overhang the text block on every edge but the hinge", () => {
  assert.ok(dimensions.square > 0, "there is a square at all");
  assert.ok(
    near(dimensions.boardWidth - dimensions.leafWidth, dimensions.square),
    "one square off the fore edge",
  );
  assert.ok(
    near(EDITION.caseHeight - dimensions.leafHeight, dimensions.square * 2),
    "one square off the head and one off the tail",
  );
  // A passport-sized square: a couple of millimetres on a 125mm book, stated
  // as a fraction of page height so it scales with the edition.
  assert.ok(dimensions.square / EDITION.caseHeight < 0.03, "a lip, not a margin");
});

test("the square cannot be set so deep that it eats the text block", () => {
  const absurd = caseDimensions({ ...EDITION, square: 99 });
  assert.ok(absurd.leafWidth > 0 && absurd.leafHeight > 0);
  assert.ok(absurd.square <= absurd.boardWidth / 2);

  const none = caseDimensions({ ...EDITION, square: 0 });
  assert.equal(none.leafWidth, none.boardWidth, "opting out still gives flush leaves");
  assert.equal(none.leafHeight, EDITION.caseHeight);
});

test("a thicker cover leaves a thinner text block, never a thicker book", () => {
  const thick = caseDimensions({ ...EDITION, coverThickness: 0.006 });
  assert.equal(thick.spineWidth, EDITION.thickness);
  assert.ok(thick.textBlockThickness < dimensions.textBlockThickness);
});

test("a text block with no room for itself is rejected rather than built inside out", () => {
  assert.throws(() => caseDimensions({ ...EDITION, coverThickness: 0.02 }), RangeError);
  assert.throws(() => caseDimensions({ ...EDITION, leafCount: 0 }), RangeError);
});

test("the spine stands on edge closed and lies flat open, and never anywhere else", () => {
  assert.equal(spineRollAngle(0), 0, "closed: standing at the binding edge");
  assert.equal(spineRollAngle(1), OPEN, "open: rolled a quarter turn onto its printed face");
  assert.equal(spineRollAngle(0.5), OPEN / 2);
  assert.equal(spineRollAngle(4), OPEN, "clamped — it cannot keep rolling");
  assert.equal(spineRollAngle(-1), 0);
});

test("the joints are the spine's own long edges, one spine width apart, and ride it down", () => {
  const front = jointPosition(dimensions, "front", 0);
  const back = jointPosition(dimensions, "back", 0);
  assert.ok(near(front.x, dimensions.innerFaceX) && near(back.x, dimensions.innerFaceX),
    "both joints sit on the spine's inner face");
  assert.ok(near(front.y - back.y, dimensions.spineWidth), "a spine width apart");

  const openFront = jointPosition(dimensions, "front", OPEN);
  const openBack = jointPosition(dimensions, "back", OPEN);
  assert.ok(near(openFront.y, dimensions.coverThickness), "front joint comes down to the table");
  assert.ok(near(openBack.y, dimensions.coverThickness), "back joint comes down to the table");
  assert.ok(openFront.x < openBack.x, "the front joint swings out to the left of the back one");
  assert.ok(near(openBack.x - openFront.x, dimensions.spineWidth), "still a spine width apart");
});

test("every leaf anchors on the spine's inner face, in stack order, inside the text block band", () => {
  let previous = Infinity;
  for (let index = 0; index < dimensions.leafCount; index += 1) {
    const anchor = leafAnchor(dimensions, index);
    assert.equal(anchor.x, dimensions.innerFaceX, `leaf ${index} is bound to the inner face`);
    assert.ok(anchor.y < previous, `leaf ${index} anchors behind leaf ${index - 1}`);
    assert.ok(
      anchor.y > dimensions.coverThickness
      && anchor.y < dimensions.coverThickness + dimensions.textBlockThickness,
      `leaf ${index} anchor stays between the two covers`,
    );
    previous = anchor.y;
  }
});

test("an anchor never moves relative to the spine, however far the spine has rolled", () => {
  for (const index of [0, 17, 89]) {
    const first = leafAnchor(dimensions, index);
    for (const angle of [0, 0.3, OPEN]) {
      const again = leafAnchor(dimensions, index);
      assert.deepEqual(again, first, "the anchor is a property of the binding, not the pose");
      assert.equal(Number.isFinite(leafAnchorHeight(dimensions, index, angle)), true);
    }
  }
});

test("open, every leaf is anchored at the same height — along the spine now lying flat", () => {
  const expected = dimensions.coverThickness;
  for (const index of [0, 45, 89]) {
    assert.ok(near(leafAnchorHeight(dimensions, index, OPEN), expected, 1e-12));
  }
  // ...and spread across its width instead, first leaf nearest the front joint.
  assert.ok(
    leafAnchor(dimensions, 0).y > leafAnchor(dimensions, 89).y,
    "stack order runs front joint to back joint",
  );
});

test("a closed book is a flat stack: no leaf flexes at all", () => {
  for (let index = 0; index < dimensions.leafCount; index += 1) {
    assert.ok(near(gutterRise(dimensions, index, 0, 0), 0, 1e-12), `leaf ${index} lies flat`);
    assert.ok(near(gutterRise(dimensions, index, 0, 0.4), 0, 1e-12), "the lift begins at the half turn");
  }
});

test("opening the book is what lifts the leaves out of the gutter", () => {
  // The outermost leaf has the longest climb — from the far end of the flat
  // spine up to the top of the pile — and the innermost barely moves.
  const outer = gutterRise(dimensions, 0, OPEN, 0);
  const inner = gutterRise(dimensions, 89, OPEN, 0);
  assert.ok(outer > inner, "the top leaf climbs further than the bottom one");
  assert.ok(near(inner, dimensions.coverThickness + dimensions.leafSpacing / 2, 1e-12));
  assert.ok(outer < EDITION.thickness, "no leaf ever climbs more than the book is thick");
});

test("each pile rests on its own cover, in the order the leaves were turned", () => {
  let previousTurned = -Infinity;
  let previousRest = Infinity;
  for (let index = 0; index < dimensions.leafCount; index += 1) {
    const turned = turnedHeight(dimensions, index, OPEN);
    const rest = restHeight(dimensions, index, OPEN);
    assert.ok(turned > jointPosition(dimensions, "front", OPEN).y, "clear of the opened front cover");
    assert.ok(rest > jointPosition(dimensions, "back", OPEN).y, "clear of the back cover");
    assert.ok(turned > previousTurned, "later-turned leaves sit on top of earlier ones");
    assert.ok(rest < previousRest, "the unturned stack has the first leaf on top");
    previousTurned = turned;
    previousRest = rest;
  }
});

test("both piles occupy the same band, so the open book does not float or grow", () => {
  const tallestTurned = turnedHeight(dimensions, dimensions.leafCount - 1, OPEN);
  const tallestRest = restHeight(dimensions, 0, OPEN);
  assert.ok(near(tallestTurned, tallestRest, 1e-12), "symmetric about the gutter");
  assert.ok(tallestTurned < EDITION.thickness * 1.5, "no taller than the book plus its covers");
});

test("the gutter curve starts at nothing on the bound edge and flattens out cleanly", () => {
  assert.equal(gutterProfile(0, 0.2), 0);
  assert.equal(gutterProfile(0.2, 0.2), 1);
  assert.equal(gutterProfile(0.9, 0.2), 1);
  assert.ok(near(gutterProfile(0.1, 0.2), 0.5), "symmetric about the mid-point");
  // Smoothstep: flat tangents at both ends, so no crease where the curve meets
  // the spine and none where it meets the flat part of the leaf.
  assert.ok((gutterProfile(1e-6, 0.2) - gutterProfile(0, 0.2)) / 1e-6 < 1e-3);
  assert.ok((gutterProfile(0.2, 0.2) - gutterProfile(0.2 - 1e-6, 0.2)) / 1e-6 < 1e-3);
  let previous = -1;
  for (let u = 0; u <= 0.2; u += 0.005) {
    const value = gutterProfile(u, 0.2);
    assert.ok(value >= previous, "monotonic — the curve never doubles back");
    previous = value;
  }
});

test("the gutter gets more length the further a leaf has to climb, within paper's limits", () => {
  const shallow = gutterRange(dimensions, gutterRise(dimensions, 89, OPEN, 0));
  const steep = gutterRange(dimensions, gutterRise(dimensions, 0, OPEN, 0));
  assert.ok(steep > shallow, "the outermost leaf curves over more of its length");
  assert.ok(shallow >= 0.05, "even a barely-climbing leaf gets a soft departure");
  assert.ok(steep <= 0.55, "the flex never takes over the whole leaf");
  // The climb has to be gentle enough to read as paper rather than as a fold:
  // the steepest leaf in the block gets most of a hand's width to do it in.
  assert.ok(steep >= 0.25, "the longest climb sweeps, it does not crease");
});

test("the flex resolves to the wanted height at rest and to nothing on edge", () => {
  // A flat leaf's normal points down the world's Y axis and a turned-over
  // leaf's points up, so the local displacement flips sign between them.
  assert.ok(near(gutterDisplacement(0.02, 0), -0.02));
  assert.ok(near(gutterDisplacement(0.02, 1), 0.02));
  assert.ok(near(gutterDisplacement(0.02, 0.5), 0, 1e-15), "no singularity at the half turn");
});

test("the lift follows the engine's own second-half curve, so page-turn timing is unchanged", () => {
  assert.equal(leafLift(0), 0);
  assert.equal(leafLift(0.49), 0);
  assert.equal(leafLift(0.5), 0);
  assert.equal(leafLift(0.75), 0.5);
  assert.equal(leafLift(1), 1);
});

test("one parameter drives the case then the leaves, with no overlap", () => {
  const closed = bindingPose(0, 90);
  assert.equal(closed.openAmount, 0);
  assert.equal(closed.leafProgress, 0);
  assert.equal(closed.spineAngle, 0);

  const halfOpen = bindingPose(0.5, 90);
  assert.equal(halfOpen.openAmount, 0.5);
  assert.equal(halfOpen.leafProgress, 0, "no leaf moves while the case is still opening");
  assert.equal(halfOpen.spineAngle, OPEN / 2, "the spine rolls on the same parameter");

  const reading = bindingPose(12.25, 90);
  assert.equal(reading.openAmount, 1, "the case stays open once it is open");
  assert.equal(reading.spineAngle, OPEN, "and the spine stays down");
  assert.equal(reading.leafProgress, 11.25);

  assert.equal(bindingPose(91, 90).leafProgress, 90);
  assert.equal(bindingPose(91, 90).closeAmount, 0, "the last leaf lands before the case shuts");
  assert.equal(bindingPose(500, 90).progress, 92, "clamped to the shut case");
  assert.equal(bindingPose(-5, 90).progress, 0);
  assert.equal(bindingPose(0, 90).steps, 92, "open, one per leaf, then shut again");
});

test("the last step shuts the case again, and nothing before it does", () => {
  for (const progress of [0, 0.5, 1, 45, 91]) {
    assert.equal(bindingPose(progress, 90).closeAmount, 0, `nothing shuts at ${progress}`);
  }
  const halfShut = bindingPose(91.5, 90);
  assert.equal(halfShut.closeAmount, 0.5);
  assert.equal(halfShut.leafProgress, 90, "every leaf has already turned");
  assert.equal(halfShut.coverAngle, Math.PI, "the front cover stays where the pile left it");
  assert.equal(halfShut.backCoverAngle, Math.PI / 2, "the back cover is what comes over");
  assert.ok(near(halfShut.spineAngle, OPEN * 1.5), "the spine carries on rolling the same way");

  const shut = bindingPose(92, 90);
  assert.equal(shut.steps, bindingSteps(90), "the pose counts its own steps");
  assert.equal(bindingSteps(90), 92, "open, 90 leaves, shut");
  assert.equal(shut.closeAmount, 1);
  assert.ok(near(shut.spineAngle, Math.PI), "a half turn from cover to cover");
  assert.equal(shut.backCoverAngle, Math.PI, "the back cover is down on the pile");
});

test("the case stays on the table through the whole half turn", () => {
  // Past upright the spine stands on a different corner; the lift is what puts
  // that corner on the table instead of driving the old one through it.
  assert.equal(caseLift(dimensions, 0), 0, "closed: already resting on its own edge");
  assert.equal(caseLift(dimensions, OPEN), 0, "flat: still resting on the same corner");
  assert.ok(near(caseLift(dimensions, Math.PI), dimensions.spineWidth), "shut the other way up");
  let previous = -Infinity;
  for (let angle = 0; angle <= Math.PI + 1e-12; angle += Math.PI / 64) {
    const lift = caseLift(dimensions, angle);
    assert.ok(lift >= previous - 1e-12, "the case only ever rises, never drops through the table");
    previous = lift;
  }
});

test("the front cover swings a half turn about its joint and nothing further", () => {
  assert.equal(frontCoverAngle(0), 0);
  assert.equal(frontCoverAngle(0.5), Math.PI / 2);
  assert.equal(frontCoverAngle(1), Math.PI);
  assert.equal(frontCoverAngle(3), Math.PI, "clamped — it cannot wind past flat");
});

test("the closed case lands exactly where the pre-rebuild book did", () => {
  const extent = caseExtent(dimensions, 0, 0);
  assert.ok(near(extent.min, 0), "the spine's printed face is the case's left edge");
  assert.ok(near(extent.max, EDITION.caseWidth), "the fore edge is one page width away");
  const offset = centringOffset(dimensions, 0);
  assert.ok(near(offset + extent.min, -EDITION.caseWidth / 2), "left edge centred as before");
  assert.ok(near(offset + extent.max, EDITION.caseWidth / 2), "right edge centred as before");
});

test("the open spread stays centred, and the covers bound everything in it", () => {
  const extent = caseExtent(dimensions, OPEN, Math.PI);
  const offset = centringOffset(dimensions, 1, 0);
  assert.ok(near(offset + (extent.min + extent.max) / 2, 0), "centred on screen");
  // The leaves are cut inside the covers, so nothing pokes out of the spread.
  const leftmostLeaf = leafAnchorHeight && jointPosition(dimensions, "front", OPEN).x;
  assert.ok(extent.min <= leftmostLeaf - dimensions.leafWidth + 1e-12,
    "the front cover reaches past the furthest turned leaf");
});
