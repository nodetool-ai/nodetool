import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  loadTogetherNodesFromManifest,
  type TogetherManifestEntry,
  type TogetherModality
} from "../src/together-factory.js";

// Load via a JSON `require` rather than `fs.readFileSync`: the manifest's model
// ids flow into outbound Together API requests, and reading the bundled file
// through `fs` makes CodeQL model those trusted static ids as file data
// reaching the network (js/file-access-to-http). A module require is the same
// data without the filesystem-read taint source. See src/index.ts.
const require = createRequire(import.meta.url);
const manifest: TogetherManifestEntry[] = require(
  "../src/together-manifest.json"
);

const MODALITY_OUTPUT: Record<TogetherModality, string> = {
  text_to_image: "image",
  image_to_image: "image",
  text_to_video: "video",
  image_to_video: "video",
  text_to_speech: "audio",
  automatic_speech_recognition: "string"
};

describe("together-manifest.json", () => {
  it("is non-empty and covers every media modality", () => {
    const modalities = new Set(manifest.map((e) => e.modality));
    expect(manifest.length).toBeGreaterThan(40);
    for (const m of Object.keys(MODALITY_OUTPUT) as TogetherModality[]) {
      expect(modalities.has(m)).toBe(true);
    }
  });

  it("has unique class names and node identities", () => {
    const classNames = manifest.map((e) => e.className);
    const ids = manifest.map((e) => `${e.modality}:${e.modelId}`);
    expect(new Set(classNames).size).toBe(classNames.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses an output type consistent with each entry's modality", () => {
    for (const e of manifest) {
      expect(e.outputType).toBe(MODALITY_OUTPUT[e.modality]);
    }
  });

  it("declares a required prompt/text input for every generative node", () => {
    for (const e of manifest) {
      if (e.modality === "automatic_speech_recognition") continue;
      const required = e.fields.filter((f) => f.required).map((f) => f.name);
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("requires an image/audio asset on the edit / conditioned nodes", () => {
    const assetModalities: TogetherModality[] = [
      "image_to_image",
      "image_to_video",
      "automatic_speech_recognition"
    ];
    for (const e of manifest.filter((x) => assetModalities.includes(x.modality))) {
      const asset = e.fields.find((f) => f.type === "image" || f.type === "audio");
      expect(asset?.required, `${e.className} must require its asset input`).toBe(true);
    }
  });

  // Drift guard against manifest-models.ts: image/video entries must carry an
  // explicit supportedTasks so a text-to-image-only model is never exposed in
  // the image-to-image picker. A model that only ships a t2i node must not list
  // image_to_image in its supportedTasks.
  it("keeps supportedTasks honest for image entries", () => {
    const i2iModels = new Set(
      manifest.filter((e) => e.modality === "image_to_image").map((e) => e.modelId)
    );
    for (const e of manifest.filter((x) => x.moduleName === "image")) {
      expect(Array.isArray(e.supportedTasks)).toBe(true);
      const claimsI2I = e.supportedTasks!.includes("image_to_image");
      expect(claimsI2I).toBe(i2iModels.has(e.modelId));
    }
  });

  it("builds a NodeClass for every entry without throwing", () => {
    const nodes = loadTogetherNodesFromManifest(manifest);
    expect(nodes.length).toBe(manifest.length);
    for (const n of nodes) {
      expect(typeof (n as { nodeType: string }).nodeType).toBe("string");
      expect((n as { requiredSettings: string[] }).requiredSettings).toEqual([
        "TOGETHER_API_KEY"
      ]);
    }
  });
});
