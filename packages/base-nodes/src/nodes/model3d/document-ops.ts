import { NodeIO } from "@gltf-transform/core";
import {
  mergeDocuments,
  simplify,
  unpartition,
  weld
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

import type { GltfJson, JsonResourceRef, Model3DRefLike } from "./types.js";
import {
  embedJsonResourceUris,
  modelBytes
} from "./utils.js";

const gltfIo = new NodeIO();

export async function convertGlbToGltf(bytes: Uint8Array): Promise<Uint8Array> {
  const document = await gltfIo.readBinary(bytes);
  const jsonDocument = await gltfIo.writeJSON(document);
  const json = JSON.parse(JSON.stringify(jsonDocument.json)) as GltfJson & {
    buffers?: JsonResourceRef[];
    images?: JsonResourceRef[];
  };
  embedJsonResourceUris(json.buffers, jsonDocument.resources);
  embedJsonResourceUris(json.images, jsonDocument.resources);
  return new TextEncoder().encode(JSON.stringify(json));
}

export async function decimateGlb(
  bytes: Uint8Array,
  targetRatio: number
): Promise<Uint8Array> {
  const document = await gltfIo.readBinary(bytes);
  const ratio = Math.max(0.01, Math.min(1, targetRatio));

  if (ratio >= 1) {
    return bytes;
  }

  await MeshoptSimplifier.ready;
  await document.transform(
    weld({}),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio,
      error: 0.01
    })
  );

  return gltfIo.writeBinary(document);
}

export async function mergeGlbModels(models: Model3DRefLike[]): Promise<Uint8Array> {
  const [first, ...rest] = models;
  if (!first) return new Uint8Array(0);

  const target = await gltfIo.readBinary(modelBytes(first));
  for (const model of rest) {
    const source = await gltfIo.readBinary(modelBytes(model));
    mergeDocuments(target, source);
  }

  await target.transform(unpartition());
  return gltfIo.writeBinary(target);
}
