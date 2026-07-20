import type { FrontendToolState } from "../../../lib/tools/frontendTools";
import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/puck";
import {
  setPuckAgentHandler,
  listOpenPuckWorkflowIds,
  PuckAgentHandler
} from "../puck/puckAgentBridge";

const WORKFLOW_ID = "wf-1";

const stubHandler = (over: Partial<PuckAgentHandler>): PuckAgentHandler => ({
  getSnapshot: () => ({
    workflowId: WORKFLOW_ID,
    rootProps: {},
    selectedId: null,
    componentTypes: [],
    components: []
  }),
  listComponentTypes: () => [],
  addComponent: () => ({
    id: "x",
    type: "Text",
    props: { id: "x" },
    parentId: null,
    slot: null
  }),
  updateComponent: () => null,
  removeComponent: () => true,
  selectComponent: () => {},
  setRootProps: () => {},
  ...over
});

const ctx = { getState: () => ({}) as unknown as FrontendToolState };

afterEach(() => {
  for (const id of listOpenPuckWorkflowIds()) setPuckAgentHandler(id, null);
});

describe("ui_app_* tools", () => {
  it("registers the app tools globally", () => {
    expect(FrontendToolRegistry.has("ui_app_get_snapshot")).toBe(true);
    expect(FrontendToolRegistry.has("ui_app_add_component")).toBe(true);
    expect(FrontendToolRegistry.has("ui_app_update_component")).toBe(true);
    expect(FrontendToolRegistry.has("ui_app_remove_component")).toBe(true);
  });

  it("appear alongside the workflow tools in the manifest", async () => {
    // Importing the workflow tools registers them too.
    await import("../../../lib/tools/builtin/addNode");
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toContain("ui_app_add_component");
    expect(names).toContain("ui_add_node");
  });

  it("routes ui_app_add_component to the editor handler", async () => {
    const addComponent = jest.fn(() => ({
      id: "n1",
      type: "Button",
      props: { id: "n1" },
      parentId: null,
      slot: null
    }));
    setPuckAgentHandler(WORKFLOW_ID, stubHandler({ addComponent }));

    const result = (await FrontendToolRegistry.call(
      "ui_app_add_component",
      { workflow_id: WORKFLOW_ID, type: "Button", props: { label: "Go" } },
      "call-1",
      ctx
    )) as { ok: boolean };

    expect(addComponent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "Button" })
    );
    expect(result.ok).toBe(true);
  });

  it("throws a helpful error when no app builder is open for the workflow", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_app_get_snapshot",
        { workflow_id: WORKFLOW_ID },
        "call-2",
        ctx
      )
    ).rejects.toThrow(/No app builder is open for workflow "wf-1"/);
  });

  it("routes each tool to the handler for the requested workflow", async () => {
    const removeA = jest.fn(() => true);
    const removeB = jest.fn(() => true);
    setPuckAgentHandler("wf-a", stubHandler({ removeComponent: removeA }));
    setPuckAgentHandler("wf-b", stubHandler({ removeComponent: removeB }));

    await FrontendToolRegistry.call(
      "ui_app_remove_component",
      { workflow_id: "wf-b", id: "widget-1" },
      "call-3",
      ctx
    );

    expect(removeB).toHaveBeenCalledWith("widget-1");
    expect(removeA).not.toHaveBeenCalled();
  });
});
