/**
 * Builds the glTF scene the 3D surface loop replays
 * (`demo/public/casts/model3d/composition.gltf`).
 *
 * It runs the product's own `@nodetool-ai/model3d` operations — the same ones
 * `edit_model3d` and the browser editor's `ui_3d_*` verbs apply — so the scene
 * in the loop is one an agent could have built, not a file drawn by hand.
 *
 * It imports `packages/model3d/src` directly rather than the package
 * specifier: tsx resolves the specifier to `dist/`, so a source fix that has
 * not been rebuilt would silently write the old geometry.
 *
 *   npx tsx scripts/build-3d-cast-scene.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  applyOperations,
  emptyGltf,
  type Model3DFile,
  type Model3DOperation,
} from "../../packages/model3d/src/index.js";

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/casts/model3d/composition.gltf"
);

/**
 * A product shot: a plinth, the product on it, two accents, and a key light.
 * No ground plane — the editor's own grid reads as the floor, and a scaled
 * plane under it only fights the grid for the same pixels.
 */
const OPERATIONS: Model3DOperation[] = [
  { op: "add_object", kind: "cylinder", name: "Plinth" },
  { op: "set_transform", target: "Plinth", position: [0, 0.12, 0], scale: [1.3, 0.24, 1.3] },
  { op: "set_material_color", target: "Plinth", color: "#334155" },

  { op: "add_object", kind: "box", name: "Product" },
  { op: "set_transform", target: "Product", position: [0, 0.72, 0], rotation: [0, 24, 0], scale: [0.85, 0.85, 0.85] },
  { op: "set_material_color", target: "Product", color: "#e879f9" },

  { op: "add_object", kind: "sphere", name: "Accent" },
  { op: "set_transform", target: "Accent", position: [1.35, 0.34, 0.85], scale: [0.34, 0.34, 0.34] },
  { op: "set_material_color", target: "Accent", color: "#fb7185" },

  { op: "add_object", kind: "torus", name: "Halo" },
  { op: "set_transform", target: "Halo", position: [-1.75, 0.95, -1.2], rotation: [72, 0, 14], scale: [0.55, 0.55, 0.55] },
  { op: "set_material_color", target: "Halo", color: "#fcd34d" },

  { op: "add_object", kind: "directionalLight", name: "Key" },
  { op: "set_transform", target: "Key", position: [3, 5, 2] },

  { op: "select_object", target: "Product" },
];

const file: Model3DFile = {
  json: emptyGltf("Product shot"),
  bin: null,
  format: "gltf",
};
applyOperations(file, OPERATIONS);

writeFileSync(OUT, `${JSON.stringify(file.json, null, 2)}\n`, "utf8");
console.log(`wrote ${OUT} (${file.json.nodes?.length ?? 0} nodes)`);
