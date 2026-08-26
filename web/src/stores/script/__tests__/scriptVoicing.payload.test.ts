/**
 * Pins the `generate_media` request the script voicer sends per line: mode,
 * provider, model, voice and the line text as prompt. The transcription
 * follow-up is best-effort and asserted only for its asset linkage.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const handlers = new Map<string, (msg: unknown) => void>();
const sendFrames: Array<Record<string, unknown>> = [];
const sendMock = jest.fn(async (frame: Record<string, unknown> & { request_id?: string }) => {
  sendFrames.push(frame);
});
type RpcHandler = (msg: unknown) => void;
const subscribeMock = jest.fn(
  (id: string, handler: RpcHandler): (() => void) => {
    handlers.set(id, handler);
    return () => handlers.delete(id);
  }
);

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (...args: unknown[]) =>
      sendMock(...(args as [Record<string, unknown>])),
    subscribe: (...args: unknown[]) =>
      subscribeMock(...(args as [string, RpcHandler])),
    setResumeJobIdProvider: jest.fn()
  }
}));

jest.mock("../timelineSync", () => ({
  syncLineClipToTimeline: jest.fn(async () => undefined)
}));

import { voiceLine } from "../scriptVoicing";
import { useScriptStore } from "../ScriptStore";

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

const respond = (
  requestId: string,
  payload: Record<string, unknown>
): void => {
  handlers.get(requestId)?.({
    type: "rpc_response",
    request_id: requestId,
    ...payload
  });
};

beforeEach(() => {
  handlers.clear();
  sendFrames.length = 0;
  sendMock.mockClear();
  subscribeMock.mockClear();
  useScriptStore.setState({
    scripts: {
      "sc-1": {
        id: "sc-1",
        title: "Film",
        cast: [
          {
            id: "sp-1",
            name: "Mara",
            voice: { provider: "tts-prov", model: "tts-1", voice: "alloy" }
          }
        ],
        sections: [
          {
            id: "sec-1",
            lines: [
              {
                id: "ln-1",
                speakerId: "sp-1",
                text: "We are closed.",
                takes: [],
                currentTakeId: null
              }
            ]
          }
        ]
      }
    }
  } as never);
});

describe("voiceLine generate_media payloads", () => {
  it("sends mode audio with the speaker's voice binding and the line text", async () => {
    const done = voiceLine("sc-1", "ln-1");
    await flush();
    expect(sendFrames[0]).toMatchObject({
      command: "generate_media",
      data: {
        mode: "audio",
        provider: "tts-prov",
        model: "tts-1",
        voice: "alloy",
        prompt: "We are closed."
      }
    });

    // Answer the TTS request; the ASR follow-up fails best-effort.
    const ttsFrame = sendFrames[0] as { request_id?: string };
    respond(ttsFrame.request_id as string, { result: { asset_ids: ["aud-1"] } });
    await flush();

    const asrFrame = sendFrames[1] as
      | { request_id?: string; command?: string }
      | undefined;
    if (asrFrame?.command === "transcribe_audio") {
      expect(asrFrame).toMatchObject({
        data: { asset_id: "aud-1", model: "whisper-1", provider: "openai" }
      });
      respond(asrFrame.request_id as string, {
        error: { message: "asr unavailable" }
      });
    }

    const take = await done;
    expect(take.assetId).toBe("aud-1");
    expect(take.textSnapshot).toBe("We are closed.");
  });
});
