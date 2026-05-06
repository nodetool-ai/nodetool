/**
 * Unit tests for assetToClipAdapter.
 *
 * Tests the pure conversion functions without any React or store dependencies.
 */

import { describe, it, expect } from "@jest/globals";
import {
  assetMediaType,
  isCompatibleWithTrack,
  assetToClip
} from "../assetToClipAdapter";
import type { Asset } from "../../../../stores/ApiTypes";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    user_id: "user-1",
    parent_id: "root",
    name: "test-asset.jpg",
    content_type: "image/jpeg",
    workflow_id: null,
    created_at: "2024-01-01T00:00:00Z",
    get_url: "https://cdn.example.com/test.jpg",
    thumb_url: "https://cdn.example.com/thumb.jpg",
    ...overrides
  };
}

// ── assetMediaType ─────────────────────────────────────────────────────────

describe("assetMediaType", () => {
  it("returns 'image' for image/* content types", () => {
    expect(assetMediaType("image/jpeg")).toBe("image");
    expect(assetMediaType("image/png")).toBe("image");
    expect(assetMediaType("image/webp")).toBe("image");
  });

  it("returns 'video' for video/* content types", () => {
    expect(assetMediaType("video/mp4")).toBe("video");
    expect(assetMediaType("video/webm")).toBe("video");
  });

  it("returns 'audio' for audio/* content types", () => {
    expect(assetMediaType("audio/mpeg")).toBe("audio");
    expect(assetMediaType("audio/wav")).toBe("audio");
  });

  it("returns null for unsupported content types", () => {
    expect(assetMediaType("application/pdf")).toBeNull();
    expect(assetMediaType("text/plain")).toBeNull();
    expect(assetMediaType("folder")).toBeNull();
  });

  it("returns null for empty or null values", () => {
    expect(assetMediaType(undefined)).toBeNull();
    expect(assetMediaType(null)).toBeNull();
    expect(assetMediaType("")).toBeNull();
  });
});

// ── isCompatibleWithTrack ──────────────────────────────────────────────────

describe("isCompatibleWithTrack", () => {
  it("accepts image onto video track", () => {
    expect(isCompatibleWithTrack("image", "video")).toBe(true);
  });

  it("accepts image onto overlay track", () => {
    expect(isCompatibleWithTrack("image", "overlay")).toBe(true);
  });

  it("rejects image onto audio track", () => {
    expect(isCompatibleWithTrack("image", "audio")).toBe(false);
  });

  it("accepts video onto video track", () => {
    expect(isCompatibleWithTrack("video", "video")).toBe(true);
  });

  it("accepts video onto overlay track", () => {
    expect(isCompatibleWithTrack("video", "overlay")).toBe(true);
  });

  it("rejects video onto audio track", () => {
    expect(isCompatibleWithTrack("video", "audio")).toBe(false);
  });

  it("accepts audio onto audio track", () => {
    expect(isCompatibleWithTrack("audio", "audio")).toBe(true);
  });

  it("rejects audio onto video track", () => {
    expect(isCompatibleWithTrack("audio", "video")).toBe(false);
  });

  it("rejects audio onto overlay track", () => {
    expect(isCompatibleWithTrack("audio", "overlay")).toBe(false);
  });
});

// ── assetToClip ────────────────────────────────────────────────────────────

describe("assetToClip", () => {
  it("creates an image clip with default 4 s duration", () => {
    const asset = makeAsset({ content_type: "image/jpeg" });
    const clip = assetToClip(asset, "track-1", 0);

    expect(clip.mediaType).toBe("image");
    expect(clip.durationMs).toBe(4000);
    expect(clip.currentAssetId).toBe("asset-1");
    expect(clip.sourceType).toBe("imported");
    expect(clip.status).toBe("generated");
    expect(clip.trackId).toBe("track-1");
    expect(clip.startMs).toBe(0);
    expect(clip.versions).toEqual([]);
  });

  it("creates a video clip with duration from asset.duration", () => {
    const asset = makeAsset({ content_type: "video/mp4", duration: 12.5 });
    const clip = assetToClip(asset, "track-1", 1000);

    expect(clip.mediaType).toBe("video");
    expect(clip.durationMs).toBe(12500);
    expect(clip.startMs).toBe(1000);
  });

  it("falls back to 4 s when video has no duration", () => {
    const asset = makeAsset({ content_type: "video/mp4", duration: null });
    const clip = assetToClip(asset, "track-1", 0);

    expect(clip.durationMs).toBe(4000);
  });

  it("creates an audio clip with duration from asset.duration", () => {
    const asset = makeAsset({ content_type: "audio/mpeg", duration: 60 });
    const clip = assetToClip(asset, "track-2", 500);

    expect(clip.mediaType).toBe("audio");
    expect(clip.durationMs).toBe(60000);
  });

  it("uses asset name as clip name", () => {
    const asset = makeAsset({ name: "my-video.mp4", content_type: "video/mp4" });
    const clip = assetToClip(asset, "track-1", 0);

    expect(clip.name).toBe("my-video.mp4");
  });

  it("sets thumbnailAssetId from video asset metadata.thumbnails", () => {
    const asset = makeAsset({
      content_type: "video/mp4",
      metadata: { thumbnails: ["thumb-asset-id-1", "thumb-asset-id-2"] }
    });
    const clip = assetToClip(asset, "track-1", 0);

    expect(clip.thumbnailAssetId).toBe("thumb-asset-id-1");
  });

  it("does not set thumbnailAssetId when metadata has no thumbnails", () => {
    const asset = makeAsset({
      content_type: "video/mp4",
      metadata: {}
    });
    const clip = assetToClip(asset, "track-1", 0);

    expect(clip.thumbnailAssetId).toBeUndefined();
  });

  it("does not set thumbnailAssetId for image clips", () => {
    const asset = makeAsset({ content_type: "image/png" });
    const clip = assetToClip(asset, "track-1", 0);

    expect(clip.thumbnailAssetId).toBeUndefined();
  });

  it("throws for unsupported content types", () => {
    const asset = makeAsset({ content_type: "application/pdf" });

    expect(() => assetToClip(asset, "track-1", 0)).toThrow();
  });

  it("generates a unique ID for each clip", () => {
    const asset = makeAsset({ content_type: "image/jpeg" });
    const clip1 = assetToClip(asset, "track-1", 0);
    const clip2 = assetToClip(asset, "track-1", 0);

    expect(clip1.id).not.toBe(clip2.id);
  });
});
