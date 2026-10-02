import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.js", import.meta.url), "utf8");
const binding = await readFile(new URL("./binding.js", import.meta.url), "utf8");
const geometry = await readFile(new URL("./binding-geometry.js", import.meta.url), "utf8");
const books = await readFile(new URL("./books.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("./style.css", import.meta.url), "utf8");
const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
const bindingLabel = await readFile(new URL("./spine-label.js", import.meta.url), "utf8");
const bookKit = await readFile(new URL("./book-kit/BookController.js", import.meta.url), "utf8");

// The Quick FlipBook lifecycle still drives every page turn; the case binding
// owns the engine now, so the calls live in binding.js and main.js talks to
// the binding through the reusable book-kit controller.
test("3D Book 2 uses the requested Quick FlipBook lifecycle", () => {
  assert.match(binding, /import \{ FlipBook \} from "quick_flipbook"/);
  assert.match(binding, /new FlipBook\(/);
  assert.match(binding, /this\.#engine\.setPages\(/);
  assert.match(binding, /this\.#engine\.progress = pose\.leafProgress/);
  assert.match(bookKit, /this\.#book\.animate\(delta\)/);
});

// The on-screen prev/next/rotate buttons are gone — the reader is driven by
// gesture alone: drag the book to turn a page, drag the space around it to
// spin the book, arrow keys as an accessible fallback. All of that lives in
// the reusable src/book-kit package; main.js only wires it to this app's
// scene and calls it via `controller`.
test("reader has no on-screen navigation or rotation buttons and is driven by gesture", () => {
  assert.doesNotMatch(html, /id="previous-page"|id="next-page"|id="rotate-view"/);
  assert.doesNotMatch(main, /rotateMode|rotateButton|previousButton|nextButton/);
  assert.doesNotMatch(styles, /\.page-button/);
  assert.match(main, /import \{ BookController \} from "\.\/book-kit\/index\.js"/);
  assert.match(main, /new BookController\(/);
  assert.match(main, /controller\.bindKeyboard\(/);
});

test("the book-kit controller drives page turns, rotation, and keyboard navigation", () => {
  assert.match(bookKit, /this\.#book\.nextPage\(\)/);
  assert.match(bookKit, /this\.#book\.previousPage\(\)/);
  assert.match(bookKit, /pointerdown/);
  assert.match(bookKit, /pointermove/);
  assert.match(bookKit, /pointerleave/);
  assert.match(bookKit, /pointercancel/);
  assert.match(bookKit, /canvas\.addEventListener\("pointermove"/);
  assert.match(bookKit, /start\.pendingFraction = fraction/);
  assert.match(bookKit, /const preview = this\.#takeEdgePreviewForDrag\(\)/);
  assert.match(bookKit, /startFraction: preview\?\.fraction \?\? 0/);
  assert.match(bookKit, /start\.startFraction/);
  assert.match(bookKit, /#applyDragFrame\(\) \{/);
  assert.match(bookKit, /this\.#book\.progress = start\.sheet \+ start\.direction \* start\.pendingFraction/);
  assert.match(bookKit, /const dragOwnsFrame = this\.#applyDragFrame\(\)/);
  assert.match(bookKit, /if \(!dragOwnsFrame\) this\.#book\.animate\(delta\)/);
  assert.match(bookKit, /shouldCompleteDrag\(start\.fraction, elapsed\)/);
  assert.match(bookKit, /if \(!isActivePointer\(start, event\.pointerId\)\) return/);
  assert.match(bookKit, /if \(!isActivePointer\(this\.#pointerStart, event\.pointerId\)\) return/);
  assert.match(bookKit, /ArrowRight/);
  assert.match(bookKit, /ArrowLeft/);
});

test("empty space around the book drives a 360° rotation, gated by the same hit test that gates page drag", () => {
  assert.match(bookKit, /nextOrbitTarget\(/);
  assert.match(bookKit, /this\.#orbitSpin\.update\(delta\)/);
  assert.match(bookKit, /this\.#orbitTilt\.update\(delta\)/);
  assert.match(bookKit, /this\.#rig\.rotation\.z = this\.#orbitSpin\.value/);
  assert.match(bookKit, /this\.#rig\.rotation\.x = this\.#orbitTilt\.value/);
});

test("the page edge offers a restrained, motion-safe hover preview", () => {
  assert.match(bookKit, /const EDGE_PREVIEW_AMOUNT = 0\.055/);
  assert.match(bookKit, /const EDGE_PREVIEW_ZONE = 28/);
  assert.match(main, /prefers-reduced-motion: reduce/);
  assert.match(bookKit, /edgePreviewDirection\(/);
  assert.match(bookKit, /edgePreviewPose\(/);
  assert.match(bookKit, /this\.#animateEdgePreview\(delta\)/);
  assert.match(bookKit, /this\.#edgePreview\.target = EDGE_PREVIEW_AMOUNT/);
  assert.match(bookKit, /sheet\.flip\(pose\.pageProgress, this\.#edgePreview\.direction, pose\.curveIntensity\)/);
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
  // ...and for a leaf lying in its pile. Ninety sheets 0.4mm apart inside a
  // shadow map that resolves 2.3mm per texel cannot be told apart by depth,
  // so they acne against each other into one hard grey slab across the
  // spread. Only the leaf actually lifted off its pile casts; the covers and
  // spine, far enough apart to resolve, still draw the outline on the table.
  assert.match(binding, /#refreshLeafShadows\(\) \{/);
  assert.match(binding, /const lifted = turn > CaseBinding\.#LIFT_EPSILON && turn < 1 - CaseBinding\.#LIFT_EPSILON/);
  assert.match(binding, /if \(object\.isMesh\) object\.castShadow = lifted/);
  assert.match(binding, /if \(object\.isMesh\) object\.userData\.shadowCaster = false/);
  // Outside the redeform guard: a leaf finishing its turn has to stop casting
  // even on a frame where no leaf needed re-deforming.
  assert.match(binding, /this\.#refreshLeafShadows\(\);\n\n    if \(pose\.spineAngle !== this\.#appliedSpineAngle/);
  assert.match(main, /dirtySheets\.add\(sheet\)/);
  assert.match(main, /for \(const sheet of dirtySheets\)/);
  assert.match(main, /refreshDirtyPageNormals\(\)/);
  assert.match(main, /sheet\.page\.geometry\.computeVertexNormals\(\)/);
});

test("3D Book 2 bounds geometry, pixel, shadow, and texture work", () => {
  // 24, not the upstream 16. The page's curl dies out over its outer fifth,
  // and at 16 that tail is four vertices: the facets read as two hard lines
  // down an otherwise smooth spread. Upstream hides them under photographs;
  // these pages are near-white, so they show. 40 chokes the renderer at
  // ninety leaves -- 24 holds 6.9ms median frames and a 44ms first paint.
  assert.match(main, /const PAGE_SUBDIVISIONS = 24/);
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

test("the book-kit controller renders on demand, in one loop, and parks a settled edge preview", () => {
  assert.match(bookKit, /requestRender\(\) \{/);
  assert.match(bookKit, /#frame = null/);
  assert.match(bookKit, /const previewNeedsFrame = this\.#edgePreviewEnabled \? this\.#animateEdgePreview\(delta\) : false/);
  assert.match(bookKit, /if \(previewNeedsFrame \|\| \(!dragOwnsFrame && progressChanged\) \|\| orbitSettling\)/);
  assert.match(bookKit, /stop feeding the modifier stack identical poses/);
  // One render loop, not the old two independent requestAnimationFrame
  // chains (page animation and orbit used to run separately).
  assert.equal((bookKit.match(/requestAnimationFrame/g) ?? []).length, 2);
});

test("the book is built as a case binding, with the spine as its anchor", () => {
  // Hierarchy: covers hang off joint pivots on the spine, leaves off anchors
  // on its inner face. Everything inside the case is carried by the spine.
  assert.match(binding, /this\.#book\.add\(this\.#spine\)/);
  assert.match(binding, /this\.#spine\.add\(this\.#frontJoint, this\.#backJoint, this\.#textBlock\)/);
  assert.match(binding, /this\.#frontJoint\.add\(this\.#frontCover\)/);
  assert.match(binding, /this\.#backJoint\.add\(this\.#backCover\)/);
  assert.match(binding, /pivot\.position\.set\(anchor\.x, anchor\.y, 0\)/);
  // The spine rolls onto its face as the case opens and on up onto its other
  // edge as it shuts, and rotating is the only thing it ever does — it is
  // never translated. Setting the case down on the table is the `book` node's
  // job, one level out, and moves the whole case as one object.
  assert.match(binding, /this\.#spine\.rotation\.z = pose\.spineAngle/);
  assert.doesNotMatch(binding, /this\.#spine\.position/);
  // Joints and pivots take the roll back out, so a cover's or a leaf's
  // attitude depends only on how far it has turned.
  assert.match(binding, /this\.#frontJoint\.rotation\.z = pose\.coverAngle - pose\.spineAngle/);
  assert.match(binding, /this\.#backJoint\.rotation\.z = pose\.backCoverAngle - pose\.spineAngle/);
  assert.match(binding, /pivot\.rotation\.z = -pose\.spineAngle/);
  // Recentring is presentational and lives outside the case.
  assert.match(binding, /this\.#frame\.position\.x = centringOffset\(/);
  assert.match(binding, /this\.#book\.position\.y = -dimensions\.spineWidth \+ caseLift\(/);
  // The reader's own travel limit and the pose's step count are the same
  // number, taken from the same function. Spelling it out twice is how the
  // closing step became unreachable: `progress` clamped one step short of it.
  assert.match(binding, /get steps\(\) \{ return this\.#dimensions \? bindingSteps\(/);
  assert.match(binding, /this\.#progress = clamp\(value, 0, this\.steps\)/);
});

// The book's name down its spine, and the run-time JSON that sets it.
test("the outside of the book is content, loaded from JSON at run time", () => {
  assert.match(main, /import \{ loadEdition \} from "\.\/edition\.js"/);
  // Applied before any texture request, so artwork the file names is what
  // actually gets fetched rather than the built-in artwork being loaded first.
  assert.ok(
    main.indexOf("await loadEdition(book") < main.indexOf("pageMaterial(book.id, book.case.front)"),
    "the edition patch must be applied before the case artwork is requested",
  );
  assert.match(main, /spineLabel: book\.spine/);
  assert.match(binding, /this\.#buildSpine\(frontMaterial, paperMaterial, spineAnisotropy, \{/);
  // A canvas cannot wait for a webfont the way laid-out text can, so the face
  // has to be resolved before the strip is painted.
  assert.match(main, /await spineFontReady\(\)/);
  assert.ok(
    main.indexOf("await spineFontReady()") < main.indexOf("binding.setEdition({"),
    "the spine face must be loaded before the strip is drawn",
  );
  assert.match(styles, /@font-face/);
  assert.match(styles, /DejaVuSans-Bold-subset\.woff2/);
});

test("the spine label is legible over whatever the artwork is doing", () => {
  // The artwork under the label runs near-black to near-white, so type of any
  // one colour loses contrast somewhere along the word. The halo gives every
  // letter its own background; drawn as one pass under the whole word, since
  // per glyph it shows where one letter's halo crosses its neighbour's stem.
  assert.match(bindingLabel, /if \(label\.halo > 0\) \{/);
  assert.match(bindingLabel, /context\.shadowBlur = fontPx \* label\.halo/);
  assert.doesNotMatch(bindingLabel, /ui-monospace/, "a coding mono is not a spine face");
  assert.match(bindingLabel, /family: '"DejaVu Sans"/);
  assert.match(bindingLabel, /weight: 700/);
});

test("the spine label is drawn to suit the face it lands on", () => {
  // Measured against the real mesh: the outward face presents the strip
  // mirrored across its width. Getting this wrong prints the title backwards.
  assert.match(binding, /const SPINE_LABEL_FACE = \{ flipU: true, flipV: false \}/);
  assert.match(binding, /\.\.\.SPINE_LABEL_FACE,/);
  // Widen the strip for type, but never scale its length: the mesh maps u
  // across the spine whatever the texel count, and keeping the crop's aspect
  // would make the canvas thousands of pixels long for nothing.
  assert.match(binding, /canvas\.width = label\?\.text \? Math\.max\(cropWidth, SPINE_LABEL_MIN_PX\) : cropWidth/);
  assert.match(binding, /canvas\.height = sourceHeight/);
});

test("cover stiffness is one switch and nothing else", () => {
  assert.match(binding, /export const COVER_STYLES = \["soft", "rigid"\]/);
  assert.match(binding, /this\.#coverStyle === "soft"/);
  assert.match(books, /"coverStyle":/);
});

// The engine writes the bend in unit-sheet space, where the page is 1 long.
// The width is then scaled to leafWidth and the bend's depth is not, so the
// droop is deeper than the page is wide and a bent leaf reaches further from
// its anchor than it is long; at the quarter turn that excess rotates into
// the horizontal and throws the fore-edge past the board. Measured before
// the fix: 0.0663 past a cover half-width of 0.6815.
// The hit test hands this list straight to a non-recursive raycast — that is
// the whole point of it being short. The covers are Groups, which carry no
// geometry, so handing them over unflattened left the spine strip as the only
// thing on the book a pointer could actually hit, and every grab anywhere else
// on the book read as empty space and spun the book instead of turning a page.
test("the hit-test hull is meshes, not the groups the covers are", () => {
  const hull = binding.slice(binding.indexOf("get hullMeshes()"), binding.indexOf("get steps()"));
  assert.match(hull, /traverse\(\(object\) => \{ if \(object\.isMesh\) meshes\.push\(object\); \}\)/);
  assert.doesNotMatch(hull, /return \[this\.#frontCover, this\.#backCover/);
  // Read on every pointer move, so it is built once and kept until the case
  // that produced it is torn down.
  assert.match(hull, /if \(this\.#hull\) return this\.#hull/);
  assert.match(binding, /this\.#spineBoard = null;\s*\n\s*this\.#hull = null;/);
});

// Measured from the cover side with the offscreen detector in tools/inspect.mjs
// (render the covers alone, then the whole book, count cover pixels a page
// replaced): flush-cut leaves broke 1310 pixels across 13 of 132 sampled
// poses; with the square it is 241 across 5, and what is left is a sliver of
// fore edge in a not-yet-shut case at the tilt limit. The square is the whole
// difference, so it is the thing to keep honest here.
test("the text block is trimmed inside the boards on every free edge", () => {
  assert.match(binding, /const \{ leafWidth, leafHeight \} = dimensions/);
  assert.match(geometry, /leafWidth: boardWidth - safeSquare/);
  assert.match(geometry, /leafHeight: caseHeight - 2 \* safeSquare/);
  // The hinge edge is the binding and stays flush — a square there would hang
  // the leaves off the spine.
  assert.doesNotMatch(geometry, /leafWidth: boardWidth - 2 \* safeSquare/);
  assert.match(geometry, /export const SQUARE_RATIO/);
});

test("a turning leaf cannot reach further than it is long", () => {
  assert.match(binding, /sheet\.bend\.force = Math\.min\(sheet\.bend\.force \* CaseBinding\.#BEND_DEPTH, -1e-4\)/);
  assert.match(binding, /static #BEND_DEPTH = 0\.58/);
  // Only the bend. The curl and the gutter flex are what hold the resting
  // pile above the pastedown -- scaling those too drops the leaves under it
  // and the cover draws over them.
  // Sized to the text block, not to the boards — the square is the difference,
  // and it is what keeps a curled leaf inside the cover's silhouette.
  assert.match(binding, /sheet\.scale\.set\(leafWidth, 1, -leafHeight\)/);
  assert.doesNotMatch(binding, /sheet\.scale\.set\(leafWidth, 1, -caseHeight\)/);
  assert.doesNotMatch(binding, /unitScale/);
});

test("a limp cover droops on the engine's own law, not one invented for it", () => {
  // Curl and bend together. Curl alone leaves the cover dead flat at the half
  // turn, which is exactly where a limp cover is at its floppiest; the twist
  // is left out because on a cover it shears the case out of register.
  assert.match(binding, /function leafDeformation\(turnProgress, strength, direction = 1\)/);
  assert.match(binding, /curl: \(-1 \+ 2 \* turnProgress\) \* \(-Math\.sin\(angle\) \+ 1\) \* strength/);
  assert.match(binding, /bend: Math\.min\(-Math\.sin\(angle\) \/ 2, -1e-4\) \* direction \* strength/);
  // Covers fade on the same number the leaves do, so the case flattens with
  // the block instead of doming through it on the last leaf.
  assert.match(binding, /const paper = leafDeformation\(turn, this\.#curve\.intensity\)/);
  assert.match(binding, /entry\.curl\.intensity = sign \* paper\.curl/);
  assert.match(binding, /entry\.bend\.force = sign \* paper\.bend/);
  assert.doesNotMatch(binding, /new MODIFIERS\.Twist/);
  // Unit geometry sized by the transform above it, the way a FlipPage is, so
  // the modifiers measure a cover and a leaf on the same scale.
  assert.match(binding, /new THREE\.PlaneGeometry\(1, 1, subdivisions, subdivisions\)/);
  assert.match(binding, /sheet\.scale\.set\(boardWidth, 1, caseHeight\)/);
  // Fading with openAmount is what keeps a shut book flat, so t=0 is untouched.
  assert.match(binding, /const turn = entry\.outward === 1 \? pose\.openAmount : pose\.closeAmount/);
});

test("the pre-rebuild spine compensations are gone and stay gone", async () => {
  const orbit = await readFile(new URL("./book-kit/orbit.js", import.meta.url), "utf8");
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
