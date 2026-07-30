import { readFile, writeFile } from "node:fs/promises";

const assessmentPath = new URL("./black-bomb-assessment.json", import.meta.url);
const specPath = new URL("./black-bomb-sculpt-spec.json", import.meta.url);

const assessment = JSON.parse(await readFile(assessmentPath, "utf8"));
const spec = JSON.parse(await readFile(specPath, "utf8"));

const detail = (id, kind, description, affects, type, ref, evidenceRef, confidence = 0.9) => ({
  id,
  kind,
  description,
  region: { x: 0, y: 0, width: 1, height: 1, units: "normalized" },
  scale: "micro-to-meso",
  affects,
  mapsTo: { type, ref },
  evidenceRef,
  confidence
});

const details = [
  detail("petal-bevels", "bevel", "Real chamfered rims catch a cool highlight around each of the six armor petals.", "geometry", "component.localFeatures", "armor-assembly/edge-chamfer", "front-and-top"),
  detail("radial-seams", "seam", "Dark recessed radial seams separate the armor petals.", "geometry+ao", "component.localFeatures", "armor-assembly/radial-seam", "front-and-top"),
  detail("equator-wear", "scratch", "Equatorial reinforcement band has restrained directional edge wear.", "roughness+albedo", "material.localOverrides", "gunmetal/equator-edge-wear", "front"),
  detail("fastener-row", "fastener", "Four recessed gunmetal cross-head fasteners repeat radially.", "geometry", "component.localFeatures", "fastener-cluster/radial-fasteners", "front-and-top"),
  detail("fastener-grooves", "groove", "Cross-shaped recessed grooves remain legible on each fastener head.", "geometry+ao", "component.localFeatures", "fastener-cluster/cross-grooves", "front"),
  detail("neck-rings", "ridge", "Two stepped forged-steel neck rings transition from shell to fuse socket.", "geometry", "component.localFeatures", "fuse-neck/stepped-rings", "front"),
  detail("braided-fuse", "ridge", "Alternating diagonal relief gives the fuse a braided silhouette and grazing-light response.", "geometry+normal", "component.localFeatures", "fuse-cord/braided-ridges", "front"),
  detail("ember-core", "emissive", "Orange-white fuse ember blooms without recoloring the black shell.", "emissive", "material.localOverrides", "ember/hot-core", "front"),
  detail("base-contact", "stain", "Low base collar is darker and rougher at the ground contact edge.", "roughness+ao", "material.localOverrides", "gunmetal/contact-darkening", "front"),
  detail("forged-pitting", "stain", "Sparse forged-steel micro-pitting breaks broad black highlights.", "normal+roughness", "material.localOverrides", "black-forged/micro-pitting", "front-and-side")
];

Object.assign(assessment.preSpecAssessment.objectClass, {
  primaryType: "faceted spherical demolition bomb",
  primaryDomain: "object",
  formLanguage: ["hard-surface", "geometric", "radially symmetric"],
  structureKind: ["compound object", "layered shell", "detachable assembly"],
  motionPotential: ["whole-object transform", "effect-emitter", "detachable", "destructible"],
  materialFamilies: ["forged metal", "painted metal", "brushed steel", "braided fiber", "emissive ember"],
  notes: "Single consistent three-view concept sheet. Hidden underside is inferred by radial symmetry."
});
assessment.preSpecAssessment.complexity.scores = {
  silhouetteComplexity: 2,
  componentCount: 3,
  hierarchyDepth: 2,
  repetitionDensity: 2,
  materialLayerCount: 2,
  localDetailDensity: 2,
  occlusionRisk: 1,
  actionReadinessNeed: 3
};
assessment.preSpecAssessment.complexity.estimatedCounts = {
  macroComponents: 4,
  mesoComponents: 12,
  microFeatureGroups: 10,
  materialLayers: 5,
  repetitionSystems: 3
};
assessment.preSpecAssessment.complexity.reasoning = [
  "The spherical silhouette is simple, but six separable armor petals, radial fasteners, stepped fuse hardware, braided cord, five material responses, and detonation rigging require a complex hierarchy.",
  "The game camera is distant, so silhouette, value separation, emissive timing, and real bevel relief take priority over invisible underside detail."
];
assessment.preSpecAssessment.unknownsToResolveBeforeImplementation = [];
assessment.preSpecAssessment.detailInventory = {
  scanMethod: "component-zones",
  targetMinDetails: 10,
  note: "All ten observed details map to generated geometry or material overrides.",
  details
};
assessment.qualityContract.definitionOfDone = [
  "At gameplay scale the prop reads immediately as a compact black bomb rather than a disc or pickup.",
  "Six armor petals, equatorial band, stepped neck, grounded base, radial fasteners, braided fuse, and ember remain distinguishable under the isometric arena camera.",
  "Fuse acceleration, shell stress, petal separation, detonation core, shock ring, fire lanes, smoke, embers, and metal debris form one continuous animation.",
  "The object stays predominantly near-black; heat is confined to seams, fuse ember, and detonation."
];
assessment.qualityContract.featureGroups = [
  {
    id: "bomb-silhouette",
    name: "Spherical shell, grounded base, neck, and curved fuse silhouette",
    required: true,
    qualityCriteria: ["The body is wider than the base, the fuse breaks the top silhouette, and no view reads as a flat coin."],
    evidenceRefs: ["front-and-side", "top"],
    failureModes: ["disc silhouette", "floating sphere", "fuse too thin to read"]
  },
  {
    id: "armor-assembly",
    name: "Six-petal armor and equatorial reinforcement assembly",
    required: true,
    qualityCriteria: ["Six repeated curved petals have real gaps and bevel highlights; the equatorial band remains continuous."],
    evidenceRefs: ["front-and-top"],
    failureModes: ["monolithic sphere", "painted-on seams", "oversized band hides petals"]
  },
  {
    id: "fuse-hardware",
    name: "Stepped neck, braided fuse, and animated ember",
    required: true,
    qualityCriteria: ["Cord is rooted in the neck socket and the ember is the only pre-detonation hot accent."],
    evidenceRefs: ["front"],
    failureModes: ["floating fuse", "straight plastic rod", "whole shell flashes white"]
  },
  {
    id: "black-metal-lookdev",
    name: "Readable near-black forged, satin, and gunmetal material separation",
    required: true,
    qualityCriteria: ["Black values preserve form under neutral and grazing light; gunmetal fasteners and band separate by roughness, not bright albedo."],
    evidenceRefs: ["front-and-side"],
    failureModes: ["flat black silhouette", "gray plastic", "gold or red body"]
  },
  {
    id: "detonation-continuity",
    name: "Bomb-to-explosion continuity",
    required: true,
    qualityCriteria: ["Recognizable petals and fasteners become debris while the core, shock ring, cardinal fire lanes, smoke, and embers follow the generated VFX sequence."],
    evidenceRefs: ["explosion-sequence"],
    failureModes: ["instant white sphere", "blue magic", "circular blast loses cross-shaped gameplay read"]
  }
];
assessment.qualityContract.visualDeltaChecks = [
  "sphere-to-base-to-fuse silhouette ratio",
  "six-petal radial spacing and seam depth",
  "equator band thickness versus shell radius",
  "near-black forged/satin/gunmetal roughness separation",
  "fuse curvature, braid cadence, and ember isolation",
  "explosion phase continuity and cross-lane readability"
];

spec.suitability = "pass";
spec.scores = {
  object_isolation: 3,
  silhouette_readability: 3,
  depth_inference: 3,
  primitive_decomposition: 3,
  material_procedurality: 3,
  occlusion_risk: 1,
  interaction_fit: 3
};
spec.preSpecAssessment = assessment.preSpecAssessment;
spec.qualityContract = assessment.qualityContract;
spec.referenceCamera = {
  solved: true,
  fovDegrees: 34,
  aspect: 1.7768,
  orientation: { yaw: -28, pitch: -18, roll: 0 },
  positionHint: [2.8, 2.25, 4.6],
  note: "Reference sheet includes matching front, side, and top views; gameplay verification uses the arena's existing isometric camera."
};
spec.assumptions = [
  "Underside repeats the visible six-petal radial construction.",
  "Internal mechanism is intentionally abstracted as an emissive core because the reference provides no mechanical cutaway.",
  "Renderer-native procedural meshes replace Three.js primitives because Riftbomb uses a custom WebGL2 wrapper."
];
spec.coordinateFrame = {
  front: "+Z, camera-facing hero side",
  up: "+Y",
  scaleReference: "body radius 0.38 gameplay world units"
};
spec.silhouette = {
  boundingShape: "faceted sphere with a flat base collar and asymmetric curved fuse",
  aspectRatios: ["shell width:height = 1:0.96", "total prop height:shell width = 1.55:1"],
  symmetry: "six-fold radial shell symmetry; fuse breaks symmetry",
  dominantCurves: ["spherical pressure shell", "shallow armor-petal crown", "five-segment fuse arc"],
  negativeSpaces: ["radial petal seams", "gap inside curved fuse arc"],
  landmarks: ["base collar", "equator band", "six armor petals", "stepped neck", "ember tip"]
};
spec.viewEvidence = [
  {
    id: "front-and-side",
    view: "front/side orthographic pair",
    imageRegion: { x: 0, y: 0, width: 0.67, height: 1, units: "normalized" },
    observations: ["faceted spherical body", "equatorial band", "four visible fasteners", "stepped neck", "curved braided fuse", "low base"],
    confidence: 0.96
  },
  {
    id: "top",
    view: "top orthographic",
    imageRegion: { x: 0.67, y: 0, width: 0.33, height: 1, units: "normalized" },
    observations: ["six radial armor petals", "central fuse socket", "radial fastener rhythm"],
    confidence: 0.93
  },
  {
    id: "explosion-sequence",
    view: "four-stage isometric VFX sequence",
    imageRegion: { x: 0, y: 0, width: 1, height: 1, units: "normalized" },
    observations: ["ignition flash", "petal debris", "cardinal fire lanes", "thin shock ring", "charcoal smoke", "red embers"],
    confidence: 0.9
  }
];

const rootTemplate = spec.componentTree[0];
const component = ({
  id, name, level, role, parent = "root", primitive, topologyClass,
  topologyRationale, material, position = [0, 0, 0], scale = [1, 1, 1],
  dimensions = [1, 1, 1], confidence = 0.92, localFeatures = [],
  attachment = null, breakable = false
}) => ({
  ...structuredClone(rootTemplate),
  id,
  name,
  level,
  role,
  importance: level === "macro" ? 1 : level === "meso" ? 0.85 : 0.7,
  confidence,
  primitive,
  topologyClass,
  topologyRationale,
  parent,
  attachment,
  dimensions: {
    width: dimensions[0],
    height: dimensions[1],
    depth: dimensions[2],
    units: "relative-to-shell-radius",
    confidence
  },
  transform: { position, rotation: [0, 0, 0], scale },
  actionProfile: {
    ...structuredClone(rootTemplate.actionProfile),
    animationRole: parent === null ? "root" : breakable ? "detachable-fragment" : "static-part",
    collider: { type: primitive === "sphere" ? "sphere" : primitive === "tube" ? "capsule" : "box", offset: [0, 0, 0], scale, isTrigger: false, notes: "Gameplay uses the existing bomb collision cell; proxy documents visual part intent." },
    destruction: {
      breakable,
      fractureGroup: breakable ? "armor-shell" : id,
      seamRefs: breakable ? ["radial-seams"] : [],
      detachableFragments: breakable ? [id] : [],
      breakImpulse: breakable ? 1 : 0,
      debrisMaterial: material
    }
  },
  material,
  materialLayers: [material],
  colorMaterialRecipe: {
    dominantAlbedo: {
      "black-forged": "rgba(8, 11, 14, 1)",
      "satin-armor": "rgba(21, 26, 31, 1)",
      "gunmetal": "rgba(48, 56, 64, 1)",
      "fuse-fiber": "rgba(20, 21, 23, 1)",
      "ember": "rgba(255, 106, 0, 1)"
    }[material] || "rgba(8, 11, 14, 1)",
    secondaryAlbedo: {
      "black-forged": "rgba(18, 23, 28, 1)",
      "satin-armor": "rgba(33, 40, 47, 1)",
      "gunmetal": "rgba(89, 99, 107, 1)",
      "fuse-fiber": "rgba(40, 41, 43, 1)",
      "ember": "rgba(255, 245, 194, 1)"
    }[material] || "rgba(18, 23, 28, 1)",
    materialClass: material === "fuse-fiber" ? "fabric" : material === "ember" ? "ceramic" : "metal",
    materialClassConfidence: material === "ember" ? 0.7 : 0.94,
    evidenceRefs: material === "ember" ? ["front-and-side", "explosion-sequence"] : ["front-and-side"]
  },
  localFeatures,
  evidenceRefs: ["front-and-side", "top"],
  fidelityTier: level === "macro" ? "blockout" : level === "meso" ? "structural" : "detail"
});

spec.componentTree = [
  component({
    id: "root", name: "Riftbomb Black Bomb", level: "macro", role: "runtime-root",
    parent: null, primitive: "sphere", topologyClass: "assembled-solid",
    topologyRationale: "Stable runtime pivot and spherical collider proxy; visible geometry lives in named child assemblies.",
    material: "black-forged", dimensions: [1, 1.55, 1]
  }),
  component({
    id: "pressure-shell", name: "Pressure shell", level: "macro", role: "body",
    primitive: "sphere", topologyClass: "continuous-sculpt",
    topologyRationale: "Single radially symmetric curved pressure vessel under the separable armor shell.",
    material: "black-forged", dimensions: [1, 0.96, 1],
    localFeatures: [{ id: "micro-pitting", type: "normal-relief", mapsTo: "black-forged.micro-pitting", confidence: 0.9 }]
  }),
  component({
    id: "armor-assembly", name: "Armor assembly", level: "macro", role: "detachable-shell",
    primitive: "instanced-cluster", topologyClass: "conforming-shell",
    topologyRationale: "Six thin curved plates conform to the pressure shell and separate along radial seams.",
    material: "satin-armor", dimensions: [1.06, 1, 1.06], breakable: true,
    localFeatures: [
      { id: "edge-chamfer", type: "chamfer", bevelRadius: 0.025, segments: 2, confidence: 0.95 },
      { id: "radial-seam", type: "recessed-groove", width: 0.018, depth: 0.014, confidence: 0.94 }
    ]
  }),
  component({
    id: "detonation-core", name: "Detonation core", level: "macro", role: "effect-emitter",
    primitive: "sphere", topologyClass: "assembled-solid",
    topologyRationale: "Compact internal volume anchors ignition, core flash, fire jets, shockwave, and debris impulses.",
    material: "ember", dimensions: [0.42, 0.42, 0.42]
  }),
  ...Array.from({ length: 6 }, (_, index) => component({
    id: `armor-petal-${index + 1}`, name: `Armor petal ${index + 1}`, level: "meso", role: "detachable-plate",
    parent: "armor-assembly", primitive: "extrude", topologyClass: "conforming-shell",
    topologyRationale: "Closed spherical patch with real thickness and chamfered radial boundaries.",
    material: "satin-armor", dimensions: [0.48, 0.88, 0.12], breakable: true,
    localFeatures: [
      { id: "edge-chamfer", type: "chamfer", bevelRadius: 0.025, segments: 2, confidence: 0.95 },
      { id: "radial-seam", type: "recessed-groove", width: 0.018, depth: 0.014, confidence: 0.94 }
    ]
  })),
  component({
    id: "equator-band", name: "Equatorial reinforcement band", level: "meso", role: "reinforcement",
    primitive: "torus", topologyClass: "assembled-solid",
    topologyRationale: "Continuous thick metal ring crossing all armor panels at the equator.",
    material: "gunmetal", dimensions: [1.08, 0.12, 1.08],
    localFeatures: [{ id: "edge-wear", type: "scratch-cluster", mapsTo: "gunmetal.equator-edge-wear", confidence: 0.88 }]
  }),
  component({
    id: "base-collar", name: "Grounding base collar", level: "meso", role: "base",
    primitive: "cylinder", topologyClass: "assembled-solid",
    topologyRationale: "Low stepped cylinder provides a stable grounded silhouette and contact plane.",
    material: "gunmetal", position: [0, -0.48, 0], dimensions: [0.64, 0.12, 0.64],
    attachment: {
      parentId: "root",
      parentSocket: "shell-bottom",
      localStart: [0, -0.5, 0],
      localEnd: [0, -0.42, 0],
      embedDepth: 0.03,
      overlap: 0.03,
      contactType: "overlap",
      gapTolerance: 0.004,
      evidenceRefs: ["front-and-side"]
    },
    localFeatures: [{ id: "contact-darkening", type: "stain", mapsTo: "gunmetal.contact-darkening", confidence: 0.9 }]
  }),
  component({
    id: "fuse-neck", name: "Fuse neck and socket", level: "meso", role: "reinforcement",
    primitive: "cylinder", topologyClass: "assembled-solid",
    topologyRationale: "Two stepped cylinders overlap the shell crown and receive the fuse cord.",
    material: "black-forged", position: [0, 0.5, 0], dimensions: [0.34, 0.24, 0.34],
    attachment: {
      parentId: "root",
      parentSocket: "shell-crown",
      localStart: [0, 0.43, 0],
      localEnd: [0, 0.62, 0],
      embedDepth: 0.035,
      overlap: 0.035,
      contactType: "socket",
      gapTolerance: 0.004,
      evidenceRefs: ["front-and-side"]
    },
    localFeatures: [{ id: "stepped-rings", type: "raised-ridge", count: 2, confidence: 0.96 }]
  }),
  component({
    id: "fuse-cord", name: "Braided fuse cord", level: "meso", role: "effect-fuse",
    parent: "fuse-neck",
    primitive: "tube", topologyClass: "fiber-strand",
    topologyRationale: "Five attached tube segments follow the observed asymmetric fuse arc.",
    material: "fuse-fiber", position: [0, 0.63, 0],
    dimensions: [0.44, 0.5, 0.08],
    attachment: {
      parentId: "fuse-neck",
      parentSocket: "fuse-socket",
      localStart: [0, 0.1, 0],
      localEnd: [0.34, 0.48, 0],
      baseRadius: 0.055,
      endRadius: 0.045,
      embedDepth: 0.04,
      overlap: 0.04,
      contactType: "socket",
      gapTolerance: 0.005,
      evidenceRefs: ["front-and-side"]
    },
    localFeatures: [{ id: "braided-ridges", type: "raised-ridge", count: 10, confidence: 0.88 }]
  }),
  component({
    id: "ember-tip", name: "Fuse ember", level: "meso", role: "effect-socket",
    parent: "fuse-cord", primitive: "sphere", topologyClass: "assembled-solid",
    topologyRationale: "Small faceted emissive cap anchors sparks and fuse-light timing.",
    material: "ember", position: [0.34, 1.1, 0], dimensions: [0.12, 0.12, 0.12],
    attachment: {
      parentId: "fuse-cord",
      parentSocket: "fuse-tip",
      localStart: [0.32, 0.46, 0],
      localEnd: [0.36, 0.5, 0],
      baseRadius: 0.05,
      endRadius: 0.035,
      embedDepth: 0.02,
      overlap: 0.02,
      contactType: "overlap",
      gapTolerance: 0.004,
      evidenceRefs: ["front-and-side"]
    },
    localFeatures: [{ id: "hot-core", type: "emissive", intensity: 5, confidence: 0.98 }]
  }),
  component({
    id: "fastener-cluster", name: "Radial fastener cluster", level: "micro", role: "hardware",
    parent: "armor-assembly", primitive: "instanced-cluster", topologyClass: "surface-relief",
    topologyRationale: "Four repeated recessed metal heads sit proud of selected armor petals.",
    material: "gunmetal", dimensions: [0.12, 0.12, 0.04],
    localFeatures: [
      { id: "radial-fasteners", type: "fastener", count: 4, distribution: "radial", confidence: 0.92 },
      { id: "cross-grooves", type: "recessed-groove", count: 8, confidence: 0.86 }
    ]
  }),
  component({
    id: "petal-bevel-relief", name: "Petal bevel relief", level: "micro", role: "surface-relief",
    parent: "armor-assembly", primitive: "extrude", topologyClass: "surface-relief",
    topologyRationale: "Narrow raised rims affect highlights and remain attached to their parent petals.",
    material: "gunmetal", dimensions: [0.49, 0.89, 0.02]
  }),
  component({
    id: "radial-seam-relief", name: "Radial seam relief", level: "micro", role: "surface-relief",
    parent: "armor-assembly", primitive: "extrude", topologyClass: "surface-relief",
    topologyRationale: "Real gaps separate plates and supply AO rather than a painted line.",
    material: "black-forged", dimensions: [0.02, 0.88, 0.02]
  }),
  component({
    id: "fuse-braid-relief", name: "Fuse braid relief", level: "micro", role: "surface-relief",
    parent: "fuse-cord", primitive: "instanced-cluster", topologyClass: "surface-relief",
    topologyRationale: "Alternating short relief bands ride the cord segments and move with the fuse.",
    material: "gunmetal", dimensions: [0.06, 0.04, 0.06]
  }),
  component({
    id: "ember-spark-socket", name: "Ember spark socket", level: "micro", role: "effect-socket",
    parent: "ember-tip", primitive: "sphere", topologyClass: "assembled-solid",
    topologyRationale: "Named point source for procedural sparks and final fuse acceleration.",
    material: "ember", dimensions: [0.04, 0.04, 0.04],
    attachment: {
      parentId: "ember-tip",
      parentSocket: "spark-origin",
      localStart: [0, 0, 0],
      localEnd: [0, 0.02, 0],
      embedDepth: 0.01,
      overlap: 0.01,
      contactType: "embedded",
      gapTolerance: 0.002,
      evidenceRefs: ["front-and-side"]
    }
  })
];

const existingReferencePbr = new Map(
  spec.materials
    .filter((entry) => entry?.id && entry.referencePbr)
    .map((entry) => [entry.id, entry.referencePbr])
);
const baseMaterial = spec.materials[0];
const material = (id, name, baseColor, metalness, roughness, overrides = []) => ({
  ...structuredClone(baseMaterial),
  id,
  name,
  baseColor,
  color: baseColor,
  albedo: { dominant: baseColor, secondary: [], samplingNotes: "Sampled/normalized from the generated multi-view reference." },
  colorVariation: { palette: [baseColor], pattern: "sparse forged variation", amplitude: 0.035, heightCorrelation: 0.18 },
  metalness: { base: metalness, variation: 0.08 },
  roughness: { base: roughness, variation: 0.12, map: "independent-procedural-field", localResponse: "cavities rougher; worn edges slightly smoother" },
  normal: { pattern: "independent forged micro-pitting field", strength: 0.16, scale: 64, space: "tangent" },
  ambientOcclusion: { cavityStrength: 0.32, contactShadowBias: 0.42, notes: "Concentrate in radial seams, fastener recesses, neck steps, and ground contact." },
  localOverrides: overrides,
  notes: "Procedural renderer-native approximation; no reference texture is projected onto the live game prop."
});

spec.materials = [
  material("black-forged", "Near-black forged pressure steel", "#080B0E", 0.78, 0.32, [
    { id: "micro-pitting", region: "pressure shell and neck", roughness: 0.4, normalStrength: 0.16, evidenceRefs: ["front-and-side"] }
  ]),
  material("satin-armor", "Satin black armor coating", "#151A1F", 0.38, 0.28, [
    { id: "bevel-catchlight", region: "petal chamfer crests", roughness: 0.16, evidenceRefs: ["front-and-top"] }
  ]),
  material("gunmetal", "Brushed gunmetal hardware", "#303840", 0.92, 0.24, [
    { id: "equator-edge-wear", region: "equator band outer edges", roughness: 0.12, color: "#59636B", evidenceRefs: ["front"] },
    { id: "contact-darkening", region: "base collar lower edge", roughness: 0.5, color: "#11161A", evidenceRefs: ["front"] }
  ]),
  material("fuse-fiber", "Charcoal braided fuse fiber", "#141517", 0.0, 0.88, [
    { id: "braid-highlight", region: "alternating diagonal braid ridges", roughness: 0.62, evidenceRefs: ["front-and-side"] }
  ]),
  {
    ...material("ember", "Incandescent fuse and detonation core", "#FF6A00", 0, 0.16, [
      { id: "hot-core", region: "fuse tip and detonation center", emissive: "#FFF5C2", emissiveIntensity: 5, evidenceRefs: ["front-and-side", "explosion-sequence"] }
    ]),
    emissive: { color: "#FF6A00", intensity: 5 }
  }
];
spec.materials.find((entry) => entry.id === "fuse-fiber").qualityTier = "utility";
spec.materials.find((entry) => entry.id === "ember").qualityTier = "utility";
for (const entry of spec.materials) {
  if (existingReferencePbr.has(entry.id)) entry.referencePbr = existingReferencePbr.get(entry.id);
}

spec.repetitionSystems = [
  {
    id: "armor-petals",
    componentRef: "armor-assembly",
    primitive: "spherical-segment",
    count: 6,
    distribution: "radial around +Y at 60-degree intervals",
    variation: "none; reference is manufactured and symmetric",
    buildsGeometry: true,
    instances: 6,
    localFeatureRefs: ["armor-petals.edge-chamfer", "armor-petals.radial-seam"],
    evidenceRefs: ["front-and-top"]
  },
  {
    id: "fasteners",
    componentRef: "fastener-cluster",
    primitive: "cylinder",
    count: 4,
    distribution: "two upper and two lower front-facing petal positions",
    variation: "none",
    buildsGeometry: true,
    instances: 4,
    localFeatureRefs: ["fastener-cluster.radial-fasteners", "fastener-cluster.cross-grooves"],
    evidenceRefs: ["front-and-top"]
  },
  {
    id: "fuse-braid",
    componentRef: "fuse-braid-relief",
    primitive: "torus-band",
    count: 10,
    distribution: "alternating diagonal bands along five tube segments",
    variation: "alternate rotation sign",
    buildsGeometry: true,
    instances: 10,
    localFeatureRefs: ["fuse-cord.braided-ridges"],
    evidenceRefs: ["front-and-side"]
  }
];

spec.featureReviewTargets = [
  { id: "bomb-silhouette", name: "Body/base/neck/fuse silhouette", tier: "critical", passIds: ["blockout"], minimumScore: 0.8, mustPass: true, componentRefs: ["pressure-shell", "base-collar", "fuse-neck", "fuse-cord"], evidenceRefs: ["front-and-side"] },
  { id: "armor-assembly", name: "Six-petal armor assembly", tier: "critical", passIds: ["structural-pass", "form-refinement"], minimumScore: 0.8, mustPass: true, componentRefs: ["armor-assembly", "equator-band"], evidenceRefs: ["front-and-top"] },
  { id: "fuse-hardware", name: "Fuse hardware and braid", tier: "critical", passIds: ["form-refinement", "interaction-pass"], minimumScore: 0.78, mustPass: true, componentRefs: ["fuse-neck", "fuse-cord", "ember-tip"], evidenceRefs: ["front-and-side"] },
  { id: "black-metal-lookdev", name: "Near-black PBR value separation", tier: "critical", passIds: ["material-pass", "surface-pass", "lighting-pass"], minimumScore: 0.75, mustPass: true, componentRefs: ["pressure-shell", "armor-assembly", "equator-band", "fastener-cluster"], evidenceRefs: ["front-and-side"] },
  { id: "detonation-continuity", name: "Bomb-to-explosion continuity", tier: "critical", passIds: ["interaction-pass"], minimumScore: 0.78, mustPass: true, componentRefs: ["armor-assembly", "detonation-core", "ember-spark-socket"], evidenceRefs: ["explosion-sequence"] }
];

spec.lightingFromPhoto = [
  { type: "key", direction: [-0.6, 0.8, 0.45], color: "#E7F4FF", intensity: 1.8, shadowSoftness: 0.42 },
  { type: "fill", direction: [0.7, 0.35, 0.25], color: "#66798A", intensity: 0.38 },
  { type: "rim", direction: [0.3, 0.65, -0.9], color: "#5CC9FF", intensity: 0.7 },
  { type: "environment", color: "#17212A", intensity: 0.34, exposure: 1.05, toneMapping: "ACES-like", background: "#11151A", "ground shadow": "soft, compact, opacity 0.32" }
];
spec.animationAnchors = [
  "root: landing drop, bounce, squash, whole-object pulse",
  "fuse-cord: progressive ember travel and heat cadence",
  "ember-spark-socket: spark orbit and pre-detonation acceleration",
  "armor-petal-1..6: radial stress offset and detonation debris",
  "detonation-core: ignition flash, cardinal jets, shockwave, smoke, and ember emitter"
];
spec.destructionAnchors = [
  "armor-shell fracture group separates six named petals along radial seams",
  "fastener cluster emits smaller gunmetal debris after petal separation",
  "detonation core remains an effect socket and never becomes a fake visible mechanism"
];
spec.risks = [
  "Near-black materials can collapse under the existing arena exposure; preserve roughness and emissive separation rather than raising albedo to gray.",
  "At gameplay distance too many micro meshes can alias; keep petal gaps, band, base, fuse, and ember before fastener grooves.",
  "Smoke translucency is expensive in the custom renderer; use bounded deterministic volumes and particle caps on mobile."
];
spec.performanceBudget = {
  qualityPriority: "gameplay-readability",
  targetTriangles: 9000,
  maxDrawCalls: 80,
  textureSize: 0,
  fpsTarget: 60,
  optimizationPolicy: "Procedural mesh reuse for petals, fasteners, braid, flame lobes, and debris; reduce repeated micro relief on mobile."
};
spec.actionReadiness.defaultRigType = "detonation-ready-procedural-rig";
spec.actionReadiness.destructionPolicy = {
  defaultBreakable: true,
  fractureGroupNaming: "armor-shell, hardware, fuse, detonation-core",
  debrisStrategy: "Reuse named armor petals and fasteners as deterministic fragments, then add a small capped ember/spark particle set."
};

for (const pass of spec.buildPasses) {
  pass.componentRefs = spec.componentTree
    .filter((entry) => {
      if (pass.id === "blockout") return entry.level === "macro" || ["base-collar", "fuse-neck", "fuse-cord"].includes(entry.id);
      if (pass.id === "structural-pass") return entry.level !== "micro";
      if (pass.id === "optimization-pass") return entry.level === "micro" || entry.primitive === "instanced-cluster";
      return true;
    })
    .map((entry) => entry.id);
}

await writeFile(assessmentPath, `${JSON.stringify(assessment, null, 2)}\n`);
await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
