/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  listOpenAudioIds,
  setAudioAgentHandler,
  type AudioAgentHandler,
  type AudioSnapshot
} from "../../../components/audio_editor/audioAgentBridge";
import { AUDIO_EFFECTS } from "../../../components/audio_editor/audioEffects";
import "../builtin/audio";

const ASSET_ID = "audio-1";

const snapshot = (overrides: Partial<AudioSnapshot> = {}): AudioSnapshot => ({
  assetId: ASSET_ID,
  name: "Take 1",
  durationSeconds: 4,
  sampleRate: 44100,
  channels: 2,
  dirty: false,
  selection: null,
  peaks: [0, 0.5, 0.5, 0],
  peakWindowSeconds: 1,
  ...overrides
});

const createMockHandler = (): jest.Mocked<AudioAgentHandler> => ({
  getSnapshot: jest.fn(() => snapshot()),
  edit: jest.fn<AudioSnapshot, Parameters<AudioAgentHandler["edit"]>>(() =>
    snapshot({ dirty: true })
  ),
  applyEffect: jest.fn<
    Promise<AudioSnapshot>,
    Parameters<AudioAgentHandler["applyEffect"]>
  >(async () => snapshot({ dirty: true })),
  save: jest.fn(async () => snapshot())
});

const ctx = { getState: () => ({}) as FrontendToolState };

const call = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(name, args, "tc-1", ctx);

afterEach(() => {
  for (const id of listOpenAudioIds()) {
    setAudioAgentHandler(id, null);
  }
});

describe("ui_audio_* tools", () => {
  it("requires the asset id on every tool that acts on an asset", () => {
    const tools = FrontendToolRegistry.getManifest().filter((tool) =>
      tool.name.startsWith("ui_audio_")
    );
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "ui_audio_apply_effect",
      "ui_audio_edit",
      "ui_audio_get_state",
      "ui_audio_list_effects",
      "ui_audio_save"
    ]);
    for (const tool of tools) {
      if (tool.name === "ui_audio_list_effects") continue;
      expect(tool.parameters.required).toContain("asset_id");
    }
  });

  it("names the remedy when the audio is not open", async () => {
    await expect(
      call("ui_audio_get_state", { asset_id: "missing" })
    ).rejects.toThrow('Call ui_open_document with type "audio"');
  });

  it("returns the snapshot", async () => {
    const handler = createMockHandler();
    setAudioAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_audio_get_state", { asset_id: ASSET_ID })
    ).resolves.toMatchObject({ ok: true, durationSeconds: 4, peaks: [0, 0.5, 0.5, 0] });
  });

  it("passes the edit, range and gain to the editor", async () => {
    const handler = createMockHandler();
    setAudioAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_audio_edit", {
        asset_id: ASSET_ID,
        op: "gain",
        start: 1,
        end: 2,
        gain_db: -6
      })
    ).resolves.toEqual({
      ok: true,
      durationSeconds: 4,
      dirty: true,
      url: "asset://audio-1"
    });
    expect(handler.edit).toHaveBeenCalledWith("gain", { start: 1, end: 2 }, -6);
  });

  it("edits the whole audio when no range is given", async () => {
    const handler = createMockHandler();
    setAudioAgentHandler(ASSET_ID, handler);
    await call("ui_audio_edit", { asset_id: ASSET_ID, op: "normalize" });
    expect(handler.edit).toHaveBeenCalledWith("normalize", undefined, undefined);
  });

  it("refuses half a range and a reversed range", async () => {
    const handler = createMockHandler();
    setAudioAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_audio_edit", { asset_id: ASSET_ID, op: "silence", start: 1 })
    ).rejects.toThrow("Pass both `start` and `end`");
    await expect(
      call("ui_audio_edit", { asset_id: ASSET_ID, op: "silence", start: 2, end: 1 })
    ).rejects.toThrow("`end` must be after `start`");
    expect(handler.edit).not.toHaveBeenCalled();
  });

  it("rejects an unknown op", async () => {
    setAudioAgentHandler(ASSET_ID, createMockHandler());
    await expect(
      call("ui_audio_edit", { asset_id: ASSET_ID, op: "explode" })
    ).rejects.toThrow();
  });

  it("lists every effect with its parameters", async () => {
    const result = (await call("ui_audio_list_effects", {})) as {
      effects: { id: string; params: { key: string }[] }[];
    };
    expect(result.effects.map((effect) => effect.id)).toEqual(
      AUDIO_EFFECTS.map((effect) => effect.id)
    );
    const eq = result.effects.find((effect) => effect.id === "equalizer");
    expect(eq?.params.length).toBeGreaterThan(0);
  });

  it("runs an effect over a range", async () => {
    const handler = createMockHandler();
    setAudioAgentHandler(ASSET_ID, handler);
    await call("ui_audio_apply_effect", {
      asset_id: ASSET_ID,
      effect_id: "reverb",
      params: { mix: 30 },
      start: 0,
      end: 2
    });
    expect(handler.applyEffect).toHaveBeenCalledWith(
      "reverb",
      { mix: 30 },
      { start: 0, end: 2 }
    );
  });

  it("saves through the editor", async () => {
    const handler = createMockHandler();
    setAudioAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_audio_save", { asset_id: ASSET_ID })
    ).resolves.toEqual({ ok: true, dirty: false, url: "asset://audio-1" });
    expect(handler.save).toHaveBeenCalledTimes(1);
  });
});
