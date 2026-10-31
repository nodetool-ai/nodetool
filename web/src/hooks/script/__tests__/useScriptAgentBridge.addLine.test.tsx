/**
 * @jest-environment jsdom
 *
 * `ui_script_add_line` is one undo step and checks its speaker. It used to
 * add, patch and reorder (three undo steps), and it accepted a speaker id
 * that is not in the cast.
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

const SCRIPT = "script-add-line";

const texts = (): string[] =>
  useScriptStore
    .getState()
    .scripts[SCRIPT].sections.flatMap((s) => s.lines.map((l) => l.text));

beforeEach(() => {
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useScriptStore.getState().loadScript(SCRIPT, {
    title: "",
    cast: [{ id: "sp-1", name: "Mara" }],
    sections: [
      {
        id: "sec",
        lines: [
          { id: "a", text: "A", takes: [] },
          { id: "b", text: "B", takes: [] }
        ]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
});

describe("useScriptAgentBridge addLine", () => {
  it("inserts before the line at the index as one undo step", () => {
    renderHook(() => useScriptAgentBridge(SCRIPT));
    const node = getScriptAgentHandler(SCRIPT).addLine({
      text: "New",
      speakerId: "sp-1",
      direction: "softly",
      index: 1
    });
    expect(texts()).toEqual(["A", "New", "B"]);
    expect(node).toEqual(
      expect.objectContaining({
        index: 1,
        speakerId: "sp-1",
        direction: "softly"
      })
    );

    useScriptStore.getState().undo(SCRIPT);
    expect(texts()).toEqual(["A", "B"]);
  });

  it("appends when the index is left out, and to an empty script", () => {
    renderHook(() => useScriptAgentBridge(SCRIPT));
    getScriptAgentHandler(SCRIPT).addLine({ text: "Last" });
    expect(texts()).toEqual(["A", "B", "Last"]);

    useScriptStore.getState().loadScript(SCRIPT, {
      title: "",
      cast: [],
      sections: [],
      timelineId: null,
      storyboardId: null
    });
    getScriptAgentHandler(SCRIPT).addLine({ text: "First" });
    expect(texts()).toEqual(["First"]);
  });

  it("refuses a speaker that is not in the cast", () => {
    renderHook(() => useScriptAgentBridge(SCRIPT));
    expect(() =>
      getScriptAgentHandler(SCRIPT).addLine({ text: "X", speakerId: "ghost" })
    ).toThrow("Speaker not found in the cast: ghost");
    expect(texts()).toEqual(["A", "B"]);
  });
});
