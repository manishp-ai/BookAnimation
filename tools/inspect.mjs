// TEMPORARY inspection harness (delete with tools/inspect.html and the
// shot-sink plugin in vite.config.js). Renders the live book from fixed
// viewpoints and POSTs the PNGs to the dev server.
import * as THREE from "three";

async function ready() {
  for (let i = 0; i < 100; i += 1) {
    if (globalThis.__binding?.sheetCount) return globalThis.__binding;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("binding harness never appeared");
}

const book = await ready();

async function post(name, camera, width, height, scene = book.scene) {
  const target = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.SRGBColorSpace });
  book.renderer.setRenderTarget(target);
  book.renderer.render(scene, camera);
  const buffer = new Uint8Array(width * height * 4);
  book.renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer);
  book.renderer.setRenderTarget(null);
  target.dispose();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = ((height - 1 - y) * width + x) * 4;
      const destination = (y * width + x) * 4;
      image.data[destination] = buffer[source];
      image.data[destination + 1] = buffer[source + 1];
      image.data[destination + 2] = buffer[source + 2];
      image.data[destination + 3] = buffer[source + 3];
    }
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await fetch(`/__shot/${name}`, { method: "POST", body: blob });
  return name;
}

globalThis.__cap3 = (name, progress, eye = [0.9, 0.7, 1.2], w = 900, h = 650, look = [0, 0, 0]) => {
  if (progress !== null) book.setProgress(progress);
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 40);
  camera.position.set(...eye);
  camera.up.set(0, 1, 0);
  camera.lookAt(...look);
  camera.updateProjectionMatrix();
  return post(name, camera, w, h);
};

globalThis.__capTop = (name, progress, halfH = 0.62, w = 900, h = 700) => {
  book.setProgress(progress);
  const camera = new THREE.OrthographicCamera(-halfH * w / h, halfH * w / h, halfH, -halfH, 0.1, 20);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return post(name, camera, w, h);
};

globalThis.__profile = (pivotName, progress) => {
  book.setProgress(progress);
  book.scene.updateMatrixWorld(true);
  let mesh = null;
  book.book.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    let node = object;
    while (node && node.name !== pivotName) node = node.parent;
    if (node && !mesh) mesh = object;
  });
  if (!mesh) return null;
  const position = mesh.geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const points = [];
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    if (Math.abs(vertex.y) > 1e-6) continue;
    const world = vertex.clone();
    mesh.localToWorld(world);
    points.push([Number(world.x.toFixed(4)), Number(world.y.toFixed(4))]);
  }
  points.sort((a, b) => a[0] - b[0]);
  const unique = [];
  for (const point of points) {
    if (!unique.length || Math.abs(point[0] - unique[unique.length - 1][0]) > 1e-5) unique.push(point);
  }
  return unique;
};

globalThis.__harnessReady = true;

globalThis.__THREE = THREE;
globalThis.__box = (name, progress) => {
  book.setProgress(progress);
  book.book.updateMatrixWorld(true);
  const found = [];
  book.book.traverse((object) => {
    if (object.name !== name || !object.geometry?.attributes?.position) return;
    const position = object.geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let nonFinite = 0;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i);
      if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y) || !Number.isFinite(vertex.z)) {
        nonFinite += 1;
        continue;
      }
      const world = vertex.clone();
      object.localToWorld(world);
      for (let a = 0; a < 3; a += 1) {
        const v = world.getComponent(a);
        min[a] = Math.min(min[a], v);
        max[a] = Math.max(max[a], v);
      }
    }
    found.push({
      name,
      parent: object.parent.name,
      nonFinite,
      min: min.map((v) => Number(v.toFixed(4))),
      max: max.map((v) => Number(v.toFixed(4))),
    });
  });
  return found;
};
globalThis.__orbitShot = (name, progress, spin, tilt, halfH = 0.72, w = 900, h = 760) => {
  book.bookRig.rotation.set(tilt, spin, 0);
  const shot = globalThis.__capTop(name, progress, halfH, w, h);
  return shot.finally(() => book.bookRig.rotation.set(0, 0, 0));
};

// TEMPORARY: does any page draw in front of a cover? Rendered from the cover
// side, the covers must occlude the text block completely. Renders the covers
// alone, then the whole book, and counts pixels where a cover was replaced —
// which is exactly "pages passing through the cover", with no viewpoint
// guesswork and no eyeballing.
globalThis.__throughCover = (progress, tilt = 0, spin = Math.PI, w = 300, h = 230) => {
  const target = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
  const camera = new THREE.OrthographicCamera(-0.72 * w / h, 0.72 * w / h, 0.72, -0.72, 0.1, 20);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const shoot = () => {
    const pixels = new Uint8Array(w * h * 4);
    book.renderer.setRenderTarget(target);
    book.renderer.render(book.scene, camera);
    book.renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    book.renderer.setRenderTarget(null);
    return pixels;
  };

  // Shadows off for both renders: the leaf casts onto the cover, and a shadow
  // appearing when the text block is shown is not a page drawing through it.
  const shadows = book.renderer.shadowMap.enabled;
  book.renderer.shadowMap.enabled = false;
  book.bookRig.rotation.set(tilt, 0, spin);
  book.setProgress(progress);
  book.book.textBlock.visible = false;
  const covers = shoot();
  book.book.textBlock.visible = true;
  const full = shoot();
  book.renderer.shadowMap.enabled = shadows;
  book.bookRig.rotation.set(0, 0, 0);
  target.dispose();

  let coverPixels = 0;
  let broken = 0;
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    if (covers[o] > 245 && covers[o + 1] > 245 && covers[o + 2] > 245) continue;
    coverPixels += 1;
    const delta = Math.abs(covers[o] - full[o])
      + Math.abs(covers[o + 1] - full[o + 1])
      + Math.abs(covers[o + 2] - full[o + 2]);
    if (delta > 40) broken += 1;
  }
  return { coverPixels, broken, pct: Number((100 * broken / Math.max(1, coverPixels)).toFixed(2)) };
};
