import { describe, expect, it } from "vitest";
import {
  trackEffect,
  vstPluginRef
} from "../src/api-schemas/timeline.js";
import {
  SHARED_TIMELINE_TOOL_NAMES,
  getPluginParametersParams,
  listPluginPresetsParams,
  listPluginsParams,
  loadPluginParams,
  selectPluginPresetParams,
  setPluginParametersParams
} from "../src/api-schemas/timeline-tool-params.js";
import { buildTimelineToolContracts } from "../src/api-schemas/timeline-tool-contracts.js";

const PLUGIN_TOOLS = [
  "ui_timeline_list_plugins",
  "ui_timeline_load_plugin",
  "ui_timeline_list_plugin_presets",
  "ui_timeline_select_plugin_preset",
  "ui_timeline_get_plugin_parameters",
  "ui_timeline_set_plugin_parameters"
] as const;

describe("VST/AU plugin timeline tool contracts", () => {
  it("supports track VST insert effects and optional plugin format in timeline schemas", () => {
    const ref = vstPluginRef.parse({
      uid: "AU-Comp-1",
      name: "Bus Comp",
      vendor: "Acme",
      path: "/Library/Audio/Plug-Ins/Components/BusComp.component",
      format: "au"
    });
    expect(ref.format).toBe("au");

    const parsed = trackEffect.parse({
      id: "fx_vst_1",
      type: "vst",
      enabled: true,
      plugin: ref,
      state: "AAEC",
      wet: 0.75
    });
    expect(parsed).toMatchObject({
      id: "fx_vst_1",
      type: "vst",
      wet: 0.75
    });
  });

  it("registers all 6 plugin tools in SHARED_TIMELINE_TOOL_NAMES and contracts", () => {
    const contracts = buildTimelineToolContracts({
      staggerUnits: ["character", "word", "line"],
      animatedProperties: ["opacity"],
      beatToleranceMs: 60
    });
    for (const name of PLUGIN_TOOLS) {
      expect(SHARED_TIMELINE_TOOL_NAMES).toContain(name);
      expect(contracts).toHaveProperty(name);
    }
  });

  it("validates list/load/preset/parameter schemas strictly", () => {
    expect(
      listPluginsParams.parse({ kind: "effect", format: "au", query: "comp", rescan: true })
    ).toEqual({ kind: "effect", format: "au", query: "comp", rescan: true });

    expect(
      loadPluginParams.parse({
        track: "Synth",
        plugin: "VST3-Pad",
        slot: "instrument",
        gainDb: -3
      })
    ).toMatchObject({ track: "Synth", plugin: "VST3-Pad", slot: "instrument" });

    expect(
      listPluginPresetsParams.parse({ track: "Synth", query: "warm" })
    ).toEqual({ track: "Synth", query: "warm" });

    expect(
      selectPluginPresetParams.parse({ track: "Synth", preset: "Warm Pad" })
    ).toEqual({ track: "Synth", preset: "Warm Pad" });

    expect(
      getPluginParametersParams.parse({ track: "Synth", parameters: ["cutoff", 1] })
    ).toEqual({ track: "Synth", parameters: ["cutoff", 1] });

    expect(
      setPluginParametersParams.safeParse({
        track: "Synth",
        parameters: [{ parameter: "cutoff", value: 0.5, displayValue: "1000 Hz" }]
      }).success
    ).toBe(false);

    expect(
      setPluginParametersParams.safeParse({
        track: "Synth",
        parameters: [{ parameter: "cutoff" }]
      }).success
    ).toBe(false);

    expect(
      setPluginParametersParams.safeParse({
        track: "Synth",
        parameter: "cutoff",
        value: 1.5
      }).success
    ).toBe(false);

    expect(
      setPluginParametersParams.parse({
        track: "Synth",
        parameters: [
          { parameter: "cutoff", value: 0.5 },
          { parameter: "Resonance", displayValue: "45%" }
        ]
      }).parameters
    ).toHaveLength(2);
  });
});
