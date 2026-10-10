/**
 * A line is paid for once. A line's own Voice button, the agent's
 * `ui_script_voice_line` and Voice all could each start a take for a line
 * another of them was still voicing, and Voice all voiced a line that was
 * voiced after it was planned.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const rpcRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args),
  randomRequestId: () => "req-test"
}));
jest.mock("../timelineSync", () => ({
  syncLineClipToTimeline: jest.fn(async () => undefined)
}));

import { useScriptStore } from "../ScriptStore";
import { readVoicingRun, voiceAll, voiceLine } from "../scriptVoicing";

const SCRIPT = "sc-inflight";
const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };

const seed = (): void => {
  useScriptStore.setState({
    scripts: {
      [SCRIPT]: {
        id: SCRIPT,
        title: "Film",
        cast: [{ id: "sp-1", name: "Mara", voice: VOICE }],
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
              },
              {
                id: "ln-2",
                speakerId: "sp-1",
                text: "Come back tomorrow.",
                takes: [],
                currentTakeId: null
              }
            ]
          }
        ],
        timelineId: null,
        setup: { stage: "done", brief: "" }
      }
    },
    voicingLineIds: {}
  } as never);
};

/** Speech calls that stay open until the test answers them. */
const heldSpeech = () => {
  const answers: Array<() => void> = [];
  rpcRequest.mockImplementation((command: unknown) => {
    if (command === "generate_media") {
      return new Promise((resolve) => {
        answers.push(() => resolve({ asset_ids: [] }));
      });
    }
    return Promise.reject(new Error("unexpected"));
  });
  return answers;
};

const speechCalls = (): number =>
  rpcRequest.mock.calls.filter((call) => call[0] === "generate_media").length;

beforeEach(() => {
  rpcRequest.mockReset();
  seed();
});

describe("a line already being voiced", () => {
  it("is not voiced a second time by another call", async () => {
    const answers = heldSpeech();
    const first = voiceLine(SCRIPT, "ln-1").catch(() => undefined);

    await expect(voiceLine(SCRIPT, "ln-1")).rejects.toThrow(
      "This line is already being voiced."
    );
    expect(speechCalls()).toBe(1);

    answers.forEach((answer) => answer());
    await first;
  });

  it("is left out of a Voice all started meanwhile", async () => {
    const answers = heldSpeech();
    const single = voiceLine(SCRIPT, "ln-1").catch(() => undefined);
    const all = voiceAll(SCRIPT, undefined, 1);

    // Voice all asks only for the line nobody is voicing.
    await Promise.resolve();
    expect(speechCalls()).toBe(2);
    expect(rpcRequest.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ prompt: "We are closed." }),
      expect.objectContaining({ prompt: "Come back tomorrow." })
    ]);

    answers.forEach((answer) => answer());
    await single;
    await all;
    const run = readVoicingRun(
      useScriptStore.getState().scripts[SCRIPT]?.setup
    );
    expect(run?.total).toBe(1);
  });
});
