/**
 * P0 native media editing acceptance journey.
 *
 * This intentionally crosses the inspector, direct-generation recovery,
 * take history, TimelineStore apply/undo, and export seams. The provider is
 * a deterministic fake: it records the generate_media request and completes
 * only through the reload lookup path.
 *
 * @jest-environment jsdom
 */
import { act, render, waitFor } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../__mocks__/themeMock";
import type { TimelineInstance } from "../../../stores/timeline/TimelineInstance";

type FakeGeneration = {
  request_id: string;
  command: string;
  data: Record<string, unknown>;
};

const sentGenerations: FakeGeneration[] = [];
type FakeLookupResult = {
  requestId: string;
  generationId: string;
  status: "completed";
  assetIds: string[];
  error: null;
};

const lookupMock = jest.fn<
  (ids: readonly string[]) => Promise<Map<string, FakeLookupResult>>
>();
const sendMock = jest.fn(async (frame: FakeGeneration) => {
  sentGenerations.push(frame);
});

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (frame: FakeGeneration) => sendMock(frame),
    subscribe: jest.fn(() => () => {}),
    setResumeJobIdProvider: jest.fn()
  }
}));

jest.mock("../../../lib/websocket/lookupGenerations", () => ({
  __esModule: true,
  isSettled: (status: string) => status !== "running",
  lookupGenerations: (ids: readonly string[]) => lookupMock(ids)
}));

const mockVideoModels = [
  {
    id: "fake-video-edit",
    name: "Fake video edit",
    provider: "fake-provider",
    supported_tasks: ["video_to_video"],
    resolutions: ["720p"]
  }
];

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({
    models: mockVideoModels,
    isLoading: false,
    error: null,
    refetch: jest.fn()
  })
}));

jest.mock("../../../hooks/useProviders", () => ({
  useProvidersByCapability: () => ({ providers: [], isLoading: false })
}));

jest.mock("../../../lib/env", () => ({
  isElectron: false,
  isLocalhost: true,
  isProduction: false
}));

const mockFakeModelValue = {
  type: "video_model" as const,
  id: "fake-video-edit",
  name: "Fake video edit",
  provider: "fake-provider",
  supported_tasks: ["video_to_video"]
};

jest.mock("../../../components/properties/VideoModelSelect", () => {
  const FakeVideoModelSelect = ({
    value,
    onChange
  }: {
    value: string;
    onChange: (next: typeof mockFakeModelValue) => void;
  }) => {
    return (
      <button
        type="button"
        aria-label="Select video edit model"
        onClick={() => onChange(mockFakeModelValue)}
      >
        {value || "Select Fake video edit"}
      </button>
    );
  };
  return { __esModule: true, default: FakeVideoModelSelect };
});

jest.mock("../../../components/properties/curated/CuratedModelSelect", () => {
  const FakeCuratedModelSelect = ({
    value,
    onChange
  }: {
    value: string;
    onChange: (next: typeof mockFakeModelValue) => void;
  }) => {
    return (
      <button
        type="button"
        aria-label="Select video edit model"
        onClick={() => onChange(mockFakeModelValue)}
      >
        {value || "Select Fake video edit"}
      </button>
    );
  };
  return { __esModule: true, default: FakeCuratedModelSelect };
});

jest.mock("../../../components/timeline/Inspector/AIEditClipPanel", () =>
  jest.requireActual("../../../components/timeline/Inspector/AIEditClipPanel")
);

const renderTimelineMock = jest.fn<
  (options: unknown) => Promise<{
    bytes: Uint8Array;
    mimeType: string;
    extension: string;
    degradations: never[];
  }>
>(async (_options: unknown) => ({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "video/mp4",
  extension: "mp4",
  degradations: []
}));

jest.mock("../../../components/timeline/render/TimelineRenderer", () => ({
  renderTimeline: (options: unknown) => renderTimelineMock(options)
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (
    selector: (state: { get: (id: string) => Promise<unknown> }) => unknown
  ) =>
    selector({
      get: async (id: string) => ({
        id,
        content_type: "video/mp4",
        uri: `asset://${id}`
      })
    })
}));

const { TimelineProvider, createTimelineInstance } = require(
  "../../../stores/timeline/TimelineInstance"
) as typeof import("../../../stores/timeline/TimelineInstance");

jest.spyOn(
  require("../../../hooks/useModelsByProvider"),
  "useVideoModelsByProvider"
).mockReturnValue({
  models: mockVideoModels,
  isLoading: false,
  error: null,
  refetch: jest.fn()
});

const { TimelineInspector } = require(
  "../../../components/timeline/Inspector/TimelineInspector"
) as typeof import("../../../components/timeline/Inspector/TimelineInspector");
const { useDirectGenPendingStore } = require("../directGenPending") as typeof import("../directGenPending");
const { reattachSequenceJobs } = require("../useTimelineDirectGenJob") as typeof import("../useTimelineDirectGenJob");
const { useTimelineExport } = require("../useTimelineExport") as typeof import("../useTimelineExport");
const { timelineTemporalOf } = require(
  "../../../stores/timeline/TimelineStore"
) as typeof import("../../../stores/timeline/TimelineStore");
const { useStoryboardStore } = require(
  "../../../stores/storyboard/StoryboardStore"
) as typeof import("../../../stores/storyboard/StoryboardStore");

const SEQUENCE_ID = "sequence-acceptance";
const CLIP_ID = "clip-imported-trimmed";
const OTHER_CLIP_ID = "clip-untouched";
const BOARD_ID = "board-untouched";
const SHOT_ID = "shot-untouched";
const PENDING_STORAGE_KEY = "nodetool-timeline-directgen-pending";

const makeAcceptanceInstance = (): TimelineInstance => {
  const instance = createTimelineInstance();
  const videoTrack = makeTrack({ id: "track-video", type: "video", name: "Video" });
  const audioTrack = makeTrack({ id: "track-audio", type: "audio", name: "Audio" });
  const imported = makeClip({
    id: CLIP_ID,
    trackId: videoTrack.id,
    name: "Imported station",
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "asset-original",
    provider: "fake-provider",
    model: "fake-video-edit",
    startMs: 1_200,
    durationMs: 4_000,
    inPointMs: 40_000,
    outPointMs: 44_000,
    versions: []
  });
  const other = makeClip({
    id: OTHER_CLIP_ID,
    trackId: audioTrack.id,
    name: "Unrelated music",
    mediaType: "audio",
    sourceType: "imported",
    currentAssetId: "asset-other",
    startMs: 0,
    durationMs: 8_000
  });
  instance.doc.setState({
    sequenceId: SEQUENCE_ID,
    tracks: [videoTrack, audioTrack],
    clips: [imported, other],
    durationMs: 8_000
  });
  return instance;
};

const clipFrom = (instance: TimelineInstance, id: string) =>
  instance.doc.getState().clips.find((clip) => clip.id === id)!;

const AcceptanceDriver = () => {
  const { exportVideo } = useTimelineExport();

  return (
    <button type="button" onClick={() => void exportVideo("acceptance")}>
      fake export
    </button>
  );
};

describe("native media editing P0 acceptance journey", () => {
  beforeEach(() => {
    sentGenerations.length = 0;
    sendMock.mockClear();
    lookupMock.mockReset();
    renderTimelineMock.mockClear();
    useDirectGenPendingStore.setState({
      pending: {},
      durationSamples: {},
      editSettlements: {}
    });
    localStorage.removeItem(PENDING_STORAGE_KEY);
    useStoryboardStore.setState({ boards: {}, serverRevisions: {}, history: {} });
  });

  it("edits, recovers, compares, applies, renders, and undoes one imported clip", async () => {
    // MUI Collapse keeps its entering subtree pointer-inert in jsdom while
    // the transition runs. Keep the interaction semantic and asynchronous,
    // but do not make the test depend on that visual transition.
    const user = userEvent.setup({
      pointerEventsCheck: PointerEventsCheckLevel.Never
    });
    const initial = makeAcceptanceInstance();
    initial.ui.getState().selectClip(CLIP_ID);
    const otherBefore = clipFrom(initial, OTHER_CLIP_ID);
    useStoryboardStore.getState().ensureBoard(BOARD_ID);
    useStoryboardStore.getState().upsertShot(BOARD_ID, {
      type: "shot",
      id: SHOT_ID,
      index: 0,
      action: "untouched storyboard shot",
      status: "planned"
    });
    const storyboardBefore = structuredClone(
      useStoryboardStore.getState().boards[BOARD_ID]
    );

    const firstView = render(
      <ThemeProvider theme={mockTheme}>
          <TimelineProvider instance={initial}>
          <TimelineInspector />
          <AcceptanceDriver />
        </TimelineProvider>
      </ThemeProvider>
    );

    // Submission goes through the inspector's production hook. The mocked
    // provider gives this journey a deterministic completion boundary.
    await user.type(
      firstView.getByRole("textbox", { name: "Edit instruction" }),
      "Make the station deserted at night"
    );
    await user.click(
      firstView.getByRole("button", { name: "Select video edit model" })
    );
    const editButton = firstView.getByRole("button", { name: "Edit video" });
    await waitFor(() => expect(editButton).toBeEnabled());
    await user.click(editButton);
    await waitFor(() => expect(sentGenerations).toHaveLength(1));
    const submitted = sentGenerations[0];
    expect(submitted.command).toBe("generate_media");
    expect(submitted.data).toMatchObject({
      mode: "video_edit",
      provider: "fake-provider",
      model: "fake-video-edit",
      source_asset_id: "asset-original",
      source_context: {
        source_start_ms: 40_000,
        source_end_ms: 44_000,
        timeline_start_ms: 1_200,
        timeline_duration_ms: 4_000
      }
    });
    expect(sentGenerations.map((frame) => frame.command)).not.toContain(
      "create_workflow"
    );
    expect(clipFrom(initial, CLIP_ID).currentAssetId).toBe("asset-original");

    const requestId = submitted.request_id;
    expect(useDirectGenPendingStore.getState().pending[SEQUENCE_ID]).toHaveLength(1);
    const persistedPending = localStorage.getItem(PENDING_STORAGE_KEY);
    expect(persistedPending).not.toBeNull();
    expect(JSON.parse(persistedPending ?? "{}").state.pending[SEQUENCE_ID]).toEqual(
      expect.arrayContaining([expect.objectContaining({ requestId })])
    );
    const serverReloadSnapshot = {
      tracks: structuredClone(initial.doc.getState().tracks),
      clips: structuredClone(initial.doc.getState().clips),
      durationMs: initial.doc.getState().durationMs
    };
    firstView.unmount();

    // Recreate the runtime state from the persisted store representation, as
    // a reload does. Reattach must not accidentally depend on the old
    // in-memory singleton contents surviving the unmount.
    useDirectGenPendingStore.setState({
      pending: {},
      durationSamples: {},
      editSettlements: {}
    });
    expect(useDirectGenPendingStore.getState().pending).toEqual({});
    localStorage.setItem(PENDING_STORAGE_KEY, persistedPending ?? "");
    await useDirectGenPendingStore.persist.rehydrate();
    expect(useDirectGenPendingStore.getState().pending[SEQUENCE_ID]).toEqual(
      expect.arrayContaining([expect.objectContaining({ requestId })])
    );

    // A page reload hydrates the saved document and recovers the persisted
    // request through generation lookup instead of the lost socket response.
    const reloaded = makeAcceptanceInstance();
    reloaded.doc.setState({
      sequenceId: SEQUENCE_ID,
      tracks: serverReloadSnapshot.tracks,
      clips: serverReloadSnapshot.clips,
      durationMs: serverReloadSnapshot.durationMs
    });
    lookupMock.mockResolvedValue(
      new Map([
        [
          requestId,
          {
            requestId,
            generationId: requestId,
            status: "completed",
            assetIds: ["asset-candidate"],
            error: null
          }
        ]
      ])
    );
    await reattachSequenceJobs(reloaded.doc, SEQUENCE_ID);
    expect(lookupMock).toHaveBeenCalledWith([requestId]);

    const recovered = clipFrom(reloaded, CLIP_ID);
    expect(recovered.currentAssetId).toBe("asset-original");
    expect(recovered.inPointMs).toBe(40_000);
    expect(recovered.outPointMs).toBe(44_000);
    expect(recovered.versions).toHaveLength(2);
    const candidate = recovered.versions.find((take) => take.assetId === "asset-candidate");
    expect(candidate).toMatchObject({
      status: "success",
      mediaEdit: {
        instruction: "Make the station deserted at night",
        sourceContext: {
          sourceStartMs: 40_000,
          sourceEndMs: 44_000,
          timelineStartMs: 1_200,
          timelineDurationMs: 4_000
        }
      }
    });
    // Hydration and recovery are external to editorial history. The only
    // undo entry in this journey must be the explicit Use take operation.
    timelineTemporalOf(reloaded.doc).clear();
    reloaded.ui.getState().selectClip(CLIP_ID);

    const recoveredView = render(
      <ThemeProvider theme={mockTheme}>
          <TimelineProvider instance={reloaded}>
          <TimelineInspector />
          <AcceptanceDriver />
        </TimelineProvider>
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(
        recoveredView.getByRole("button", {
          name: /^Preview Candidate$/
        })
      ).toBeEnabled()
    );
    await user.click(
      recoveredView.getByRole("button", {
        name: /^Preview Candidate$/
      })
    );
    expect(reloaded.ui.getState().audition).toEqual({
      clipId: CLIP_ID,
      takeId: candidate?.id
    });
    expect(clipFrom(reloaded, CLIP_ID).currentAssetId).toBe("asset-original");
    expect(timelineTemporalOf(reloaded.doc).pastStates).toHaveLength(0);
    await user.click(
      recoveredView.getByRole("button", { name: /^Use take Latest$/ })
    );
    expect(clipFrom(reloaded, CLIP_ID)).toMatchObject({
      currentAssetId: "asset-candidate",
      activeTakeId: candidate?.id,
      inPointMs: 0,
      outPointMs: 4_000,
      startMs: 1_200,
      durationMs: 4_000
    });
    expect(clipFrom(reloaded, OTHER_CLIP_ID)).toEqual(otherBefore);
    expect(useStoryboardStore.getState().boards[BOARD_ID]).toEqual(
      storyboardBefore
    );

    await user.click(recoveredView.getByRole("button", { name: "fake export" }));
    await waitFor(() => expect(renderTimelineMock).toHaveBeenCalledTimes(1));
    expect(renderTimelineMock.mock.calls[0][0]).toMatchObject({
      clips: expect.arrayContaining([
        expect.objectContaining({
          id: CLIP_ID,
          currentAssetId: "asset-candidate",
          inPointMs: 0,
          outPointMs: 4_000
        })
      ])
    });

    act(() => timelineTemporalOf(reloaded.doc).undo());
    expect(clipFrom(reloaded, CLIP_ID)).toMatchObject({
      currentAssetId: "asset-original",
      activeTakeId: recovered.activeTakeId,
      inPointMs: 40_000,
      outPointMs: 44_000,
      startMs: 1_200,
      durationMs: 4_000
    });
    expect(clipFrom(reloaded, OTHER_CLIP_ID)).toEqual(otherBefore);
    expect(useStoryboardStore.getState().boards[BOARD_ID]).toEqual(
      storyboardBefore
    );
    expect(sentGenerations).toHaveLength(1);
    recoveredView.unmount();
  });
});
