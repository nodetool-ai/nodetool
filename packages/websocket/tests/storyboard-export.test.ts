/**
 * Tests for the storyboard zip export — the Markdown rendering and the
 * archive it is packed into with the board's stills and clips.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- storyboard-export
 */
import { describe, it, expect, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { Shot } from "@nodetool-ai/protocol";
import {
  packStoryboardZip,
  renderStoryboardMarkdown,
  type StoryboardExportInput
} from "../src/lib/storyboard-export.js";

function shot(overrides: Partial<Shot> & { id: string; index: number }): Shot {
  return {
    type: "shot",
    action: "A lighthouse at dusk",
    status: "rendered",
    ...overrides
  } as Shot;
}

const board: StoryboardExportInput = {
  name: "My board",
  title: "Beacon",
  logline: "A light that will not go out.",
  brief: "Thirty seconds of coastline.",
  style: "Cold blues, 35mm",
  aspectRatio: "16:9",
  shots: [
    shot({
      id: "s1",
      index: 0,
      slug: "Lighthouse",
      motion: "slow push in",
      duration_seconds: 4,
      camera: { framing: "wide", lens: "35mm" },
      keyframe: { type: "image", uri: "asset://u1/a1.png", asset_id: "a1" },
      clip: { type: "video", uri: "asset://u1/c1.mp4", asset_id: "c1" }
    }),
    shot({ id: "s2", index: 1, slug: "Gulls", status: "planned" })
  ]
};

describe("renderStoryboardMarkdown", () => {
  it("writes the board header, each shot, and links the packed media", () => {
    const md = renderStoryboardMarkdown(
      board,
      new Map([["s1", { still: "stills/01-lighthouse.png", clip: "clips/01-lighthouse.mp4" }]])
    );

    expect(md).toContain("# Beacon");
    expect(md).toContain("- **Logline:** A light that will not go out.");
    expect(md).toContain("- **Style:** Cold blues, 35mm");
    expect(md).toContain("- **Shots:** 2");
    expect(md).toContain("## 01. Lighthouse");
    expect(md).toContain("![Still for shot 01](stills/01-lighthouse.png)");
    expect(md).toContain("[clips/01-lighthouse.mp4](clips/01-lighthouse.mp4)");
    expect(md).toContain("- **Camera:** wide, 35mm");
    expect(md).toContain("- **Duration:** 4s");
    // The second shot has no media, so it renders without links.
    expect(md).toContain("## 02. Gulls");
    expect(md).not.toContain("stills/02");
  });

  it("omits fields the board does not carry", () => {
    const md = renderStoryboardMarkdown(
      { name: "bare", shots: [shot({ id: "s1", index: 0 })] },
      new Map()
    );
    expect(md).toContain("# bare");
    expect(md).not.toContain("**Logline:**");
    expect(md).not.toContain("**Style:**");
  });
});

describe("packStoryboardZip", () => {
  it("packs the markdown plus one file per resolvable shot asset", async () => {
    const fetchAssetBytes = vi.fn(async (ref: string) =>
      ref.endsWith(".png")
        ? new Uint8Array([1, 2, 3])
        : new Uint8Array([4, 5, 6, 7])
    );

    const { bytes, files, missing } = await packStoryboardZip({
      board,
      fetchAssetBytes
    });

    expect(missing).toEqual([]);
    expect(files).toEqual([
      "storyboard.md",
      "stills/01-lighthouse.png",
      "clips/01-lighthouse.mp4"
    ]);

    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual([
      "clips/01-lighthouse.mp4",
      "stills/01-lighthouse.png",
      "storyboard.md"
    ]);
    expect(entries["stills/01-lighthouse.png"]).toEqual(new Uint8Array([1, 2, 3]));
    expect(strFromU8(entries["storyboard.md"])).toContain(
      "![Still for shot 01](stills/01-lighthouse.png)"
    );
  });

  it("reports media it cannot resolve and leaves the shot unlinked", async () => {
    const { bytes, missing } = await packStoryboardZip({
      board,
      fetchAssetBytes: async () => null
    });

    expect(missing).toEqual(["asset://u1/a1.png", "asset://u1/c1.mp4"]);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(["storyboard.md"]);
    expect(strFromU8(entries["storyboard.md"])).not.toContain("stills/");
  });

  it("falls back to the asset id when a ref carries no uri", async () => {
    const seen: string[] = [];
    await packStoryboardZip({
      board: {
        name: "b",
        shots: [
          shot({
            id: "s1",
            index: 0,
            keyframe: { type: "image", asset_id: "a9" }
          })
        ]
      },
      fetchAssetBytes: async (ref) => {
        seen.push(ref);
        return new Uint8Array([9]);
      }
    });
    expect(seen).toEqual(["asset://a9"]);
  });
});
