/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { act, renderHook } from "@testing-library/react";
import type { TimelineClip } from "@nodetool-ai/timeline";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: jest.fn(async () => {
      throw new Error("socket closed");
    })
  }
}));
jest.mock("../useTimelineDirectGenJob", () => ({
  subscribeDirectGen: jest.fn(() => () => undefined)
}));
jest.mock("../../../stores/script/ScriptStore", () => ({
  useScriptStore: {
    getState: () => ({
      getScript: () => ({
        id: "script_1",
        cast: [{ id: "speaker_1", voice: { provider: "p", model: "voice-1" } }],
        sections: [
          {
            lines: [{ id: "line_1", speakerId: "speaker_1", text: "Hello" }]
          }
        ]
      })
    })
  }
}));
jest.mock("@nodetool-ai/timeline", () => {
  const actual = jest.requireActual<typeof import("@nodetool-ai/timeline")>(
    "@nodetool-ai/timeline"
  );
  return {
    ...actual,
    createLineDeliveryRequest: () => ({
      ok: true,
      request: { sourceContext: { voice: { model: "voice-1" } } }
    }),
    lineDeliveryGenerateMediaData: () => ({})
  };
});

import {
  createTimelineInstance,
  TimelineProvider
} from "../../../stores/timeline/TimelineInstance";
import { useDirectGenPendingStore } from "../directGenPending";
import { useLineDeliveryRevision } from "../useLineDeliveryRevision";

describe("useLineDeliveryRevision", () => {
  it("settles only its own request when the send fails", async () => {
    const instance = createTimelineInstance();
    const clip = {
      id: "clip_line",
      trackId: "track_a",
      name: "Line",
      startMs: 0,
      durationMs: 1000,
      mediaType: "audio",
      sourceType: "generated",
      status: "generated",
      locked: false,
      versions: [],
      scriptId: "script_1",
      scriptLineId: "line_1"
    } as TimelineClip;
    act(() => {
      instance.doc.setState({ sequenceId: "seq_1", clips: [clip] });
      useDirectGenPendingStore.getState().remember("seq_1", {
        clipId: "clip_line",
        requestId: "other_request",
        startedAt: Date.now(),
        bucket: "change_line_delivery:voice-1"
      });
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TimelineProvider instance={instance}>{children}</TimelineProvider>
    );
    const { result } = renderHook(() => useLineDeliveryRevision(), { wrapper });

    let requestId: string | null = "unset";
    await act(async () => {
      requestId = await result.current.reviseLine({ clipId: "clip_line" });
    });

    expect(requestId).toBeNull();
    expect(
      (useDirectGenPendingStore.getState().pending.seq_1 ?? []).map(
        (job) => job.requestId
      )
    ).toEqual(["other_request"]);
  });
});
