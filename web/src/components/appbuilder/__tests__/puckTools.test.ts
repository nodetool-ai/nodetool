jest.mock("../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

import type { FrontendToolState } from "../../../lib/tools/frontendTools";
import { stub } from "../../../test-utils/doubles";
import { restFetch } from "../../../lib/rest-fetch";
import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/puck";
import {
  setPuckAgentHandler,
  listOpenPuckApplicationIds,
  PuckAgentHandler
} from "../puck/puckAgentBridge";

const APP_ID = "app-1";

const stubHandler = (over: Partial<PuckAgentHandler>): PuckAgentHandler => ({
  getSnapshot: () => ({
    applicationId: APP_ID,
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
  listOperations: () => [],
  addOperation: (input) => ({
    id: input.id ?? "op",
    name: input.name ?? "op",
    workflowId: input.workflowId,
    inputs: input.inputs ?? {},
    outputs: input.outputs ?? {},
    policy: input.policy ?? "replace"
  }),
  updateOperation: () => null,
  removeOperation: () => true,
  listVariables: () => [],
  declareVariable: (input) => ({
    id: input.id ?? "v",
    name: input.name ?? "v",
    type: null,
    scope: input.scope ?? "instance",
    persist: false
  }),
  updateVariable: () => null,
  removeVariable: () => true,
  listResources: () => [],
  addResource: (input) => ({
    id: input.id ?? "r",
    name: input.name ?? "r",
    kind: input.kind,
    scope: input.scope,
    operations: input.operations ?? ["read"]
  }),
  removeResource: () => true,
  getBindingTargets: () => ({
    operations: [],
    variables: [],
    resources: []
  }),
  document: () => ({
    schemaVersion: 3,
    ui: { root: { props: {} }, content: [], zones: {} },
    operations: [],
    resources: [],
    variables: []
  }),
  ...over
});

const restFetchMock = restFetch as jest.MockedFunction<typeof restFetch>;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  stub<Response>({
    ok,
    status,
    json: async () => body
  });

const ctx = { getState: () => stub<FrontendToolState>({}) };

afterEach(() => {
  for (const id of listOpenPuckApplicationIds()) setPuckAgentHandler(id, null);
  restFetchMock.mockReset();
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
    setPuckAgentHandler(APP_ID, stubHandler({ addComponent }));

    const result = (await FrontendToolRegistry.call(
      "ui_app_add_component",
      { application_id: APP_ID, type: "Button", props: { label: "Go" } },
      "call-1",
      ctx
    )) as { ok: boolean };

    expect(addComponent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "Button" })
    );
    expect(result.ok).toBe(true);
  });

  it("throws a helpful error when no app builder is open for the application", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_app_get_snapshot",
        { application_id: APP_ID },
        "call-2",
        ctx
      )
    ).rejects.toThrow(/No app builder is open for application "app-1"/);
  });

  it("routes each tool to the handler for the requested application", async () => {
    const removeA = jest.fn(() => true);
    const removeB = jest.fn(() => true);
    setPuckAgentHandler("app-a", stubHandler({ removeComponent: removeA }));
    setPuckAgentHandler("app-b", stubHandler({ removeComponent: removeB }));

    await FrontendToolRegistry.call(
      "ui_app_remove_component",
      { application_id: "app-b", id: "widget-1" },
      "call-3",
      ctx
    );

    expect(removeB).toHaveBeenCalledWith("widget-1");
    expect(removeA).not.toHaveBeenCalled();
  });
});

describe("ui_app_* authoring tools", () => {
  it("registers a tool for every authoring concept", () => {
    for (const name of [
      "ui_app_list_operations",
      "ui_app_add_operation",
      "ui_app_update_operation",
      "ui_app_remove_operation",
      "ui_app_list_variables",
      "ui_app_declare_variable",
      "ui_app_update_variable",
      "ui_app_remove_variable",
      "ui_app_list_resources",
      "ui_app_add_resource",
      "ui_app_remove_resource",
      "ui_app_get_binding_targets"
    ]) {
      expect(FrontendToolRegistry.has(name)).toBe(true);
    }
  });

  it("maps ui_app_add_operation args onto the operation binding", async () => {
    const addOperation = jest.fn(() => ({
      id: "translate",
      name: "Translate",
      workflowId: "wf-2",
      inputs: {},
      outputs: {},
      policy: "queue" as const
    }));
    setPuckAgentHandler(APP_ID, stubHandler({ addOperation }));

    const result = (await FrontendToolRegistry.call(
      "ui_app_add_operation",
      {
        application_id: APP_ID,
        id: "translate",
        name: "Translate",
        target_workflow_id: "wf-2",
        policy: "queue",
        inputs: { "node-1": { from: "variable", variableId: "lang" } },
        outputs: { "node-9": { to: "variable", variableId: "result" } },
        timeout_ms: 5000
      },
      "call-op",
      ctx
    )) as { ok: boolean };

    expect(addOperation).toHaveBeenCalledWith({
      id: "translate",
      name: "Translate",
      workflowId: "wf-2",
      workflowVersion: undefined,
      policy: "queue",
      inputs: { "node-1": { from: "variable", variableId: "lang" } },
      outputs: { "node-9": { to: "variable", variableId: "result" } },
      timeoutMs: 5000
    });
    expect(result.ok).toBe(true);
  });

  it("reports a missing operation instead of throwing", async () => {
    setPuckAgentHandler(APP_ID, stubHandler({ updateOperation: () => null }));

    const result = (await FrontendToolRegistry.call(
      "ui_app_update_operation",
      { application_id: APP_ID, id: "nope", name: "x" },
      "call-op-missing",
      ctx
    )) as { ok: boolean; error?: string };

    expect(result).toEqual({ ok: false, error: "No operation with id nope" });
  });

  it("passes only the fields the caller sent to updateOperation", async () => {
    const updateOperation = jest.fn(() => null);
    setPuckAgentHandler(APP_ID, stubHandler({ updateOperation }));

    await FrontendToolRegistry.call(
      "ui_app_update_operation",
      { application_id: APP_ID, id: "main", policy: "parallel" },
      "call-op-patch",
      ctx
    );

    expect(updateOperation).toHaveBeenCalledWith("main", {
      policy: "parallel"
    });
  });

  it("declares a variable through the handler", async () => {
    const declareVariable = jest.fn(() => ({
      id: "lang",
      name: "Language",
      type: { type: "str" },
      scope: "user" as const,
      persist: true
    }));
    setPuckAgentHandler(APP_ID, stubHandler({ declareVariable }));

    const result = (await FrontendToolRegistry.call(
      "ui_app_declare_variable",
      {
        application_id: APP_ID,
        id: "lang",
        name: "Language",
        type: { type: "str" },
        default: "en",
        scope: "user",
        persist: true
      },
      "call-var",
      ctx
    )) as { ok: boolean; variable: { id: string } };

    expect(declareVariable).toHaveBeenCalledWith({
      id: "lang",
      name: "Language",
      type: { type: "str" },
      default: "en",
      scope: "user",
      persist: true
    });
    expect(result.variable.id).toBe("lang");
  });

  it("adds a resource binding with its scope split out of the flat args", async () => {
    const addResource = jest.fn(() => ({
      id: "shots",
      name: "Shots",
      kind: "asset" as const,
      scope: { projectId: "proj-1" },
      operations: ["read" as const]
    }));
    setPuckAgentHandler(APP_ID, stubHandler({ addResource }));

    await FrontendToolRegistry.call(
      "ui_app_add_resource",
      {
        application_id: APP_ID,
        name: "Shots",
        kind: "asset",
        project_id: "proj-1",
        operations: ["read", "update"]
      },
      "call-res",
      ctx
    );

    expect(addResource).toHaveBeenCalledWith({
      id: undefined,
      name: "Shots",
      kind: "asset",
      scope: { projectId: "proj-1", fixedId: undefined },
      operations: ["read", "update"]
    });
  });

  it("returns the binding targets the handler reports", async () => {
    setPuckAgentHandler(
      APP_ID,
      stubHandler({
        getBindingTargets: () => ({
          operations: [
            {
              operationId: "main",
              name: "Run",
              workflowId: "wf-2",
              ioAvailable: true,
              inputs: [
                {
                  nodeId: "n1",
                  name: "prompt",
                  label: "Prompt",
                  binding: "op:main/in:n1"
                }
              ],
              outputs: [],
              execution: [
                { field: "running", binding: "op:main/exec#running" }
              ]
            }
          ],
          variables: [
            {
              id: "lang",
              name: "Language",
              scope: "instance",
              persist: false,
              binding: "var:lang"
            }
          ],
          resources: []
        })
      })
    );

    const result = (await FrontendToolRegistry.call(
      "ui_app_get_binding_targets",
      { application_id: APP_ID },
      "call-targets",
      ctx
    )) as {
      ok: boolean;
      operations: { inputs: { binding: string }[] }[];
      variables: { binding: string }[];
    };

    expect(result.ok).toBe(true);
    expect(result.operations[0].inputs[0].binding).toBe("op:main/in:n1");
    expect(result.variables[0].binding).toBe("var:lang");
  });
});

describe("ui_app_debug", () => {
  const draft = {
    schemaVersion: 3,
    ui: { root: { props: { title: "Draft" } }, content: [], zones: {} },
    operations: [
      {
        id: "main",
        name: "Main",
        workflowId: "wf-1",
        inputs: {},
        outputs: {},
        policy: "replace" as const
      }
    ],
    resources: [],
    variables: []
  };

  it("is registered", () => {
    expect(FrontendToolRegistry.has("ui_app_debug")).toBe(true);
  });

  it("posts the handler's live document and returns the report", async () => {
    setPuckAgentHandler(APP_ID, stubHandler({ document: () => draft }));
    restFetchMock.mockResolvedValue(
      jsonResponse({
        status: "ok",
        verdict: { ok: true, headline: "3 widgets wired", issues: [], warnings: [] },
        widgets: [{ id: "w1", type: "Text", binding: "op:main/out:n9" }]
      })
    );

    const result = (await FrontendToolRegistry.call(
      "ui_app_debug",
      { application_id: APP_ID, run: false, params: { prompt: "hi" } },
      "call-debug",
      ctx
    )) as { ok: boolean; verdict: { ok: boolean } };

    expect(restFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = restFetchMock.mock.calls[0];
    expect(path).toBe("/api/applications/debug");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      document: draft,
      params: { prompt: "hi" },
      run: false
    });
    expect(result.ok).toBe(true);
    expect(result.verdict.ok).toBe(true);
  });

  it("forwards scripted interactions and the timeout", async () => {
    setPuckAgentHandler(APP_ID, stubHandler({ document: () => draft }));
    restFetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await FrontendToolRegistry.call(
      "ui_app_debug",
      {
        application_id: APP_ID,
        run: true,
        interact: [{ set: { key: "op:main/in:n1", value: "hi" } }, { run: "main" }],
        timeout_ms: 30000
      },
      "call-debug-interact",
      ctx
    );

    const body = JSON.parse(String(restFetchMock.mock.calls[0][1]?.body));
    expect(body.run).toBe(true);
    expect(body.timeout_ms).toBe(30000);
    expect(body.interact).toEqual([
      { set: { key: "op:main/in:n1", value: "hi" } },
      { run: "main" }
    ]);
  });

  it("reports a server error instead of throwing", async () => {
    setPuckAgentHandler(APP_ID, stubHandler({ document: () => draft }));
    restFetchMock.mockResolvedValue(
      jsonResponse({ detail: "workflow wf-1 not found" }, false, 404)
    );

    const result = (await FrontendToolRegistry.call(
      "ui_app_debug",
      { application_id: APP_ID },
      "call-debug-err",
      ctx
    )) as { ok: boolean; error?: string };

    expect(result).toEqual({ ok: false, error: "workflow wf-1 not found" });
  });

  it("errors when no app builder is open for the application", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_app_debug",
        { application_id: APP_ID },
        "call-debug-noop",
        ctx
      )
    ).rejects.toThrow(/No app builder is open for application "app-1"/);
    expect(restFetchMock).not.toHaveBeenCalled();
  });
});
