import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.js", import.meta.url), "utf8");
const binding = await readFile(new URL("./binding.js", import.meta.url), "utf8");
const books = await readFile(new URL("./books.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("./style.css", import.meta.url), "utf8");
const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");

// The Quick FlipBook lifecycle still drives every page turn; the case binding
// owns the engine now, so the calls live in binding.js and main.js talks to
// the binding.
test("3D Book 2 uses the requested Quick FlipBook lifecycle", () => {
  assert.match(binding, /import \{ FlipBook \} from "quick_flipbook"/);
  assert.match(binding, /new FlipBook\(/);
  assert.match(binding, /this\.#engine\.setPages\(/);
  assert.match(binding, /this\.#engine\.progress = pose\.leafProgress/);
  assert.match(main, /binding\.animate\(delta\)/);
});

test("reader supports buttons, pointer gestures, and keyboard navigation", () => {
  assert.match(main, /binding\.nextPage\(\)/);
  assert.match(main, /binding\.previousPage\(\)/);
  assert.match(main, /pointerdown/);
  assert.match(main, /pointermove/);
  assert.match(main, /pointerleave/);
  assert.match(main, /pointercancel/);
  assert.doesNotMatch(html, /id="book-interaction"/);
  assert.doesNotMatch(main, /interactionSurface/);
  assert.match(main, /canvas\.addEventListener\("pointermove"/);
  assert.match(main, /start\.pendingFraction = fraction/);
  assert.match(main, /const preview = takeEdgePreviewForDrag\(\)/);
  assert.match(main, /startFraction: preview\?\.fraction \?\? 0/);
  assert.match(main, /start\.startFraction/);
  assert.match(main, /function applyDragFrame\(\)/);
  assert.match(main, /binding\.progress = start\.sheet \+ start\.direction \* start\.pendingFraction/);
  assert.match(main, /const dragOwnsFrame = applyDragFrame\(\)/);
  assert.match(main, /if \(!dragOwnsFrame\) binding\.animate\(delta\)/);
  assert.match(main, /shouldCompleteDrag\(start\.fraction, elapsed\)/);
  assert.match(main, /if \(!isActivePointer\(start, event\.pointerId\)\) return/);
  assert.match(main, /if \(!isActivePointer\(pointerStart, event\.pointerId\)\) return/);
  assert.match(main, /ArrowRight/);
  assert.match(main, /ArrowLeft/);
});

test("the page edge offers a restrained, motion-safe hover preview", () => {
  assert.match(main, /const EDGE_PREVIEW_AMOUNT = 0\.055/);
  assert.match(main, /const EDGE_PREVIEW_ZONE = 28/);
  assert.match(main, /prefers-reduced-motion: reduce/);
  assert.match(main, /edgePreviewDirection\(/);
  assert.match(main, /edgePreviewPose\(/);
  assert.match(main, /animateEdgePreview\(delta\)/);
  assert.match(main, /edgePreview\.target = EDGE_PREVIEW_AMOUNT/);
  assert.match(main, /sheet\.flip\(pose\.pageProgress, edgePreview\.direction, pose\.curveIntensity\)/);
  assert.deepEqual(styles.match(/cursor:\s*[^;]+;/g), ["cursor: default;"]);
  assert.doesNotMatch(main, /classList\.(?:add|remove)\("is-dragging"\)/);
  assert.doesNotMatch(styles, /#book-scene\s*\{[^}]*pointer-events:\s*none/s);
});

test("reduced motion snaps automatic page turns", () => {
  assert.match(main, /const reducedMotion = window\.matchMedia/);
  assert.match(main, /flipDuration: reducedMotion \? 0\.001 : 0\.78/);
});

test("the loading live region is removed from the accessibility tree when idle", () => {
  assert.match(html, /id="loading-card"[^>]*hidden/);
  assert.match(html, /id="loading-card"[^>]*aria-hidden="true"/);
  assert.match(main, /loadingCard\.hidden = !value/);
  assert.match(main, /loadingCard\.setAttribute\("aria-hidden", String\(!value\)\)/);
  assert.match(main, /loadingCopy\.textContent = value \? copy : ""/);
});

test("books.js defines at least one edition with an even page count", async () => {
  const { books: editions } = await import("./books.js");
  assert.ok(Array.isArray(editions) && editions.length > 0, "books.js must export a non-empty books array");
  for (const book of editions) {
    assert.match(book.id, /^[a-z0-9-]+$/, `book id must be a slug: ${book.id}`);
    assert.ok(book.pages.length >= 4, `${book.id} needs at least 4 pages`);
    assert.equal(book.pages.length % 2, 0, `${book.id} must have an even page count`);
    assert.ok(book.ratio > 0 && book.ratio < 2, `${book.id} ratio out of range`);
  }
  assert.match(config, /publicDir: "public"/);
  assert.match(main, /const assetUrl = \/\^\(data:\|https\?:\)\/\.test\(source\)/);
  assert.match(main, /import\.meta\.env\.BASE_URL/);
  assert.match(main, /textureLoader\.loadAsync\(assetUrl\)/);
});

test("3D Book 2 keeps the interface silent and the stage white", () => {
  assert.doesNotMatch(html, /QUICK FLIPBOOK STUDY|FOUR EDITIONS|CLICK EITHER SIDE|PREV|NEXT/);
  assert.match(styles, /background:\s*#fff/);
  assert.match(main, /scene\.background = new THREE\.Color\("#ffffff"\)/);
});

test("3D Book 2 uses a straight-on fitted camera and shadow-responsive paper materials", () => {
  assert.match(main, /new THREE\.OrthographicCamera/);
  assert.match(main, /camera\.up\.set\(0, 0, -1\)/);
  assert.match(main, /bookRig\.rotation\.set\(0, 0, 0\)/);
  assert.match(main, /new THREE\.MeshStandardMaterial/);
  assert.match(main, /material\.shadowSide = THREE\.DoubleSide/);
  assert.doesNotMatch(main, /aoMap/);
  assert.match(main, /const spreadWidth = selectedBook\.ratio \* 2/);
  assert.match(main, /camera\.right = halfHeight \* aspect/);
});

test("3D Book 2 renders soft dynamic shadows and refreshes every deformed sheet's normals", () => {
  assert.match(main, /renderer\.shadowMap\.enabled = true/);
  assert.match(main, /renderer\.shadowMap\.type = THREE\.PCFShadowMap/);
  assert.match(main, /keyLight\.castShadow = true/);
  assert.match(main, /keyLight\.shadow\.normalBias = 0\.012/);
  assert.match(main, /keyLight\.shadow\.radius = 3/);
  // Every mesh casts unless the binding has opted it out — which it does only
  // for a surface sitting within a shadow-map bias of another, where two
  // casters would acne against each other instead of reading as one sheet.
  assert.match(main, /object\.castShadow = object\.userData\.shadowCaster !== false/);
  assert.match(main, /object\.receiveShadow = true/);
  assert.match(binding, /mesh\.userData\.shadowCaster = facing === 1/);
  assert.match(main, /dirtySheets\.add\(sheet\)/);
  assert.match(main, /for \(const sheet of dirtySheets\)/);
  assert.match(main, /refreshDirtyPageNormals\(\)/);
  assert.match(main, /sheet\.page\.geometry\.computeVertexNormals\(\)/);
});

test("3D Book 2 bounds geometry, pixel, shadow, and texture work", () => {
  assert.match(main, /const PAGE_SUBDIVISIONS = 16/);
  assert.match(main, /const MAX_PIXEL_RATIO = 1\.5/);
  assert.match(main, /const SHADOW_MAP_SIZE = 1024/);
  assert.match(main, /const MAX_TEXTURE_EDGE = 1024/);
  assert.match(main, /const MAX_TEXTURE_ANISOTROPY = 4/);
  assert.match(main, /Math\.min\(window\.devicePixelRatio, MAX_PIXEL_RATIO\)/);
  assert.match(main, /resizeTextureImage\(texture\)/);
});

test("3D Book 2 memoizes settled sheets and bounds the material cache", () => {
  assert.match(main, /function memoizeSheetDeformation\(\)/);
  assert.match(main, /pageProgress === previousPageProgress/);
  assert.match(main, /const CACHED_BOOK_LIMIT = 2/);
  assert.match(main, /material\.map\?\.dispose\(\)/);
  assert.match(main, /material\.dispose\(\)/);
});

test("3D Book 2 renders on demand and parks a settled edge preview", () => {
  assert.match(main, /function requestRender\(\)/);
  assert.match(main, /let animationFrame = null/);
  assert.match(main, /const previewNeedsFrame = animateEdgePreview\(delta\)/);
  assert.match(main, /if \(previewNeedsFrame \|\| \(!dragOwnsFrame && progressChanged\)\) continueRendering\(\)/);
  assert.match(main, /stop feeding the modifier stack identical poses/);
});

test("the book is built as a case binding, with the spine as its anchor", () => {
  // Hierarchy: covers hang off joint pivots on the spine, leaves off anchors
  // on its inner face. Everything inside the case is carried by the spine.
  assert.match(binding, /this\.#book\.add\(this\.#spine\)/);
  assert.match(binding, /this\.#spine\.add\(this\.#frontJoint, this\.#backJoint, this\.#textBlock\)/);
  assert.match(binding, /this\.#frontJoint\.add\(this\.#frontCover\)/);
  assert.match(binding, /this\.#backJoint\.add\(this\.#backCover\)/);
  assert.match(binding, /pivot\.position\.set\(anchor\.x, anchor\.y, 0\)/);
  // The spine rolls onto its face as the case opens, and that is the only
  // thing it ever does — it is never translated.
  assert.match(binding, /this\.#spine\.rotation\.z = pose\.spineAngle/);
  assert.doesNotMatch(binding, /this\.#spine\.position/);
  // Joints and pivots take the roll back out, so a cover's or a leaf's
  // attitude depends only on how far it has turned.
  assert.match(binding, /this\.#frontJoint\.rotation\.z = pose\.coverAngle - pose\.spineAngle/);
  assert.match(binding, /this\.#backJoint\.rotation\.z = -pose\.spineAngle/);
  assert.match(binding, /pivot\.rotation\.z = -pose\.spineAngle/);
  // Recentring is presentational and lives outside the case.
  assert.match(binding, /this\.#frame\.position\.x = centringOffset\(/);
});

test("cover stiffness is one switch and nothing else", () => {
  assert.match(binding, /export const COVER_STYLES = \["soft", "rigid"\]/);
  assert.match(binding, /this\.#coverStyle === "soft"/);
  assert.match(books, /"coverStyle":/);
});

test("a limp cover droops on the engine's own law, not one invented for it", () => {
  // Curl, bend and twist together — the three Quick FlipBook puts on a leaf.
  // Curl alone leaves the cover dead flat at the half turn, which is exactly
  // where a limp cover is at its floppiest.
  assert.match(binding, /function leafDeformation\(turnProgress, strength, direction = 1\)/);
  assert.match(binding, /curl: \(-1 \+ 2 \* turnProgress\) \* \(-Math\.sin\(angle\) \+ 1\) \* strength/);
  assert.match(binding, /bend: Math\.min\(-Math\.sin\(angle\) \/ 2, -1e-4\) \* direction \* strength/);
  assert.match(binding, /twist: \(Math\.sin\(angle\) \/ 10\) \* strength/);
  assert.match(binding, /const paper = leafDeformation\(turn, pose\.openAmount\)/);
  assert.match(binding, /entry\.curl\.intensity = sign \* paper\.curl/);
  assert.match(binding, /entry\.bend\.force = sign \* paper\.bend/);
  assert.match(binding, /entry\.twist\.angle = sign \* paper\.twist/);
  // Unit geometry sized by the transform above it, the way a FlipPage is, so
  // the modifiers measure a cover and a leaf on the same scale.
  assert.match(binding, /new THREE\.PlaneGeometry\(1, 1, subdivisions, subdivisions\)/);
  assert.match(binding, /sheet\.scale\.set\(boardWidth, 1, caseHeight\)/);
  // Fading with openAmount is what keeps a shut book flat, so t=0 is untouched.
  assert.match(binding, /const turn = entry\.outward === 1 \? pose\.openAmount : 0/);
});

test("the pre-rebuild spine compensations are gone and stay gone", async () => {
  const orbit = await readFile(new URL("./orbit.js", import.meta.url), "utf8");
  for (const source of [main, binding, orbit]) {
    assert.doesNotMatch(source, /SPINE_FLATNESS/);
    assert.doesNotMatch(source, /spineGeometryFromBounds/);
    assert.doesNotMatch(source, /coverSpine/);
    assert.doesNotMatch(source, /clearance/);
  }
  // No measure-the-bounds-then-compensate step, and no visibility toggle
  // standing in for occlusion.
  assert.doesNotMatch(main, /setFromObject\(binding\)/);
  assert.doesNotMatch(binding, /\.visible = false/);
});

test("3D Book 2 settles page materials and avoids per-frame DOM writes", () => {
  assert.match(main, /for \(let index = 0; index < leafMaterials\.length; index \+= 1\) await Promise\.resolve\(\)/);
  assert.match(main, /if \(statusKey === lastStatusKey\) return/);
});
