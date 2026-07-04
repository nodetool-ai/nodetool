/**
 * Unit test for materializing native-image assistant content into assets.
 *
 * Native providers (e.g. OpenAI Responses) emit an assistant message whose
 * content array carries raw base64 image bytes. The runner must persist those
 * as real assets and rewrite each block to an `asset_id` reference so raw
 * base64 never lands in the DB or on the wire. Blocks that already reference an
 * asset, and non-image blocks, pass through untouched.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnifiedWebSocketRunner } from "../src/unified-websocket-runner.js";
import type { MessageContent } from "@nodetool-ai/protocol";

const storeMock = vi.fn(async () => undefined);
vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: (...args: unknown[]) => storeMock(...args)
}));

let assetSeq = 0;
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  class FakeAsset {
    id = `asset-${++assetSeq}`;
    size = 0;
    constructor(public readonly props: Record<string, unknown>) {}
    async save(): Promise<void> {}
  }
  return { ...actual, Asset: FakeAsset };
});

interface MaterializeRunner {
  materializeAssistantImageContent(
    content: MessageContent[],
    userId: string,
    workflowId: string | null
  ): Promise<Array<Record<string, unknown>>>;
}

describe("materializeAssistantImageContent", () => {
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    assetSeq = 0;
    storeMock.mockClear();
    runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        async process() {
          return {};
        }
      })
    });
  });

  it("persists raw base64 image blocks as assets and rewrites them", async () => {
    const b64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const content: MessageContent[] = [
      { type: "text", text: "Here is your image" },
      {
        type: "image_url",
        image: { type: "image", data: b64, mimeType: "image/png" }
      }
    ];

    const out = await (
      runner as unknown as MaterializeRunner
    ).materializeAssistantImageContent(content, "user-9", "wf-1");

    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(out[0]).toEqual({ type: "text", text: "Here is your image" });
    expect(out[1]).toEqual({
      type: "image_url",
      image: { type: "image", asset_id: "asset-1", mimeType: "image/png" }
    });
    // The raw base64 must not survive into the persisted block.
    expect(JSON.stringify(out)).not.toContain(b64);
  });

  it("leaves already-referenced and non-image blocks untouched", async () => {
    const content: MessageContent[] = [
      { type: "text", text: "note" },
      {
        type: "image_url",
        image: { type: "image", asset_id: "existing-42", mimeType: "image/png" }
      },
      {
        type: "image_url",
        image: { type: "image", uri: "asset://existing-7.png" }
      }
    ];

    const out = await (
      runner as unknown as MaterializeRunner
    ).materializeAssistantImageContent(content, "user-9", null);

    expect(storeMock).not.toHaveBeenCalled();
    expect(out).toEqual(content);
  });

  it("decodes Uint8Array image data as well", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const content: MessageContent[] = [
      {
        type: "image_url",
        image: { type: "image", data: bytes, mimeType: "image/jpeg" }
      }
    ];

    const out = await (
      runner as unknown as MaterializeRunner
    ).materializeAssistantImageContent(content, "user-9", "wf-2");

    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(out[0]).toEqual({
      type: "image_url",
      image: { type: "image", asset_id: "asset-1", mimeType: "image/jpeg" }
    });
  });
});
