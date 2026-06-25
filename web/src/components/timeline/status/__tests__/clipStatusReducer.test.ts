/**
 * clipStatusReducer tests
 *
 * Covers every row of the status-mapping table from PRD §5.5. `clip.status` is
 * the single source of truth for generation lifecycle (both the workflow and
 * direct-gen paths write it), so the active states are driven off it here.
 */

import { describe, it, expect } from "@jest/globals";
import { deriveClipStatus } from "../clipStatusReducer";
import type { ClipErrorState } from "../clipStatusReducer";
import type { TimelineClip } from "@nodetool-ai/timeline";

// ── Helpers ────────────────────────────────────────────────────────────────

type ClipInput = Pick<
  TimelineClip,
  | "locked"
  | "status"
  | "currentAssetId"
  | "sourceType"
  | "dependencyHash"
  | "lastGeneratedHash"
>;

const baseClip = (): ClipInput => ({
  locked: false,
  status: "generated",
  currentAssetId: undefined,
  sourceType: "generated",
  dependencyHash: "hash-1",
  lastGeneratedHash: "hash-1"
});

const noErrorState = null;

// ── Rows in priority order ─────────────────────────────────────────────────

describe("deriveClipStatus — PRD §5.5 mapping table", () => {
  // Row 1: locked
  it('returns "locked" when clip.locked is true regardless of other state', () => {
    const err: ClipErrorState = { hasError: true };
    expect(
      deriveClipStatus(
        { ...baseClip(), locked: true, status: "generating" },
        err,
        false
      )
    ).toBe("locked");
  });

  // Rows 2-4: active lifecycle, off clip.status
  it('returns "queued" when clip.status is "queued"', () => {
    expect(
      deriveClipStatus({ ...baseClip(), status: "queued" }, noErrorState, true)
    ).toBe("queued");
  });

  it('returns "generating" when clip.status is "generating"', () => {
    expect(
      deriveClipStatus({ ...baseClip(), status: "generating" }, noErrorState, true)
    ).toBe("generating");
  });

  it("returns \"generating\" while regenerating even though the previous asset is still present", () => {
    expect(
      deriveClipStatus(
        { ...baseClip(), status: "generating", currentAssetId: "asset-1" },
        noErrorState,
        true
      )
    ).toBe("generating");
  });

  it('returns "failed" when clip.status is "failed"', () => {
    expect(
      deriveClipStatus({ ...baseClip(), status: "failed" }, noErrorState, true)
    ).toBe("failed");
  });

  // Row 5: failed (via errorState)
  it('returns "failed" when errorState.hasError is true and clip is idle', () => {
    const err: ClipErrorState = {
      hasError: true,
      message: "Failed at NodeA: timeout"
    };
    expect(deriveClipStatus(baseClip(), err, true)).toBe("failed");
  });

  // Row 6: missing
  it('returns "missing" when currentAssetId is set but asset does not exist', () => {
    expect(
      deriveClipStatus(
        { ...baseClip(), currentAssetId: "asset-abc" },
        noErrorState,
        false
      )
    ).toBe("missing");
  });

  it('does NOT return "missing" when currentAssetId is set AND asset exists', () => {
    expect(
      deriveClipStatus(
        { ...baseClip(), currentAssetId: "asset-abc" },
        noErrorState,
        true
      )
    ).toBe("generated");
  });

  // Row 7: draft
  it('returns "draft" for sourceType=="generated" with no currentAssetId', () => {
    expect(
      deriveClipStatus(
        { ...baseClip(), sourceType: "generated", currentAssetId: undefined },
        noErrorState,
        true
      )
    ).toBe("draft");
  });

  it('does NOT return "draft" for sourceType=="imported" with no currentAssetId', () => {
    expect(
      deriveClipStatus(
        {
          ...baseClip(),
          sourceType: "imported",
          currentAssetId: undefined,
          dependencyHash: undefined,
          lastGeneratedHash: undefined
        },
        noErrorState,
        true
      )
    ).toBe("generated");
  });

  // Row 8: stale
  it('returns "stale" when dependencyHash differs from lastGeneratedHash', () => {
    expect(
      deriveClipStatus(
        {
          ...baseClip(),
          currentAssetId: "asset-1",
          dependencyHash: "hash-new",
          lastGeneratedHash: "hash-old"
        },
        noErrorState,
        true
      )
    ).toBe("stale");
  });

  it('does NOT return "stale" when only one hash is undefined', () => {
    expect(
      deriveClipStatus(
        {
          ...baseClip(),
          currentAssetId: "asset-1",
          dependencyHash: undefined,
          lastGeneratedHash: "hash-old"
        },
        noErrorState,
        true
      )
    ).toBe("generated");
  });

  // Row 9: generated (default)
  it('returns "generated" when all conditions are clean', () => {
    expect(
      deriveClipStatus(
        { ...baseClip(), currentAssetId: "asset-1" },
        noErrorState,
        true
      )
    ).toBe("generated");
  });

  // Priority: an in-flight clip overrides a lingering error
  it("in-flight clip.status takes priority over errorState", () => {
    const err: ClipErrorState = { hasError: true };
    expect(
      deriveClipStatus({ ...baseClip(), status: "generating" }, err, true)
    ).toBe("generating");
  });

  // Priority: errorState overrides missing / draft / stale
  it("errorState takes priority over missing state", () => {
    const err: ClipErrorState = { hasError: true };
    expect(
      deriveClipStatus(
        { ...baseClip(), currentAssetId: "asset-gone" },
        err,
        false
      )
    ).toBe("failed");
  });

  // Edge: locked clip with mismatched hashes still shows "locked"
  it('locked clip with stale hashes still shows "locked"', () => {
    expect(
      deriveClipStatus(
        {
          ...baseClip(),
          locked: true,
          currentAssetId: "asset-1",
          dependencyHash: "hash-new",
          lastGeneratedHash: "hash-old"
        },
        noErrorState,
        true
      )
    ).toBe("locked");
  });
});
