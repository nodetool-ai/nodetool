import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_AUTOMATION_POINTS_PER_LANE,
  MAX_AUTOMATION_LANES_PER_TRACK
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { MAX_AUTOMATION_TIME_MS } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { automationTargetKey } from "../src/automation.js";
import { makeTrack } from "../src/index.js";
import { FABLESYNTH_FACTORY_PRESETS } from "../src/midi/fablesynthPresets.gen.js";
import type { AutomationTarget } from "../src/types.js";
import {
  automationTargetRange,
  runAutomationEdit
} from "../src/ops/automation.js";
import ranges from "../src/automationRanges.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

const target = { kind: "mixer", param: "volumeDb" } as const;
function state(): TimelineOpState {
  return {
    fps: 30,
    width: 640,
    height: 360,
    clips: [],
    mediaTracks: [],
    markers: [],
    playheadMs: 0,
    selectedClipIds: [],
    tracks: [
      makeTrack({
        id: "a",
        name: "Audio",
        index: 0,
        type: "audio",
        automation: [
          {
            id: "lane",
            target,
            points: [
              { timeMs: 10, value: -12 },
              { timeMs: 20, value: 0 }
            ]
          }
        ]
      })
    ]
  };
}
const edits = [
  ["automation.addPoints", { target, points: [{ timeMs: -10, value: 100 }] }],
  [
    "automation.movePoints",
    { target, fromMs: 10, toMs: 10, deltaMs: -100, deltaValue: -100 }
  ],
  ["automation.deletePoints", { target, fromMs: 10, toMs: 10 }],
  ["automation.clearLane", { target }],
  ["automation.setLaneEnabled", { target, enabled: false }],
  ["setTrackAutomationMode", { mode: "write" }]
] as const;
function context() {
  return { newId: () => "new_lane" };
}
async function run(
  s: TimelineOpState,
  edit: string,
  payload: Record<string, unknown>
) {
  return applyTimelineOp(
    s,
    timelineOpFromToolArgs(edit as never, { track_id: "a", ...payload }),
    context() as never
  );
}

async function expectNative(
  initial: TimelineOpState,
  edit: string,
  payload: Record<string, unknown>
) {
  let out:
    | Awaited<ReturnType<typeof run>>
    | { state: TimelineOpState; error: string };
  try {
    out = await run(initial, edit, payload);
  } catch (error) {
    out = { state: initial, error: String(error) };
  }
  const binary = fileURLToPath(
    new URL("../../../native/timeline/build/tst_automation", import.meta.url)
  );
  const actual = JSON.parse(
    execFileSync(binary, ["--json"], {
      input: JSON.stringify([
        ["automationEditResult", [initial, edit, { trackId: "a", ...payload }]]
      ]),
      encoding: "utf8",
      env: { ...process.env, QT_QPA_PLATFORM: "offscreen" }
    })
  );
  const expected = structuredClone(out.state);
  const nativeState: TimelineOpState = actual[0].state;
  for (const track of expected.tracks) {
    for (const lane of track.automation ?? []) {
      if (lane.id !== "new_lane") {
        continue;
      }
      const nativeLane = nativeState.tracks
        .find((candidate) => candidate.id === track.id)
        ?.automation?.find(
          (candidate) =>
            automationTargetKey(candidate.target) ===
            automationTargetKey(lane.target)
        );
      expect(nativeLane?.id).toMatch(/^[a-f0-9]{32}$/);
      if (nativeLane) {
        lane.id = nativeLane.id;
      }
    }
  }
  expect(nativeState).toEqual(expected);
  expect(actual[0].ok).toBe(!out.error);
  if (out.error) {
    expect(actual[0].error).toEqual(expect.any(String));
    if (
      [
        "Track is locked.",
        "Automation lane does not exist.",
        "Device id is missing or ambiguous.",
        "Automation capacity exceeded.",
        "Unknown automation parameter.",
        "Automation move overflow.",
        "Invalid stored automation point."
      ].includes(out.error)
    ) {
      expect(actual[0].error).toBe(out.error);
    }
  }
  return out;
}

describe("narrow automation edits", () => {
  it("resolves move collisions with moved points winning, last selected point winning ties", async () => {
    for (const [fromMs, toMs, deltaMs, expected] of [
      [10, 20, -100, [{ timeMs: 0, value: 0 }]],
      [10, 10, 10, [{ timeMs: 20, value: -12 }]],
      [20, 20, -10, [{ timeMs: 10, value: 0 }]]
    ] as const) {
      const payload = { target, fromMs, toMs, deltaMs, deltaValue: 0 };
      const out = await run(state(), "automation.movePoints", payload);
      expect(out.state.tracks[0]!.automation![0]!.points).toEqual(expected);
      await expectNative(state(), "automation.movePoints", payload);
    }
  });
  it("merges a full batch with last input winning duplicate times within the UI budget", async () => {
    const initial = state();
    initial.tracks[0]!.automation![0]!.points = [];
    const points = Array.from({ length: 10000 }, (_, timeMs) => ({
      timeMs,
      value: -12
    }));
    const start = performance.now();
    const out = await run(initial, "automation.addPoints", { target, points });
    expect(out.error).toBeUndefined();
    expect(out.state.tracks[0]!.automation![0]!.points).toHaveLength(10000);
    expect(performance.now() - start).toBeLessThan(250);
    await expectNative(initial, "automation.addPoints", { target, points });
    const full = out.state;
    const overflow = points.map((point) => ({
      ...point,
      timeMs: point.timeMs + 10000
    }));
    const refused = await run(full, "automation.addPoints", {
      target,
      points: overflow
    });
    expect(refused.error).toMatch(/capacity/);
    expect(refused.state).toEqual(full);
    await expectNative(full, "automation.addPoints", {
      target,
      points: overflow
    });
  });
  it("rejects a discriminator smuggled into flat command arguments", () => {
    expect(() =>
      timelineOpFromToolArgs("automation.clearLane", {
        track_id: "a",
        target,
        edit: "automation.addPoints"
      })
    ).toThrow();
  });
  it.each(["", "unknown", "constructor", "toString", "x".repeat(257)])(
    "rejects invalid easing %s",
    async (easing) => {
      await expect(async () => {
        const out = await run(state(), "automation.addPoints", {
          target,
          points: [{ timeMs: 0, value: 0, easing }]
        });
        if (out.error) {
          throw new Error(out.error);
        }
      }).rejects.toThrow();
    }
  );
  it("edits existing orphaned device lanes without needing a value range", async () => {
    const initial = state();
    const orphan = {
      kind: "device",
      deviceId: "removed",
      param: "wet"
    } as const;
    initial.tracks[0]!.automation![0]!.target = orphan;
    for (const [edit, payload] of [
      ["automation.clearLane", { target: orphan }],
      ["automation.setLaneEnabled", { target: orphan, enabled: false }],
      ["automation.deletePoints", { target: orphan, fromMs: 0, toMs: 15 }]
    ] as const) {
      const out = await run(initial, edit, payload);
      expect(out.error).toBeUndefined();
      await expectNative(initial, edit, payload);
    }
  });
  it("rejects extra target and point keys at both boundaries", async () => {
    for (const payload of [
      {
        target: { ...target, surprise: true },
        points: [{ timeMs: 0, value: 0 }]
      },
      { target, points: [{ timeMs: 0, value: 0, surprise: true }] },
      { target, points: [{ timeMs: 0, value: 0 }], surprise: true }
    ]) {
      expect(() =>
        timelineOpFromToolArgs("automation.addPoints", {
          track_id: "a",
          ...payload
        })
      ).toThrow();
      await expectNative(state(), "automation.addPoints", payload);
    }
  });
  it("rejects time magnitudes unsafe for sample conversion", async () => {
    for (const payload of [
      { target, points: [{ timeMs: 1e308, value: 0 }] },
      { target, points: [{ timeMs: -1e308, value: 0 }] }
    ]) {
      expect(() =>
        timelineOpFromToolArgs("automation.addPoints", {
          track_id: "a",
          ...payload
        })
      ).toThrow();
      await expectNative(state(), "automation.addPoints", payload);
    }
  });
  it("rejects inverted ranges and bundled set_track edits during parsing", () => {
    for (const edit of [
      "automation.movePoints",
      "automation.deletePoints"
    ] as const) {
      expect(() =>
        timelineOpFromToolArgs(edit, {
          track_id: "a",
          target,
          fromMs: 20,
          toMs: 10,
          ...(edit === "automation.movePoints"
            ? { deltaMs: 0, deltaValue: 0 }
            : {})
        })
      ).toThrow(/toMs/);
    }
    expect(() =>
      timelineOpFromToolArgs("set_track", {
        track: "a",
        muted: true,
        automationEdit: { edit: "automation.clearLane", target }
      })
    ).toThrow(/alone/);
  });
  it("does not expose prototype properties as parameter ranges", () => {
    const initial = state();
    initial.tracks[0]!.effects = [
      { id: "fx", type: "gain", enabled: true, gainDb: 0 }
    ];
    for (const param of ["toString", "constructor", "__proto__"]) {
      expect(() =>
        automationTargetRange(initial.tracks[0]!, {
          kind: "device",
          deviceId: "fx",
          param
        })
      ).toThrow(/Unknown/);
    }
  });
  it("does not consume a lane id when capacity validation fails", () => {
    const track = state().tracks[0]!;
    track.automation = Array.from({ length: 256 }, (_, id) => ({
      id: String(id),
      target,
      points: []
    }));
    let ids = 0;
    expect(() =>
      runAutomationEdit(
        track,
        {
          edit: "automation.addPoints",
          target: { kind: "mixer", param: "pan" },
          points: [{ timeMs: 0, value: 0 }]
        },
        () => String(++ids)
      )
    ).toThrow(/capacity/);
    expect(ids).toBe(0);
  });
  it("keeps native documents identical for all modes, noops, easing, reordered points and rejections", async () => {
    for (const mode of ["off", "read", "touch", "latch", "write"]) {
      await expectNative(state(), "setTrackAutomationMode", { mode });
    }
    for (const enabled of [true, false]) {
      await expectNative(state(), "automation.setLaneEnabled", {
        target,
        enabled
      });
    }
    for (const easing of [
      "hold",
      "easeIn",
      "cubic-bezier(0.2,0,0.8,1)",
      "spring(100,10,1)"
    ]) {
      await expectNative(state(), "automation.addPoints", {
        target,
        points: [
          { timeMs: 10, value: -6, easing },
          { timeMs: 10, value: -3, easing }
        ]
      });
    }
    const unordered = state();
    unordered.tracks[0]!.automation![0]!.points.reverse();
    await expectNative(unordered, "automation.deletePoints", {
      target,
      fromMs: 100,
      toMs: 100
    });
    for (const payload of [
      { target, fromMs: 100, toMs: 100, deltaMs: 0, deltaValue: 0 },
      { target, fromMs: 20, toMs: 10, deltaMs: 0, deltaValue: 0 },
      { target, fromMs: 0, toMs: 100, deltaMs: 1e308, deltaValue: 0 }
    ]) {
      await expectNative(state(), "automation.movePoints", payload);
    }
    const locked = state();
    locked.tracks[0]!.locked = true;
    await expectNative(locked, "automation.clearLane", { target });
    for (const easing of [
      "unknown",
      "constructor",
      "toString",
      "",
      "x".repeat(257)
    ]) {
      await expectNative(state(), "automation.addPoints", {
        target,
        points: [{ timeMs: 0, value: 0, easing }]
      });
    }
  });
  it("keeps existing segment easing when replacing a point within half a millisecond", async () => {
    const initial = state();
    initial.tracks[0]!.automation![0]!.points[0]!.easing = "hold";
    const payload = { target, points: [{ timeMs: 10.25, value: -3 }] };
    const out = await run(initial, "automation.addPoints", payload);
    expect(out.state.tracks[0]!.automation![0]!.points).toEqual([
      { timeMs: 10.25, value: -3, easing: "hold" },
      { timeMs: 20, value: 0 }
    ]);
    await expectNative(initial, "automation.addPoints", payload);
  });
  it("shares native capacity and time limits with protocol validation", () => {
    const binary = fileURLToPath(
      new URL("../../../native/timeline/build/tst_automation", import.meta.url)
    );
    const actual = JSON.parse(
      execFileSync(binary, ["--json"], {
        input: JSON.stringify([["automationLimits", []]]),
        encoding: "utf8",
        env: { ...process.env, QT_QPA_PLATFORM: "offscreen" }
      })
    );
    expect(actual).toEqual([
      [
        MAX_AUTOMATION_POINTS_PER_LANE,
        MAX_AUTOMATION_LANES_PER_TRACK,
        MAX_AUTOMATION_TIME_MS
      ]
    ]);
  });
  it("rejects malformed stored points before ordered merging", async () => {
    for (const timeMs of [NaN, Infinity, 1e308]) {
      const initial = state();
      initial.tracks[0]!.automation![0]!.points[0]!.timeMs = timeMs;
      const out = await run(initial, "automation.movePoints", {
        target,
        fromMs: 0,
        toMs: 100,
        deltaMs: 1,
        deltaValue: 0
      });
      expect(out.error).toMatch(/stored/);
      // JSON transports non-finite values as null. Compare the transported document.
      if (Number.isFinite(timeMs)) {
        await expectNative(initial, "automation.movePoints", {
          target,
          fromMs: 0,
          toMs: 100,
          deltaMs: 1,
          deltaValue: 0
        });
      }
    }
  });
  it("creates the same new lane on both surfaces", async () => {
    const out = await expectNative(state(), "automation.addPoints", {
      target: { kind: "mixer", param: "pan" },
      points: [{ timeMs: 40, value: 2, easing: "hold" }]
    });
    expect(out.state.tracks[0]!.automation).toHaveLength(2);
    expect(out.state.tracks[0]!.automation![1]).toMatchObject({
      target: { kind: "mixer", param: "pan" },
      points: [{ timeMs: 40, value: 1, easing: "hold" }]
    });
  });
  it.each(edits)(
    "%s changes only the requested lane and respects locks",
    async (edit, payload) => {
      const s = state();
      const before = structuredClone(s);
      const out = await run(s, edit, payload);
      expect(out.error).toBeUndefined();
      expect(out.state).not.toEqual(s);
      expect(s).toEqual(before);
      const locked = state();
      locked.tracks[0]!.locked = true;
      const refused = await run(locked, edit, payload);
      expect(refused.error).toMatch(/locked/);
      expect(refused.state).toEqual(locked);
    }
  );
  it("clamps values and time, moves inclusively and preserves unselected points", async () => {
    const added = await run(state(), edits[0][0], edits[0][1]);
    expect(added.state.tracks[0]!.automation![0]!.points[0]).toEqual({
      timeMs: 0,
      value: 6
    });
    const moved = await run(state(), edits[1][0], edits[1][1]);
    expect(moved.state.tracks[0]!.automation![0]!.points).toEqual([
      { timeMs: 0, value: -60 },
      { timeMs: 20, value: 0 }
    ]);
  });
  it("supports set_track and get_state through the tool contract", async () => {
    const out = await applyTimelineOp(
      state(),
      timelineOpFromToolArgs("set_track", {
        track: "a",
        automationEdit: {
          edit: "automation.setLaneEnabled",
          target,
          enabled: false
        }
      }),
      context() as never
    );
    expect(out.error).toBeUndefined();
    const read = await applyTimelineOp(
      out.state,
      { op: "get_state", track: "a" },
      context() as never
    );
    expect(read.result).toMatchObject({
      trackDetail: {
        automation: [
          {
            enabled: false,
            points: [
              { timeMs: 10, value: -12 },
              { timeMs: 20, value: 0 }
            ]
          }
        ]
      }
    });
  });
  it("refuses malformed input and unknown targets atomically", async () => {
    expect(() =>
      timelineOpFromToolArgs("automation.addPoints", {
        track_id: "a",
        target,
        points: [{ timeMs: 0, value: NaN }]
      })
    ).toThrow();
    const s = state();
    for (const payload of [
      {
        target: { kind: "mixer", param: "invalid" },
        points: [{ timeMs: 0, value: 0 }]
      },
      {
        target: { kind: "device", deviceId: "missing", param: "gainDb" },
        points: [{ timeMs: 0, value: 0 }]
      }
    ]) {
      await expect(async () => {
        const result = await run(s, "automation.addPoints", payload);
        if (result.error) {
          throw new Error(result.error);
        }
      }).rejects.toThrow();
      expect(s).toEqual(state());
    }
    await expect(
      run(s, "automation.deletePoints", { target, fromMs: 20, toMs: 10 })
    ).rejects.toThrow(/toMs/);
  });
  it.each(["off", "read", "touch", "latch", "write"])(
    "sets %s mode",
    async (mode) => {
      const out = await run(state(), "setTrackAutomationMode", { mode });
      expect(out.state.tracks[0]!.automationMode).toBe(mode);
    }
  );
  it("resolves exact device prefixes and refuses ambiguous or incomplete prefixes", async () => {
    const initial = state();
    const track = initial.tracks[0]!;
    const id = "abcdefabcdef00000000000000000001";
    track.effects = [{ id, type: "gain", enabled: true, gainDb: 0 }];
    track.automation = [
      {
        id: "lane",
        target: { kind: "device", deviceId: id, param: "gainDb" },
        points: []
      }
    ];
    const payload = {
      target: { kind: "device", deviceId: id.slice(0, 12), param: "gainDb" },
      points: [{ timeMs: 0, value: 100 }]
    };
    const out = await run(initial, "automation.addPoints", payload);
    expect(out.error).toBeUndefined();
    await expectNative(initial, "automation.addPoints", payload);
    expect(out.state.tracks[0]!.automation).toHaveLength(1);
    expect(out.state.tracks[0]!.automation![0]!.points[0]!.value).toBe(24);
    expect(
      (
        await run(initial, "automation.addPoints", {
          ...payload,
          target: { ...payload.target, deviceId: id.slice(0, 6) }
        })
      ).error
    ).toMatch(/missing/);
    track.effects.push({
      id: "abcdefabcdef00000000000000000002",
      type: "gain",
      enabled: true,
      gainDb: 0
    });
    const refused = await run(initial, "automation.addPoints", payload);
    await expectNative(initial, "automation.addPoints", payload);
    expect(refused.error).toMatch(/ambiguous/);
    expect(refused.state).toEqual(initial);
  });
  it("handles a full lane and refuses exceeding capacity atomically", async () => {
    const initial = state();
    initial.tracks[0]!.automation![0]!.points = Array.from(
      { length: 10000 },
      (_, index) => ({ timeMs: index, value: 0 })
    );
    const moved = await run(initial, "automation.movePoints", {
      target,
      fromMs: 0,
      toMs: 9999,
      deltaMs: 1,
      deltaValue: 1
    });
    expect(moved.error).toBeUndefined();
    expect(moved.state.tracks[0]!.automation![0]!.points).toHaveLength(10000);
    const refused = await run(initial, "automation.addPoints", {
      target,
      points: [{ timeMs: 10000, value: 0 }]
    });
    await expectNative(initial, "automation.addPoints", {
      target,
      points: [{ timeMs: 10000, value: 0 }]
    });
    expect(refused.error).toMatch(/capacity/);
    expect(refused.state).toEqual(initial);
  });
  it("uses the ranges displayed by the native automation UI", () => {
    const source = readFileSync(
      new URL(
        "../../../native/timeline/qml/Tracks/automation/automationTargets.js",
        import.meta.url
      ),
      "utf8"
    )
      .split("\n")
      .filter((line) => !/^\.(pragma|import) /.test(line))
      .join("\n");
    const groups: Readonly<
      Record<string, Readonly<Record<string, readonly number[]>>>
    > = ranges;
    let inspected = 0;
    for (const type of ["audio", "video"]) {
      const effects = ["gain", "eq3", "filter", "compressor"].map((type) => ({
        id: type,
        type
      }));
      const specs: Array<{
        target: AutomationTarget;
        min: number;
        max: number;
      }> = runInNewContext(source + "; automationTargetSpecs(track)", {
        track: { type, effects },
        Native: { AutomationParameters: { effectDefaults: () => ({}) } }
      });
      for (const { target, min, max } of specs) {
        const group = target.kind === "device" ? target.deviceId : target.kind;
        const param = target.kind === "clip" ? target.property : target.param;
        expect(groups[group]?.[param]).toEqual([min, max]);
        ++inspected;
      }
    }
    expect(inspected).toBeGreaterThan(0);
  });
  it("tracks the instrument parameter definitions used by the native UI", () => {
    const text = readFileSync(
      new URL(
        "../../../native/timeline/src/audio/automation/InstrumentParameters.inc",
        import.meta.url
      ),
      "utf8"
    );
    const definitions: Record<
      string,
      Array<[string, number, number]>
    > = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const groups: Readonly<
      Record<string, Readonly<Record<string, readonly number[]>>>
    > = ranges;
    expect(Object.keys(definitions).length).toBeGreaterThan(0);
    for (const [kind, parameters] of Object.entries(definitions)) {
      expect(Object.keys(groups[kind] ?? {})).toHaveLength(parameters.length);
      for (const [id, min, max] of parameters) {
        expect(groups[kind]?.[id]).toEqual([min, max]);
      }
    }
  });
  it("keeps native range data synchronized", () => {
    const text = readFileSync(
      new URL(
        "../../../native/timeline/src/audio/automation/AutomationRanges.inc",
        import.meta.url
      ),
      "utf8"
    );
    expect(
      JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))
    ).toEqual(ranges);
  });
});

describe("native document parity", () => {
  const binary = fileURLToPath(
    new URL("../../../native/timeline/build/tst_automation", import.meta.url)
  );
  it("compares each named edit against the native edit implementation", async () => {
    expect(
      existsSync(binary),
      "Build tst_automation before running parity"
    ).toBe(true);
    const requests: unknown[] = [];
    const expected: unknown[] = [];
    for (const [edit, payload] of edits) {
      const initial = state();
      const out = await run(initial, edit, payload);
      expect(out.error).toBeUndefined();
      requests.push([
        "automationEdit",
        [initial, edit, { trackId: "a", ...payload }]
      ]);
      expected.push(out.state);
    }
    // Clamp at both ends for every continuous instrument parameter and every UI effect parameter.
    const groups: Readonly<
      Record<string, Readonly<Record<string, readonly number[]>>>
    > = ranges;
    let parameters = 0;
    for (const [kind, fields] of Object.entries(groups)) {
      for (const [param, bounds] of Object.entries(fields)) {
        const initial = state();
        const track = initial.tracks[0]!;
        let target: AutomationTarget;
        if (kind === "mixer") {
          continue;
        } // The named-edit cases cover the mixer.
        if (kind === "clip") {
          track.type = "video";
          target = { kind: "clip", property: param };
        } else if (["gain", "eq3", "filter", "compressor"].includes(kind)) {
          // Parse a serialized fixture at the boundary, rather than pretending a partial effect is a complete runtime effect.
          const effect = JSON.parse(
            JSON.stringify({
              id: "abcdefabcdef00000000000000000001",
              type: kind,
              enabled: true
            })
          );
          track.effects = [effect];
          target = { kind: "device", deviceId: effect.id, param };
        } else {
          const instrumentType = kind === "drumPad" ? "drum" : kind;
          const instrument = FABLESYNTH_FACTORY_PRESETS.find(
            (preset) => preset.instrument.type === instrumentType
          )?.instrument;
          expect(instrument).toBeDefined();
          track.type = "midi";
          track.instrument = structuredClone(instrument);
          target = {
            kind: "device",
            deviceId: "instrument",
            param: kind === "drumPad" ? "pad15." + param : param
          };
        }
        track.automation = [{ id: "lane", target, points: [] }];
        const payload = {
          target,
          points: [
            { timeMs: 0, value: -1e10 },
            { timeMs: 100, value: 1e10 }
          ]
        };
        const out = await run(initial, "automation.addPoints", payload);
        expect(out.error).toBeUndefined();
        expect(
          out.state.tracks[0]!.automation![0]!.points.map(
            (point) => point.value
          )
        ).toEqual(bounds);
        requests.push([
          "automationEdit",
          [initial, "automation.addPoints", { trackId: "a", ...payload }]
        ]);
        expected.push(out.state);
        ++parameters;
      }
    }
    expect(parameters).toBeGreaterThan(0);
    const actual = JSON.parse(
      execFileSync(binary, ["--json"], {
        input: JSON.stringify(requests),
        maxBuffer: 64 * 1024 * 1024,
        encoding: "utf8",
        env: { ...process.env, QT_QPA_PLATFORM: "offscreen" }
      })
    );
    expect(actual).toEqual(expected);
  });
});
