import { describe, expect, it } from "vitest";
import { makeTrack } from "../src/defaults.js";
import {
  TIMELINE_OP_NAMES,
  applyTimelineOp,
  createMemoryPluginHost,
  timelineOpFromToolArgs,
  type TimelineOpContext,
  type TimelineOpState
} from "../src/ops/index.js";

function makeState(): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "t_midi", type: "midi", name: "Lead", index: 0 }),
      makeTrack({ id: "t_audio", type: "audio", name: "Vocals", index: 1 }),
      makeTrack({ id: "t_video", type: "video", name: "Video", index: 2 })
    ],
    clips: [],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

function makeHost() {
  return createMemoryPluginHost([
    {
      info: {
        uid: "VST3-Pad",
        name: "Acme Pad",
        vendor: "Acme",
        version: "1.0.0",
        path: "/Library/Audio/Plug-Ins/VST3/AcmePad.vst3",
        format: "vst3",
        isInstrument: true
      },
      presets: [
        { index: 0, name: "Init" },
        { index: 1, name: "Warm Pad" }
      ],
      parameters: [
        {
          id: "cutoff",
          index: 0,
          name: "Cutoff",
          label: "Hz",
          value: 0.5,
          defaultValue: 0.5,
          formatDisplay: (v) => `${Math.round(20 + v * 19980)} Hz`,
          parseDisplay: (text) => {
            const hz = Number.parseFloat(text);
            return Number.isFinite(hz) ? Math.min(1, Math.max(0, (hz - 20) / 19980)) : null;
          }
        },
        {
          id: "resonance",
          index: 1,
          name: "Resonance",
          label: "%",
          value: 0.2,
          defaultValue: 0.2,
          formatDisplay: (v) => `${Math.round(v * 100)}%`
        }
      ]
    },
    {
      info: {
        uid: "AU-Comp",
        name: "Studio Comp",
        vendor: "WavesCo",
        version: "2.1.0",
        path: "/Library/Audio/Plug-Ins/Components/StudioComp.component",
        format: "au",
        isInstrument: false
      },
      presets: [
        { index: 0, name: "Default" },
        { index: 1, name: "Vocal Glue" }
      ],
      parameters: [
        {
          id: "threshold",
          index: 0,
          name: "Threshold",
          label: "dB",
          value: 0.5,
          defaultValue: 0.5,
          formatDisplay: (v) => `${(-60 + v * 60).toFixed(1)} dB`,
          parseDisplay: (text) => {
            const db = Number.parseFloat(text);
            return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : null;
          }
        }
      ]
    }
  ]);
}

function makeCtx(pluginHost = makeHost()): TimelineOpContext {
  let seq = 0;
  return {
    newId: (kind) => `${kind}_${++seq}`,
    pluginHost
  };
}

describe("VST/AU plugin timeline ops", () => {
  it("registers all 6 plugin op names", () => {
    for (const op of [
      "list_plugins",
      "load_plugin",
      "list_plugin_presets",
      "select_plugin_preset",
      "get_plugin_parameters",
      "set_plugin_parameters"
    ]) {
      expect(TIMELINE_OP_NAMES).toContain(op);
    }
  });

  it("lists available VST3 and AU instruments and effects with filters", async () => {
    const state = makeState();
    const ctx = makeCtx();

    const all = await applyTimelineOp(state, timelineOpFromToolArgs("list_plugins", {}), ctx);
    expect(all.error).toBeUndefined();
    expect((all.result.plugins as unknown[]).length).toBe(2);

    const effectsOnly = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("list_plugins", { kind: "effect", format: "au" }),
      ctx
    );
    expect(effectsOnly.error).toBeUndefined();
    expect(effectsOnly.result.plugins).toEqual([
      expect.objectContaining({
        uid: "AU-Comp",
        format: "au",
        isInstrument: false,
        kind: "effect"
      })
    ]);

    const noHost = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("list_plugins", {}),
      { newId: (k) => `${k}_1` }
    );
    expect(noHost.error).toMatch(/plugin host/i);
  });

  it("loads a VST/AU instrument on a MIDI track and an insert effect on audio/MIDI/master tracks", async () => {
    const ctx = makeCtx();
    let state = makeState();

    const loadInst = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("load_plugin", {
        track: "Lead",
        plugin: "Acme Pad",
        gainDb: -2
      }),
      ctx
    );
    expect(loadInst.error).toBeUndefined();
    expect(loadInst.result).toMatchObject({ ok: true, slot: "instrument" });
    state = loadInst.state;
    expect(state.tracks[0].instrument).toMatchObject({
      type: "vst",
      gainDb: -2,
      plugin: { uid: "VST3-Pad", name: "Acme Pad", format: "vst3" }
    });

    const loadFx = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("load_plugin", {
        track: "Vocals",
        plugin: "AU-Comp",
        wet: 0.6
      }),
      ctx
    );
    expect(loadFx.error).toBeUndefined();
    expect(loadFx.result).toMatchObject({ ok: true, slot: "effect" });
    state = loadFx.state;
    expect(state.tracks[1].effects).toEqual([
      expect.objectContaining({
        type: "vst",
        enabled: true,
        wet: 0.6,
        plugin: expect.objectContaining({ uid: "AU-Comp", format: "au" })
      })
    ]);

    const loadMaster = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("load_plugin", {
        track: "master",
        plugin: "Studio Comp"
      }),
      ctx
    );
    expect(loadMaster.error).toBeUndefined();
    expect(loadMaster.state.master?.effects).toHaveLength(1);

    const badInstOnAudio = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("load_plugin", {
        track: "Vocals",
        plugin: "Acme Pad",
        slot: "instrument"
      }),
      ctx
    );
    expect(badInstOnAudio.error).toMatch(/midi/i);
  });

  it("lists and selects plugin presets by index or name and stores updated state", async () => {
    const ctx = makeCtx();
    const loaded = await applyTimelineOp(
      makeState(),
      timelineOpFromToolArgs("load_plugin", { track: "Lead", plugin: "VST3-Pad" }),
      ctx
    );
    const listed = await applyTimelineOp(
      loaded.state,
      timelineOpFromToolArgs("list_plugin_presets", { track: "Lead" }),
      ctx
    );
    expect(listed.error).toBeUndefined();
    expect(listed.result).toMatchObject({
      ok: true,
      target: "instrument",
      presets: [
        { index: 0, name: "Init" },
        { index: 1, name: "Warm Pad" }
      ]
    });

    const selected = await applyTimelineOp(
      loaded.state,
      timelineOpFromToolArgs("select_plugin_preset", { track: "Lead", preset: "warm pad" }),
      ctx
    );
    expect(selected.error).toBeUndefined();
    expect(selected.result).toMatchObject({
      ok: true,
      preset: { index: 1, name: "Warm Pad" }
    });
    const inst = selected.state.tracks[0].instrument;
    expect(inst?.type === "vst" ? inst.state : null).toBeTruthy();
  });

  it("lists, reads, and sets plugin parameters by id or name using normalized or display values", async () => {
    const ctx = makeCtx();
    const loaded = await applyTimelineOp(
      makeState(),
      timelineOpFromToolArgs("load_plugin", { track: "Lead", plugin: "VST3-Pad" }),
      ctx
    );

    const readAll = await applyTimelineOp(
      loaded.state,
      timelineOpFromToolArgs("get_plugin_parameters", { track: "Lead" }),
      ctx
    );
    expect(readAll.error).toBeUndefined();
    expect(readAll.result.parameters).toEqual([
      expect.objectContaining({ id: "cutoff", name: "Cutoff", value: 0.5, displayValue: "10010 Hz" }),
      expect.objectContaining({ id: "resonance", name: "Resonance", value: 0.2, displayValue: "20%" })
    ]);

    const setParams = await applyTimelineOp(
      loaded.state,
      timelineOpFromToolArgs("set_plugin_parameters", {
        track: "Lead",
        parameters: [
          { parameter: "Cutoff", displayValue: "5015 Hz" },
          { parameter: "resonance", value: 0.75 }
        ]
      }),
      ctx
    );
    expect(setParams.error).toBeUndefined();
    expect(setParams.result.updated).toEqual([
      expect.objectContaining({ id: "cutoff", displayValue: "5015 Hz" }),
      expect.objectContaining({ id: "resonance", value: 0.75, displayValue: "75%" })
    ]);
    const inst = setParams.state.tracks[0].instrument;
    expect(inst?.type === "vst" ? inst.state : null).toBeTruthy();

    const readBack = await applyTimelineOp(
      setParams.state,
      timelineOpFromToolArgs("get_plugin_parameters", {
        track: "Lead",
        parameters: ["Cutoff", "resonance"]
      }),
      ctx
    );
    expect(readBack.error).toBeUndefined();
    expect(readBack.result.parameters).toEqual([
      expect.objectContaining({ id: "cutoff", displayValue: "5015 Hz" }),
      expect.objectContaining({ id: "resonance", value: 0.75, displayValue: "75%" })
    ]);
  });

  it("F1: preserves previously persisted state when host returns empty or null state", async () => {
    const baseHost = makeHost();
    const emptyStateHost = {
      ...baseHost,
      selectPreset: async (req: Parameters<typeof baseHost.selectPreset>[0]) => {
        const res = await baseHost.selectPreset(req);
        return { preset: res.preset, state: null };
      },
      setParameters: async (req: Parameters<typeof baseHost.setParameters>[0]) => {
        const res = await baseHost.setParameters(req);
        return { parameters: res.parameters, state: "" as unknown as string | null };
      }
    };
    const ctx = makeCtx(emptyStateHost);
    const loaded = await applyTimelineOp(
      makeState(),
      timelineOpFromToolArgs("load_plugin", {
        track: "Lead",
        plugin: "VST3-Pad",
        state: "U0FWRURfUEFUQ0g="
      }),
      ctx
    );
    expect(loaded.error).toBeUndefined();

    const afterPreset = await applyTimelineOp(
      loaded.state,
      timelineOpFromToolArgs("select_plugin_preset", { track: "Lead", preset: 1 }),
      ctx
    );
    expect(afterPreset.error).toBeUndefined();
    expect(afterPreset.result.stateUpdated).toBe(false);
    expect(
      afterPreset.state.tracks[0].instrument?.type === "vst"
        ? afterPreset.state.tracks[0].instrument.state
        : null
    ).toBe("U0FWRURfUEFUQ0g=");

    const afterParams = await applyTimelineOp(
      afterPreset.state,
      timelineOpFromToolArgs("set_plugin_parameters", {
        track: "Lead",
        parameter: "Cutoff",
        value: 0.9
      }),
      ctx
    );
    expect(afterParams.error).toBeUndefined();
    expect(afterParams.result.stateUpdated).toBe(false);
    expect(
      afterParams.state.tracks[0].instrument?.type === "vst"
        ? afterParams.state.tracks[0].instrument.state
        : null
    ).toBe("U0FWRURfUEFUQ0g=");
  });

  it("F5: rejects NaN, Infinity, and out-of-range inputs when applyTimelineOp is called directly", async () => {
    const ctx = makeCtx();
    const state = makeState();

    const badIndex = await applyTimelineOp(
      state,
      { op: "load_plugin", track: "Vocals", plugin: "AU-Comp", index: Number.NaN },
      ctx
    );
    expect(badIndex.error).toMatch(/index/i);

    const badWet = await applyTimelineOp(
      state,
      { op: "load_plugin", track: "Vocals", plugin: "AU-Comp", wet: Number.NaN },
      ctx
    );
    expect(badWet.error).toMatch(/wet/i);

    const badGain = await applyTimelineOp(
      state,
      { op: "load_plugin", track: "Lead", plugin: "VST3-Pad", gainDb: Number.POSITIVE_INFINITY },
      ctx
    );
    expect(badGain.error).toMatch(/gainDb/i);

    const loaded = await applyTimelineOp(
      state,
      { op: "load_plugin", track: "Lead", plugin: "VST3-Pad" },
      ctx
    );
    const badPreset = await applyTimelineOp(
      loaded.state,
      { op: "select_plugin_preset", track: "Lead", preset: Number.NaN },
      ctx
    );
    expect(badPreset.error).toMatch(/preset/i);

    const badParamVal = await applyTimelineOp(
      loaded.state,
      {
        op: "set_plugin_parameters",
        track: "Lead",
        parameters: [{ parameter: "cutoff", value: Number.NaN }]
      },
      ctx
    );
    expect(badParamVal.error).toMatch(/value/i);
  });

  it("F8: sanitizes and bounds plugin host instance keys to match /^[A-Za-z0-9_.:-]{1,128}$/", async () => {
    const seenInstances: string[] = [];
    const baseHost = makeHost();
    const spyHost = {
      ...baseHost,
      listPresets: async (req: Parameters<typeof baseHost.listPresets>[0]) => {
        seenInstances.push(req.instance);
        return baseHost.listPresets(req);
      }
    };
    const longTrackId = `track with spaces/${"a".repeat(90)}`;
    const longEffectId = `fx with spaces/${"b".repeat(90)}`;
    const state: TimelineOpState = {
      ...makeState(),
      tracks: [makeTrack({ id: longTrackId, type: "midi", name: "Weird", index: 0 })]
    };
    const ctx: TimelineOpContext = {
      newId: () => longEffectId,
      pluginHost: spyHost
    };
    const withInst = await applyTimelineOp(
      state,
      { op: "load_plugin", track: longTrackId, plugin: "VST3-Pad" },
      ctx
    );
    const withFx = await applyTimelineOp(
      withInst.state,
      { op: "load_plugin", track: longTrackId, plugin: "AU-Comp" },
      ctx
    );
    const withMasterFx = await applyTimelineOp(
      withFx.state,
      { op: "load_plugin", track: "master", plugin: "AU-Comp" },
      ctx
    );
    await applyTimelineOp(
      withMasterFx.state,
      { op: "list_plugin_presets", track: longTrackId },
      ctx
    );
    await applyTimelineOp(
      withMasterFx.state,
      { op: "list_plugin_presets", track: longTrackId, effectId: longEffectId },
      ctx
    );
    await applyTimelineOp(
      withMasterFx.state,
      { op: "list_plugin_presets", track: "master", effectId: longEffectId },
      ctx
    );
    expect(seenInstances).toHaveLength(3);
    for (const key of seenInstances) {
      expect(key).toMatch(/^[A-Za-z0-9_.:-]{1,128}$/);
    }
  });

  it("F10: enforces displayValue max length, 32-bit int upper bounds, and numeric string preset bounds", async () => {
    expect(() =>
      timelineOpFromToolArgs("set_plugin_parameters", {
        track: "Lead",
        parameter: "cutoff",
        displayValue: "x".repeat(257)
      })
    ).toThrow();
    expect(() =>
      timelineOpFromToolArgs("select_plugin_preset", {
        track: "Lead",
        preset: 2_147_483_648
      })
    ).toThrow();
    expect(() =>
      timelineOpFromToolArgs("load_plugin", {
        track: "Vocals",
        plugin: "AU-Comp",
        index: 2_147_483_648
      })
    ).toThrow();

    const ctx = makeCtx();
    const loaded = await applyTimelineOp(
      makeState(),
      { op: "load_plugin", track: "Lead", plugin: "VST3-Pad" },
      ctx
    );
    const overflowStr = await applyTimelineOp(
      loaded.state,
      { op: "select_plugin_preset", track: "Lead", preset: "999999999999999999999" },
      ctx
    );
    expect(overflowStr.error).toMatch(/out of range|no preset/i);

    const outOfBoundsStr = await applyTimelineOp(
      loaded.state,
      { op: "select_plugin_preset", track: "Lead", preset: "99" },
      ctx
    );
    expect(outOfBoundsStr.error).toMatch(/no preset at index 99/i);
  });

  it("F11: refuses load_plugin with an object selector when pluginHost is absent", async () => {
    const res = await applyTimelineOp(
      makeState(),
      {
        op: "load_plugin",
        track: "Lead",
        plugin: {
          uid: "fake",
          name: "Evil",
          path: "/etc/passwd"
        }
      },
      { newId: (k) => `${k}_1` }
    );
    expect(res.error).toMatch(/plugin host/i);
    expect(res.state.tracks[0].instrument).toBeUndefined();
  });

  it("F12: enforces the 32-effect insert chain limit on tracks and master bus", async () => {
    const ctx = makeCtx();
    let state = makeState();
    for (let i = 0; i < 32; i++) {
      const added = await applyTimelineOp(
        state,
        { op: "load_plugin", track: "Vocals", plugin: "AU-Comp" },
        ctx
      );
      expect(added.error).toBeUndefined();
      state = added.state;
    }
    expect(state.tracks[1].effects).toHaveLength(32);

    const overflow = await applyTimelineOp(
      state,
      { op: "load_plugin", track: "Vocals", plugin: "AU-Comp" },
      ctx
    );
    expect(overflow.error).toMatch(/32/);

    // Replacing an existing slot at capacity is still allowed.
    const replaced = await applyTimelineOp(
      state,
      {
        op: "load_plugin",
        track: "Vocals",
        plugin: "AU-Comp",
        effectId: state.tracks[1].effects![0].id
      },
      ctx
    );
    expect(replaced.error).toBeUndefined();
    expect(replaced.state.tracks[1].effects).toHaveLength(32);
  });

  it('F15: allows selecting an insert effect named "Instrument" via effectId', async () => {
    const host = createMemoryPluginHost([
      {
        info: {
          uid: "VST3-InstFx",
          name: "Instrument",
          vendor: "Acme",
          version: "1.0.0",
          path: "/Library/Audio/Plug-Ins/VST3/InstrumentFx.vst3",
          format: "vst3",
          isInstrument: false
        },
        presets: [{ index: 0, name: "Fx Preset" }],
        parameters: [{ id: "mix", index: 0, name: "Mix", value: 0.5 }]
      }
    ]);
    const ctx = makeCtx(host);
    const loaded = await applyTimelineOp(
      makeState(),
      { op: "load_plugin", track: "Lead", plugin: "Instrument", slot: "effect" },
      ctx
    );
    expect(loaded.error).toBeUndefined();
    const presets = await applyTimelineOp(
      loaded.state,
      { op: "list_plugin_presets", track: "Lead", effectId: "Instrument" },
      ctx
    );
    expect(presets.error).toBeUndefined();
    expect(presets.result).toMatchObject({
      target: "effect",
      presets: [{ index: 0, name: "Fx Preset" }]
    });
  });
});
