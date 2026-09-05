import { describe, expect, it } from "vitest";
import { z } from "zod";
import { uiToolParams } from "../src/api-schemas/ui-tool-contract.js";
import {
  BROWSER_ONLY_TIMELINE_TOOL_NAMES,
  HEADLESS_ONLY_TIMELINE_TOOL_NAMES,
  buildTimelineToolContracts,
  rejectUnknownClipParams
} from "../src/api-schemas/timeline-tool-contracts.js";
import { SHARED_TIMELINE_TOOL_NAMES } from "../src/api-schemas/timeline-tool-params.js";

/**
 * The engine's lists, spelled out here rather than imported: this package is
 * below `@nodetool-ai/timeline` in the dependency order. The values are pinned
 * against the engine's own by `packages/agents/tests/timeline-tool-contracts.test.ts`,
 * which can import both.
 */
const VOCAB = {
  staggerUnits: ["word", "character", "line"] as [string, ...string[]],
  animatedProperties: ["offsetX", "offsetY", "opacity"],
  beatToleranceMs: 60
};

const contracts = buildTimelineToolContracts(VOCAB);

describe("timeline tool contracts", () => {
  it("covers exactly the shared name list both hosts assert", () => {
    expect([...SHARED_TIMELINE_TOOL_NAMES].sort()).toEqual(
      Object.keys(contracts).sort()
    );
  });

  it("keeps shared, browser-only and headless-only names disjoint", () => {
    const shared = new Set<string>(Object.keys(contracts));
    for (const name of [
      ...BROWSER_ONLY_TIMELINE_TOOL_NAMES,
      ...HEADLESS_ONLY_TIMELINE_TOOL_NAMES
    ]) {
      expect(shared.has(name), `${name} is both shared and host-only`).toBe(
        false
      );
    }
    for (const name of BROWSER_ONLY_TIMELINE_TOOL_NAMES) {
      expect(HEADLESS_ONLY_TIMELINE_TOOL_NAMES).not.toContain(name);
    }
  });

  it("gives every tool a non-empty description", () => {
    for (const [name, contract] of Object.entries(contracts)) {
      expect(contract.description.length, name).toBeGreaterThan(20);
    }
  });

  it("returns the same record for the same vocabulary", () => {
    expect(buildTimelineToolContracts(VOCAB)).toBe(contracts);
  });
});

describe("uiToolParams", () => {
  it("adds the host's own fields in front of the shared ones", () => {
    const schema = uiToolParams(contracts.ui_timeline_split_clip, {
      timeline_id: z.string()
    });
    const parsed = schema.parse({ timeline_id: "seq-1", target: "clip-1" });
    expect(parsed).toEqual({ timeline_id: "seq-1", target: "clip-1" });
    expect(() => schema.parse({ target: "clip-1" })).toThrow();
  });

  it("omits the host field when a host declares none", () => {
    const schema = uiToolParams(contracts.ui_timeline_split_clip);
    expect(schema.parse({ target: "clip-1" })).toEqual({ target: "clip-1" });
  });

  it("runs finalize after the host's fields are added", () => {
    // `.strict()` has to see `timeline_id`, or the browser's own field is the
    // first thing it refuses.
    const schema = uiToolParams(contracts.ui_timeline_move_track, {
      timeline_id: z.string()
    });
    expect(
      schema.parse({ timeline_id: "seq-1", target: "Video 1", toIndex: 0 })
    ).toMatchObject({ timeline_id: "seq-1" });
    expect(() =>
      schema.parse({ timeline_id: "seq-1", target: "Video 1", nope: 1 })
    ).toThrow();
  });

  it("keeps set_clip_params' unknown keys so they can be refused by name", () => {
    const schema = uiToolParams(contracts.ui_timeline_set_clip_params, {
      timeline_id: z.string()
    });
    const parsed = schema.parse({
      timeline_id: "seq-1",
      target: "clip-1",
      nope: 3
    }) as Record<string, unknown>;
    expect(parsed.nope).toBe(3);
    expect(() => rejectUnknownClipParams({ nope: 3 })).toThrow(/no `nope`/);
    expect(() => rejectUnknownClipParams({ effects: [] })).toThrow(
      /use set_effects/
    );
  });

  it("accepts the timing keys set_clip_params documents", () => {
    const schema = uiToolParams(contracts.ui_timeline_set_clip_params);
    const parsed = schema.parse({
      target: "clip-1",
      startMs: 100,
      durationMs: 200,
      inPointMs: 0,
      outPointMs: 200,
      trackId: "track-1",
      fontSizePx: 48
    }) as Record<string, unknown>;
    expect(parsed.startMs).toBe(100);
    expect(parsed.fontSizePx).toBe(48);
  });
});
