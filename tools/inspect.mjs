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
