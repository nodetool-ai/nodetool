import "../code";
import { FrontendToolRegistry } from "../../frontendTools";
import type { FrontendToolState } from "../../frontendTools";
import type { Workflow, WorkflowList } from "../../../../stores/ApiTypes";
import {
  getCodeAssistantHandler,
  listOpenCodeAssistantIds,
  registerCodeAssistantHandler,
  type CodeAssistantHandler,
  type CodeAssistantState
} from "../../../../components/node_types/code_assistant/codeAssistantBridge";
import { stub } from "../../../../test-utils/doubles";

const mockState: FrontendToolState = {
  nodeMetadata: {},
  currentWorkflowId: null,
  getWorkflow: () => undefined,
  addWorkflow: () => {},
  removeWorkflow: () => {},
  getNodeStore: () => undefined,
  updateWorkflow: () => {},
  saveWorkflow: async () => {},
  getCurrentWorkflow: () => undefined,
  setCurrentWorkflowId: () => {},
  fetchWorkflow: async () => {},
  newWorkflow: () => stub<Workflow>({}),
  createNew: async () => stub<Workflow>({}),
  searchTemplates: async () => stub<WorkflowList>({ workflows: [], next: null }),
  copy: async () => stub<Workflow>({})
};

const ctx = { getState: () => mockState };

const baseState: CodeAssistantState = {
  node_id: "node-1",
  code: "return { total: inputs.rows.length };",
  inputs: [{ name: "rows", type: "list" }],
  outputs: [{ name: "total", type: "int" }]
};

function makeHandler(
  overrides?: Partial<CodeAssistantHandler>
): CodeAssistantHandler {
  return {
    getState: () => baseState,
    setCode: jest.fn(),
    setPorts: jest.fn(),
    ...overrides
  };
}

describe("codeAssistantBridge", () => {
  it("register returns an unregister function and lists open ids", () => {
    const unregister = registerCodeAssistantHandler("node-1", makeHandler());
    expect(listOpenCodeAssistantIds()).toEqual(["node-1"]);
    expect(getCodeAssistantHandler("node-1")).toBeDefined();

    unregister();
    expect(listOpenCodeAssistantIds()).toEqual([]);
    expect(() => getCodeAssistantHandler("node-1")).toThrow(
      /No Code assistant is open for node "node-1"/
    );
  });

  it("names the open ids when the requested node is not registered", () => {
    const unregister = registerCodeAssistantHandler("node-a", makeHandler());
    expect(() => getCodeAssistantHandler("node-b")).toThrow(
      /Open Code assistants: node-a/
    );
    unregister();
  });

  it("unregister does not remove a newer handler for the same id", () => {
    const first = makeHandler();
    const second = makeHandler();
    const unregisterFirst = registerCodeAssistantHandler("node-1", first);
    const unregisterSecond = registerCodeAssistantHandler("node-1", second);

    unregisterFirst();
    expect(getCodeAssistantHandler("node-1")).toBe(second);
    unregisterSecond();
  });
});

describe("ui_code_* tools", () => {
  let unregister: (() => void) | null = null;

  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("ui_code_get_state returns the handler's draft state", async () => {
    unregister = registerCodeAssistantHandler("node-1", makeHandler());

    const result = await FrontendToolRegistry.call(
      "ui_code_get_state",
      { node_id: "node-1" },
      "call-1",
      ctx
    );

    expect(result).toEqual({ ok: true, ...baseState });
  });

  it("ui_code_set_code delegates the new code body", async () => {
    const handler = makeHandler();
    unregister = registerCodeAssistantHandler("node-1", handler);

    const result = await FrontendToolRegistry.call(
      "ui_code_set_code",
      { node_id: "node-1", code: "return { x: 1 };" },
      "call-2",
      ctx
    );

    expect(handler.setCode).toHaveBeenCalledWith("return { x: 1 };");
    expect(result).toEqual({ ok: true, chars: 16 });
  });

  it("ui_code_set_ports delegates and echoes the resulting ports", async () => {
    const handler = makeHandler();
    unregister = registerCodeAssistantHandler("node-1", handler);

    const result = await FrontendToolRegistry.call(
      "ui_code_set_ports",
      {
        node_id: "node-1",
        inputs: [{ name: "text", type: "str" }]
      },
      "call-3",
      ctx
    );

    expect(handler.setPorts).toHaveBeenCalledWith({
      inputs: [{ name: "text", type: "str" }],
      outputs: undefined
    });
    expect(result).toEqual({
      ok: true,
      inputs: baseState.inputs,
      outputs: baseState.outputs
    });
  });

  it.each([
    ["ui_code_get_state", { node_id: "closed" }],
    ["ui_code_set_code", { node_id: "closed", code: "x" }],
    ["ui_code_set_ports", { node_id: "closed", inputs: [] }]
  ])("%s throws when no assistant is open", async (tool, args) => {
    await expect(
      FrontendToolRegistry.call(tool, args, `call-${tool}`, ctx)
    ).rejects.toThrow(/No Code assistant is open for node "closed"/);
  });
});
