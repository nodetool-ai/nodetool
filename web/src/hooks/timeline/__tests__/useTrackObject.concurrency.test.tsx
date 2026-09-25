import { act, renderHook, waitFor } from "@testing-library/react";
import {
  makeClip,
  makeTrack,
  type MediaTrack,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../../stores/timeline/TimelineInstance";
import { trpcClient } from "../../../trpc/client";
import { restFetch } from "../../../lib/rest-fetch";
import { useTrackObject, type TrackObjectSelection } from "../useTrackObject";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: { update: { mutate: jest.fn() }, get: { query: jest.fn() } }
  }
}));
jest.mock("../../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../../useProviders", () => ({
  useProvidersByCapability: () => ({
    providers: [],
    isLoading: false,
    error: null
  })
}));
jest.mock("../../useModelsByProvider", () => ({
  useAggregatedProviderModels: () => ({
    models: [
      {
        type: "video_model",
        id: "tracker",
        name: "Tracker",
        provider: "provider"
      }
    ],
    isLoading: false,
    error: null
  })
}));

const track = makeTrack({ type: "video", name: "Video", index: 0 });
const clip = makeClip({
  id: "clip-1",
  trackId: track.id,
  name: "Shot",
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: "asset-1",
  startMs: 0,
  durationMs: 1000
});
const selection: TrackObjectSelection = {
  clipId: clip.id,
  sourceAssetId: "asset-1",
  sourceMs: 0,
  region: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }
};
const mediaTrack = (id: string): MediaTrack => ({
  id,
  clipId: clip.id,
  sourceAssetId: "asset-1",
  name: id,
  kind: "box",
  sourceStartMs: 0,
  sourceEndMs: 1000,
  samples: [],
  status: "ready"
});
const sequence = (
  mediaTracks: MediaTrack[],
  updatedAt: string
): TimelineSequence =>
  ({
    id: "timeline-1",
    projectId: "project-1",
    name: "Sequence",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 1000,
    tracks: [track],
    clips: [clip],
    markers: [],
    mediaTracks,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt
  }) as TimelineSequence;

it("keeps media-track edits made while tracking and leaves them unsynced", async () => {
  const instance = createTimelineInstance();
  instance.doc.getState().loadSequence(sequence([], "2026-01-01T00:00:00Z"));
  jest
    .mocked(trpcClient.timeline.update.mutate)
    .mockResolvedValueOnce(sequence([], "2026-01-01T00:00:01Z") as never);
  jest.mocked(restFetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: "ready", track_id: "generated" })
  } as Response);
  let resolveGet!: (value: TimelineSequence) => void;
  jest.mocked(trpcClient.timeline.get.query).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveGet = resolve as typeof resolveGet;
      }) as ReturnType<typeof trpcClient.timeline.get.query>
  );
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TimelineProvider instance={instance}>{children}</TimelineProvider>
  );
  const rendered = renderHook(() => useTrackObject(clip, selection), {
    wrapper
  });
  let running!: ReturnType<typeof rendered.result.current.start>;
  act(() => {
    running = rendered.result.current.start();
  });
  await waitFor(() =>
    expect(trpcClient.timeline.get.query).toHaveBeenCalledTimes(1)
  );
  act(() => {
    instance.doc
      .getState()
      .applyExternalMerge({ mediaTracks: [mediaTrack("local")] });
  });
  await act(async () => {
    resolveGet(sequence([mediaTrack("generated")], "2026-01-01T00:00:02Z"));
    await running;
  });

  expect(instance.doc.getState().mediaTracks.map((item) => item.id)).toEqual([
    "generated",
    "local"
  ]);
  expect(
    instance.doc.getState().syncedDocument?.mediaTracks.map((item) => item.id)
  ).toEqual(["generated"]);
  rendered.unmount();
});
