/**
 * @jest-environment jsdom
 *
 * A write replaces the lines voicing is recording. Started together, one of
 * them pays for nothing: takes for dropped lines, or stale takes on lines with
 * new words. Each refuses while the other runs, whichever caller started it.
 */
import { renderHook, act } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));
jest.mock("../../../stores/script/timelineSync", () => ({
  syncLineClipToTimeline: jest.fn(async () => undefined)
}));

import { useWriteScript } from "../useWriteScript";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import {
  isVoicingLive,
  voiceAll,
  voiceLine
} from "../../../stores/script/scriptVoicing";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

const SCRIPT = "script-lock";

const seed = (): void => {
  useScriptStore.setState({
    scripts: {
      [SCRIPT]: {
        id: SCRIPT,
        title: "Film",
        cast: [
          {
            id: "sp-1",
            name: "Mara",
            voice: { provider: "openai", model: "tts-1", voice: "alloy" }
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
        ],
        timelineId: null,
        setup: {
          stage: "review",
          brief: "A shop at closing time",
          format: "voiceover",
          length_seconds: 30
        }
      }
    }
  } as never);
};

beforeEach(() => {
  rpcRequest.mockReset();
  useGlobalChatStore.setState({
    selectedModel: {
      type: "language_model",
      id: "claude-sonnet-5",
      provider: "anthropic"
    }
  } as never);
  seed();
});

/** A request that stays open until the test settles it. */
const held = () => {
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise((_resolve, rejectWith) => {
    reject = rejectWith;
  });
  return { promise, reject };
};

describe("writing and voicing one script", () => {
  it("refuses a write while the script is being voiced", async () => {
    const speech = held();
    rpcRequest.mockReturnValueOnce(speech.promise);
    const voicing = voiceAll(SCRIPT);
    expect(isVoicingLive(SCRIPT)).toBe(true);

    const { result } = renderHook(() => useWriteScript(SCRIPT));
    let written = true;
    await act(async () => {
      written = await result.current.write(SCRIPT, { rewrite: true });
    });

    expect(written).toBe(false);
    expect(result.current.errorRef.current).toMatch(/being voiced/);
    // Only the speech call went out: no writer call was paid for.
    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest.mock.calls[0][0]).toBe("generate_media");

    speech.reject(new Error("stopped"));
    await act(async () => {
      await voicing;
    });
  });

  it("refuses to voice while the script is being written", async () => {
    const writer = held();
    rpcRequest.mockReturnValueOnce(writer.promise);
    const { result } = renderHook(() => useWriteScript(SCRIPT));
    let writing: Promise<boolean> = Promise.resolve(false);
    act(() => {
      writing = result.current.write(SCRIPT, { rewrite: true });
    });
    expect(result.current.writing).toBe(true);

    await expect(voiceAll(SCRIPT)).rejects.toThrow(/being written/);
    await expect(voiceLine(SCRIPT, "ln-1")).rejects.toThrow(/being written/);
    // The writer call is the only one: no speech was paid for.
    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest.mock.calls[0][0]).toBe("generate_text");
    // A refused run records nothing on the document.
    expect(
      (
        useScriptStore.getState().getScript(SCRIPT)?.setup as
          | { voicing?: unknown }
          | undefined
      )?.voicing
    ).toBeUndefined();

    writer.reject(new Error("stopped"));
    await act(async () => {
      await writing;
    });
  });
});
