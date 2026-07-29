import fs from "node:fs/promises";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// GLTFLoader expects these browser globals even when we only inspect embedded
// textures from Node. The image pixels are irrelevant to mesh/animation metadata.
globalThis.self ??= globalThis;
if (typeof globalThis.Image === "undefined") {
  globalThis.Image = class Image {
    set src(_value) {
      queueMicrotask(() => {
        this.width = 1;
        this.height = 1;
        this.onload?.();
      });
    }
  };
}

const input = process.argv[2];
if (!input) throw new Error("Usage: node inspect-game-model.mjs <model.glb>");

const bytes = await fs.readFile(input);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
});

const nodes = [];
gltf.scene.traverse((node) => {
  if (!node.isMesh) return;
  const geometry = node.geometry;
  nodes.push({
    name: node.name,
    type: node.type,
    material: Array.isArray(node.material)
      ? node.material.map((item) => item.name)
      : node.material?.name,
    vertices: geometry.attributes.position?.count,
    indices: geometry.index?.count ?? 0,
    firstUv: geometry.attributes.uv
      ? [geometry.attributes.uv.getX(0), geometry.attributes.uv.getY(0)]
      : null,
    attributes: Object.fromEntries(
      Object.entries(geometry.attributes).map(([name, attribute]) => [name, attribute.itemSize])
    )
  });
});

console.log(JSON.stringify({
  nodes,
  animations: gltf.animations.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.length
  }))
}, null, 2));
