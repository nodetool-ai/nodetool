import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTrack } from "@nodetool-ai/timeline";
import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";
import { READ_ONLY_OPS } from "../src/capabilities/timeline-operations.js";
import { createNodePluginHost } from "../src/capabilities/vst-host-adapter.js";

const FAKE_HOST_SCRIPT = String.raw`
const readline = require("readline");
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const plugins = [
  { uid: "VST3-Pad", name: "Acme Pad", vendor: "Acme", version: "1.0", path: "/plugins/AcmePad.vst3", format: "vst3", isInstrument: true },
  { uid: "AU-Comp", name: "Studio Comp", vendor: "WavesCo", version: "2.0", path: "/plugins/StudioComp.component", format: "au", isInstrument: false }
];
const decode = (b64) => {
  if (!b64) return { preset: 0, params: { cutoff: 0.5, resonance: 0.25 } };
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
};
const encode = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const paramList = (st) => [
  { id: "cutoff", index: 0, name: "Cutoff", label: "Hz", value: st.params.cutoff, displayValue: Math.round(20 + st.params.cutoff * 19980) + " Hz", defaultValue: 0.5, isAutomatable: true },
  { id: "resonance", index: 1, name: "Resonance", label: "%", value: st.params.resonance, displayValue: Math.round(st.params.resonance * 100) + "%", defaultValue: 0.25, isAutomatable: true }
];
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line);
  if (req.cmd === "scan") {
    const out = req.includeEffects ? plugins : plugins.filter((p) => p.isInstrument);
    return send({ id: req.id, ok: true, plugins: out });
  }
  if (req.cmd === "listPresets") {
    const st = decode(req.state);
    return send({ id: req.id, ok: true, currentPresetIndex: st.preset, presets: [{ index: 0, name: "Init" }, { index: 1, name: "Warm Pad" }] });
  }
  if (req.cmd === "selectPreset") {
    const st = decode(req.state);
    const idx = typeof req.presetIndex === "number" ? req.presetIndex : 1;
    st.preset = idx;
    st.params.cutoff = idx === 1 ? 0.75 : 0.5;
    return send({ id: req.id, ok: true, preset: { index: idx, name: idx === 1 ? "Warm Pad" : "Init" }, state: encode(st) });
  }
  if (req.cmd === "getParameters") {
    const st = decode(req.state);
    return send({ id: req.id, ok: true, parameters: paramList(st) });
  }
  if (req.cmd === "setParameters") {
    const st = decode(req.state);
    for (const ch of req.changes || []) {
      const key = ch.id || (ch.index === 1 ? "resonance" : "cutoff");
      if (typeof ch.value === "number") st.params[key] = ch.value;
      else if (typeof ch.displayValue === "string") {
        const n = parseFloat(ch.displayValue);
        st.params[key] = key === "cutoff" ? Math.max(0, Math.min(1, (n - 20) / 19980)) : Math.max(0, Math.min(1, n / 100));
      }
    }
    return send({ id: req.id, ok: true, parameters: paramList(st), state: encode(st) });
  }
  if (req.cmd === "quit") process.exit(0);
  return send({ id: req.id, ok: false, error: "Unknown command " + req.cmd });
});
`;

describe("VST/AU plugin bridge & Node host adapter", () => {
  let tmpDir: string;
  let helperScript: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-vst-host-"));
    helperScript = path.join(tmpDir, "fake-vst-host.js");
    await fs.writeFile(helperScript, FAKE_HOST_SCRIPT);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("marks read-only plugin ops in READ_ONLY_OPS", () => {
    expect(READ_ONLY_OPS.has("ui_timeline_list_plugins")).toBe(true);
    expect(READ_ONLY_OPS.has("ui_timeline_list_plugin_presets")).toBe(true);
    expect(READ_ONLY_OPS.has("ui_timeline_get_plugin_parameters")).toBe(true);
    expect(READ_ONLY_OPS.has("ui_timeline_load_plugin")).toBe(false);
    expect(READ_ONLY_OPS.has("ui_timeline_select_plugin_preset")).toBe(false);
    expect(READ_ONLY_OPS.has("ui_timeline_set_plugin_parameters")).toBe(false);
  });

  it("drives list, load, presets, and parameters through createTimelineToolBridge and createNodePluginHost", async () => {
    const host = createNodePluginHost({
      locate: () => "NodeToolVstHost",
      spawnHelper: () =>
        spawn(process.execPath, [helperScript], { stdio: ["pipe", "pipe", "pipe"] })
    });
    try {
      const bridge = createTimelineToolBridge({
        pluginHost: host,
        sequence: {
          tracks: [
            makeTrack({ id: "t_midi", type: "midi", name: "Synth", index: 0 }),
            makeTrack({ id: "t_audio", type: "audio", name: "Bus", index: 1 })
          ],
          clips: []
        }
      });
      const call = async (tool: string, args: Record<string, unknown>) => {
        const entry = bridge.tools.find((t) => t.name === tool);
        expect(entry, `${tool} should be registered`).toBeDefined();
        return (await entry!.execute(args)) as Record<string, unknown>;
      };

      const listed = await call("ui_timeline_list_plugins", {});
      expect((listed.plugins as unknown[]).length).toBe(2);

      const loaded = await call("ui_timeline_load_plugin", {
        track: "Synth",
        plugin: "Acme Pad"
      });
      expect(loaded).toMatchObject({ ok: true, slot: "instrument" });

      const presets = await call("ui_timeline_list_plugin_presets", { track: "Synth" });
      expect(presets.presets).toHaveLength(2);

      const selected = await call("ui_timeline_select_plugin_preset", {
        track: "Synth",
        preset: "Warm Pad"
      });
      expect(selected).toMatchObject({ ok: true, preset: { index: 1, name: "Warm Pad" } });

      const updated = await call("ui_timeline_set_plugin_parameters", {
        track: "Synth",
        parameters: [
          { parameter: "Cutoff", displayValue: "10010 Hz" },
          { parameter: "resonance", value: 0.8 }
        ]
      });
      expect(updated.updated).toEqual([
        expect.objectContaining({ id: "cutoff", displayValue: "10010 Hz" }),
        expect.objectContaining({ id: "resonance", value: 0.8, displayValue: "80%" })
      ]);

      const readBack = await call("ui_timeline_get_plugin_parameters", {
        track: "Synth",
        parameters: ["cutoff", "Resonance"]
      });
      expect(readBack.parameters).toEqual([
        expect.objectContaining({ id: "cutoff", displayValue: "10010 Hz" }),
        expect.objectContaining({ id: "resonance", value: 0.8, displayValue: "80%" })
      ]);

      const finalTrack = bridge.finalState().documentTracks[0];
      expect(finalTrack.instrument?.type === "vst" ? finalTrack.instrument.state : null).toBeTruthy();
    } finally {
      host.dispose();
    }
  });
});
