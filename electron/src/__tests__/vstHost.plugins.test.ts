import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

jest.mock("../types.d", () => ({ IpcChannels: { VST_EVENT: "vst-event" } }));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));

import { VstHost } from "../vstHost";

const FAKE_HELPER = String.raw`
const readline = require("readline");
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const plugins = [
  { uid: "VST3-Pad", name: "Pad", vendor: "Acme", version: "1.0", path: "/plugins/Pad.vst3", format: "vst3", isInstrument: true },
  { uid: "AU-Comp", name: "Comp", vendor: "Acme", version: "1.0", path: "/plugins/Comp.component", format: "au", isInstrument: false }
];
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line);
  if (req.cmd === "scan") {
    return send({ id: req.id, ok: true, plugins: req.includeEffects ? plugins : plugins.filter((p) => p.isInstrument) });
  }
  if (req.cmd === "listPresets") {
    return send({ id: req.id, ok: true, currentPresetIndex: 0, presets: [{ index: 0, name: "Init" }, { index: 1, name: "Lush" }] });
  }
  if (req.cmd === "selectPreset") {
    return send({ id: req.id, ok: true, preset: { index: 1, name: "Lush" }, state: "cHJlc2V0MQ==" });
  }
  if (req.cmd === "getParameters") {
    return send({ id: req.id, ok: true, parameters: [{ id: "cutoff", index: 0, name: "Cutoff", label: "Hz", value: 0.5, displayValue: "1000 Hz" }] });
  }
  if (req.cmd === "setParameters") {
    return send({ id: req.id, ok: true, parameters: [{ id: "cutoff", index: 0, name: "Cutoff", label: "Hz", value: 0.8, displayValue: "4000 Hz" }], state: "cGFyYW0x" });
  }
  send({ id: req.id, ok: false, error: "Unknown command " + req.cmd });
});
`;

describe("VstHost presets, parameters, and effects scan", () => {
  let dir: string;
  let script: string;
  let host: VstHost;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vst-host-plugins-"));
    script = path.join(dir, "fake-helper.js");
    await fs.writeFile(script, FAKE_HELPER);
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    host = new VstHost({
      locate: () => "NodeToolVstHost",
      spawnHelper: () => spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "pipe"] }),
      tmpDir: dir
    });
  });

  afterEach(() => host.dispose());

  it("scans instruments and effects when includeEffects is true", async () => {
    const plugins = await host.scan(false, true);
    expect(plugins).toHaveLength(2);
    expect(plugins[1]).toMatchObject({ uid: "AU-Comp", format: "au", isInstrument: false });
  });

  it("lists/selects presets and reads/sets parameters on scanned plugins", async () => {
    const target = { path: "/plugins/Pad.vst3", uid: "VST3-Pad" };
    const presets = await host.listPresets({ instance: "track:t1", plugin: target, state: null });
    expect(presets).toMatchObject({ currentPresetIndex: 0, presets: [{ index: 0, name: "Init" }, { index: 1, name: "Lush" }] });

    const selected = await host.selectPreset({ instance: "track:t1", plugin: target, state: null, presetIndex: 1 });
    expect(selected).toMatchObject({ preset: { index: 1, name: "Lush" }, state: "cHJlc2V0MQ==" });

    const params = await host.getParameters({ instance: "track:t1", plugin: target, state: selected.state });
    expect(params.parameters).toEqual([
      expect.objectContaining({ id: "cutoff", value: 0.5, displayValue: "1000 Hz" })
    ]);

    const updated = await host.setParameters({
      instance: "track:t1",
      plugin: target,
      state: selected.state,
      changes: [{ id: "cutoff", value: 0.8 }]
    });
    expect(updated).toMatchObject({
      state: "cGFyYW0x",
      parameters: [expect.objectContaining({ id: "cutoff", value: 0.8, displayValue: "4000 Hz" })]
    });
  });

  it("refuses preset and parameter calls for unscanned plugin paths", async () => {
    await expect(
      host.getParameters({
        instance: "track:t1",
        plugin: { path: "/tmp/untrusted.vst3", uid: "evil" },
        state: null
      })
    ).rejects.toThrow(/not installed on this computer/);
  });
});
