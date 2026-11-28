/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";
import { useClipMenuActions } from "../useClipMenuActions";

const clip = makeClip({
  id: "c1",
  name: "c1",
  trackId: "t1",
  mediaType: "audio",
  sourceType: "imported",
  startMs: 0,
  durationMs: 1000
});
const state = { clips: [clip], sequenceId: "seq-missing", tracks: [] };
const storeApi = { getState: () => state };

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../../../stores/timeline/TimelineStore", () => ({
  useTimelineStore: (selector: (s: unknown) => unknown) =>
    selector({ ...state, duplicateClip: jest.fn() }),
  useTimelineStoreApi: () => storeApi
}));
jest.mock("../../../../stores/timeline/TimelineUIStore", () => ({
  useTimelineUIStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({}),
    { getState: () => ({ selectedClipIds: new Set<string>() }) }
  )
}));
jest.mock("../../../../stores/timeline/TimelinePlaybackStore", () => ({
  useTimelinePlaybackStoreApi: () => ({ getState: () => ({ getTimeMs: () => 0 }) })
}));
jest.mock("../../../../hooks/timeline/useDetectClipBeats", () => ({
  canDetectClipBeats: () => false,
  useDetectClipBeats: () => jest.fn()
}));

describe("useClipMenuActions section actions", () => {
  it("reports an error instead of throwing when no editor handler is registered", () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useClipMenuActions("c1", { onRequestReplace: jest.fn(), onError })
    );
    expect(() => act(() => result.current.insertSilence())).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toMatch(/seq-missing/);
  });
});
