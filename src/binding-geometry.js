// Case-binding geometry: the arithmetic a bookbinder would do before cutting
// board. Deliberately free of three.js so every number here is unit testable
// without a GPU; src/binding.js is the only place these become meshes.
//
// SPINE FRAME — the frame the spine establishes, and the book frame at rest.
// Its origin is the spine's bottom-outer edge: the line that rests on the
// table and stays there, closed or open. Everything is measured from it.
//
//   closed (spineAngle 0)                 open (spineAngle π/2)
//
//        ┌──────────────────────┐            front cover      back cover
//   ┌─┐  │  front board   y∈[ct+Tt, W]     ╲                      ╱
//   │ │  ├──────────────────────┤           ╲____   ▁▁▁▁▁   ____╱
//   │s│  │  text block    y∈[ct, ct+Tt]          ╲▁▁│spine│▁▁╱
//   │ │  ├──────────────────────┤          ──────────────────────── table
//   └─┘  │  back board    y∈[0, ct]
//    ▲   └──────────────────────┘          the spine has rolled a quarter
//    │       x ∈ [ct, ct+boardWidth]       turn onto its printed face; both
//  x∈[0,ct]                                joints are now at table level and
//  origin at (0,0), on the table           the leaves fan up out of it
//
//   x = ct  is the spine's INNER face: the joint plane, and the line every
//           leaf is bound along. x ∈ [0, ct] is the spine board itself, so
//           its printed face (x = 0) is the case's outermost surface at the
//           binding edge — and the face it lies on once rolled down.
//   z = 0   mid-height; head at -z, tail at +z (the scene's camera has
//           up = (0,0,-1), so -z is screen-up).
//
// The two joint axes are the spine's own long edges on its inner face:
//   front joint  (x = ct, y = W,  z free)
//   back  joint  (x = ct, y = 0,  z free)
// Each cover's hinge edge IS its joint axis, so a cover can swing to any
// angle without its hinge edge ever leaving the spine's edge — and because
// the joints are carried by the spine, rolling the spine carries them with
// it instead of leaving the case hinged in mid-air.

export const EPSILON = 1e-9;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rotate(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * Every derived measurement of the case, from the four a binder actually picks:
 * the trimmed page size, the finished thickness, and the board calliper.
 *
 * `thickness` is the finished closed thickness and is conserved exactly:
 * the text block gets whatever the two boards leave it, rather than the case
 * growing by the boards it gained.
 */
export function caseDimensions({ caseWidth, caseHeight, thickness, coverThickness, leafCount }) {
  if (!(leafCount > 0)) throw new RangeError("caseDimensions: leafCount must be positive");
  if (!(thickness > 2 * coverThickness)) {
    throw new RangeError("caseDimensions: the two boards leave no room for a text block");
  }

  const spineWidth = thickness;
  const textBlockThickness = spineWidth - 2 * coverThickness;
  // The case is `caseWidth` wide overall; the spine board eats `coverThickness`
  // of that at the binding edge, so the cover boards get the rest. Leaves are
  // cut flush with the boards' fore edge.
  const boardWidth = caseWidth - coverThickness;

  return {
    caseWidth,
    caseHeight,
    coverThickness,
    leafCount,
    spineWidth,
    textBlockThickness,
    boardWidth,
    leafWidth: boardWidth,
    leafSpacing: textBlockThickness / leafCount,
    innerFaceX: coverThickness,
    frontJointY: spineWidth,
    backJointY: 0,
  };
}

/**
 * How far the spine has rolled, per quarter turn. Closed it stands on edge at
 * the binding edge, exactly as it looks now; opening rolls it a quarter turn
 * onto its printed face so it lies on the table under the gutter, the way a
 * real book's spine does. Shutting the book again at the far end rolls it a
 * second quarter turn the same way, so it comes back up on edge with the back
 * cover on top — a whole half turn from cover to cover.
 */
export function spineRollAngle(amount) {
  return (Math.PI / 2) * clamp(amount, 0, 1);
}

/** A cover swings a half turn about its joint, and nothing else. */
export function frontCoverAngle(amount) {
  return Math.PI * clamp(amount, 0, 1);
}

/**
 * How far to set the case down so the spine keeps resting on the table.
 *
 * Through the first quarter turn the spine pivots on the bottom-outer edge it
 * started on and nothing is needed. Past upright it is standing on a different
 * corner, and rotating about the original one would drive it through the
 * table; lifting the case by however far its lowest corner has dropped moves
 * the contact line to the corner actually touching down. The case is set on
 * the table, which is not the same thing as the spine being translated inside
 * the case — the spine still only ever rotates.
 */
export function caseLift(dimensions, spineAngle) {
  const { innerFaceX, spineWidth } = dimensions;
  const corners = [[0, 0], [innerFaceX, 0], [0, spineWidth], [innerFaceX, spineWidth]];
  let lowest = 0;
  for (const [x, y] of corners) lowest = Math.min(lowest, rotate(x, y, spineAngle)[1]);
  return lowest < 0 ? -lowest : 0;
}

/** Where a joint axis has got to, in book coordinates, at a given spine roll. */
export function jointPosition(dimensions, side, spineAngle) {
  const y = side === "front" ? dimensions.frontJointY : dimensions.backJointY;
  const [x, height] = rotate(dimensions.innerFaceX, y, spineAngle);
  return { x, y: height };
}

/**
 * Where leaf `index` is glued to the spine's inner face, in the spine's own
 * frame. Fixed for the life of the book: a bound leaf's anchor never moves
 * relative to the spine, whatever the leaf or the spine is doing.
 * Stack order runs back joint → front joint, so leaf 0 sits nearest the front.
 */
export function leafAnchor(dimensions, index) {
  const { coverThickness, textBlockThickness, leafSpacing, innerFaceX } = dimensions;
  return {
    x: innerFaceX,
    y: coverThickness + textBlockThickness - leafSpacing * (index + 0.5),
  };
}

/** The same anchor in book coordinates, once the spine has rolled. */
export function leafAnchorHeight(dimensions, index, spineAngle) {
  const anchor = leafAnchor(dimensions, index);
  return rotate(anchor.x, anchor.y, spineAngle)[1];
}

/**
 * The engine's own second-half lift curve, restated so the flex follows the
 * existing page-turn timing rather than inventing its own.
 */
export function leafLift(pageProgress) {
  return pageProgress < 0.5 ? 0 : (pageProgress - 0.5) / 0.5;
}

/**
 * Height of the pile a leaf lies in. Each pile rests on its own cover, so both
 * are measured from that cover's joint: the unturned stack builds off the back
 * cover with the first leaf on top, the turned stack off the front cover with
 * the first leaf turned at the bottom.
 *
 * Closed, `restHeight` comes out exactly equal to the leaf's own anchor — which
 * is why a closed book is a flat stack with no flex in it at all.
 */
export function restHeight(dimensions, index, spineAngle) {
  const { coverThickness, leafSpacing, leafCount } = dimensions;
  return jointPosition(dimensions, "back", spineAngle).y
    + coverThickness
    + leafSpacing * (leafCount - index - 0.5);
}

export function turnedHeight(dimensions, index, spineAngle) {
  const { coverThickness, leafSpacing } = dimensions;
  return jointPosition(dimensions, "front", spineAngle).y
    + coverThickness
    + leafSpacing * (index + 0.5);
}

export function leafBodyHeight(dimensions, index, spineAngle, pageProgress) {
  const lift = leafLift(pageProgress);
  const rest = restHeight(dimensions, index, spineAngle);
  return rest + (turnedHeight(dimensions, index, spineAngle) - rest) * lift;
}

/**
 * How far leaf `index` has to climb out of the gutter, from its anchor on the
 * spine to wherever its body is lying. Zero for every leaf of a closed book.
 */
export function gutterRise(dimensions, index, spineAngle, pageProgress) {
  return leafBodyHeight(dimensions, index, spineAngle, pageProgress)
    - leafAnchorHeight(dimensions, index, spineAngle);
}

// Paper can only bend so hard. The curve is given roughly this much length per
// unit of climb, bounded so a flat leaf still gets a soft departure and a
// steeply climbing one does not turn the whole leaf into a ramp.
//
// Generous on purpose. A leaf at the top of its pile has to climb the whole
// text block out of the gutter; spread over a short run that reads as a bracket
// folded out of sheet metal, with a visible crease where it meets the flat of
// the leaf. Real paper takes a long, shallow sweep out of the gutter instead —
// roughly a hand's width of curve for a few millimetres of climb — and the
// engine's own page curl then sits on top of that undisturbed.
const GUTTER_LENGTH_PER_RISE = 12;
const GUTTER_MIN_RANGE = 0.05;
const GUTTER_MAX_RANGE = 0.55;

/** What fraction of a leaf's length does the gutter curve, for a given climb. */
export function gutterRange(dimensions, rise) {
  const wanted = (Math.abs(rise) * GUTTER_LENGTH_PER_RISE) / dimensions.leafWidth;
  return clamp(wanted, GUTTER_MIN_RANGE, GUTTER_MAX_RANGE);
}

/**
 * The flex profile itself: 0 at the bound edge, 1 once clear of the gutter,
 * smoothstep between. Flat tangents at both ends are what keep the bound edge
 * exactly on the spine while leaving no crease where the curve ends.
 * `u` is 0..1 along the leaf, measured from its bound edge.
 */
export function gutterProfile(u, range) {
  if (u <= 0) return 0;
  if (u >= range) return 1;
  const t = u / range;
  return t * t * (3 - 2 * t);
}

/**
 * The flex displaces vertices along the leaf's own normal, which points
 * straight down the world's Y axis when the leaf is flat and straight up once
 * it has turned over. This converts a wanted change in height into that local
 * displacement — and lands on zero rather than a singularity at the half turn,
 * where a leaf standing on edge has no height to give.
 */
export function gutterDisplacement(rise, pageProgress) {
  return -Math.cos(Math.PI * pageProgress) * rise;
}

/**
 * The case's horizontal extent in book coordinates, measured from the actual
 * corners of the actual boards. The frame negates its midpoint to keep the
 * composition centred — closed on the case, open on the spread — which is the
 * only thing outside the case that follows `progress`, and the reason the
 * spine itself never needs a translation.
 */
export function caseExtent(dimensions, spineAngle, coverAngle, backCoverAngle = 0) {
  const { innerFaceX, spineWidth, boardWidth } = dimensions;
  const front = jointPosition(dimensions, "front", spineAngle);
  const back = jointPosition(dimensions, "back", spineAngle);
  const xs = [
    rotate(0, 0, spineAngle)[0],
    rotate(innerFaceX, 0, spineAngle)[0],
    rotate(0, spineWidth, spineAngle)[0],
    rotate(innerFaceX, spineWidth, spineAngle)[0],
    front.x,
    front.x + boardWidth * Math.cos(coverAngle),
    back.x,
    back.x + boardWidth * Math.cos(backCoverAngle),
  ];
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

/**
 * How far to slide the whole composition so it stays in frame: from the closed
 * case centred on itself to the open spread centred on its gutter.
 *
 * Eased between those two ends rather than measured live. Measuring the case's
 * extent every frame sounds more principled and is worse to watch: the front
 * cover's reach folds back through the joint as it passes upright, so the
 * measured midpoint barely moves for the first half of the opening and then
 * lurches half a page sideways in the second. On screen the text block sits
 * still, then bolts to the right while the cover swings left, and the two read
 * as coming apart rather than as one book opening. Both ends still land
 * exactly where the measured rule put them.
 */
export function centringOffset(dimensions, openAmount, closeAmount = 0) {
  const middle = (extent) => -(extent.min + extent.max) / 2;
  const shut = middle(caseExtent(dimensions, 0, 0, 0));
  const spread = middle(caseExtent(dimensions, Math.PI / 2, Math.PI, 0));
  const shutAgain = middle(caseExtent(dimensions, Math.PI, Math.PI, Math.PI));
  const ease = (t) => {
    const u = clamp(t, 0, 1);
    return u * u * (3 - 2 * u);
  };
  // Opening slides from the shut case to the spread, shutting slides on from
  // the spread to where the case comes to rest the other way up. The second
  // leg only ever runs once the first is finished, so the two never fight.
  return shut + (spread - shut) * ease(openAmount) + (shutAgain - spread) * ease(closeAmount);
}

/**
 * One parameter drives the whole binding. `progress` runs 0 → 2 + leafCount:
 * the first unit opens the case — front cover swinging, spine rolling down —
 * each unit after that is one leaf turning, and the last unit shuts the case
 * again, bringing the back cover over the read pile and rolling the spine up
 * onto its other edge. The book ends closed, the way it started, rather than
 * abandoned open on the last spread.
 */
export function bindingSteps(leafCount) {
  return 2 + leafCount;
}

export function bindingPose(progress, leafCount) {
  const steps = bindingSteps(leafCount);
  const clamped = clamp(progress, 0, steps);
  const openAmount = clamp(clamped, 0, 1);
  const closeAmount = clamp(clamped - 1 - leafCount, 0, 1);
  return {
    steps,
    progress: clamped,
    openAmount,
    closeAmount,
    leafProgress: clamp(clamped - 1, 0, leafCount),
    // A half turn all told, taken in two quarters a whole text block apart.
    spineAngle: spineRollAngle(openAmount) + spineRollAngle(closeAmount),
    coverAngle: frontCoverAngle(openAmount),
    // The back cover is what shuts the book, so it swings on the last unit and
    // is still for all the ones before it.
    backCoverAngle: frontCoverAngle(closeAmount),
  };
}
