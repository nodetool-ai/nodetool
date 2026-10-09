/**
 * @jest-environment jsdom
 *
 * `ui_script_write` reports the reason a refused write gives. A write refused
 * before any await sets its reason in the same tick, so the handler has to
 * read it from the writer's ref, not from a mirror of last render's state.
 */
import { renderHook } from "@testing-library/react";

jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn(),
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
