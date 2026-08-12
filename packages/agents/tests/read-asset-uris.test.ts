/**
 * `read_asset` accepts the forms an agent actually holds.
 *
 * The tool was written against one shape — a `assets/<name>` storage key — so
 * an agent holding the `asset://<id>` URI a generation returned had nothing
 * that worked. A real session burned four round trips guessing (bare id,
 * `asset://<id>`, `asset://<id>.png`, `file://…`) and got "Asset not found"
 * every time. Each of those forms now resolves, and a genuine miss names the
 * form that does work.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";

const ID = "abc123";
const TEXT = "generated report";
const BYTES = new TextEncoder().encode(TEXT);

/** A context whose asset resolver answers for one id, plus a storage map. */
function context(): ProcessingContext {
  const stored = new Map<string, Uint8Array>([
    ["memory://assets/notes.txt", BYTES],
    ["/api/storage/blob.bin", BYTES]
  ]);
  return {
    userId: "user-read-asset",
    storage: {
      retrieve: async (uri: string) => stored.get(uri) ?? null,
      store: async () => "",
      uriForKey: (key: string) => key
    },
    resolveAssetBytes: async (uri: string) =>
      uri.startsWith(`asset://${ID}`)
        ? { bytes: BYTES, attempts: [uri] }
        : { bytes: null, attempts: [uri] }
  } as unknown as ProcessingContext;
}

async function readAsset(name: string): Promise<Record<string, unknown>> {
  const run = createCapabilityRun({ context: context(), gate: UNGATED });
  return (await run.invoke("read_asset", { name })) as Record<string, unknown>;
}

describe("read_asset accepts every form an agent holds", () => {
  it("resolves an asset:// URI", async () => {
    const result = await readAsset(`asset://${ID}`);
    expect(result.success).toBe(true);
    expect(result.content).toBe(TEXT);
  });

  it("resolves an asset:// URI carrying an extension", async () => {
    const result = await readAsset(`asset://${ID}.png`);
    expect(result.success).toBe(true);
    expect(result.content).toBe(TEXT);
  });

  it("resolves a bare asset id", async () => {
    const result = await readAsset(ID);
    expect(result.success).toBe(true);
    expect(result.content).toBe(TEXT);
  });

  it("resolves a storage key URI", async () => {
    const result = await readAsset("/api/storage/blob.bin");
    expect(result.success).toBe(true);
    expect(result.content).toBe(TEXT);
  });

  it("still resolves a legacy assets/<name> key", async () => {
    const result = await readAsset("notes.txt");
    expect(result.success).toBe(true);
    expect(result.content).toBe(TEXT);
  });

  it("names the form that works when nothing resolves", async () => {
    const result = await readAsset("asset://not-a-real-asset");
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("asset://");
    expect(String(result.error)).toContain("list_assets");
  });
});
