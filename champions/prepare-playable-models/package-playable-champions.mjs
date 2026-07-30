import { readFile } from "node:fs/promises";
import path from "node:path";

const playableChampions = ["katarina", "zed", "renekton", "vladimir", "gangplank"];

export const katarinaDaggerPresentation = Object.freeze({
  readyScale: 2.3,
  readyPitch: Math.PI / 3,
  readyHeading: Math.PI * (31 / 18),
  readyHeadingSwing: 0.055,
  readyHeight: 0.58,
  readyHover: 0.035
});

const encode = async (filePath) => (await readFile(filePath)).toString("base64");

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const normalise = (vector) => {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
};

/**
 * Extract one complete base-skin dagger from Riot's Katarina OBJ. The source mesh
 * stores blade, guard, grip, and pommel as four disconnected components beside
 * their mirrored counterparts. Packaging only this authored geometry keeps the
 * runtime prop small and guarantees that the dropped dagger matches the champion.
 */
export async function packageKatarinaDagger(repositoryRoot) {
  const source = await readFile(
    path.join(repositoryRoot, "champions", "katarina", "Katarina_Base_MAT.obj"),
    "utf8"
  );
  const vertices = [];
  const faces = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      vertices.push(line.trim().split(/\s+/).slice(1).map(Number));
    } else if (line.startsWith("f ")) {
      faces.push(line.trim().split(/\s+/).slice(1).map((entry) =>
        Number(entry.split("/")[0]) - 1
      ));
    }
  }

  const parent = vertices.map((_, index) => index);
  const find = (index) => parent[index] === index
    ? index
    : (parent[index] = find(parent[index]));
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (const face of faces) {
    for (let index = 1; index < face.length; index += 1) union(face[0], face[index]);
  }

  const components = new Map();
  for (let index = 0; index < vertices.length; index += 1) {
    const root = find(index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(index);
  }
  const daggerComponents = [...components.values()].map((indices) => {
    const points = indices.map((index) => vertices[index]);
    const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
    return { indices, min, max };
  }).filter(({ min, max }) =>
    min[0] >= 4 && max[0] <= 15 && max[1] < 15 && min[2] > -16 && max[2] < 60
  ).sort((left, right) =>
    (left.min[2] + left.max[2]) - (right.min[2] + right.max[2])
  );
  if (daggerComponents.length !== 4) {
    throw new Error(`Expected four Katarina dagger components, found ${daggerComponents.length}`);
  }

  const selected = new Set(daggerComponents.flatMap(({ indices }) => indices));
  const selectedPoints = [...selected].map((index) => vertices[index]);
  const min = [0, 1, 2].map((axis) => Math.min(...selectedPoints.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...selectedPoints.map((point) => point[axis])));
  const length = max[2] - min[2];
  const centreX = (min[0] + max[0]) * 0.5;
  const centreY = (min[1] + max[1]) * 0.5;
  const centreZ = (min[2] + max[2]) * 0.5;
  const transform = ([x, y, z]) => [
    (y - centreY) / length,
    (z - centreZ) / length,
    (x - centreX) / length
  ];

  const componentNames = ["pommel", "grip", "guard", "blade"];
  const packed = [];
  const parts = {};
  for (let componentIndex = 0; componentIndex < daggerComponents.length; componentIndex += 1) {
    const component = new Set(daggerComponents[componentIndex].indices);
    const first = packed.length / 6;
    for (const face of faces) {
      if (!face.every((index) => component.has(index))) continue;
      for (let triangle = 1; triangle < face.length - 1; triangle += 1) {
        const points = [face[0], face[triangle], face[triangle + 1]]
          .map((index) => transform(vertices[index]));
        const edgeA = points[1].map((value, axis) => value - points[0][axis]);
        const edgeB = points[2].map((value, axis) => value - points[0][axis]);
        const faceNormal = normalise(cross(edgeA, edgeB));
        for (const point of points) packed.push(...point, ...faceNormal);
      }
    }
    parts[componentNames[componentIndex]] = {
      first,
      count: packed.length / 6 - first
    };
  }
  return {
    geometry: Buffer.from(new Float32Array(packed).buffer).toString("base64"),
    parts
  };
}

export async function packagePlayableChampions(repositoryRoot) {
  const entries = await Promise.all(playableChampions.map(async (champion) => {
    const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
    const [vertices, indices, texture, metadataSource] = await Promise.all([
      encode(path.join(modelDirectory, `${champion}-model-vertices.bin`)),
      encode(path.join(modelDirectory, `${champion}-model-indices.bin`)),
      encode(path.join(modelDirectory, `${champion}-model-texture.webp`)),
      readFile(path.join(modelDirectory, `${champion}-model-metadata.json`), "utf8")
    ]);
    const metadata = JSON.parse(metadataSource);
    const payload = {
      vertices,
      indices,
      texture: `data:image/webp;base64,${texture}`
    };
    if (champion === "katarina") {
      const dagger = await packageKatarinaDagger(repositoryRoot);
      payload.dagger = dagger.geometry;
      payload.daggerParts = dagger.parts;
      payload.daggerPresentation = katarinaDaggerPresentation;
    }
    if (metadata.runtime === "vat-v1") {
      const [frames, normals] = await Promise.all([
        encode(path.join(modelDirectory, `${champion}-model-frames.bin`)),
        encode(path.join(modelDirectory, `${champion}-model-normals.bin`))
      ]);
      Object.assign(payload, {
        frames,
        normals,
        animation: {
          runtime: metadata.runtime,
          vertexCount: metadata.vertexCount,
          frameCount: metadata.frameCount,
          textureDimensions: metadata.textureDimensions,
          positionMin: metadata.positionBounds.min,
          positionRange: metadata.positionBounds.range,
          actions: metadata.animationActions,
          clips: metadata.animationClips
        }
      });
    }

    return `  ${champion}: Object.freeze(${JSON.stringify(payload)})`;
  }));

  return `"use strict";\n\nconst PLAYABLE_CHAMPIONS = Object.freeze({\n${entries.join(",\n")}\n});\n`;
}

export { playableChampions };
