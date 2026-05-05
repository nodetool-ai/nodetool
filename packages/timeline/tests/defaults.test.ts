/**
 * Tests for timeline factory functions (defaults.ts).
 */

import { describe, it, expect } from "vitest";
import {
  createTimeOrderedUuid,
  makeMarker,
  makeClipVersion,
  makeTrack,
  makeClip,
  makeSequence
} from "../src/defaults.js";

// ── createTimeOrderedUuid ─────────────────────────────────────────────

describe("createTimeOrderedUuid", () => {
  it("returns a 32-character hex string (no hyphens)", () => {
    const id = createTimeOrderedUuid();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns a unique value on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createTimeOrderedUuid()));
    expect(ids.size).toBe(100);
  });
});

// ── makeMarker ────────────────────────────────────────────────────────

describe("makeMarker", () => {
  it("returns a valid TimelineMarker with defaults", () => {
    const marker = makeMarker();
    expect(marker.id).toMatch(/^[0-9a-f]{32}$/);
    expect(marker.timeMs).toBe(0);
    expect(marker.label).toBe("");
  });

  it("applies overrides correctly", () => {
    const marker = makeMarker({ label: "Chapter 1", timeMs: 3000, color: "#ff0000" });
    expect(marker.label).toBe("Chapter 1");
    expect(marker.timeMs).toBe(3000);
    expect(marker.color).toBe("#ff0000");
  });

  it("override can replace generated id", () => {
    const marker = makeMarker({ id: "fixed-id" });
    expect(marker.id).toBe("fixed-id");
  });
});

// ── makeClipVersion ───────────────────────────────────────────────────

describe("makeClipVersion", () => {
  it("returns a valid ClipVersion with defaults", () => {
    const version = makeClipVersion();
    expect(version.id).toMatch(/^[0-9a-f]{32}$/);
    expect(version.status).toBe("success");
    expect(version.paramOverridesSnapshot).toEqual({});
    expect(version.dependencyHash).toBe("");
    expect(version.createdAt).toBeTruthy();
  });

  it("createdAt is a valid ISO timestamp", () => {
    const version = makeClipVersion();
    expect(() => new Date(version.createdAt).toISOString()).not.toThrow();
  });

  it("applies overrides correctly", () => {
    const version = makeClipVersion({
      status: "failed",
      assetId: "asset-1",
      jobId: "job-1",
      costCredits: 5
    });
    expect(version.status).toBe("failed");
    expect(version.assetId).toBe("asset-1");
    expect(version.jobId).toBe("job-1");
    expect(version.costCredits).toBe(5);
  });
});

// ── makeTrack ─────────────────────────────────────────────────────────

describe("makeTrack", () => {
  it("returns a valid TimelineTrack with defaults", () => {
    const track = makeTrack();
    expect(track.id).toMatch(/^[0-9a-f]{32}$/);
    expect(track.type).toBe("video");
    expect(track.index).toBe(0);
    expect(track.visible).toBe(true);
    expect(track.locked).toBe(false);
    expect(track.name).toBe("");
  });

  it("applies overrides correctly", () => {
    const track = makeTrack({
      name: "Audio Track",
      type: "audio",
      index: 2,
      muted: true
    });
    expect(track.name).toBe("Audio Track");
    expect(track.type).toBe("audio");
    expect(track.index).toBe(2);
    expect(track.muted).toBe(true);
  });

  it("each call produces a unique id", () => {
    const a = makeTrack();
    const b = makeTrack();
    expect(a.id).not.toBe(b.id);
  });
});

// ── makeClip ──────────────────────────────────────────────────────────

describe("makeClip", () => {
  it("returns a valid TimelineClip with defaults", () => {
    const clip = makeClip();
    expect(clip.id).toMatch(/^[0-9a-f]{32}$/);
    expect(clip.startMs).toBe(0);
    expect(clip.durationMs).toBe(0);
    expect(clip.mediaType).toBe("video");
    expect(clip.sourceType).toBe("generated");
    expect(clip.status).toBe("draft");
    expect(clip.locked).toBe(false);
    expect(clip.versions).toEqual([]);
    expect(clip.trackId).toBe("");
    expect(clip.name).toBe("");
  });

  it("applies overrides correctly", () => {
    const clip = makeClip({
      name: "Intro",
      startMs: 1000,
      durationMs: 5000,
      mediaType: "audio",
      sourceType: "imported",
      status: "locked",
      locked: true
    });
    expect(clip.name).toBe("Intro");
    expect(clip.startMs).toBe(1000);
    expect(clip.durationMs).toBe(5000);
    expect(clip.mediaType).toBe("audio");
    expect(clip.sourceType).toBe("imported");
    expect(clip.status).toBe("locked");
    expect(clip.locked).toBe(true);
  });

  it("each call produces a unique id", () => {
    const a = makeClip();
    const b = makeClip();
    expect(a.id).not.toBe(b.id);
  });

  it("versions array is independent between calls", () => {
    const a = makeClip();
    const b = makeClip();
    a.versions.push({
      id: "v1",
      createdAt: new Date().toISOString(),
      jobId: "j1",
      assetId: "a1",
      workflowUpdatedAt: new Date().toISOString(),
      dependencyHash: "hash",
      paramOverridesSnapshot: {},
      status: "success"
    });
    expect(b.versions).toHaveLength(0);
  });
});

// ── makeSequence ──────────────────────────────────────────────────────

describe("makeSequence", () => {
  it("returns a valid TimelineSequence with defaults", () => {
    const seq = makeSequence();
    expect(seq.id).toMatch(/^[0-9a-f]{32}$/);
    expect(seq.fps).toBe(30);
    expect(seq.width).toBe(1920);
    expect(seq.height).toBe(1080);
    expect(seq.durationMs).toBe(0);
    expect(seq.tracks).toEqual([]);
    expect(seq.clips).toEqual([]);
    expect(seq.markers).toEqual([]);
    expect(seq.projectId).toBe("");
    expect(seq.name).toBe("");
  });

  it("createdAt and updatedAt are valid ISO timestamps", () => {
    const seq = makeSequence();
    expect(() => new Date(seq.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(seq.updatedAt).toISOString()).not.toThrow();
    expect(seq.createdAt).toBe(seq.updatedAt);
  });

  it("applies overrides correctly", () => {
    const seq = makeSequence({
      name: "My Film",
      projectId: "proj-1",
      fps: 24,
      width: 1280,
      height: 720
    });
    expect(seq.name).toBe("My Film");
    expect(seq.projectId).toBe("proj-1");
    expect(seq.fps).toBe(24);
    expect(seq.width).toBe(1280);
    expect(seq.height).toBe(720);
  });

  it("each call produces a unique id", () => {
    const a = makeSequence();
    const b = makeSequence();
    expect(a.id).not.toBe(b.id);
  });

  it("arrays are independent between calls", () => {
    const a = makeSequence();
    const b = makeSequence();
    a.tracks.push(makeTrack());
    expect(b.tracks).toHaveLength(0);
  });
});
