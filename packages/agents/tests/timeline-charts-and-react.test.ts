/**
 * Real-sandbox coverage for the two additions to
 * `@nodetool-ai/sandbox-timeline`: chart components (`s.barChart`,
 * `s.lineChart`, `s.donut`) and audio-reactive motion (`el.react()`,
 * compiling to `bake_audio_animation` at save time). Follows the pattern in
 * `codeact-timeline-package.test.ts`: a real `discoverSandboxPack` catalog, a
 * real chat CodeAct session, guest code that imports the installed pack.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";

const discovery = discoverSandboxPack(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "sandbox-packs",
    "sandbox-timeline"
  )
);
if (discovery === undefined) {
  throw new Error("The shipped timeline pack is missing");
}
const catalog = createSandboxModuleCatalog([discovery]);

function chatSession(executeTool?: (call: { name: string; args: Record<string, unknown> }) => Promise<unknown>) {
  return createChatCodeActSession({
    tools: [
      "create_timeline",
      "set_timeline_document",
      "validate_timeline",
      "edit_timeline",
      "bake_audio_animation"
    ].map((name) => ({
      name,
      description: name,
      inputSchema: { type: "object", properties: {} }
    })),
    sandboxModuleCatalog: catalog,
    executeTool: executeTool ?? (async () => ({}))
  });
}

async function runCode(
  code: string,
  executeTool?: (call: { name: string; args: Record<string, unknown> }) => Promise<unknown>
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const observation = JSON.parse(
    await chatSession(executeTool).executeAction({ code })
  );
  return observation;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

describe("s.barChart", () => {
  it("produces one bar per datum, staggered growth, and value labels that finish inside each bar's own window", async () => {
    const observation = await runCode(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1080, fps: 30 });
const scene = v.scene("chart", 3, (s) => {
  s.barChart([10, 40, 25], { at: 0, dur: 0.4, stagger: 0.1 });
});
v.series([scene]);
const bars = v._document.clips.filter((c) => c.name && c.name.startsWith("bar-"));
const labels = v._document.clips.filter((c) => c.mediaType === "text");
return {
  barCount: bars.length,
  growAts: bars.map((b) => b.animations.find((a) => a.custom).delayMs),
  labelWindows: labels.map((l) => {
    const ticker = l.animations.find((a) => a.textAnimator);
    return { at: ticker.delayMs, end: ticker.delayMs + ticker.durationMs, clipEnd: l.durationMs };
  })
};
`);
    expect(observation.ok).toBe(true);
    const result = observation.result as {
      barCount: number;
      growAts: number[];
      labelWindows: { at: number; end: number; clipEnd: number }[];
    };
    expect(result.barCount).toBe(3);
    // Staggered: each bar's own grow animation starts later than the last.
    expect(result.growAts[0]).toBeLessThan(result.growAts[1]);
    expect(result.growAts[1]).toBeLessThan(result.growAts[2]);
    // Every value-label ticker finishes before the scene (and hence the
    // clip's own visible window) ends, never mid-flight.
    for (const w of result.labelWindows) {
      expect(w.end).toBeLessThanOrEqual(w.clipEnd);
    }
  });
});

describe("s.lineChart", () => {
  it("scales data points into the w×h box the line is drawn in", async () => {
    const observation = await runCode(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1080, fps: 30 });
const scene = v.scene("chart", 2, (s) => {
  s.lineChart([0, 5, 10], { w: 400, h: 200, dots: false, endLabel: false });
});
v.series([scene]);
const line = v._document.clips.find((c) => c.name === "line");
return { d: line.shapeStyle.d, w: v.width, h: v.height };
`);
    expect(observation.ok).toBe(true);
    const { d } = observation.result as { d: string };
    const commands = d.trim().split(/\s+(?=[ML])/);
    expect(commands).toHaveLength(3);
    const parsed = commands.map((cmd) => {
      const [, x, y] = cmd.match(/^[ML]([0-9.]+)\s+([0-9.]+)$/) ?? [];
      return { x: Number(x), y: Number(y) };
    });
    // series [0, 5, 10] over a 400x200 box inside a 1080x1080 frame: x steps
    // evenly across the box width (-200..+200px from centre), y descends
    // monotonically (higher value draws higher on screen), the lowest value
    // sits at the box's baseline (100px below centre) and the highest 100px
    // above it. `pathData` normalizes a px-from-centre offset to
    // `(frameDim / 2 + val) / frameDim`.
    const F = 1080;
    expect(parsed[0].x).toBeCloseTo((F / 2 - 200) / F, 5);
    expect(parsed[2].x).toBeCloseTo((F / 2 + 200) / F, 5);
    expect(parsed[0].x).toBeLessThan(parsed[1].x);
    expect(parsed[1].x).toBeLessThan(parsed[2].x);
    expect(parsed[0].y).toBeCloseTo((F / 2 + 100) / F, 5);
    expect(parsed[2].y).toBeCloseTo((F / 2 - 100) / F, 5);
    expect(parsed[0].y).toBeGreaterThan(parsed[1].y);
    expect(parsed[1].y).toBeGreaterThan(parsed[2].y);
  });
});

describe("s.donut", () => {
  it("sweeps every segment's angle to sum to 360 minus the gap notches", async () => {
    const observation = await runCode(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1080, fps: 30 });
let segAngles;
const scene = v.scene("chart", 2, (s) => {
  const chart = s.donut([25, 25, 50], { gap: 6, stagger: 0.05 });
  segAngles = chart.segments.map((seg) => seg.endDeg - seg.startDeg);
});
v.series([scene]);
return { segAngles, gap: 6, n: 3 };
`);
    expect(observation.ok).toBe(true);
    const { segAngles, gap, n } = observation.result as { segAngles: number[]; gap: number; n: number };
    expect(segAngles).toHaveLength(3);
    const totalSweep = segAngles.reduce((a, b) => a + b, 0);
    expect(totalSweep).toBeCloseTo(360 - gap * n, 3);
    // 25/25/50 split of 100 -> proportional sweeps (before the gap notch).
    expect(segAngles[2]).toBeGreaterThan(segAngles[0]);
    expect(segAngles[0]).toBeCloseTo(segAngles[1], 3);
  });
});

// ---------------------------------------------------------------------------
// Audio-reactive motion
// ---------------------------------------------------------------------------

describe("el.react", () => {
  it("compiles to bake_audio_animation at save time, with the right ids and params", async () => {
    const bakeCalls: Record<string, unknown>[] = [];
    const timelineId = "b".repeat(32);
    const observation = await runCode(
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1080, fps: 30 });
let title, kick;
const scene = v.scene("drop", 4, (s) => {
  kick = s.audio("asset_kicks", { name: "kicks" });
  title = s.text("DROP", { size: 90 });
  title.react(kick, { prop: "scale", mode: "beats", range: [1, 1.3], smooth: 0.05 });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Drop demo" });
`,
      async (call) => {
        if (call.name === "create_timeline") return { timeline_id: timelineId };
        if (call.name === "set_timeline_document") return { written: true };
        if (call.name === "bake_audio_animation") {
          bakeCalls.push(call.args);
          return { ok: true };
        }
        return { ok: true, errors: [] };
      }
    );
    expect(observation.ok).toBe(true);
    expect(bakeCalls).toHaveLength(1);
    const args = bakeCalls[0] as Record<string, unknown>;
    expect(args.timeline_id).toBe(timelineId);
    expect(args.property).toBe("scale");
    expect(args.mode).toBe("beats");
    expect(args.output_range).toEqual([1, 1.3]);
    // smooth: 0.05s snapped to the 30fps frame grid by msFor (0.05*30 = 1.5
    // -> 2 frames -> 66.67ms), same as every other duration in this API.
    expect(args.attack_ms).toBe(67);
    expect(args.release_ms).toBe(67);
    expect(typeof args.audio_clip_id).toBe("string");
    expect(typeof args.target_clip_id).toBe("string");
    expect(args.audio_clip_id).not.toBe(args.target_clip_id);
  });

  it("throws naming the limit when asked for a frequency band", async () => {
    const observation = await runCode(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1080, fps: 30 });
const scene = v.scene("drop", 2, (s) => {
  const kick = s.audio("asset_kicks", {});
  const title = s.text("DROP", {});
  title.react(kick, { prop: "scale", band: "bass" });
});
v.series([scene]);
return "unreachable";
`);
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("band-pass");
    expect(observation.error).toContain("bake_audio_animation");
  });

  it("surfaces a failed bake naming the timeline it was saved to", async () => {
    const timelineId = "c".repeat(32);
    const observation = await runCode(
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1080, fps: 30 });
const scene = v.scene("drop", 2, (s) => {
  const kick = s.audio("asset_kicks", {});
  const title = s.text("DROP", {});
  title.react(kick, { prop: "scale" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Drop demo" });
`,
      async (call) => {
        if (call.name === "create_timeline") return { timeline_id: timelineId };
        if (call.name === "set_timeline_document") return { written: true };
        if (call.name === "bake_audio_animation") return { error: "no asset to measure" };
        return { ok: true, errors: [] };
      }
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain(timelineId);
    expect(observation.error).toContain("no asset to measure");
  });
});
