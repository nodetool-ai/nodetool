/**
 * @jest-environment jsdom
 *
 * `ui_script_write` reports the reason a refused write gives. A write refused
 * before any await sets its reason in the same tick, so the handler has to
 * read it from the writer's ref, not from a mirror of last render's state.
 */
import { act, renderHook } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));
jest.mock("../useAssembleScriptTimeline", () => ({
  useAssembleScriptTimeline: () => ({ assemble: jest.fn() })
}));
jest.mock("../useDeriveStoryboard", () => ({
  useDeriveStoryboard: () => ({ derive: jest.fn() })
}));

import { useScriptAgentBridge } from "../useScriptAgentBridge";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import { useWriteScript } from "../useWriteScript";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

const SCRIPT = "script-bridge";

beforeEach(() => {
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useScriptStore.getState().ensureScript(SCRIPT);
});

describe("useScriptAgentBridge write", () => {
  it("rejects with the writer's own reason for a synchronous refusal", async () => {
    renderHook(() => useScriptAgentBridge(SCRIPT));
    const handler = getScriptAgentHandler(SCRIPT);
    expect(handler).toBeDefined();
    await expect(handler!.write()).rejects.toThrow(
      "Write a brief before writing the script."
    );
  });
});

describe("a canceled agent write", () => {
  // The flow shows the agent's write with Cancel. A canceled write used to
  // reach the agent as "The writer did not return a script."
  it("tells the agent the write was canceled", async () => {
    useScriptStore.getState().setSetup(SCRIPT, {
      stage: "format",
      brief: "A short explainer",
      format: "voiceover"
    });
    useGlobalChatStore.setState({
      selectedModel: {
        type: "language_model",
        id: "claude-sonnet-5",
        provider: "anthropic"
      }
    } as never);
    rpcRequest.mockImplementation(
      (_command, _payload, _timeout, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    renderHook(() => useScriptAgentBridge(SCRIPT));
    const flow = renderHook(() => useWriteScript(SCRIPT));
    let written: Promise<unknown> = Promise.resolve();
    act(() => {
      written = getScriptAgentHandler(SCRIPT).write();
    });
    await act(async () => {
      flow.result.current.cancel();
      await expect(written).rejects.toThrow("The write was canceled.");
    });
    expect(flow.result.current.error).toBeNull();
  });
});

describe("agent edits during a write", () => {
  // The write replaces the cast and the lines when it lands. An edit the
  // agent made meanwhile was reported as done and then thrown away.
  it("refuses line and cast edits until the write lands", async () => {
    useScriptStore.getState().setSetup(SCRIPT, {
      stage: "review",
      brief: "A short explainer",
      format: "voiceover"
    });
    useScriptStore.getState().applyWrittenScript(SCRIPT, {
      cast: [{ id: "spk_1", name: "Narrator" }],
      sections: [
        {
          id: "sec_1",
          title: "Open",
          lines: [{ id: "line_1", speakerId: "spk_1", text: "First words." }]
        }
      ]
    });
    useGlobalChatStore.setState({
      selectedModel: {
        type: "language_model",
        id: "claude-sonnet-5",
        provider: "anthropic"
      }
    } as never);
    let finish: (value: unknown) => void = () => undefined;
    rpcRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderHook(() => useScriptAgentBridge(SCRIPT));
    // The flow's Rewrite, running while the agent edits.
    const flow = renderHook(() => useWriteScript(SCRIPT));
    let written: Promise<boolean> = Promise.resolve(false);
    act(() => {
      written = flow.result.current.write(SCRIPT, { rewrite: true });
    });

    const handler = getScriptAgentHandler(SCRIPT);
    const refusal = /being written/;
    expect(() => handler.setLineText("line_1", "Edited.")).toThrow(refusal);
    expect(() => handler.setLineSpeaker("line_1", null)).toThrow(refusal);
    expect(() => handler.addLine({ text: "More." })).toThrow(refusal);
    expect(() => handler.addSpeaker("Guest")).toThrow(refusal);
    expect(() =>
      handler.setSpeakerVoice("spk_1", {
        provider: "openai",
        model: "tts-1",
        voice: "alloy"
      })
    ).toThrow(refusal);

    await act(async () => {
      finish({ data: {} });
      await written;
    });
    expect(handler.setLineText("0", "Edited.").text).toBe("Edited.");
  });
});
