/**
 * `read_media_bytes` — the gated way a chat action reads the bytes behind a
 * media ref.
 *
 * A chat action runs without a `ProcessingContext`, by design (#4780), so the
 * `media.*` sandbox bridge throws there. The capability is the sanctioned route
 * to the same answer: it runs host-side with the run's context, past the
 * permission gate, and hands the bytes back as base64 the guest revives with
 * `fromBase64`. Without it, a chat user can generate an image and never read it
 * back, so generate-then-composite is impossible from chat.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const ASSET_ID = "asset-generated-1";

/** A context whose asset store holds one generated image. */
function contextWithAsset(): ProcessingContext {
  return {
    userId: "user-media",
    resolveAssetBytes: async (uri: string) =>
      uri.startsWith(`asset://${ASSET_ID}`)
        ? { bytes: PNG, attempts: [uri] }
        : { bytes: null, attempts: [uri] },
    resolveWorkspacePath: (p: string) => p
  } as unknown as ProcessingContext;
}

function run(context: ProcessingContext): CapabilityRun {
  return createCapabilityRun({ context, gate: UNGATED });
}

/** One chat action whose only platform surface is the capability run. */
async function action(
  capabilityRun: CapabilityRun,
  code: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const session = createChatCodeActSession({
    tools: [],
    executeTool: async (call) => capabilityRun.invoke(call.name, call.args),
    capabilityRun
  });
  return JSON.parse(await session.executeAction({ code })) as {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

describe("read_media_bytes from a chat action", () => {
  it("reads back the bytes of a generated asset", async () => {
    const observation = await action(
      run(contextWithAsset()),
      `
        import { read_media_bytes } from "@nodetool-ai/sandbox-nodetool/media";
        const result = await read_media_bytes({ uri: "asset://${ASSET_ID}.png" });
        const bytes = fromBase64(result.content_base64);
        return {
          size: result.size,
          mimeType: result.mime_type,
          head: Array.from(bytes.slice(0, 4)),
          isBytes: bytes instanceof Uint8Array
        };
      `
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({
      size: PNG.length,
      mimeType: "image/png",
      head: [137, 80, 78, 71],
      isBytes: true
    });
  }, 60_000);

  it("feeds the bytes straight into the image bridge", async () => {
    // The point of the capability: generate → read → composite, all in chat.
    const observation = await action(
      run(contextWithAsset()),
      `
        import { read_media_bytes } from "@nodetool-ai/sandbox-nodetool/media";
        const result = await read_media_bytes({ uri: "asset://${ASSET_ID}.png" });
        return { bytes: fromBase64(result.content_base64).length };
      `
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({ bytes: PNG.length });
  }, 60_000);

  it("names the ref it could not read", async () => {
    const observation = await action(
      run(contextWithAsset()),
      `
        import { read_media_bytes } from "@nodetool-ai/sandbox-nodetool/media";
        try {
          await read_media_bytes({ uri: "asset://nope.png" });
          return "resolved";
        } catch (e) {
          return e.message;
        }
      `
    );
    expect(observation.ok).toBe(true);
    expect(String(observation.result)).toContain("asset://nope.png");
  }, 60_000);

  it("still refuses the ungated media.* bridge in the same action", async () => {
    // The capability is an addition, not a reopening: the sandbox bridge stays
    // context-less in chat.
    const observation = await action(
      run(contextWithAsset()),
      `return await media.bytes({ type: "image", uri: "asset://${ASSET_ID}.png" });`
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain(
      "media.bytes is not available without a context"
    );
  }, 60_000);
});
