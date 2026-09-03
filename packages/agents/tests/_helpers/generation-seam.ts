/**
 * The generation seam over a hand-built fake context.
 *
 * The media capabilities call `context.runGeneration` /
 * `runGenerationWith` (docs/media-generation-tracking-design.md § 5), which a
 * real `ProcessingContext` implements over `dispatchCapability`. The suites
 * here build plain-object contexts that stub `runProviderPrediction` and
 * assert on its calls, so this shim implements the seam over that stub: it
 * mints an id, runs the stub, persists bytes through the fake's `createAsset`
 * when `persist` was asked for and the fake exposes one, and answers the
 * `GenerationResult` shape. The stub's call list is untouched, so every
 * existing assertion on it keeps reading.
 */

import { randomUUID } from "node:crypto";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { AssetRef } from "@nodetool-ai/protocol";

interface SeamFake {
  runProviderPrediction?: (req: unknown) => Promise<unknown>;
  hasModelInterface?: (name: string) => boolean;
  createAsset?: (args: {
    name: string;
    contentType: string;
    content: Uint8Array;
    metadata?: Record<string, unknown> | null;
  }) => Promise<unknown>;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav"
};

function sniff(bytes: Uint8Array, capability: string, mime?: string): string {
  if (mime) return mime;
  if (capability.includes("video") || capability === "lip_sync")
    return "video/mp4";
  if (capability.includes("speech") || capability.includes("music"))
    return "audio/mpeg";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

async function persist(
  fake: SeamFake,
  id: string,
  req: {
    capability: string;
    persist?: { name?: string; mime?: string };
    nodeId?: string;
  },
  output: unknown
): Promise<AssetRef[]> {
  if (!req.persist) return [];
  const hasCreate =
    typeof fake.createAsset === "function" &&
    (typeof fake.hasModelInterface !== "function" ||
      fake.hasModelInterface("createAsset"));
  if (!hasCreate) return [];
  const buffers =
    output instanceof Uint8Array
      ? [output]
      : Array.isArray(output) && output.every((b) => b instanceof Uint8Array)
        ? (output as Uint8Array[])
        : [];
  const assets: AssetRef[] = [];
  for (const bytes of buffers) {
    const mime = sniff(bytes, req.capability, req.persist.mime);
    const ext = EXT[mime] ?? "bin";
    try {
      const created = (await fake.createAsset!({
        name: req.persist.name ?? `${req.capability}.${ext}`,
        contentType: mime,
        content: bytes,
        metadata: { generation_id: id }
      })) as { id?: unknown } | null;
      const assetId = created && typeof created.id === "string" ? created.id : null;
      if (!assetId) continue;
      assets.push({
        type: mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "image",
        uri: `asset://${assetId}.${ext}`,
        asset_id: assetId,
        metadata: { generation_id: id }
      });
    } catch {
      // The real seam logs and moves on; the caller falls back to the workspace.
    }
  }
  return assets;
}

/**
 * Add `runGeneration` / `runGenerationWith` to a fake context that stubs
 * `runProviderPrediction`. Returns the same object, typed as a context.
 */
export function withGenerationSeam<T extends object>(
  fake: T
): T & ProcessingContext {
  const f = fake as T & SeamFake & Record<string, unknown>;
  if (typeof f.runGeneration !== "function") {
    f.runGeneration = async (req: {
      id?: string;
      capability: string;
      persist?: { name?: string; mime?: string };
      nodeId?: string;
    }) => {
      const id = req.id ?? randomUUID();
      if (typeof f.runProviderPrediction !== "function") {
        throw new Error("fake context has no runProviderPrediction");
      }
      const startedAt = Date.now();
      const output = await f.runProviderPrediction(req);
      const assets = await persist(f, id, req, output);
      return { id, output, assets, receipt: null, duration_ms: Date.now() - startedAt };
    };
  }
  if (typeof f.runGenerationWith !== "function") {
    f.runGenerationWith = async (
      req: {
        id?: string;
        capability: string;
        persist?: { name?: string; mime?: string };
      },
      call: (provider: unknown, signal: AbortSignal) => Promise<unknown>
    ) => {
      const id = req.id ?? randomUUID();
      const startedAt = Date.now();
      const output = await call(null, new AbortController().signal);
      const assets = await persist(f, id, req, output);
      return { id, output, assets, receipt: null, duration_ms: Date.now() - startedAt };
    };
  }
  return f as T & ProcessingContext;
}
