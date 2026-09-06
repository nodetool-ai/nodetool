import { describe, it, expect, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";
import {
  createTimelineStore,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  applyBeatPlan,
  planBeats,
  planContextOf,
  usePlanBeats
} from "../usePlanBeats";
import {
  VIDEO_FORMATS,
  videoFormatById
} from "../../../components/setup/video/formats";

/** The store the hook under test reads. Set per test, before it renders. */
let mockStore: TimelineStoreApi;

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  ...(jest.requireActual("../../../stores/timeline/TimelineStore") as Record<
    string,
    unknown
  >),
  useTimelineStoreApi: () => mockStore
}));

/** The RPC the hook reaches for by default; each test resolves it by hand. */
const mockRequest =
  jest.fn<
    (
      command: string,
      data: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
  >();

jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (command: string, data: Record<string, unknown>) =>
    mockRequest(command, data)
}));

/**
 * PRD § 8.7 criterion 3: `Plan the beats` writes `setup.beats` and creates no
 * clip and no job. Both halves are asserted — the store's clips, and the RPCs
 * the planner issued, since a render job is a `generate_media` call and nothing
 * else on this path can start one.
 */

const AD_15 = videoFormatById("ad-15")!;

/** A screenplay the Director would answer with, in the wire shape. */
const screenplay = {
  type: "screenplay",
  title: "Paper boat",
  style_bible: "overcast, handheld",
  shots: [
    {
      slug: "kerb",
      action: "a paper boat at the kerb",
      camera: { framing: "wide", lens: "35mm" },
      motion: "slow push in",
      narration: "It was never going to last.",
      duration_seconds: 3
    },
    {
      slug: "drain",
      action: "the boat slips into the drain",
      camera: { framing: "close" },
      duration_seconds: 4
    }
  ]
};

describe("planBeats (criterion 3)", () => {
  it("creates no clip and starts no job", async () => {
    const store = createTimelineStore();
    const request = jest.fn(
      async (command: string, _data: Record<string, unknown>) => {
        void command;
        return { data: screenplay };
      }
    );

    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request
    });
    applyBeatPlan(store, beats);

    expect(beats).toHaveLength(2);
    expect(store.getState().clips).toEqual([]);
    // The only command it issues is text generation. `generate_media` is what
    // starts a render job, and it is never sent.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.map(([command]) => command)).toEqual([
      "generate_text"
    ]);
  });

  it("stops at the review with the plan on the document", async () => {
    const store = createTimelineStore();
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({ data: screenplay })
    });
    applyBeatPlan(store, beats);

    expect(store.getState().setup?.stage).toBe("review");
    expect(store.getState().setup?.beats).toHaveLength(2);
  });

  it("composes each beat's prompt the direct-clip way", async () => {
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({ data: screenplay })
    });
    // `shot-prompt`'s direct composition: action, framing, lens, motion, style.
    expect(beats[0].prompt).toBe(
      "a paper boat at the kerb, wide shot, 35mm lens, slow push in, overcast, handheld"
    );
  });

  it("takes each beat's length from the shot, and the format's when absent", async () => {
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({
        data: {
          ...screenplay,
          shots: [screenplay.shots[0], { action: "no length given" }]
        }
      })
    });
    expect(beats[0].duration_ms).toBe(3000);
    expect(beats[1].duration_ms).toBe(
      Math.round(AD_15.durationMs / AD_15.beatCount)
    );
  });

  it("carries the narration as the voiceover, only where the format has the lane", async () => {
    const trailer = videoFormatById("trailer")!;
    const [voiced] = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({ data: screenplay })
    });
    const [scored] = await planBeats({
      brief: "a paper boat's last voyage",
      format: trailer,
      request: async () => ({ data: screenplay })
    });
    expect(voiced.voiceover).toBe("It was never going to last.");
    expect(scored.voiceover).toBeUndefined();
  });

  it("still answers an editable plan when the provider returns nothing usable", async () => {
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({})
    });
    expect(beats.length).toBe(AD_15.beatCount);
  });

  it("refuses an empty brief without asking a provider", async () => {
    const request = jest.fn(async () => ({ data: screenplay }));
    await expect(
      planBeats({ brief: "   ", format: AD_15, request })
    ).rejects.toThrow(/before planning/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the edited plan back as context on a re-plan", async () => {
    const sentPrompts: string[] = [];
    const request = async (_command: string, data: Record<string, unknown>) => {
      sentPrompts.push(String(data["prompt"]));
      return { data: screenplay };
    };
    await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      previous: [
        { id: "b1", prompt: "the kerb, but at night", duration_ms: 3000 }
      ],
      request
    });
    expect(sentPrompts[0]).toContain("the kerb, but at night");
  });

  // PRD § 8.1 and F10: media the creator dropped is what the plan describes.
  // F4: the composer's references and entities reach the planner too.
  it("tells the Director about the placed clips, in order", async () => {
    const sentPrompts: string[] = [];
    await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      context: { clips: ["kerb.mp4", "drain.mp4"] },
      request: async (_command, data) => {
        sentPrompts.push(String(data["prompt"]));
        return { data: screenplay };
      }
    });

    expect(sentPrompts[0]).toContain("1. kerb.mp4");
    expect(sentPrompts[0]).toContain("2. drain.mp4");
  });

  it("names the attached references and entities without resolving them", async () => {
    const sentPrompts: string[] = [];
    await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      context: {
        references: [{ uri: "asset://abc.png", name: "kerb.png" }],
        entityIds: ["entity-boat"]
      },
      request: async (_command, data) => {
        sentPrompts.push(String(data["prompt"]));
        return { data: screenplay };
      }
    });

    expect(sentPrompts[0]).toContain("kerb.png");
    expect(sentPrompts[0]).toContain("entity-boat");
    // The locator stays a locator: nothing fetches it and no bytes are inlined.
    expect(sentPrompts[0]).not.toContain("data:");
  });

  it("plans one beat per placed clip, not the format's count", async () => {
    // The format asks for more beats than the creator placed clips, and the
    // Director answers with two shots. The clip on the timeline wins.
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      context: { clips: ["kerb.mp4"] },
      request: async () => ({ data: screenplay })
    });

    expect(beats).toHaveLength(1);
  });

  it("sends no context block when the creator brought nothing", async () => {
    const sentPrompts: string[] = [];
    await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      context: {},
      request: async (_command, data) => {
        sentPrompts.push(String(data["prompt"]));
        return { data: screenplay };
      }
    });

    expect(sentPrompts[0]).not.toContain("already placed this media");
    expect(sentPrompts[0]).not.toContain("Keep these entities");
  });

  it("asks for every format's beat count", () => {
    for (const format of VIDEO_FORMATS) {
      expect(format.beatCount).toBeGreaterThan(0);
      expect(format.beatCount).toBeLessThanOrEqual(20);
    }
  });
});

/**
 * F2: a Director call outlives the stage that asked for it. The creator who
 * moved on keeps the plan they moved on with, and is not pulled back to the
 * review by an answer they no longer wanted.
 */
describe("usePlanBeats staleness", () => {
  const setup = (stage: "format" | "review" | "look") => {
    mockStore = createTimelineStore();
    mockStore.getState().setSetup({
      stage,
      brief: "a paper boat's last voyage",
      format: "ad-15"
    });
  };

  it("writes the plan and the review stage when the creator stayed", async () => {
    setup("format");
    mockRequest.mockResolvedValue({ data: screenplay });
    const { result } = renderHook(() => usePlanBeats());

    await act(async () => {
      await result.current.plan();
    });

    expect(mockStore.getState().setup?.stage).toBe("review");
    expect(mockStore.getState().setup?.beats).toHaveLength(2);
  });

  it("keeps the draft and the stage when the creator has moved on", async () => {
    setup("review");
    let answer: (value: Record<string, unknown>) => void = () => undefined;
    mockRequest.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { result } = renderHook(() => usePlanBeats());

    let planned: Promise<void> = Promise.resolve();
    act(() => {
      planned = result.current.plan({ replan: true });
    });
    // The creator continued to the look while the Director was still writing.
    act(() => {
      mockStore.getState().setSetup({ stage: "look" });
    });
    await act(async () => {
      answer({ data: screenplay });
      await planned;
    });

    expect(mockStore.getState().setup?.stage).toBe("look");
    expect(mockStore.getState().setup?.beats ?? []).toHaveLength(0);
    await waitFor(() => expect(result.current.planning).toBe(false));
  });
});

/**
 * A dropped video places two imported clips: the picture, and the audio track
 * `importVideoWithAudio` extracts beside it. Only the picture is a shot, so
 * only the picture is a beat (PRD § 8.1).
 */
describe("planContextOf", () => {
  const withClips = (clips: Parameters<typeof makeClip>[0][]) => {
    const store = createTimelineStore();
    store.setState({ clips: clips.map((clip) => makeClip(clip)) });
    return store;
  };

  it("counts one dropped video once, not twice with its audio", () => {
    const store = withClips([
      {
        id: "c1",
        name: "kerb.mp4",
        startMs: 0,
        durationMs: 3200,
        mediaType: "video",
        sourceType: "imported",
        linkId: "l1"
      },
      {
        id: "c2",
        name: "kerb.mp4 (audio)",
        startMs: 0,
        durationMs: 3200,
        mediaType: "audio",
        sourceType: "imported",
        linkId: "l1"
      }
    ]);

    expect(planContextOf(store).clips).toEqual(["kerb.mp4"]);
  });

  it("plans one beat for one dropped video with an audio track", async () => {
    const store = withClips([
      {
        id: "c1",
        name: "kerb.mp4",
        startMs: 0,
        durationMs: 3200,
        mediaType: "video",
        sourceType: "imported"
      },
      {
        id: "c2",
        name: "kerb.mp4 (audio)",
        startMs: 0,
        durationMs: 3200,
        mediaType: "audio",
        sourceType: "imported"
      }
    ]);

    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      context: planContextOf(store),
      request: async () => ({ data: screenplay })
    });

    expect(beats).toHaveLength(1);
  });

  it("keeps a dropped still, and leaves generated clips out", () => {
    const store = withClips([
      {
        id: "c1",
        name: "kerb.png",
        startMs: 0,
        durationMs: 2000,
        mediaType: "image",
        sourceType: "imported"
      },
      {
        id: "c2",
        name: "Beat 1",
        startMs: 2000,
        durationMs: 3000,
        mediaType: "video",
        sourceType: "generated"
      }
    ]);

    expect(planContextOf(store).clips).toEqual(["kerb.png"]);
  });
});
