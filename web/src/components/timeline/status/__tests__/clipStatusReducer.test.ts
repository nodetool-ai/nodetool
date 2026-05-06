/**
 * clipStatusReducer tests
 *
 * Covers every row of the status-mapping table from PRD §5.5.
 */

import { describe, it, expect } from "@jest/globals";
import { deriveClipStatus } from "../clipStatusReducer";
import type {
  ClipGenerationState,
  ClipErrorState
} from "../clipStatusReducer";
import type { TimelineClip } from "@nodetool-ai/timeline";

// ── Helpers ────────────────────────────────────────────────────────────────

type ClipInput = Pick<
  TimelineClip,
  "locked" | "currentAssetId" | "sourceType" | "dependencyHash" | "lastGeneratedHash"
>;

const baseClip = (): ClipInput => ({
  locked: false,
  currentAssetId: undefined,
  sourceType: "generated",
  dependencyHash: "hash-1",
  lastGeneratedHash: "hash-1"
});

const noGenState = null;
const noErrorState = null;

// ── Rows in priority order ─────────────────────────────────────────────────

describe("deriveClipStatus — PRD §5.5 mapping table", () => {
  // Row 1: locked
  it('returns "locked" when clip.locked is true regardless of other state', () => {
    const gen: ClipGenerationState = { status: "running" };
    const err: ClipErrorState = { hasError: true };
    expect(
      deriveClipStatus({ ...baseClip(), locked: true }, gen, err, false)
    ).toBe("locked");
  });

  // Row 2: queued
  it('returns "queued" when generationState.status is "queued"', () => {
    const gen: ClipGenerationState = { status: "queued" };
    expect(deriveClipStatus(baseClip(), gen, noErrorState, true)).toBe("queued");
  });

  // Row 3: generating
  it('returns "generating" when generationState.status is "running"', () => {
    const gen: ClipGenerationState = { status: "running" };
    expect(deriveClipStatus(baseClip(), gen, noErrorState, true)).toBe("generating");
  });

  // Row 4: failed (via generationState)
  it('returns "failed" when generationState.status is "failed"', () => {
    const gen: ClipGenerationState = { status: "failed" };
    expect(deriveClipStatus(baseClip(), gen, noErrorState, true)).toBe("failed");
  });

  // Row 5: failed (via errorState)
  it('returns "failed" when errorState.hasError is true and no active job', () => {
    const err: ClipErrorState = { hasError: true, message: "Failed at NodeA: timeout" };
    expect(deriveClipStatus(baseClip(), noGenState, err, true)).toBe("failed");
  });

  // Row 6: missing
  it('returns "missing" when currentAssetId is set but asset does not exist', () => {
    const clip: ClipInput = {
      ...baseClip(),
      currentAssetId: "asset-abc"
    };
    expect(deriveClipStatus(clip, noGenState, noErrorState, false)).toBe("missing");
  });

  it('does NOT return "missing" when currentAssetId is set AND asset exists', () => {
    const clip: ClipInput = {
      ...baseClip(),
      currentAssetId: "asset-abc"
    };
    // hashes match → should be "generated"
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("generated");
  });

  // Row 7: draft
  it('returns "draft" for sourceType=="generated" with no currentAssetId', () => {
    const clip: ClipInput = {
      ...baseClip(),
      sourceType: "generated",
      currentAssetId: undefined
    };
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("draft");
  });

  it('does NOT return "draft" for sourceType=="imported" with no currentAssetId', () => {
    const clip: ClipInput = {
      ...baseClip(),
      sourceType: "imported",
      currentAssetId: undefined,
      dependencyHash: undefined,
      lastGeneratedHash: undefined
    };
    // falls through to "generated" (imported clips don't need an assetId for draft)
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("generated");
  });

  // Row 8: stale
  it('returns "stale" when dependencyHash differs from lastGeneratedHash', () => {
    const clip: ClipInput = {
      ...baseClip(),
      currentAssetId: "asset-1",
      dependencyHash: "hash-new",
      lastGeneratedHash: "hash-old"
    };
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("stale");
  });

  it('does NOT return "stale" when only one hash is undefined', () => {
    const clip: ClipInput = {
      ...baseClip(),
      currentAssetId: "asset-1",
      dependencyHash: undefined,
      lastGeneratedHash: "hash-old"
    };
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("generated");
  });

  // Row 9: generated (default)
  it('returns "generated" when all conditions are clean', () => {
    const clip: ClipInput = {
      ...baseClip(),
      currentAssetId: "asset-1"
    };
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("generated");
  });

  // Priority: active job overrides error state
  it("active job status takes priority over errorState", () => {
    const gen: ClipGenerationState = { status: "running" };
    const err: ClipErrorState = { hasError: true };
    expect(deriveClipStatus(baseClip(), gen, err, true)).toBe("generating");
  });

  // Priority: errorState overrides missing / draft / stale
  it("errorState takes priority over missing state", () => {
    const clip: ClipInput = {
      ...baseClip(),
      currentAssetId: "asset-gone"
    };
    const err: ClipErrorState = { hasError: true };
    expect(deriveClipStatus(clip, noGenState, err, false)).toBe("failed");
  });

  // Edge: locked clip with mismatched hashes still shows "locked"
  it('locked clip with stale hashes still shows "locked"', () => {
    const clip: ClipInput = {
      ...baseClip(),
      locked: true,
      currentAssetId: "asset-1",
      dependencyHash: "hash-new",
      lastGeneratedHash: "hash-old"
    };
    expect(deriveClipStatus(clip, noGenState, noErrorState, true)).toBe("locked");
  });
});
