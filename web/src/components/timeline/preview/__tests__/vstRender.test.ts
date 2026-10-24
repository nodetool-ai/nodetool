import type { VstMidiInstrument } from "@nodetool-ai/timeline";
import { clearMidiRenderCache, getMidiClipBuffer } from "../midiRender";
import { playAuditionNote } from "../audition";
import { VST_DESKTOP_ONLY, VST_NO_PLUGIN } from "../vstRender";
import type { VstBridge, VstRenderRequest } from "../../daw/devices/vstBridge";

const instrument: VstMidiInstrument = {
  type: "vst",
  plugin: { uid: "VST3-Pad", name: "Pad", vendor: "Acme", path: "/plugins/Pad.vst3" },
  state: "AAEC",
  gainDb: -6
};

function context() {
  return {
    sampleRate: 1000,
    createBuffer: (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, numberOfChannels: channels, getChannelData: (ch: number) => data[ch] };
    }
  } as unknown as BaseAudioContext;
}

function bridge(): VstBridge & { render: jest.Mock } {
  return {
    status: jest.fn(),
    scan: jest.fn(),
    render: jest.fn(async (request: VstRenderRequest) => {
      const pcm = new Float32Array(request.frames * 2);
      pcm.fill(0.5, 0, request.frames);
      pcm.fill(-0.5, request.frames);
      return { frames: request.frames, pcm };
    }),
    openEditor: jest.fn(),
    closeEditor: jest.fn(),
    onEvent: jest.fn(() => () => {})
  };
}

const clip = {
  notes: [{ id: "n", pitch: 62, velocity: 90, startTick: 0, durationTick: 960 }],
  inPointMs: 0,
  durationMs: 2000
};

describe("VST rendering", () => {
  const api = window.api;
  afterEach(() => {
    clearMidiRenderCache();
    window.api = api;
  });

  it("renders a clip through the desktop host as stereo, at the instrument's gain", async () => {
    const host = bridge();
    window.api = { ...api, vst: host } as typeof window.api;
    const buffer = await getMidiClipBuffer(context(), clip, 60, instrument);

    expect(host.render).toHaveBeenCalledWith({
      plugin: { path: "/plugins/Pad.vst3", uid: "VST3-Pad" },
      state: "AAEC",
      sampleRate: 1000,
      frames: 2000,
      // 60 bpm: one beat (960 ticks) is one second.
      events: [{ pitch: 62, velocity: 90, startFrame: 0, gateOffFrame: 1000 }]
    });
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.getChannelData(0)[10]).toBeCloseTo(0.5 * 10 ** (-6 / 20));
    expect(buffer.getChannelData(1)[10]).toBeCloseTo(-0.5 * 10 ** (-6 / 20));

    // Cached by the render key: the same clip does not render twice.
    await getMidiClipBuffer(context(), clip, 60, instrument);
    expect(host.render).toHaveBeenCalledTimes(1);
    // A sound change in the plug-in renders again.
    await getMidiClipBuffer(context(), clip, 60, { ...instrument, state: "AAED" });
    expect(host.render).toHaveBeenCalledTimes(2);
  });

  it("explains that the browser build cannot play a VST track", async () => {
    window.api = { ...api, vst: undefined } as typeof window.api;
    await expect(getMidiClipBuffer(context(), clip, 60, instrument)).rejects.toThrow(VST_DESKTOP_ONLY);
  });

  it("asks for a plug-in before rendering", async () => {
    window.api = { ...api, vst: bridge() } as typeof window.api;
    await expect(
      getMidiClipBuffer(context(), clip, 60, { ...instrument, plugin: null })
    ).rejects.toThrow(VST_NO_PLUGIN);
  });

  it("auditions one note with room for the plug-in's tail", async () => {
    const host = bridge();
    window.api = { ...api, vst: host } as typeof window.api;
    const ctx = {
      ...context(),
      destination: {},
      createBufferSource: () => ({ connect: jest.fn(), start: jest.fn(), buffer: null, onended: null })
    } as unknown as BaseAudioContext;
    await playAuditionNote(instrument, 64, 100, () => ctx);
    expect(host.render).toHaveBeenCalledWith(
      expect.objectContaining({
        frames: 2100,
        events: [{ pitch: 64, velocity: 100, startFrame: 0, gateOffFrame: 600 }]
      })
    );
  });
});
