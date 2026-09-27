import * as THREE from "three";
import * as MODIFIERS from "three.modifiers";
import { FlipBook } from "quick_flipbook";
import {
  bindingPose,
  caseDimensions,
  centringOffset,
  clamp,
  gutterDisplacement,
  gutterProfile,
  gutterRange,
  gutterRise,
  jointPosition,
  leafAnchor,
} from "./binding-geometry.js";

// Real hardcover (case) construction. The case — back cover, spine, front
// cover — is one connected structure; the spine is the anchor both covers
// hinge from and every leaf is bound to. It is never translated and nothing
// inside the case moves independently of it: opening the book rolls the spine
// a quarter turn onto its printed face, so it lies down on the table under the
// gutter instead of standing on edge, and it carries the joints and the whole
// text block with it.
//
// Scene graph, matching how the object is actually made:
//
//   CaseBinding
//   └─ frame                 presentational recentring ONLY, outside the case
//      └─ book               sits the case on the table
//         └─ spine           the anchor; rolls flat as the case opens
//            ├─ spineBoard       printed face outward, and downward when open
//            ├─ spineLiner       paper over the inner face (-> the spine is
//            │                   occluded from inside by geometry, not by a
//            │                   visibility toggle)
//            ├─ frontJoint    pivot ON the spine's front long edge
//            │  └─ frontCover    cover + pastedown, pasted to its inside
//            ├─ backJoint     pivot ON the spine's back long edge
//            │  └─ backCover     cover + pastedown, pasted to its inside
//            └─ textBlock     on the spine's inner face
//               └─ sheetPivot[i]  anchor line, offset by stack index
//                  └─ FlipPage[i] flexes into the gutter near its anchor
//
// The joints and sheet pivots take the spine's roll back out of their own
// rotation, so a cover's or a leaf's attitude is driven only by how far it has
// turned, never by how far the spine has rolled. That subtraction is the
// flexible joint of a real binding, not a compensating offset: the leaf stays
// flat in the world while its bound edge rides the spine down.
//
// Quick FlipBook stays on as the page-turn engine — its flip, bend and page
// curl are untouched, so the leaves droop exactly as they always have — but
// its sheets are re-parented onto their own anchors and it is no longer part
// of the scene graph, so the on-screen recentring it bakes into its own
// transform cannot drag the spine around with it.

// Paper glued over something is still paper thick. These were a tenth of a
// leaf's own spacing — far below anything the depth buffer or the shadow map
// can separate at this scale. An eighth of the board's calliper is still
// invisible and is comfortably resolvable.
const PASTEDOWN_LIFT = 0.0004;
const LINER_LIFT = 0.0004;
const SOFT_COVER_SUBDIVISIONS = 16; // same as the leaves (PAGE_SUBDIVISIONS)

// ---------------------------------------------------------------------------
// COVER STIFFNESS — the one place to change it.
//
// "soft"  limp covers: a single flexible sheet that bends and curls the way
//         a leaf does, as a passport's card cover behaves.
// "rigid" boards: flat panels with real calliper, a hardcover case.
//
// Set per edition with `coverStyle` in src/books.js. Nothing else needs to
// change to switch between them.
// ---------------------------------------------------------------------------
export const COVER_STYLES = ["soft", "rigid"];

/**
 * Quick FlipBook's own page-curl profile. Reimplemented here — same axes, same
 * constants as node_modules/quick_flipbook/dist/flipbook.mjs — because the
 * class is internal to that package and a limp cover needs to carry the same
 * droop its leaves do. Quick FlipBook is BSD-2; see THIRD_PARTY_NOTICES.md.
 */
class PaperCurl extends MODIFIERS.UserDefined {
  constructor(effectRange = 0.812, effectMid = 0.325, elevationHeight = 0.054) {
    super();
    this.intensity = 0;
    this.renderVector = (vertex) => {
      if (this.intensity === 0) return;
      let ratio = vertex.getRatio(MODIFIERS.ModConstant.X);
      if (ratio > effectRange) return;
      ratio /= effectRange;
      let lift;
      if (ratio < effectMid) {
        const t = ratio / effectMid;
        lift = Math.sqrt(t * (2 - t));
      } else {
        const t = (ratio - effectMid) / (1 - effectMid);
        lift = (Math.cos(t * Math.PI) + 1) / 2;
      }
      const elevation = vertex.getValue(MODIFIERS.ModConstant.Z);
      vertex.setValue(
        MODIFIERS.ModConstant.Z,
        elevation + lift * elevationHeight * this.intensity,
      );
    };
  }
}

/**
 * What Quick FlipBook does to a leaf that is `turnProgress` through its turn
 * (FlipPage.flip, same package, same constants). `strength` fades the whole
 * effect out where the book is shut and the stack should be flat.
 *
 * Curl alone is not paper: it vanishes at the half turn, because a sheet
 * standing on edge has no height to give. What keeps a leaf limp there is the
 * bend, which peaks at exactly the point the curl disappears. A cover built
 * out of only the curl is a board pretending to be paper: dead flat at ninety
 * degrees.
 *
 * Quick FlipBook's third ingredient, the twist, is deliberately left out. On a
 * leaf it is a flourish you never look at directly; on a cover it lifts one
 * end and drops the other, so the cover's head and tail stop lining up with
 * the block's and the case reads as two pieces sliding past each other.
 */
function leafDeformation(turnProgress, strength, direction = 1) {
  const angle = Math.PI * turnProgress;
  return {
    curl: (-1 + 2 * turnProgress) * (-Math.sin(angle) + 1) * strength,
    bend: Math.min(-Math.sin(angle) / 2, -1e-4) * direction * strength,
  };
}

/** Just the curl, for the leaves — the engine applies their own bend and twist. */
function curlIntensity(turnProgress, strength) {
  return leafDeformation(turnProgress, strength).curl;
}

/**
 * Real paper leaving a real spine: no crease at the bound edge, no strip
 * bridging the gap. Displaces along the sheet's own normal, easing from
 * nothing at the anchor to the sheet's full climb by the end of the gutter.
 */
class GutterFlex extends MODIFIERS.UserDefined {
  constructor() {
    super();
    this.displacement = 0;
    this.range = 1;
    this.renderVector = (vertex) => {
      if (this.displacement === 0) return;
      const along = gutterProfile(vertex.getRatio(MODIFIERS.ModConstant.X), this.range);
      if (along === 0) return;
      const elevation = vertex.getValue(MODIFIERS.ModConstant.Z);
      vertex.setValue(MODIFIERS.ModConstant.Z, elevation + this.displacement * along);
    };
  }

  set(rise, turnProgress, dimensions) {
    this.displacement = gutterDisplacement(rise, turnProgress);
    this.range = gutterRange(dimensions, rise);
  }
}

/**
 * A leaf's flex, kept next to the leaf so the binding can refresh it when the
 * spine rolls without going back through the page-turn engine.
 */
class LeafFlex extends GutterFlex {
  constructor() {
    super();
    this.dimensions = null;
    this.index = 0;
    this.spineAngle = 0;
    this.pageProgress = 0;
    this.appliedRise = Number.NaN;
    this.appliedCurve = Number.NaN;
  }

  configure(dimensions, index) {
    this.dimensions = dimensions;
    this.index = index;
    this.appliedRise = Number.NaN;
    this.appliedCurve = Number.NaN;
  }

  /** Recompute from whatever the leaf and the spine are currently doing. */
  refresh() {
    if (!this.dimensions) return 0;
    const rise = gutterRise(this.dimensions, this.index, this.spineAngle, this.pageProgress);
    this.set(rise, this.pageProgress, this.dimensions);
    return rise;
  }
}

const AXIS = { x: 0, y: 1, z: 2 };

/**
 * Lay a texture over one face of a box by its actual vertex positions, so the
 * artwork's orientation follows the geometry rather than three.js's internal
 * face-winding order. Face indices are BoxGeometry's: 0 +x, 1 -x, 2 +y,
 * 3 -y, 4 +z, 5 -z.
 */
function orientFaceUV(geometry, faceIndex, { u, v }) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const first = faceIndex * 4;
  const span = (axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = first; i < first + 4; i += 1) {
      const value = position.getComponent(i, AXIS[axis]);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { min, size: max - min || 1 };
  };
  const uSpan = span(u.axis);
  const vSpan = span(v.axis);
  for (let i = first; i < first + 4; i += 1) {
    const rawU = (position.getComponent(i, AXIS[u.axis]) - uSpan.min) / uSpan.size;
    const rawV = (position.getComponent(i, AXIS[v.axis]) - vSpan.min) / vSpan.size;
    uv.setXY(i, u.flip ? 1 - rawU : rawU, v.flip ? 1 - rawV : rawV);
  }
  uv.needsUpdate = true;
}

/**
 * The spine's printed face is the cover's own covering material carrying on
 * around the binding edge: a strip cropped from the cover artwork's hinge-side
 * edge, as wide as the spine is, so the pixel column at the joint is the same
 * one the cover ends on.
 */
export function makeSpineStripTexture(coverMap, widthFraction, anisotropy = 1) {
  const image = coverMap?.image;
  const sourceWidth = image?.width ?? image?.naturalWidth ?? 0;
  const sourceHeight = image?.height ?? image?.naturalHeight ?? 0;
  if (!image || !sourceWidth || !sourceHeight) return null;

  const cropWidth = Math.max(1, Math.round(sourceWidth * clamp(widthFraction, 0, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, cropWidth, sourceHeight, 0, 0, cropWidth, sourceHeight);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

export class CaseBinding extends THREE.Group {
  #engine;
  #frame = new THREE.Group();
  #book = new THREE.Group();
  #spine = new THREE.Group();
  #spineBoard = null;
  #spineLiner = null;
  #frontJoint = new THREE.Group();
  #backJoint = new THREE.Group();
  #frontCover = new THREE.Group();
  #backCover = new THREE.Group();
  #textBlock = new THREE.Group();
  #softCoverFlex = [];
  #pivots = [];
  #sheets = [];
  #dimensions = null;
  #coverStyle = "rigid";
  #spineTexture = null;
  #owned = [];
  #flipDuration;
  #progress = 0;
  #goal = 0;
  #stepSize = 0;
  #page = 0;
  #appliedSpineAngle = Number.NaN;
  // Shared with every leaf's flip wrapper. Quick FlipBook fades the page curl
  // out over the first and last sheet, on the assumption that those sheets are
  // the covers and the book is shut behind them. Here the case is what shuts,
  // so the fade follows the case opening instead — otherwise the whole text
  // block sits dead flat the moment the cover is open.
  #curve = { intensity: 0 };
  #onSheetDeformed = null;

  constructor({ flipDuration = 1, pageSubdivisions = 20, onSheetDeformed = null } = {}) {
    super();
    this.#flipDuration = flipDuration;
    this.#onSheetDeformed = onSheetDeformed;
    // yBetweenPages is deliberately inert: stack offsets belong to the sheet
    // pivots on the spine now, and #apply() zeroes whatever the engine writes.
    this.#engine = new FlipBook({ flipDuration, yBetweenPages: 0, pageSubdivisions });

    this.name = "Book";
    this.#frame.name = "Frame";
    this.#book.name = "Case";
    this.#spine.name = "Spine";
    this.#frontJoint.name = "FrontJointPivot";
    this.#backJoint.name = "BackJointPivot";
    this.#frontCover.name = "FrontCover";
    this.#backCover.name = "BackCover";
    this.#textBlock.name = "TextBlock";

    this.add(this.#frame);
    this.#frame.add(this.#book);
    this.#book.add(this.#spine);
    this.#spine.add(this.#frontJoint, this.#backJoint, this.#textBlock);
    this.#frontJoint.add(this.#frontCover);
    this.#backJoint.add(this.#backCover);
  }

  get dimensions() { return this.#dimensions; }
  get spine() { return this.#spine; }
  get spineBoard() { return this.#spineBoard; }
  get frontCover() { return this.#frontCover; }
  get backCover() { return this.#backCover; }
  get frontJoint() { return this.#frontJoint; }
  get backJoint() { return this.#backJoint; }
  get textBlock() { return this.#textBlock; }
  get sheetPivots() { return this.#pivots; }
  get coverStyle() { return this.#coverStyle; }
  get leafCount() { return this.#dimensions?.leafCount ?? 0; }
  get steps() { return this.#dimensions ? 1 + this.#dimensions.leafCount : 0; }
  get totalPages() { return this.steps * 2; }
  get pose() { return bindingPose(this.#progress, this.leafCount); }

  [Symbol.iterator]() {
    return this.#sheets[Symbol.iterator]();
  }

  /**
   * Bind an edition. `leafMaterials` are the text block's two-sided leaves (two
   * per sheet); the cover artwork goes on the covers, where a bound book's
   * artwork actually lives, and the endpapers are pasted to their insides.
   */
  setEdition({
    caseWidth,
    caseHeight,
    thickness,
    coverThickness,
    coverStyle = "rigid",
    frontMaterial,
    backMaterial,
    paperMaterial,
    spineAnisotropy = 1,
    leafMaterials,
  }) {
    this.#disposeCase();

    this.#coverStyle = COVER_STYLES.includes(coverStyle) ? coverStyle : "rigid";
    const leafCount = Math.ceil(leafMaterials.length / 2);
    const dimensions = caseDimensions({
      caseWidth,
      caseHeight,
      thickness,
      coverThickness,
      leafCount,
    });
    this.#dimensions = dimensions;

    // The spine's bottom-outer edge is the book frame's origin and the line
    // that rests on the table, so the case sits on the table at every angle.
    this.#book.position.set(0, -thickness, 0);
    this.#buildSpine(frontMaterial, paperMaterial, spineAnisotropy);
    this.#buildCover({
      joint: this.#frontJoint,
      cover: this.#frontCover,
      side: "front",
      outward: 1,
      coverMaterial: frontMaterial,
      paperMaterial,
    });
    this.#buildCover({
      joint: this.#backJoint,
      cover: this.#backCover,
      side: "back",
      outward: -1,
      coverMaterial: backMaterial,
      paperMaterial,
    });

    this.#engine.setPages(leafMaterials);
    this.#buildTextBlock();

    this.#progress = 0;
    this.#goal = 0;
    this.#stepSize = 0;
    this.#page = 0;
    this.#appliedSpineAngle = Number.NaN;
    this.#apply();
  }

  #buildSpine(coverMaterial, paperMaterial, anisotropy) {
    const { spineWidth, caseHeight, coverThickness, caseWidth } = this.#dimensions;

    this.#spineTexture = makeSpineStripTexture(
      coverMaterial?.map ?? null,
      spineWidth / caseWidth,
      anisotropy,
    );
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: this.#spineTexture,
      roughness: 0.88,
      metalness: 0,
    });
    spineMaterial.shadowSide = THREE.DoubleSide;
    this.#owned.push(spineMaterial);

    const geometry = new THREE.BoxGeometry(coverThickness, spineWidth, caseHeight);
    // The printed face is -x: outward at the binding edge when closed, face
    // down on the table once the spine has rolled. Its u runs from the front
    // joint to the back joint so the strip meets the front cover on the same
    // pixel column the cover ends on; v puts the artwork's top at the head
    // (-z, which is screen-up under this scene's camera).
    orientFaceUV(geometry, 1, { u: { axis: "y", flip: true }, v: { axis: "z", flip: true } });
    this.#owned.push(geometry);

    this.#spineBoard = new THREE.Mesh(geometry, spineMaterial);
    this.#spineBoard.name = "SpineBoard";
    this.#spineBoard.position.set(coverThickness / 2, spineWidth / 2, 0);
    this.#spineBoard.castShadow = true;
    this.#spineBoard.receiveShadow = true;
    this.#spine.add(this.#spineBoard);

    // Spine liner: the paper a binder glues over the inside of the spine. It
    // is what makes "the spine is never visible from inside" a property of the
    // geometry rather than of a visibility flag.
    const linerGeometry = new THREE.PlaneGeometry(caseHeight, spineWidth);
    this.#owned.push(linerGeometry);
    this.#spineLiner = new THREE.Mesh(linerGeometry, paperMaterial);
    this.#spineLiner.name = "SpineLiner";
    this.#spineLiner.rotation.y = Math.PI / 2;
    this.#spineLiner.position.set(coverThickness + LINER_LIFT, spineWidth / 2, 0);
    this.#spineLiner.receiveShadow = true;
    this.#spine.add(this.#spineLiner);
  }

  #buildCover({ joint, cover, side, outward, coverMaterial, paperMaterial }) {
    const anchor = jointPosition(this.#dimensions, side, 0);
    joint.position.set(anchor.x, anchor.y, 0);
    joint.rotation.set(0, 0, 0);
    cover.position.set(0, 0, 0);
    cover.clear();

    const parts = this.#coverStyle === "soft"
      ? this.#buildSoftCover(outward, coverMaterial, paperMaterial)
      : this.#buildRigidCover(outward, coverMaterial, paperMaterial);
    cover.add(...parts);
  }

  #buildRigidCover(outward, coverMaterial, paperMaterial) {
    const { boardWidth, caseHeight, coverThickness } = this.#dimensions;

    const geometry = new THREE.BoxGeometry(boardWidth, coverThickness, caseHeight);
    const printedFace = outward === 1 ? 2 : 3;
    const innerFace = outward === 1 ? 3 : 2;
    orientFaceUV(geometry, printedFace, {
      u: { axis: "x", flip: false },
      v: { axis: "z", flip: true },
    });
    this.#owned.push(geometry);

    // Covering material wraps the board's edges too, so every face but the
    // inside carries the cover artwork; the inside is paper under the
    // pastedown. No colour is invented for the board edges.
    const materials = Array.from({ length: 6 }, () => coverMaterial);
    materials[innerFace] = paperMaterial;

    const board = new THREE.Mesh(geometry, materials);
    board.name = "CoverBoard";
    // The joint axis sits on the spine's long edge, which is the cover's outer
    // corner, so the board hangs inward from it: the hinge edge and the spine
    // edge stay the same line at every angle.
    board.position.set(boardWidth / 2, (-outward * coverThickness) / 2, 0);
    board.castShadow = true;
    board.receiveShadow = true;

    const pastedown = this.#buildCoverSheet({
      outward,
      facing: -1,
      material: paperMaterial,
      offset: -outward * (coverThickness + PASTEDOWN_LIFT),
      flex: false,
      name: "Pastedown",
      subdivisions: 1,
    });

    return [board, pastedown];
  }

  #buildSoftCover(outward, coverMaterial, paperMaterial) {
    // A limp cover is one flexible sheet, not a panel: the printed face and
    // the pastedown are two skins a hair apart, both carrying the same flex so
    // they bend out of the joint together.
    const printed = this.#buildCoverSheet({
      outward,
      facing: 1,
      material: coverMaterial,
      offset: 0,
      flex: true,
      name: "CoverSheet",
      subdivisions: SOFT_COVER_SUBDIVISIONS,
    });
    const pastedown = this.#buildCoverSheet({
      outward,
      facing: -1,
      material: paperMaterial,
      offset: -outward * PASTEDOWN_LIFT,
      flex: true,
      name: "Pastedown",
      subdivisions: SOFT_COVER_SUBDIVISIONS,
    });
    return [printed, pastedown];
  }

  /**
   * One skin of a cover. `facing` is +1 for the printed outside and -1 for the
   * pastedown, so the pair covers both directions: a cover is opaque whichever
   * side of it you are looking at, closed or thrown open.
   *
   * Laid out exactly the way Quick FlipBook lays out a leaf — a unit plane
   * hinged on its own left edge, rotated flat, and sized by the transform
   * above it rather than by the geometry. The modifiers therefore see the same
   * unit box on a leaf and on a cover, so the same force reads as the same
   * curve on both and a limp cover droops with the pages instead of alongside
   * them.
   */
  #buildCoverSheet({ outward, facing, material, offset, flex, name, subdivisions }) {
    const { boardWidth, caseHeight } = this.#dimensions;
    const geometry = new THREE.PlaneGeometry(1, 1, subdivisions, subdivisions);
    geometry.translate(0.5, 0, 0);
    this.#owned.push(geometry);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}Skin`;
    mesh.rotation.x = (-outward * facing * Math.PI) / 2;
    // A cover is one sheet of board, so it casts one shadow. Letting both
    // skins cast puts two shadow casters a fraction of a millimetre apart,
    // and with `shadowSide = DoubleSide` each one then shadow-acnes the
    // other — streaked banding right across the open cover. The printed skin
    // is the cover as far as the light is concerned; the pastedown only
    // receives.
    mesh.castShadow = facing === 1;
    mesh.userData.shadowCaster = facing === 1;
    mesh.receiveShadow = true;

    const sheet = new THREE.Group();
    sheet.name = name;
    sheet.scale.set(boardWidth, 1, caseHeight);
    sheet.position.set(0, offset, 0);
    sheet.add(mesh);

    if (flex) {
      const curl = new PaperCurl();
      const bend = new MODIFIERS.Bend(0, 0, 0);
      bend.constraint = MODIFIERS.ModConstant.LEFT;
      const stack = new MODIFIERS.ModifierStack(mesh);
      // Same order Quick FlipBook stacks them in on a leaf.
      stack.addModifier(curl);
      stack.addModifier(bend);
      // Which way this skin's normal points at rest. A cover's two skins face
      // opposite ways, so they take opposite forces to move together, and a
      // leaf's own normal points the other way again — which is why the leaf
      // formula comes through negated here.
      this.#softCoverFlex.push({
        mesh,
        curl,
        bend,
        stack,
        outward,
        normalSign: outward * facing,
      });
    }
    return sheet;
  }

  #buildTextBlock() {
    const dimensions = this.#dimensions;
    const { leafWidth, caseHeight } = dimensions;

    this.#textBlock.clear();
    this.#textBlock.position.set(0, 0, 0);
    this.#pivots = [];
    this.#sheets = [];

    let index = 0;
    for (const sheet of this.#engine) {
      const anchor = leafAnchor(dimensions, index);
      const pivot = new THREE.Group();
      pivot.name = `SheetPivot#${index}`;
      // The anchor line: on the spine's inner face, at this leaf's own offset
      // through the stack. It never moves relative to the spine again.
      pivot.position.set(anchor.x, anchor.y, 0);
      pivot.add(sheet);
      this.#textBlock.add(pivot);

      sheet.position.set(0, 0, 0);
      sheet.scale.set(leafWidth, 1, -caseHeight);
      this.#attachLeafFlex(sheet, index);

      this.#pivots.push(pivot);
      this.#sheets.push(sheet);
      index += 1;
    }
  }

  #attachLeafFlex(sheet, index) {
    let flex = sheet.userData.leafFlex;
    if (!flex) {
      // A loose leaf in a book with no covers can flutter off the trim and
      // nobody is the wiser; bound in a case, it cannot. Quick FlipBook twists
      // a turning leaf about its own length, and because the bend has already
      // lifted the sheet well off its plane by then, that rotation swings the
      // tail corner a tenth of a page height past the head and tail of the
      // case — the leaf visibly overhangs the cover mid-turn. Measured on the
      // first leaf at half turn: the page's own height coordinate reaches
      // -0.606 of a nominal -0.5. Scaling the twist down only scales the
      // overhang down, so the modifier comes out of the stack. The engine
      // still writes its angle; nothing reads it. Curl and bend, the two that
      // make the droop, are untouched.
      sheet.modifiers.removeModifier(sheet.twist);
      flex = new LeafFlex();
      sheet.modifiers.addModifier(flex);
      // Wrapped once per sheet and never re-wrapped: the flex reads its leaf
      // index off the modifier, so re-binding an edition updates it in place
      // and any wrapper layered on top of this one stays valid.
      const inner = sheet.flip.bind(sheet);
      const curve = this.#curve;
      sheet.flip = (pageProgress, direction) => {
        flex.pageProgress = pageProgress;
        flex.appliedRise = flex.refresh();
        flex.appliedCurve = curve.intensity;
        inner(pageProgress, direction, curve.intensity);
      };
      sheet.userData.leafFlex = flex;
    }
    flex.configure(this.#dimensions, index);
  }

  // A leaf whose climb out of the gutter has changed by less than this has not
  // visibly moved; skipping it keeps the spine's roll from re-deforming all
  // ninety leaves on every single frame.
  static #RISE_EPSILON = 0.0004;
  static #CURVE_EPSILON = 0.01;

  /**
   * The spine rolling changes every leaf's climb out of the gutter without
   * changing any leaf's flip progress, so the page-turn engine has no reason
   * to touch them. Re-deform the ones that actually moved.
   */
  #redeformLeaves(spineAngle) {
    const curve = this.#curve.intensity;
    for (const sheet of this.#sheets) {
      const flex = sheet.userData.leafFlex;
      flex.spineAngle = spineAngle;
      const rise = gutterRise(this.#dimensions, flex.index, spineAngle, flex.pageProgress);
      const movedEnough = Math.abs(rise - flex.appliedRise) >= CaseBinding.#RISE_EPSILON;
      const curledEnough = Math.abs(curve - flex.appliedCurve) >= CaseBinding.#CURVE_EPSILON;
      if (!movedEnough && !curledEnough) continue;

      flex.appliedRise = rise;
      flex.appliedCurve = curve;
      flex.set(rise, flex.pageProgress, this.#dimensions);
      sheet.pageCurve.intensity = curlIntensity(flex.pageProgress, curve);
      sheet.modifiers.apply();
      this.#onSheetDeformed?.(sheet);
    }
  }

  #refreshSoftCovers(pose) {
    if (this.#coverStyle !== "soft") return;
    for (const entry of this.#softCoverFlex) {
      // The front cover swings; the back one stays put and behaves as the
      // sheet the whole block rests on. Both fade in from nothing, so a shut
      // book is a flat stack and t=0 looks exactly as it always has.
      const turn = entry.outward === 1 ? pose.openAmount : 0;
      // Strength is the same number the leaves get, not openAmount. A cover is
      // the outermost sheet of the book, so it has to flatten with the sheet
      // it is lying against: on the last leaf the fade takes the text block to
      // dead flat, and a cover still carrying its full droop domes a whole
      // text block's worth straight up through the pile lying on it.
      const paper = leafDeformation(turn, this.#curve.intensity);
      const sign = -entry.normalSign;
      entry.curl.intensity = sign * paper.curl;
      entry.bend.force = sign * paper.bend;
      entry.stack.apply();
      entry.mesh.geometry.computeVertexNormals();
    }
  }

  #apply() {
    const dimensions = this.#dimensions;
    if (!dimensions) return;

    const pose = bindingPose(this.#progress, dimensions.leafCount);

    // One parameter. The spine rolls down, the front cover swings about its own
    // joint, and the leaves are driven from the same number through the engine.
    // The curl fades in as the case opens, and back out over the last leaf the
    // way Quick FlipBook fades it over its own last sheet.
    const leafTail = dimensions.leafCount - pose.leafProgress;
    const previousCurve = this.#curve.intensity;
    this.#curve.intensity = pose.openAmount * clamp(leafTail, 0, 1);

    this.#spine.rotation.z = pose.spineAngle;
    // Joints and pivots subtract the spine's roll, so a cover's or a leaf's
    // attitude depends only on how far it has turned.
    this.#frontJoint.rotation.z = pose.coverAngle - pose.spineAngle;
    this.#backJoint.rotation.z = -pose.spineAngle;
    for (const pivot of this.#pivots) pivot.rotation.z = -pose.spineAngle;

    this.#engine.progress = pose.leafProgress;
    // The engine still stacks its sheets in y for books that have no spine to
    // hang them from; here that job belongs to the anchors, so drop it.
    for (const sheet of this.#sheets) sheet.position.set(0, 0, 0);

    if (pose.spineAngle !== this.#appliedSpineAngle || this.#curve.intensity !== previousCurve) {
      this.#appliedSpineAngle = pose.spineAngle;
      this.#redeformLeaves(pose.spineAngle);
      this.#refreshSoftCovers(pose);
    }

    this.#frame.position.x = centringOffset(dimensions, pose.openAmount);
  }

  get progress() { return this.#progress; }

  set progress(value) {
    this.#progress = clamp(value, 0, this.steps);
    this.#page = Math.floor(this.#progress * 2);
    this.#stepSize = 0;
    this.#apply();
  }

  get currentPage() { return this.#page; }

  set currentPage(value) {
    const goal = Math.ceil(value / 2);
    this.#stepSize = (goal - this.#progress) / this.#flipDuration;
    this.#page = Math.ceil(value);
    this.#goal = goal;
    this.#apply();
  }

  animate(delta) {
    if (this.#stepSize === 0) return;
    this.#progress += this.#stepSize * delta;
    const overshot = this.#stepSize > 0
      ? this.#progress > this.#goal
      : this.#progress < this.#goal;
    if (overshot) {
      this.#progress = this.#goal;
      this.#stepSize = 0;
    }
    this.#apply();
  }

  nextPage() {
    this.currentPage = Math.min(Math.ceil(this.currentPage / 2) + 1, this.steps) * 2;
  }

  previousPage() {
    this.currentPage = Math.max(Math.ceil(this.currentPage / 2) - 1, 0) * 2;
  }

  #disposeCase() {
    this.#spine.remove(...[this.#spineBoard, this.#spineLiner].filter(Boolean));
    this.#spineBoard = null;
    this.#spineLiner = null;
    for (const entry of this.#softCoverFlex) entry.stack.destroy?.();
    this.#softCoverFlex = [];
    this.#frontCover.clear();
    this.#backCover.clear();
    this.#textBlock.clear();
    this.#pivots = [];
    this.#sheets = [];
    this.#spineTexture?.dispose();
    this.#spineTexture = null;
    for (const resource of this.#owned) resource.dispose();
    this.#owned = [];
  }

  dispose() {
    this.#disposeCase();
    this.#engine.dispose();
  }
}
