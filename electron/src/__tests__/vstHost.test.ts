/**
 * VstHost against a stand-in helper: a Node script that speaks FableVstHost's
 * JSON-line protocol, so the request routing, the path check, the PCM file
 * hand-off and the restart after a crash run against a real child process.
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

jest.mock("../types.d", () => ({ IpcChannels: { VST_EVENT: "vst-event" } }));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));

import { VstHost } from "../vstHost";
import type { VstHostEvent } from "../types.d";

const FAKE_HELPER = String.raw`
const fs = require("fs");
const readline = require("readline");
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const plugin = { uid: "VST3-Pad", name: "Pad", vendor: "Acme", version: "1.0", path: "/plugins/Pad.vst3", isInstrument: true };
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line);
  if (req.cmd === "scan") return send({ id: req.id, ok: true, plugins: [plugin, { name: "broken" }] });
  if (req.cmd === "render") {
    if (req.state === "crash") process.exit(3);
    const pcm = new Float32Array(req.frames * 2);
    pcm.fill(0.5, 0, req.frames);
    pcm.fill(-0.25, req.frames);
    // The first event's pitch marks the first frame, so routing is visible.
    if (req.events.length) pcm[0] = req.events[0].pitch;
    fs.writeFileSync(req.out, Buffer.from(pcm.buffer));
    return send({ id: req.id, ok: true, channels: 2, frames: req.frames, instance: req.instance, state: req.state });
  }
  if (req.cmd === "openEditor") {
    send({ id: req.id, ok: true, hasEditor: true });
    return send({ event: "state", instance: req.instance, state: "tweaked" });
  }
  if (req.cmd === "closeEditor") return send({ id: req.id, ok: true });
  send({ id: req.id, ok: false, error: "Unknown command " + req.cmd });
});
`;

describe("VstHost", () => {
  let dir: string;
  let script: string;
  let spawned: number;
  let events: VstHostEvent[];
  let host: VstHost;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vst-host-test-"));
    script = path.join(dir, "fake-helper.js");
    await fs.writeFile(script, FAKE_HELPER);
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    spawned = 0;
    events = [];
    host = new VstHost({
      locate: () => "FableVstHost",
      spawnHelper: () => {
        spawned++;
        return spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "pipe"] });
      },
      onEvent: (event) => events.push(event),
      tmpDir: dir,
    });
  });

  afterEach(() => host.dispose());

  const target = { path: "/plugins/Pad.vst3", uid: "VST3-Pad" };
  const render = (state: string | null = "AAEC") =>
    host.render({
      plugin: target,
      state,
      sampleRate: 48000,
      frames: 4,
      events: [{ pitch: 64, velocity: 100, startFrame: 0, gateOffFrame: 2 }],
    });

  it("reports a missing helper instead of starting one", async () => {
    const missing = new VstHost({ locate: () => null });
    expect(missing.status()).toMatchObject({ available: false });
    expect(missing.status().reason).toMatch(/NODETOOL_VST_HOST/);
    await expect(missing.scan()).rejects.toThrow(/not installed/);
  });

  it("lists the scanned instruments and drops malformed entries", async () => {
    const plugins = await host.scan();
    expect(plugins).toEqual([
      { uid: "VST3-Pad", name: "Pad", vendor: "Acme", version: "1.0", path: "/plugins/Pad.vst3", isInstrument: true },
    ]);
    // Cached until a rescan.
    await host.scan();
    expect(spawned).toBe(1);
  });

  it("returns a render as planar stereo and removes the hand-off file", async () => {
    const result = await render();
    expect(result.frames).toBe(4);
    expect(Array.from(result.pcm)).toEqual([64, 0.5, 0.5, 0.5, -0.25, -0.25, -0.25, -0.25]);
    expect((await fs.readdir(dir)).filter((f) => f.endsWith(".f32"))).toEqual([]);
  });

  it("refuses a plug-in path the scan did not find", async () => {
    await expect(
      host.render({ plugin: { path: "/tmp/evil.so", uid: "x" }, state: null, sampleRate: 48000, frames: 4, events: [] }),
    ).rejects.toThrow(/not installed on this computer/);
  });

  it("refuses out-of-range renders before they reach the helper", async () => {
    await expect(
      host.render({ plugin: target, state: null, sampleRate: 48000, frames: -1, events: [] }),
    ).rejects.toThrow(/Invalid VST render request/);
    await expect(
      host.render({ plugin: target, state: null, sampleRate: 1, frames: 4, events: [] }),
    ).rejects.toThrow(/Invalid VST render request/);
    await expect(
      host.render({ plugin: target, state: null, sampleRate: 48000, frames: 4, events: [{ pitch: 200, velocity: 1, startFrame: 0, gateOffFrame: 1 }] }),
    ).rejects.toThrow(/Invalid VST render request/);
    expect(spawned).toBe(0);
  });

  it("forwards the editor's state changes", async () => {
    await host.openEditor({ instance: "track:t1", plugin: target, state: null, title: "Pad" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toContainEqual({ event: "state", instance: "track:t1", state: "tweaked" });
    await expect(
      host.openEditor({ instance: "../../bad id", plugin: target, state: null, title: "Pad" }),
    ).rejects.toThrow(/Invalid VST editor request/);
    await expect(host.closeEditor("../x")).rejects.toThrow(/Invalid VST instance id/);
  });

  it("rejects the requests a crash interrupts and restarts on the next one", async () => {
    await expect(render("crash")).rejects.toThrow(/VST host stopped/);
    expect(events).toContainEqual({ event: "exited" });
    const result = await render();
    expect(result.frames).toBe(4);
    expect(spawned).toBe(2);
  });
});
