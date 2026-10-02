// Reusable book-interaction package: drag/swipe to turn a page where the
// book is, drag the empty space around it to spin the book in 360°, with
// gesture priority locked for the life of each pointer. See BookController's
// own doc comment for the `book`/`rig` contract a host provides.
//
// Drop this folder anywhere in a Three.js scene that has a page-turn engine
// shaped like CaseBinding (src/binding.js) — nothing here imports from the
// rest of this app.
export { BookController } from "./BookController.js";
export {
  chooseDragDirection,
  dragFraction,
  edgePreviewDirection,
  edgePreviewPose,
  isActivePointer,
  shouldCompleteDrag,
} from "./drag.js";
export {
  ORBIT_SPIN_SENSITIVITY,
  ORBIT_TILT_SENSITIVITY,
  ORBIT_TILT_LIMIT,
  OrbitSpring,
  clamp,
  facing,
  groundShadowStrength,
  nextOrbitTarget,
  normalizeTurns,
  reseatHalfTurn,
  shortestAngleTo,
} from "./orbit.js";
