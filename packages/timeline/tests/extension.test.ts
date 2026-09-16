import { describe, expect, it } from "vitest";
import {
  applyExtensionToClips,
  captureExtensionSource,
  type ApplyExtensionInput,
  type ApplyExtensionResult,
  type ExtensionSourceSnapshot
} from "../src/extension.js";
import type { TimelineClip } from "../src/types.js";

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "hero",
    name: "Hero",
    trackId: "video",
    mediaType: "video",
    sourceType: "imported",
    startMs: 5000,
    durationMs: 4000,
    inPointMs: 40000,
    outPointMs: 44000,
    currentAssetId: "original",
    activeTakeId: "original-take",
    status: "generated",
    locked: false,
    versions: [
      {
        id: "extension",
        assetId: "extended-asset",
        createdAt: "2026-01-01",
        jobId: "generation",
        workflowUpdatedAt: "2026-01-01",
        dependencyHash: "candidate-hash",
        paramOverridesSnapshot: { prompt: "candidate prompt" },
        source: "extended",
        status: "success",
        durationMs: 8000
      }
    ],
    ...overrides
  };
}

function neighbour(
  id: string,
  startMs: number,
  overrides: Partial<TimelineClip> = {}
): TimelineClip {
  return clip({ id, startMs, durationMs: 1000, ...overrides });
}

function snapshot(target: TimelineClip): ExtensionSourceSnapshot {
  const result = captureExtensionSource(target);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.source;
}

function request(
  clips: readonly TimelineClip[] = [clip()],
  overrides: Partial<ApplyExtensionInput> = {}
): ApplyExtensionInput {
  return {
    clips,
    source: snapshot(clips[0]),
    takeId: "extension",
    direction: "end",
    addedSourceDurationMs: 2000,
    timing: "keep-cut",
    ...overrides
  };
}

function applied(result: ApplyExtensionResult, id = "hero"): TimelineClip {
  if (!result.ok) {
    throw new Error(result.error);
  }
  const found = result.clips.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Missing clip ${id}`);
  }
  return found;
}

function expectRefusal(input: ApplyExtensionInput, code: string): void {
  const before = structuredClone(input.clips);
  const result = applyExtensionToClips(input);
  expect(result).toMatchObject({ ok: false, code });
  expect(result).not.toHaveProperty("clips");
  expect(input.clips).toEqual(before);
}

describe("captureExtensionSource", () => {
  it("captures an immutable trimmed source with the effective playback rate", () => {
    const target = clip({ speedMultiplier: 2, outPointMs: 48000 });
    const source = snapshot(target);
    expect(source).toEqual({
      clipId: "hero",
      trackId: "video",
      sourceAssetId: "original",
      sourceTakeId: "original-take",
      sourceStartMs: 40000,
      sourceEndMs: 48000,
      timelineStartMs: 5000,
      timelineDurationMs: 4000,
      rate: 2
    });
    expect(Object.isFrozen(source)).toBe(true);
    target.inPointMs = 100;
    expect(source.sourceStartMs).toBe(40000);
  });

  it.each([0, -1, NaN, Infinity])(
    "refuses invalid unbaked rate %s",
    (speedMultiplier) => {
      expect(captureExtensionSource(clip({ speedMultiplier }))).toMatchObject({
        ok: false,
        code: "invalid"
      });
    }
  );

  it("uses rate one for a baked speed change and resolves absent source bounds", () => {
    expect(snapshot(clip({ speedMultiplier: 3, speedBaked: true })).rate).toBe(
      1
    );
    expect(
      snapshot(clip({ inPointMs: undefined, outPointMs: undefined }))
    ).toMatchObject({
      sourceStartMs: 0,
      sourceEndMs: 4000
    });
  });

  it.each([
    { mediaType: "audio" as const },
    { currentAssetId: undefined },
    { startMs: -1 },
    { durationMs: 0 },
    { inPointMs: NaN },
    { outPointMs: 45000 }
  ])("refuses an invalid source %j", (overrides) => {
    expect(captureExtensionSource(clip(overrides))).toMatchObject({
      ok: false,
      code: "invalid"
    });
  });

  it("refuses a time-remapped source", () => {
    expect(
      captureExtensionSource(
        clip({
          timeRemap: { keyframes: [{ t: 0, sourceMs: 40000 }] }
        })
      )
    ).toMatchObject({ ok: false, code: "unsupported" });
  });
});

describe("keep-cut extension", () => {
  it.each([
    ["start", 2000, 6000],
    ["end", 0, 4000]
  ] as const)(
    "keeps %s extension as source handles",
    (direction, inPointMs, outPointMs) => {
      const input = request(undefined, { direction });
      const result = applyExtensionToClips(input);
      expect(applied(result)).toEqual({
        ...input.clips[0],
        currentAssetId: "extended-asset",
        activeTakeId: "extension",
        inPointMs,
        outPointMs
      });
      expect(input.clips[0].currentAssetId).toBe("original");
    }
  );

  it("preserves every unrelated field and clip, including links and editorial settings", () => {
    const target = clip({
      opacity: 0.6,
      muted: true,
      linkId: "linked",
      parentId: "group",
      speedMultiplier: 1,
      speedBaked: false,
      effects: [
        { id: "gain", type: "gain", enabled: true, params: { gain: 0.5 } }
      ],
      paramOverrides: { prompt: "accepted prompt" },
      lastGeneratedHash: "accepted-hash",
      storyboardBoardId: "board",
      storyboardShotId: "shot",
      caption: { words: [{ text: "Keep", startMs: 0, endMs: 500 }] },
      animations: [],
      transform: {
        position: { x: 0.25, y: 0.5 },
        scale: { x: 0.8, y: 0.8 },
        rotation: 0.2,
        anchor: { x: 0.5, y: 0.5 }
      }
    });
    const sibling = neighbour("audio", 5000, {
      trackId: "audio",
      linkId: "linked"
    });
    const input = request([target, sibling]);
    Object.freeze(target);
    Object.freeze(input.clips);
    const result = applyExtensionToClips(input);
    expect(applied(result)).toEqual({
      ...target,
      currentAssetId: "extended-asset",
      activeTakeId: "extension",
      inPointMs: 0,
      outPointMs: 4000
    });
    expect(applied(result, "audio")).toBe(sibling);
    expect(applied(result).versions).toBe(target.versions);
  });

  it("permits a baseline take recorded after capturing an imported source", () => {
    const target = clip({ activeTakeId: undefined });
    const source = snapshot(target);
    const landed = { ...target, activeTakeId: "new-baseline" };
    expect(applyExtensionToClips(request([landed], { source })).ok).toBe(true);
  });
});

describe("extension into available space", () => {
  it.each([
    ["start", 3000, 9000],
    ["end", 5000, 11000]
  ] as const)(
    "grows the %s edge without moving adjacent clips",
    (direction, startMs, endMs) => {
      const before = neighbour("before", startMs - 1000);
      const after = neighbour("after", endMs);
      const result = applyExtensionToClips(
        request([clip(), before, after], {
          direction,
          timing: "available-space"
        })
      );
      expect(applied(result)).toMatchObject({
        startMs,
        durationMs: 6000,
        inPointMs: 0,
        outPointMs: 6000
      });
      expect(applied(result, "before")).toBe(before);
      expect(applied(result, "after")).toBe(after);
    }
  );

  it.each(["start", "end"] as const)(
    "refuses a %s collision without shortening the request",
    (direction) => {
      const neighbourStart = direction === "start" ? 3001 : 10999;
      expectRefusal(
        request([clip(), neighbour("blocked", neighbourStart)], {
          direction,
          timing: "available-space"
        }),
        "collision"
      );
    }
  );

  it("refuses a start extension before timeline zero", () => {
    expectRefusal(
      request([clip({ startMs: 1000 })], {
        direction: "start",
        timing: "available-space"
      }),
      "invalid"
    );
  });

  it.each(["keep-cut", "available-space", "ripple"] as const)(
    "converts source duration at half speed for %s",
    (timing) => {
      const target = clip({ speedMultiplier: 0.5, outPointMs: 42000 });
      const result = applyExtensionToClips(
        request([target], { direction: "start", timing })
      );
      expect(applied(result)).toMatchObject({
        speedMultiplier: 0.5,
        startMs: timing === "available-space" ? 1000 : 5000,
        durationMs: timing === "keep-cut" ? 4000 : 8000,
        inPointMs: timing === "keep-cut" ? 2000 : 0,
        outPointMs: 4000
      });
    }
  );

  it("converts a 2x extension without requiring a baked result", () => {
    const target = clip({ speedMultiplier: 2, outPointMs: 48000 });
    target.versions = target.versions?.map((take) => ({
      ...take,
      durationMs: 10000
    }));
    const result = applyExtensionToClips(
      request([target], { timing: "available-space" })
    );
    expect(applied(result)).toMatchObject({
      durationMs: 5000,
      outPointMs: 10000,
      speedMultiplier: 2
    });
  });

  it.each(["available-space", "ripple"] as const)(
    "preserves unrelated fields when applying %s",
    (timing) => {
      const target = clip({
        opacity: 0.6,
        muted: true,
        speedMultiplier: 3,
        speedBaked: true,
        paramOverrides: { accepted: true },
        lastGeneratedHash: "accepted-hash",
        caption: { words: [{ text: "Keep", startMs: 0, endMs: 500 }] },
        effects: [{ id: "blur", type: "blur", enabled: true, radius: 2 }],
        animations: []
      });
      expect(
        applied(applyExtensionToClips(request([target], { timing })))
      ).toEqual({
        ...target,
        currentAssetId: "extended-asset",
        activeTakeId: "extension",
        inPointMs: 0,
        outPointMs: 6000,
        durationMs: 6000
      });
    }
  );
});

describe("ripple extension", () => {
  it.each(["start", "end"] as const)(
    "keeps a %s extension parked and ripples all unlocked tracks",
    (direction) => {
      const clips = [
        clip(),
        neighbour("later", 9000),
        neighbour("voice", 9000, { trackId: "audio" }),
        neighbour("caption", 12000, { trackId: "captions" }),
        neighbour("locked-track", 9000, { trackId: "locked" }),
        neighbour("locked-clip", 20000, { locked: true }),
        neighbour("earlier", 2000)
      ];
      const result = applyExtensionToClips(
        request(clips, {
          direction,
          timing: "ripple",
          lockedTrackIds: new Set(["locked"])
        })
      );
      expect(applied(result)).toMatchObject({
        startMs: 5000,
        durationMs: 6000,
        inPointMs: 0,
        outPointMs: 6000
      });
      expect(applied(result, "later").startMs).toBe(11000);
      expect(applied(result, "voice").startMs).toBe(11000);
      expect(applied(result, "caption").startMs).toBe(14000);
      expect(applied(result, "locked-track")).toBe(clips[4]);
      expect(applied(result, "locked-clip")).toBe(clips[5]);
      expect(applied(result, "earlier")).toBe(clips[6]);
      expect(clips[1].startMs).toBe(9000);
    }
  );

  it("moves linked downstream clips together without changing their fields", () => {
    const left = neighbour("left", 9000, { linkId: "pair" });
    const right = neighbour("right", 9000, {
      linkId: "pair",
      trackId: "audio"
    });
    const result = applyExtensionToClips(
      request([clip(), left, right], { timing: "ripple" })
    );
    expect(applied(result, "left")).toEqual({ ...left, startMs: 11000 });
    expect(applied(result, "right")).toEqual({ ...right, startMs: 11000 });
  });

  it("retains existing overlaps between clips that move together", () => {
    const result = applyExtensionToClips(
      request(
        [
          clip(),
          neighbour("a", 9000, { durationMs: 4000 }),
          neighbour("b", 10000)
        ],
        { timing: "ripple" }
      )
    );
    expect(applied(result, "a").startMs).toBe(11000);
    expect(applied(result, "b").startMs).toBe(12000);
  });

  it("refuses collision with a locked clip at the extension edge", () => {
    expectRefusal(
      request([clip(), neighbour("locked", 9000, { locked: true })], {
        timing: "ripple"
      }),
      "collision"
    );
  });

  it("refuses a downstream collision even when the extended clip has space", () => {
    expectRefusal(
      request(
        [
          clip(),
          neighbour("moving", 9000, { trackId: "audio" }),
          neighbour("locked", 11500, { trackId: "audio", locked: true })
        ],
        { timing: "ripple" }
      ),
      "collision"
    );
  });

  it("refuses stationary media straddling the ripple boundary", () => {
    expectRefusal(
      request([clip(), neighbour("straddler", 8500)], { timing: "ripple" }),
      "collision"
    );
  });

  it("refuses a ripple that separates linked clips across a locked track", () => {
    expectRefusal(
      request(
        [
          clip(),
          neighbour("a", 9000, { linkId: "pair" }),
          neighbour("b", 9000, { trackId: "audio", linkId: "pair" })
        ],
        { timing: "ripple", lockedTrackIds: new Set(["audio"]) }
      ),
      "unsupported"
    );
  });

  it("refuses a ripple that separates a child from its stationary group", () => {
    expectRefusal(
      request(
        [
          clip(),
          neighbour("group", 1000, {
            mediaType: "group",
            trackId: "groups",
            durationMs: 20000
          }),
          neighbour("child", 9000, { parentId: "group", trackId: "children" })
        ],
        { timing: "ripple" }
      ),
      "unsupported"
    );
  });

  it("allows a group and all of its children to ripple together", () => {
    const result = applyExtensionToClips(
      request(
        [
          clip(),
          neighbour("group", 9000, {
            mediaType: "group",
            trackId: "groups",
            durationMs: 5000
          }),
          neighbour("child", 10000, { parentId: "group", trackId: "children" })
        ],
        { timing: "ripple" }
      )
    );
    expect(applied(result, "group").startMs).toBe(11000);
    expect(applied(result, "child").startMs).toBe(12000);
  });

  it("finds a collision inside nested stationary intervals", () => {
    expectRefusal(
      request(
        [
          clip(),
          neighbour("long", 1000, { trackId: "audio", durationMs: 20000 }),
          neighbour("short", 1500, { trackId: "audio" }),
          neighbour("moving", 9000, { trackId: "audio" })
        ],
        { timing: "ripple" }
      ),
      "collision"
    );
  });

  it("handles large unsorted arrays and overlapping stationary intervals", () => {
    const clips: TimelineClip[] = [clip()];
    for (let index = 0; index < 12000; index += 1) {
      clips.push(neighbour(`moving-${index}`, 20000 + index * 10000));
      clips.push(
        neighbour(`locked-${index}`, 25000 + index * 10000, { locked: true })
      );
      clips.push(
        neighbour(`overlay-${index}`, 0, {
          trackId: "overlay",
          durationMs: 5000
        })
      );
    }
    const source = snapshot(clips[0]);
    clips.reverse();
    const result = applyExtensionToClips(
      request([clip()], { clips, source, timing: "ripple" })
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.clips).toHaveLength(36001);
    expect(applied(result, "moving-11999").startMs).toBe(120012000);
    expect(applied(result, "locked-11999").startMs).toBe(120015000);
    expect(applied(result, "overlay-11999").startMs).toBe(0);
    expect(clips.find((item) => item.id === "moving-11999")?.startMs).toBe(
      120010000
    );
  }, 10000);
});

describe("atomic extension refusal", () => {
  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])(
    "refuses invalid added duration %s",
    (addedSourceDurationMs) => {
      const input = request(undefined, { addedSourceDurationMs });
      const result = applyExtensionToClips(input);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("clips");
    }
  );

  it.each(["keep-cut", "available-space", "ripple"] as const)(
    "refuses a short candidate for %s",
    (timing) => {
      const target = clip();
      target.versions = target.versions?.map((take) => ({
        ...take,
        durationMs: 5999
      }));
      expectRefusal(request([target], { timing }), "short");
    }
  );

  it.each([undefined, NaN, Infinity, 0])(
    "refuses invalid measured duration %s",
    (durationMs) => {
      const target = clip();
      target.versions = target.versions?.map((take) => ({
        ...take,
        durationMs
      }));
      expectRefusal(request([target]), "invalid");
    }
  );

  it("refuses an absent, failed or non-extension take", () => {
    expectRefusal(request(undefined, { takeId: "missing" }), "invalid");
    for (const overrides of [
      { status: "failed" as const },
      { source: "generated" as const }
    ]) {
      const target = clip();
      target.versions = target.versions?.map((take) => ({
        ...take,
        ...overrides
      }));
      expectRefusal(request([target]), "invalid");
    }
  });

  it("refuses duplicate take ids and a take pointing back to the source asset", () => {
    const target = clip();
    target.versions = [...(target.versions ?? []), ...(target.versions ?? [])];
    expectRefusal(request([target]), "invalid");
    const sameAsset = clip();
    sameAsset.versions = sameAsset.versions?.map((take) => ({
      ...take,
      assetId: "original"
    }));
    expectRefusal(request([sameAsset]), "invalid");
  });

  it("refuses invalid direction and timing values at runtime", () => {
    expectRefusal(
      request(undefined, {
        // @ts-expect-error Runtime callers can bypass the TypeScript contract.
        direction: "both"
      }),
      "invalid"
    );
    expectRefusal(
      request(undefined, {
        // @ts-expect-error Runtime callers can bypass the TypeScript contract.
        timing: "overwrite"
      }),
      "invalid"
    );
  });

  it.each([
    { currentAssetId: "different" },
    { activeTakeId: "different-take" },
    { startMs: 6000 },
    { trackId: "different-track" },
    { inPointMs: 40001, outPointMs: 44001 },
    { durationMs: 3000, outPointMs: 43000 },
    { speedMultiplier: 2, outPointMs: 48000 }
  ])("refuses a stale snapshot after %j", (change) => {
    const target = clip();
    const source = snapshot(target);
    expectRefusal(request([{ ...target, ...change }], { source }), "stale");
  });

  it("refuses a deleted source and duplicate clip ids", () => {
    expectRefusal(request(undefined, { clips: [] }), "stale");
    expectRefusal(request([clip(), clip()]), "invalid");
  });

  it("refuses a locked source clip or source track", () => {
    expectRefusal(request([clip({ locked: true })]), "locked");
    expectRefusal(
      request(undefined, { lockedTrackIds: new Set(["video"]) }),
      "locked"
    );
  });

  it("refuses timing changes that require extending linked media or a parent group", () => {
    expectRefusal(
      request(
        [
          clip({ linkId: "pair" }),
          neighbour("sibling", 5000, { trackId: "audio", linkId: "pair" })
        ],
        { timing: "available-space" }
      ),
      "unsupported"
    );
    expectRefusal(
      request([clip({ parentId: "group" })], { timing: "ripple" }),
      "unsupported"
    );
  });
});
