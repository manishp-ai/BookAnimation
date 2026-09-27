// TEMPORARY (delete with tools/inspect.html and the shot-sink plugin in
// vite.config.js). Checks the case binding's structural invariants against the
// live scene graph, sampling openAmount at 0, 0.1 … 1.0 and again through the
// page turns. Exposes globalThis.__invariants() -> report.
import * as THREE from "three";

const SAMPLES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const EPSILON = 1e-6;

function byName(root, name) {
  const found = [];
  root.traverse((object) => {
    if (object.name === name) found.push(object);
  });
  return found;
}

// A named node's world-space segment along the book's height, taken at the
// node's own origin — the hinge/anchor line of whatever is hanging off it.
function axisOf(node, halfHeight) {
  const head = node.localToWorld(new THREE.Vector3(0, 0, -halfHeight));
  const tail = node.localToWorld(new THREE.Vector3(0, 0, halfHeight));
  return [head, tail];
}

function worstDistance(a, b) {
  return Math.max(a[0].distanceTo(b[0]), a[1].distanceTo(b[1]));
}

export function runInvariants(api) {
  const book = api.book;
  const dims = book.dimensions;
  const half = dims.caseHeight / 2;
  const spine = book.spine;
  const board = book.spineBoard;
  const failures = [];
  const measured = {};

  const record = (id, ok, detail) => {
    measured[id] = measured[id] ?? { worst: 0, samples: 0 };
    measured[id].samples += 1;
    if (typeof detail === "number") measured[id].worst = Math.max(measured[id].worst, detail);
    if (!ok) failures.push({ id, detail });
  };

  const spineOrigin = spine.getWorldPosition(new THREE.Vector3());
  let firstSpineOrigin = null;

  const raycaster = new THREE.Raycaster();
  const everything = [];
  book.traverse((object) => {
    if (object.isMesh && object.geometry?.attributes?.position) everything.push(object);
  });
  // "The spine must be hidden from inside" means the board must be — the liner
  // is the paper a binder glues over it, and seeing that paper is the point:
  // it is what does the hiding, by geometry rather than by a visibility flag.
  const spineParts = new Set(byName(book, "SpineBoard"));

  for (const openAmount of SAMPLES) {
    api.setProgress(openAmount);
    book.updateMatrixWorld(true);
    const label = `open=${openAmount}`;

    // 1. Each cover's hinge edge is the spine's own long edge.
    for (const [side, joint] of [["front", book.frontJoint], ["back", book.backJoint]]) {
      const jointAxis = axisOf(joint, half);
      const y = side === "front" ? dims.spineWidth : 0;
      const edge = [
        spine.localToWorld(new THREE.Vector3(dims.innerFaceX, y, -half)),
        spine.localToWorld(new THREE.Vector3(dims.innerFaceX, y, half)),
      ];
      const gap = worstDistance(jointAxis, edge);
      record("1-hinge-on-spine-edge", gap < 1e-9, `${label} ${side} gap=${gap}`);
    }

    // 2. The spine is the anchor: it rolls, and that is all it ever does.
    // Measured inside the case, because the frame above it recentres the whole
    // composition on screen and that translation is presentational — it moves
    // the case as one object and cannot change anything about the binding.
    const origin = spine.position.clone();
    firstSpineOrigin = firstSpineOrigin ?? origin.clone();
    const drift = origin.distanceTo(firstSpineOrigin);
    record("2-spine-never-translates", drift < 1e-9, `${label} drift=${drift}`);
    const wantedRoll = (Math.PI / 2) * openAmount;
    const rollError = Math.abs(spine.rotation.z - wantedRoll);
    record("2-spine-rolls-only", rollError < 1e-9 && spine.rotation.x === 0 && spine.rotation.y === 0,
      `${label} rollError=${rollError}`);

    // 3. Every leaf is bound along the spine's inner face at its own offset.
    let worstAnchor = 0;
    book.sheetPivots.forEach((pivot, index) => {
      const anchor = axisOf(pivot, half);
      const y = dims.coverThickness + dims.textBlockThickness - dims.leafSpacing * (index + 0.5);
      const wanted = [
        spine.localToWorld(new THREE.Vector3(dims.innerFaceX, y, -half)),
        spine.localToWorld(new THREE.Vector3(dims.innerFaceX, y, half)),
      ];
      worstAnchor = Math.max(worstAnchor, worstDistance(anchor, wanted));
    });
    record("3-leaf-bound-on-inner-face", worstAnchor < 1e-9, `${label} worst=${worstAnchor}`);

    // 4. A pastedown stays pasted: within a paper thickness of its cover.
    let worstPaste = 0;
    for (const cover of [book.frontCover, book.backCover]) {
      const printed = byName(cover, "CoverSheet")[0] ?? byName(cover, "CoverBoard")[0];
      const pasted = byName(cover, "Pastedown")[0];
      if (!printed || !pasted) continue;
      const a = printed.getWorldPosition(new THREE.Vector3());
      const b = pasted.getWorldPosition(new THREE.Vector3());
      worstPaste = Math.max(worstPaste, a.distanceTo(b));
    }
    record("4-pastedown-stays-pasted", worstPaste <= dims.coverThickness + EPSILON,
      `${label} worst=${worstPaste}`);

    // 5. The spine never stands taller or wider than the covers it joins.
    const spineBox = new THREE.Box3().setFromObject(board);
    const coverBox = new THREE.Box3()
      .setFromObject(book.frontCover)
      .union(new THREE.Box3().setFromObject(book.backCover));
    const overshootZ = Math.max(coverBox.min.z - spineBox.min.z, spineBox.max.z - coverBox.max.z);
    record("5-spine-within-cover-height", overshootZ <= 1e-6, `${label} overshootZ=${overshootZ}`);
    const tallest = Math.max(coverBox.max.y, new THREE.Box3().setFromObject(book.textBlock).max.y);
    record("5-spine-never-stands-proud", spineBox.max.y <= tallest + 1e-6,
      `${label} spineTop=${spineBox.max.y} tallest=${tallest}`);

    // 6. From inside the open book, the spine is hidden by paper, not by a flag.
    if (openAmount > 0.35) {
      const gutter = spine.getWorldPosition(new THREE.Vector3());
      let hits = 0;
      for (let dz = -0.4; dz <= 0.4001; dz += 0.2) {
        for (let dx = -0.06; dx <= 0.0601; dx += 0.03) {
          for (const height of [0.08, 0.2, 0.5]) {
            const eye = new THREE.Vector3(gutter.x + dx, gutter.y + height, gutter.z + dz);
            const target = new THREE.Vector3(gutter.x + dx * 0.5, gutter.y, gutter.z + dz);
            raycaster.set(eye, target.clone().sub(eye).normalize());
            const hit = raycaster.intersectObjects(everything, false)[0];
            if (hit && spineParts.has(hit.object)) hits += 1;
          }
        }
      }
      record("6-spine-hidden-from-inside", hits === 0, `${label} spineHits=${hits}`);
    }

    // 7. From outside, the spine is what you see at the binding edge. The
    // printed face is the spine's local -x, so stand off along that normal and
    // look back down it.
    const outward = spine
      .localToWorld(new THREE.Vector3(-1, 0, 0))
      .sub(spine.getWorldPosition(new THREE.Vector3()))
      .normalize();
    let outsideHits = 0;
    let outsideRays = 0;
    for (let dz = -0.4; dz <= 0.4001; dz += 0.2) {
      const surface = spine.localToWorld(new THREE.Vector3(0, dims.spineWidth / 2, dz));
      const eye = surface.clone().addScaledVector(outward, 0.5);
      raycaster.set(eye, outward.clone().negate());
      const hit = raycaster.intersectObjects(everything, false)[0];
      outsideRays += 1;
      if (hit && hit.object === board) outsideHits += 1;
    }
    record("7-spine-visible-from-outside", outsideHits === outsideRays,
      `${label} ${outsideHits}/${outsideRays}`);
  }

  // The same structural checks once more, this time while leaves are turning.
  for (const page of [1, 12, 45, 78, book.leafCount + 1]) {
    api.setProgress(page);
    book.updateMatrixWorld(true);
    const label = `page=${page}`;
    const origin = spine.position.clone();
    record("2-spine-never-translates", origin.distanceTo(firstSpineOrigin) < 1e-9, label);
    let worstAnchor = 0;
    book.sheetPivots.forEach((pivot, index) => {
      const anchor = axisOf(pivot, half);
      const y = dims.coverThickness + dims.textBlockThickness - dims.leafSpacing * (index + 0.5);
      const wanted = [
        spine.localToWorld(new THREE.Vector3(dims.innerFaceX, y, -half)),
        spine.localToWorld(new THREE.Vector3(dims.innerFaceX, y, half)),
      ];
      worstAnchor = Math.max(worstAnchor, worstDistance(anchor, wanted));
    });
    record("3-leaf-bound-on-inner-face", worstAnchor < 1e-9, `${label} worst=${worstAnchor}`);
  }

  api.setProgress(0);
  return {
    spineOrigin: spineOrigin.toArray(),
    checks: Object.fromEntries(
      Object.entries(measured).map(([id, value]) => [
        id,
        { samples: value.samples, worst: value.worst, failed: failures.filter((f) => f.id === id).length },
      ]),
    ),
    failures,
    pass: failures.length === 0,
  };
}

globalThis.__invariants = () => runInvariants(globalThis.__binding);
globalThis.__invariantsReady = true;
