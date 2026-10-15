import { describe, expect, it } from "vitest";
import { canonicalizeTimelineAssetIds } from "../src/capabilities/timeline-asset-ids.js";

const FULL = "3e53f6cbb3a34f949de988183791cd14";
const SHORT = FULL.slice(0, 12);

const finder = (ids: string[]) => async (id: string) => {
  const matches = ids.filter((candidate) => candidate.startsWith(id));
  if (matches.length > 1) {
    throw new Error(`short id "${id}" matches more than one row; use the full id`);
  }
  return matches[0] ? { id: matches[0] } : null;
};

const doc = (currentAssetId: string) => ({
  clips: [{ id: "c1", currentAssetId, versions: [{ assetId: currentAssetId }] }]
});

describe("canonicalizeTimelineAssetIds", () => {
  it.each([`asset://${SHORT}.jpg`, `asset://${SHORT}`, SHORT, FULL, `asset://${FULL}.png`])(
    "stores %s as the full id",
    async (ref) => {
      const result = await canonicalizeTimelineAssetIds(doc(ref), finder([FULL]));
      expect(result).toEqual({
        document: { clips: [{ id: "c1", currentAssetId: FULL, versions: [{ assetId: FULL }] }] }
      });
    }
  );

  it("keeps package and http locators as written", async () => {
    for (const ref of [
      "package://nodetool-base/timelines/voltra/street.jpg",
      "https://example.com/a.png"
    ]) {
      const input = doc(ref);
      const result = await canonicalizeTimelineAssetIds(input, finder([FULL]));
      expect(result).toEqual({ document: input });
    }
  });

  it("stores an unmatched short id bare", async () => {
    const result = await canonicalizeTimelineAssetIds(doc(`asset://${SHORT}.jpg`), finder([]));
    expect(result).toMatchObject({ document: { clips: [{ currentAssetId: SHORT }] } });
  });

  it("refuses an ambiguous short id", async () => {
    const result = await canonicalizeTimelineAssetIds(
      doc(SHORT),
      finder([FULL, `${SHORT}${"0".repeat(20)}`])
    );
    expect(result).toEqual({
      error: `short id "${SHORT}" matches more than one row; use the full id`
    });
  });
});
