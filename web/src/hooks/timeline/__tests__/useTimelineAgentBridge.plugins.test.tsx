/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { DEFAULT_TEMPO, makeTrack } from "@nodetool-ai/timeline";
import {
  FrontendToolRegistry,
  type FrontendToolState
} from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/timeline";
import {
  createTimelineStore,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  createTimelineUIStore,
  type TimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  createTimelinePlaybackStore,
  type TimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";
import type { VstBridge } from "../../../components/timeline/daw/devices/vstBridge";

let mockDoc: TimelineStoreApi;
let mockUi: TimelineUIStoreApi;
let mockPlayback: TimelinePlaybackStoreApi;

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineStore"),
  useTimelineStoreApi: () => mockDoc
}));
jest.mock("../../../stores/timeline/TimelineUIStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineUIStore"),
  useTimelineUIStoreApi: () => mockUi
}));
jest.mock("../../../stores/timeline/TimelinePlaybackStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelinePlaybackStore"),
  useTimelinePlaybackStoreApi: () => mockPlayback
}));
jest.mock("../useTimelineDirectGenJob", () => ({
  ...jest.requireActual("../useTimelineDirectGenJob"),
  useTimelineDirectGenJob: () => ({
    start: jest.fn(),
    startEdit: jest.fn()
  })
}));
jest.mock("../useModel3DBake", () => ({
  ...jest.requireActual("../useModel3DBake"),
  useModel3DBake: () => ({ bakeClip: jest.fn() })
}));

const SEQ_ID = "seq-vst-bridge";
const toolCtx = {
  getState: () => ({}) as FrontendToolState,
  abortSignal: new AbortController().signal
};

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = FrontendToolRegistry.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return (await tool.execute(args as never, toolCtx)) as Record<string, unknown>;
}

describe("useTimelineAgentBridge VST/AU plugin tools", () => {
  const originalApi = window.api;

  beforeEach(() => {
    mockDoc = createTimelineStore();
    mockDoc.setState({
      sequenceId: SEQ_ID,
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({ id: "t-midi", type: "midi", name: "Synth", index: 0 }),
        makeTrack({ id: "t-audio", type: "audio", name: "Vocals", index: 1 })
      ],
      clips: [],
      markers: []
    });
    mockUi = createTimelineUIStore();
    mockPlayback = createTimelinePlaybackStore();

    const vstMock: VstBridge = {
      status: jest.fn(async () => ({ available: true, path: "/bin/NodeToolVstHost" })),
      scan: jest.fn(async () => [
        {
          uid: "VST3-Pad",
          name: "Acme Pad",
          vendor: "Acme",
          version: "1.0",
          path: "/plugins/AcmePad.vst3",
          format: "vst3" as const,
          isInstrument: true
        },
        {
          uid: "AU-Comp",
          name: "Studio Comp",
          vendor: "WavesCo",
          version: "2.0",
          path: "/plugins/StudioComp.component",
          format: "au" as const,
          isInstrument: false
        }
      ]),
      render: jest.fn(),
      openEditor: jest.fn(),
      closeEditor: jest.fn(),
      onEvent: jest.fn(() => () => {}),
      listPresets: jest.fn(async () => ({
        currentPresetIndex: 0,
        presets: [
          { index: 0, name: "Init" },
          { index: 1, name: "Warm Pad" }
        ]
      })),
      selectPreset: jest.fn(async () => ({
        preset: { index: 1, name: "Warm Pad" },
        state: "cHJlc2V0MQ=="
      })),
      getParameters: jest.fn(async () => ({
        parameters: [
          {
            id: "cutoff",
            index: 0,
            name: "Cutoff",
            label: "Hz",
            value: 0.5,
            displayValue: "1000 Hz"
          }
        ]
      })),
      setParameters: jest.fn(async () => ({
        parameters: [
          {
            id: "cutoff",
            index: 0,
            name: "Cutoff",
            label: "Hz",
            value: 0.75,
            displayValue: "4000 Hz"
          }
        ],
        state: "cGFyYW0x"
      }))
    };

    window.api = { ...(originalApi ?? {}), vst: vstMock } as Window["api"];
  });

  afterEach(() => {
    window.api = originalApi;
  });

  it("exposes all 6 plugin tools through FrontendToolRegistry and persists plugin state in TimelineStore", async () => {
    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const listRes = await runTool("ui_timeline_list_plugins", { timeline_id: SEQ_ID });
      expect((listRes.plugins as unknown[]).length).toBe(2);

      const loadRes = await runTool("ui_timeline_load_plugin", {
        timeline_id: SEQ_ID,
        track: "Synth",
        plugin: "Acme Pad"
      });
      expect(loadRes).toMatchObject({ ok: true, slot: "instrument" });
      expect(mockDoc.getState().tracks[0].instrument).toMatchObject({
        type: "vst",
        plugin: { uid: "VST3-Pad" }
      });

      const presetsRes = await runTool("ui_timeline_list_plugin_presets", {
        timeline_id: SEQ_ID,
        track: "Synth"
      });
      expect((presetsRes.presets as unknown[]).length).toBe(2);

      const selectRes = await runTool("ui_timeline_select_plugin_preset", {
        timeline_id: SEQ_ID,
        track: "Synth",
        preset: "Warm Pad"
      });
      expect(selectRes).toMatchObject({ ok: true, preset: { index: 1, name: "Warm Pad" } });
      expect(mockDoc.getState().tracks[0].instrument).toMatchObject({
        state: "cHJlc2V0MQ=="
      });

      const getParamsRes = await runTool("ui_timeline_get_plugin_parameters", {
        timeline_id: SEQ_ID,
        track: "Synth"
      });
      expect(getParamsRes.parameters).toHaveLength(1);

      const setParamsRes = await runTool("ui_timeline_set_plugin_parameters", {
        timeline_id: SEQ_ID,
        track: "Synth",
        parameters: [{ parameter: "Cutoff", displayValue: "4000 Hz" }]
      });
      expect(setParamsRes).toMatchObject({ ok: true });
      expect(mockDoc.getState().tracks[0].instrument).toMatchObject({
        state: "cGFyYW0x"
      });

      // Insert effect on an audio track
      const loadFxRes = await runTool("ui_timeline_load_plugin", {
        timeline_id: SEQ_ID,
        track: "Vocals",
        plugin: "Studio Comp",
        wet: 0.75
      });
      expect(loadFxRes).toMatchObject({ ok: true, slot: "effect" });
      const fx = mockDoc.getState().tracks[1].effects?.[0];
      expect(fx).toMatchObject({
        type: "vst",
        wet: 0.75,
        plugin: { uid: "AU-Comp", format: "au" }
      });
    } finally {
      unmount();
    }
  });

  it("F3: does not replay side-effecting selectPreset/setParameters on concurrent store updates and bounds retries", async () => {
    let selectCalls = 0;
    const vst = window.api!.vst!;
    vst.selectPreset = jest.fn(async () => {
      selectCalls++;
      // Simulate concurrent store updates landing while awaiting the out-of-process host.
      if (selectCalls <= 5) {
        mockDoc.setState((s) => ({ ...s, tracks: [...s.tracks] }));
      }
      return {
        preset: { index: 1, name: "Warm Pad" },
        state: "cHJlc2V0MQ=="
      };
    });

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      await runTool("ui_timeline_load_plugin", {
        timeline_id: SEQ_ID,
        track: "Synth",
        plugin: "Acme Pad"
      });

      const res = await runTool("ui_timeline_select_plugin_preset", {
        timeline_id: SEQ_ID,
        track: "Synth",
        preset: "Warm Pad"
      });
      expect(res).toMatchObject({ ok: true, preset: { index: 1, name: "Warm Pad" } });
      expect(selectCalls).toBe(1);
      expect(mockDoc.getState().tracks[0].instrument).toMatchObject({ state: "cHJlc2V0MQ==" });
    } finally {
      unmount();
    }
  });

  it("F3: stops retrying after the retry bound when the store keeps changing concurrently", async () => {
    const vst = window.api!.vst!;
    let setCalls = 0;
    vst.setParameters = jest.fn(async () => {
      setCalls++;
      return {
        parameters: [
          {
            id: "cutoff",
            index: 0,
            name: "Cutoff",
            label: "Hz",
            value: 0.75,
            displayValue: "4000 Hz"
          }
        ],
        state: "cGFyYW0x"
      };
    });
    // Mutate the store during every getParameters read so every retry sees a changed store.
    vst.getParameters = jest.fn(async () => {
      mockDoc.setState((s) => ({ ...s, tracks: [...s.tracks] }));
      return {
        parameters: [
          {
            id: "cutoff",
            index: 0,
            name: "Cutoff",
            label: "Hz",
            value: 0.5,
            displayValue: "1000 Hz"
          }
        ]
      };
    });

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      await runTool("ui_timeline_load_plugin", {
        timeline_id: SEQ_ID,
        track: "Synth",
        plugin: "Acme Pad"
      });
      await expect(
        runTool("ui_timeline_set_plugin_parameters", {
          timeline_id: SEQ_ID,
          track: "Synth",
          parameter: "Cutoff",
          value: 0.75
        })
      ).rejects.toThrow(/retry limit/i);
      expect(setCalls).toBe(1);
    } finally {
      unmount();
    }
  });
});
