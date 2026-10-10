/**
 * The browser export mixes the same clips the server export does: a video
 * clip with no extracted-audio partner sounds its own audio, and a clip
 * sounds under the status rule its picture is drawn under.
 */
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { renderTimelineAudio } from "../renderAudio";

const scheduled: string[] = [];

jest.mock("../../preview/AudioGraph", () => ({
  AudioGraph: class {
    scheduleClips(clips: Array<{ clip: { id: string } }>) {
      scheduled.push(...clips.map((c) => c.clip.id));
      return Promise.resolve();
    }
  }
}));

class MockOfflineAudioContext {
  constructor(readonly channels: number, readonly length: number) {}
  startRendering() {
    return Promise.resolve({ length: this.length } as AudioBuffer);
  }
}

const track = (id: string, type: TimelineTrack["type"]): TimelineTrack => ({
  id,
  name: id,
  type,
  index: 0,
  visible: true,
  locked: false
});

const clip = (overrides: Partial<TimelineClip>): TimelineClip => ({
  id: "c",
  trackId: "v",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video",
  sourceType: "generated",
  status: "generated",
  currentAssetId: "asset",
  locked: false,
  versions: [],
  ...overrides
});

const tracks = [track("v", "video"), track("a", "audio")];

const render = async (clips: TimelineClip[]): Promise<string[]> => {
  scheduled.length = 0;
  await renderTimelineAudio({
    clips,
    tracks,
    durationMs: 1000,
    resolveUrl: async (id) => `https://example.test/${id}`
  });
  return [...scheduled];
};

beforeAll(() => {
  (globalThis as unknown as { OfflineAudioContext: unknown }).OfflineAudioContext =
    MockOfflineAudioContext;
});

describe("renderTimelineAudio — video clips with their own audio", () => {
  it("mixes a video clip that has no audio partner", async () => {
    expect(await render([clip({ id: "shot" })])).toEqual(["shot"]);
  });

  it("mixes the audio partner instead of a linked video", async () => {
    const shot = clip({ id: "shot", linkId: "L" });
    const partner = clip({
      id: "partner",
      trackId: "a",
      mediaType: "audio",
      linkId: "L"
    });
    expect(await render([shot, partner])).toEqual(["partner"]);
  });

  it("leaves out a muted video clip", async () => {
    expect(await render([clip({ id: "shot", muted: true })])).toEqual([]);
  });
});

describe("renderTimelineAudio — clip status", () => {
  it("follows the picture's rule: failed is silent, generating keeps its asset", async () => {
    const audio = (status: TimelineClip["status"]) =>
      clip({ id: status, trackId: "a", mediaType: "audio", status });
    expect(await render([audio("failed")])).toEqual([]);
    expect(await render([audio("generating")])).toEqual(["generating"]);
  });
});
