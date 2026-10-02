import * as THREE from "three";
import { books } from "./books.js";
import { loadEdition } from "./edition.js";
import { SPINE_LABEL_DEFAULTS } from "./spine-label.js";
import { CaseBinding } from "./binding.js";
import { BookController } from "./book-kit/index.js";
import "./style.css";

const chinese = document.documentElement.lang.startsWith("zh");
const readerText = chinese ? {
  loading: "正在准备相册",
  preparing: (title) => `正在准备《${title}》`,
  cover: "封面",
  backCover: "封底",
  spread: (current, total) => `第 ${current} 组跨页，共 ${total} 组`,
} : {
  loading: "Preparing edition",
  preparing: (title) => `Preparing ${title}`,
  cover: "Cover",
  backCover: "Back cover",
  spread: (current, total) => `Spread ${current} of ${total}`,
};
const bookTitle = (book) => chinese ? book.titleZh ?? book.title : book.title;

const canvas = document.querySelector("#book-scene");
const pageState = document.querySelector("#page-state");
const loadingCard = document.querySelector("#loading-card");
const loadingCopy = document.querySelector("#loading-copy");
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
const MAX_PIXEL_RATIO = 1.5;
const SHADOW_MAP_SIZE = 1024;
const PAGE_SUBDIVISIONS = 24;
const MAX_TEXTURE_EDGE = 1024;
const MAX_TEXTURE_ANISOTROPY = 4;
const CACHED_BOOK_LIMIT = 2;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffffff");

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.set(0, 5, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

scene.add(new THREE.HemisphereLight("#ffffff", "#e9e9e6", 0.9));

const keyLight = new THREE.DirectionalLight("#ffffff", 2.65);
keyLight.position.set(-2.8, 5.2, 2.7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 14;
// Fitted to the book plus the reach of an open cover, not to the whole table.
// A +/-3 frustum spent 1024 texels on 6 units — about 6mm per texel, coarse
// enough that the cover's shadow came back as a blocky wedge with a stepped
// edge. Same light, same softness, four times the resolution where it lands.
keyLight.shadow.camera.left = -1.2;
keyLight.shadow.camera.right = 1.2;
keyLight.shadow.camera.top = 1.2;
keyLight.shadow.camera.bottom = -1.2;
keyLight.shadow.bias = -0.00025;
keyLight.shadow.normalBias = 0.012;
keyLight.shadow.radius = 3;
scene.add(keyLight);

const rimLight = new THREE.PointLight("#ffffff", 0.45, 8, 2);
rimLight.position.set(2.5, 1.8, -2.4);
scene.add(rimLight);

// Bounce. A sheet standing up mid-turn shows the viewer the face pointing away
// from the key, and with only the hemisphere reaching it that face renders as
// flat mid-grey — it reads as a shadow lying on the page when nothing is
// casting one. This sits opposite the key and just below the horizon, so it
// can only reach faces the key cannot: every up-facing surface has n·L < 0 and
// takes nothing from it, and the closed book is pixel-for-pixel unchanged
// (verified by differencing the rendered closed state against the no-fill
// baseline — zero on every channel). It casts nothing.
//
// Only just below: at y = -1.4 it fronted the underside of the case squarely
// and washed the shading off it, so the two covers read as one rigid printed
// card from underneath instead of as sheets with a curve in them. Level with
// the table it grazes — strong on the near-vertical faces it is there for,
// weak (n·L ~ 0.09) on anything facing straight down.
const fillLight = new THREE.DirectionalLight("#ffffff", 0.8);
fillLight.position.set(2.9, -0.35, -2.8);
scene.add(fillLight);

const table = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  // ShadowMaterial only ever darkens the shadowed area and is otherwise fully
  // transparent, so it blends to scene.background (white) instead of showing
  // as a lit gray plane under ACES tone mapping wherever no shadow falls.
  new THREE.ShadowMaterial({ opacity: 0.28 }),
);
table.rotation.x = -Math.PI / 2;
table.position.y = -0.035;
table.receiveShadow = true;
scene.add(table);

const bookRig = new THREE.Group();
bookRig.rotation.set(0, 0, 0);
scene.add(bookRig);

// A real hardcover case: back board + spine + front board as one connected
// structure, with the spine as the static anchor both covers hinge from and
// every leaf is bound to. See src/binding.js for the construction and
// src/binding-geometry.js for the measurements it follows.
const binding = new CaseBinding({
  flipDuration: reducedMotion ? 0.001 : 0.78,
  pageSubdivisions: PAGE_SUBDIVISIONS,
  // Rolling the spine re-deforms leaves the page-turn engine never touched, so
  // their normals need recomputing too.
  onSheetDeformed: (sheet) => dirtySheets.add(sheet),
});
bookRig.add(binding);

// The whole interaction surface — drag the book to turn a page, drag the
// space around it to spin the book in 360°, gesture priority locked to
// whichever the pointer started on — lives in src/book-kit, a package with
// no knowledge of this app. It renders every frame itself; nothing here
// runs its own animation loop.
const controller = new BookController({
  canvas,
  renderer,
  scene,
  camera,
  rig: bookRig,
  book: binding,
  reducedMotion,
  onBeforeRender: () => {
    refreshDirtyPageNormals();
    updateStatus();
  },
});
controller.bindKeyboard(window);

let selectedBook = books[0];
let loading = false;
let loadToken = 0;
let lastStatusKey = "";
const textureLoader = new THREE.TextureLoader();
const materialCaches = new Map();
const recentBookIds = [];
const memoizedSheets = new WeakSet();
const dirtySheets = new Set();

function makePaperMaterial(map = null) {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map,
    roughness: 0.88,
    metalness: 0,
    toneMapped: true,
  });
  material.shadowSide = THREE.DoubleSide;
  return material;
}

const blankMaterial = makePaperMaterial();

function resizeTextureImage(texture) {
  const image = texture.image;
  const width = image?.naturalWidth ?? image?.width ?? 0;
  const height = image?.naturalHeight ?? image?.height ?? 0;
  const longestEdge = Math.max(width, height);
  if (!width || !height || longestEdge <= MAX_TEXTURE_EDGE) return;

  const scale = MAX_TEXTURE_EDGE / longestEdge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  texture.image = canvas;
}

function cacheForBook(bookId) {
  if (!materialCaches.has(bookId)) materialCaches.set(bookId, new Map());
  return materialCaches.get(bookId);
}

function pageMaterial(bookId, source) {
  if (!source) return Promise.resolve(blankMaterial);
  const cache = cacheForBook(bookId);
  if (cache.has(source)) return cache.get(source);

  // Inlined (data:) or absolute sources are used as-is so the single-file build works.
  const assetUrl = /^(data:|https?:)/.test(source)
    ? source
    : `${import.meta.env.BASE_URL}${source.replace(/^\/+/, "")}`;
  const request = textureLoader.loadAsync(assetUrl).then((texture) => {
    resizeTextureImage(texture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(
      MAX_TEXTURE_ANISOTROPY,
      renderer.capabilities.getMaxAnisotropy(),
    );
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return makePaperMaterial(texture);
  }).catch(() => blankMaterial);
  cache.set(source, request);
  return request;
}

function disposeBookMaterials(bookId) {
  const cache = materialCaches.get(bookId);
  if (!cache) return;
  materialCaches.delete(bookId);
  for (const request of new Set(cache.values())) {
    request.then((material) => {
      if (material === blankMaterial) return;
      material.map?.dispose();
      material.dispose();
    });
  }
}

function rememberBook(bookId) {
  const previousIndex = recentBookIds.indexOf(bookId);
  if (previousIndex >= 0) recentBookIds.splice(previousIndex, 1);
  recentBookIds.push(bookId);

  const retained = new Set(recentBookIds.slice(-CACHED_BOOK_LIMIT));
  for (const cachedBookId of materialCaches.keys()) {
    if (!retained.has(cachedBookId)) disposeBookMaterials(cachedBookId);
  }
  while (recentBookIds.length > CACHED_BOOK_LIMIT) recentBookIds.shift();
}

function memoizeSheetDeformation() {
  for (const sheet of binding) {
    if (memoizedSheets.has(sheet)) continue;
    const flip = sheet.flip.bind(sheet);
    let previousPageProgress = Number.NaN;
    let previousDirection = Number.NaN;
    let previousCurveIntensity = Number.NaN;
    sheet.flip = (pageProgress, direction, curveIntensity = 1) => {
      if (
        pageProgress === previousPageProgress
        && direction === previousDirection
        && curveIntensity === previousCurveIntensity
      ) return;
      previousPageProgress = pageProgress;
      previousDirection = direction;
      previousCurveIntensity = curveIntensity;
      flip(pageProgress, direction, curveIntensity);
      dirtySheets.add(sheet);
    };
    memoizedSheets.add(sheet);
  }
}

function setLoading(value, copy = readerText.loading) {
  loading = value;
  loadingCard.classList.toggle("is-visible", value);
  loadingCard.hidden = !value;
  loadingCard.setAttribute("aria-hidden", String(!value));
  loadingCopy.textContent = value ? copy : "";
  controller.setLoading(value);
}

async function selectBook(book, immediate = false) {
  if (!book || (book.id === selectedBook.id && !immediate)) return;

  controller.resetInteraction();
  selectedBook = book;
  const token = ++loadToken;
  setLoading(true, readerText.preparing(bookTitle(book)));
  resize();

  // A canvas draws with whatever face is resolved at the moment fillText
  // runs; it cannot wait for a webfont the way laid-out text does. So the
  // spine's face has to be in before the strip is painted, or the label
  // silently falls back to the system mono.
  await spineFontReady();

  // What is printed on the outside of the book is content, not structure, so
  // it comes from public/books/<id>/edition.json at run time. Applied before
  // any texture is requested, so artwork the file names is what gets fetched.
  const edition = await loadEdition(book, {
    baseUrl: import.meta.env.BASE_URL,
    fetchImpl: typeof fetch === "function" ? fetch.bind(globalThis) : undefined,
    warn: (message) => console.warn(`[edition] ${message}`),
  });
  if (token !== loadToken) return;
  selectedBook = edition;
  book = edition;

  const [leafMaterials, frontMaterial, backMaterial, paperMaterial] = await Promise.all([
    Promise.all(book.pages.map((source) => pageMaterial(book.id, source))),
    pageMaterial(book.id, book.case.front),
    pageMaterial(book.id, book.case.back),
    pageMaterial(book.id, book.case.paper),
  ]);
  if (token !== loadToken) return;

  binding.setEdition({
    caseWidth: book.ratio,
    caseHeight: 1,
    thickness: book.thickness,
    coverThickness: book.coverThickness,
    coverStyle: book.coverStyle,
    frontMaterial,
    backMaterial,
    paperMaterial,
    spineAnisotropy: Math.min(MAX_TEXTURE_ANISOTROPY, renderer.capabilities.getMaxAnisotropy()),
    spineLabel: book.spine,
    leafMaterials,
  });
  memoizeSheetDeformation();
  binding.progress = 0;
  refreshAllPageNormals();
  // Quick FlipBook assigns supplied materials through an internal promise
  // chain. Drain those microtasks before making the new edition interactive.
  for (let index = 0; index < leafMaterials.length; index += 1) await Promise.resolve();
  if (token !== loadToken) return;
  binding.traverse((object) => {
    if (object.isMesh) {
      // The binding opts a part out when two of its surfaces sit within a
      // shadow-map bias of each other; everything else casts.
      object.castShadow = object.userData.shadowCaster !== false;
      object.receiveShadow = true;
    }
  });
  rememberBook(book.id);
  setLoading(false);
  updateStatus();
  controller.requestRender();
}

// Resolves once the spine face is usable, whether it loaded or not: a missing
// font must cost the label its typeface, never the book.
let spineFontPromise = null;
function spineFontReady() {
  if (spineFontPromise) return spineFontPromise;
  const sample = `${SPINE_LABEL_DEFAULTS.weight} 32px ${SPINE_LABEL_DEFAULTS.family}`;
  spineFontPromise = (document.fonts?.load(sample, "WORLD PASSPORT") ?? Promise.resolve())
    .catch((error) => console.warn(`[spine] font unavailable, falling back: ${error?.message ?? error}`));
  return spineFontPromise;
}

function refreshAllPageNormals() {
  for (const sheet of binding) sheet.page.geometry.computeVertexNormals();
  dirtySheets.clear();
}

function refreshDirtyPageNormals() {
  for (const sheet of dirtySheets) sheet.page.geometry.computeVertexNormals();
  dirtySheets.clear();
}

function updateStatus() {
  const previewSheet = controller.previewSheet;
  const current = previewSheet === null
    ? Math.round(binding.currentPage || 0)
    : previewSheet * 2;
  const total = binding.totalPages || selectedBook.pages.length;
  const shown = Math.min(current, total);
  const statusKey = `${loading}:${shown}:${total}`;
  if (statusKey === lastStatusKey) return;
  lastStatusKey = statusKey;
  if (shown === 0) pageState.textContent = readerText.cover;
  else if (shown >= total) pageState.textContent = readerText.backCover;
  else pageState.textContent = readerText.spread(Math.ceil(shown / 2), Math.ceil(total / 2));
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / Math.max(1, height);
  const spreadWidth = selectedBook.ratio * 2;
  const padding = width < 620 ? 1.16 : 1.1;
  const halfHeight = Math.max(0.62, (spreadWidth * padding) / (2 * aspect));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  controller.requestRender();
}

window.addEventListener("resize", resize);
resize();
selectBook(books[0], true);

// Test seam, not debug scaffolding: tools/invariants.html asserts the binding's
// construction against the live scene (hinge edges, a motionless spine, sheet
// anchors, raycast occlusion), which needs the real objects and a real GPU.
// Inert unless a harness page sets the flag before this module runs; nothing in
// the app or the production build ever does.
if (globalThis.__BINDING_HARNESS__) {
  globalThis.__binding = {
    scene,
    camera,
    renderer,
    book: binding,
    bookRig,
    get spine() { return binding.spineBoard; },
    get sheetCount() { return binding.leafCount; },
    get maxProgress() { return binding.steps; },
    setProgress(value) {
      binding.progress = value;
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
    },
  };
}
