import type { FrontendToolState } from "../../../lib/tools/frontendTools";
import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/puck";
import {
  setPuckAgentHandler,
  PuckAgentHandler
} from "../puck/puckAgentBridge";

const stubHandler = (over: Partial<PuckAgentHandler>): PuckAgentHandler => ({
  getSnapshot: () => ({
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

afterEach(() => setPuckAgentHandler(null));

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
    setPuckAgentHandler(stubHandler({ addComponent }));

    const result = (await FrontendToolRegistry.call(
      "ui_app_add_component",
      { type: "Button", props: { label: "Go" } },
      "call-1",
      ctx
    )) as { ok: boolean };

    expect(addComponent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "Button" })
    );
    expect(result.ok).toBe(true);
  });

  it("throws a helpful error when no app builder is open", async () => {
    setPuckAgentHandler(null);
    await expect(
      FrontendToolRegistry.call("ui_app_get_snapshot", {}, "call-2", ctx)
    ).rejects.toThrow(/No app builder is open/);
  });
});
