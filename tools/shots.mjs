// TEMPORARY (delete with tools/shots.html and the shot-sink plugin in
// vite.config.js): renders the live book from four fixed viewpoints at five
// open amounts and POSTs the resulting contact sheets to the dev server so the
// case-binding rebuild can be compared before/after as real image files.
//
// Works against either build: the pre-rebuild tree exposes window.__passportDebug,
// the rebuilt tree exposes window.__binding.
import * as THREE from "three";

const TILE = 340;
const VIEWS = ["front", "inside-gutter", "top", "outside-spine"];
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function adapter() {
  const modern = window.__binding;
  if (modern?.book) {
    return {
      label: "after",
      scene: modern.scene,
      renderer: modern.renderer,
      appCamera: modern.camera,
      ready: () => modern.sheetCount > 0,
      maxProgress: () => modern.maxProgress,
      setProgress: (value) => modern.setProgress(value),
      gutterX: () => modern.spine.getWorldPosition(new THREE.Vector3()).x,
    };
  }
  const legacy = window.__passportDebug;
  if (legacy?.flipBook) {
    return {
      label: "before",
      scene: legacy.scene,
      renderer: legacy.renderer,
      appCamera: legacy.camera,
      ready: () => legacy.flipBook.pages.length > 0,
      maxProgress: () => legacy.flipBook.pages.length,
      setProgress: (value) => legacy.setProgress(value),
      gutterX: () => legacy.flipBook.getWorldPosition(new THREE.Vector3()).x,
    };
  }
  return null;
}

// Fixed poses so the same camera sees the same world box in both builds; the
// gutter-relative ones follow whatever the build calls its gutter, which is
// itself the thing under test (it must not move in the rebuilt tree).
function cameraFor(view, api) {
  const gutter = api.gutterX();
  if (view === "front") {
    // The app's own top-down orthographic pose, re-fitted to a square tile so
    // the contact sheet doesn't stretch it out of the window's aspect ratio.
    const camera = new THREE.OrthographicCamera(-0.78, 0.78, 0.78, -0.78, 0.1, 20);
    camera.position.set(0, 5, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return camera;
  }

  const camera = new THREE.PerspectiveCamera(1, 1, 0.01, 40);
  camera.up.set(0, 1, 0);
  if (view === "inside-gutter") {
    // Down inside the V of the open book, close to the page plane, aimed along
    // the gutter — the viewpoint the spine must never be visible from.
    camera.fov = 58;
    camera.position.set(gutter + 0.15, 0.072, 0.30);
    camera.lookAt(gutter - 0.01, -0.014, -0.02);
  } else if (view === "top") {
    // Raking view down onto the book's head, where the spine overshooting the
    // covers' top/bottom bound would show as a lip.
    camera.fov = 38;
    camera.position.set(gutter * 0.5, 0.30, 1.72);
    camera.lookAt(gutter * 0.5, -0.014, 0);
  } else {
    camera.fov = 34;
    camera.position.set(gutter - 1.42, 0.34, 0.6);
    camera.lookAt(gutter, -0.015, 0);
  }
  camera.updateProjectionMatrix();
  return camera;
}

function renderTile(api, view) {
  const camera = cameraFor(view, api);
  const target = new THREE.WebGLRenderTarget(TILE, TILE, {
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  });
  api.renderer.setRenderTarget(target);
  api.renderer.clear();
  api.renderer.render(api.scene, camera);

  const buffer = new Uint8Array(TILE * TILE * 4);
  api.renderer.readRenderTargetPixels(target, 0, 0, TILE, TILE, buffer);
  api.renderer.setRenderTarget(null);
  target.dispose();

  // readRenderTargetPixels hands back GL's bottom-up rows; flip into canvas order.
  const flipped = new Uint8ClampedArray(buffer.length);
  const stride = TILE * 4;
  for (let row = 0; row < TILE; row += 1) {
    flipped.set(buffer.subarray(row * stride, row * stride + stride), (TILE - 1 - row) * stride);
  }
  return new ImageData(flipped, TILE, TILE);
}

async function sheet(api, name, progressFor, rowLabel) {
  const gutterWidth = 150;
  const headerHeight = 34;
  const canvas = document.createElement("canvas");
  canvas.width = gutterWidth + VIEWS.length * TILE;
  canvas.height = headerHeight + FRACTIONS.length * TILE;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.font = "600 15px Arial, sans-serif";
  context.textBaseline = "middle";
  context.fillText(`${api.label} — ${name}`, 14, headerHeight / 2);
  VIEWS.forEach((view, column) => {
    context.fillText(view, gutterWidth + column * TILE + 10, headerHeight / 2);
  });

  const tile = document.createElement("canvas");
  tile.width = TILE;
  tile.height = TILE;
  const tileContext = tile.getContext("2d");

  for (let row = 0; row < FRACTIONS.length; row += 1) {
    const fraction = FRACTIONS[row];
    api.setProgress(progressFor(fraction));
    // setTimeout, not requestAnimationFrame: this harness has to keep running
    // when the preview tab is not the foreground one, where rAF never fires.
    await new Promise((resolve) => setTimeout(resolve, 60));

    context.font = "500 14px Arial, sans-serif";
    context.fillStyle = "#111111";
    context.fillText(
      rowLabel(fraction),
      14,
      headerHeight + row * TILE + TILE / 2,
    );
    for (let column = 0; column < VIEWS.length; column += 1) {
      tileContext.putImageData(renderTile(api, VIEWS[column]), 0, 0);
      context.drawImage(tile, gutterWidth + column * TILE, headerHeight + row * TILE);
      context.strokeStyle = "rgba(0,0,0,.18)";
      context.strokeRect(gutterWidth + column * TILE + 0.5, headerHeight + row * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await fetch(`/__shot/${api.label}-${name}.png`, { method: "POST", body: blob });
  return `${api.label}-${name}.png`;
}

async function run() {
  const started = performance.now();
  let api = adapter();
  while (!api?.ready()) {
    if (performance.now() - started > 25000) {
      document.title = "shots:timeout";
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    api = adapter();
  }
  await new Promise((resolve) => setTimeout(resolve, 400));

  const written = [];
  // "Open" = the cover swinging through its joint, the motion this rebuild is about.
  written.push(await sheet(api, "cover-open", (f) => f, (f) => `open ${Math.round(f * 100)}%`));
  // "Read" = the whole book travelling from front cover to back, so page turns
  // deep in the text block are covered too.
  const max = api.maxProgress();
  written.push(await sheet(api, "read-through", (f) => f * max, (f) => `read ${Math.round(f * 100)}%`));

  api.setProgress(0);
  document.title = `shots:done ${written.join(" ")}`;
}

run();
