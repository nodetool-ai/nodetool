/**
 * Regression tests for the three `ui_app_*` defects a real app-building
 * session produced: an interaction script guessed twice with the same
 * unhelpful error, an input mapping rejected with a raw Zod dump, and an add
 * that returned nothing the next call could address.
 */
jest.mock("../../rest-fetch", () => ({
  restFetch: jest.fn()
}));

import type { FrontendToolState } from "../frontendTools";
import { stub } from "../../../test-utils/doubles";
import { restFetch } from "../../rest-fetch";
import { FrontendToolRegistry } from "../frontendTools";
import "../builtin/puck";
import {
  setPuckAgentHandler,
  listOpenPuckApplicationIds,
  PuckAgentHandler,
  PuckSnapshot
} from "../../../components/appbuilder/puck/puckAgentBridge";

const APP_ID = "app-1";

const emptySnapshot: PuckSnapshot = {
  applicationId: APP_ID,
  rootProps: {},
  selectedId: null,
  componentTypes: [],
  components: []
};

const stubHandler = (over: Partial<PuckAgentHandler>): PuckAgentHandler => ({
  getSnapshot: () => emptySnapshot,
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
  updateOperation: (id, patch) => ({
    id,
    name: "op",
    workflowId: "wf-1",
    inputs: {},
    outputs: {},
    policy: "replace",
    ...patch
  }),
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

const jsonResponse = (body: unknown): Response =>
  stub<Response>({ ok: true, status: 200, json: async () => body });

const ctx = { getState: () => stub<FrontendToolState>({}) };

const call = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(name, args, `call-${name}`, ctx);

/** The tool's JSON schema as flat text, with JSON's own quote escaping undone
 * so an example written into a description reads the way an agent sees it. */
const schemaText = (name: string): string => {
  const entry = FrontendToolRegistry.getManifest().find((t) => t.name === name);
  if (!entry) {
    throw new Error(`tool ${name} is not registered`);
  }
  return JSON.stringify(entry.parameters).replace(/\\"/g, '"');
};

afterEach(() => {
  for (const id of listOpenPuckApplicationIds()) setPuckAgentHandler(id, null);
  restFetchMock.mockReset();
});

describe("ui_app_add_component identifies what it created", () => {
  it("returns the new widget's id and type at the top level", async () => {
    setPuckAgentHandler(
      APP_ID,
      stubHandler({
        addComponent: () => ({
          id: "Heading-7",
          type: "Heading",
          props: { id: "Heading-7", text: "Hi" },
          parentId: "Panel-1",
          slot: "content"
        })
      })
    );

    const result = (await call("ui_app_add_component", {
      application_id: APP_ID,
      type: "Heading",
      props: { text: "Hi" }
    })) as {
      ok: boolean;
      id: string;
      type: string;
      parent_id: string | null;
      slot: string | null;
    };

    expect(result.ok).toBe(true);
    expect(result.id).toBe("Heading-7");
    expect(result.type).toBe("Heading");
    expect(result.parent_id).toBe("Panel-1");
    expect(result.slot).toBe("content");
  });

  it("fails loudly when the editor reports no widget id", async () => {
    setPuckAgentHandler(
      APP_ID,
      stubHandler({
        addComponent: () => null as never
      })
    );

    await expect(
      call("ui_app_add_component", { application_id: APP_ID, type: "Heading" })
    ).rejects.toThrow(/Heading.*no widget id/s);
  });
});

describe("ui_app_update_operation input mappings", () => {
  it("names the four mapping forms when `from` is wrong", async () => {
    setPuckAgentHandler(APP_ID, stubHandler({}));

    await expect(
      call("ui_app_update_operation", {
        application_id: APP_ID,
        id: "main",
        inputs: { string_input: { from: "input" } }
      })
    ).rejects.toThrow(
      /inputs\["string_input"\].*"input".*widget.*variable.*constant.*resource/s
    );
  });

  it("names the field a mapping form requires", async () => {
    setPuckAgentHandler(APP_ID, stubHandler({}));

    await expect(
      call("ui_app_update_operation", {
        application_id: APP_ID,
        id: "main",
        inputs: { string_input: { from: "variable" } }
      })
    ).rejects.toThrow(/variableId/);
  });

  it("passes a valid mapping through unchanged", async () => {
    const updateOperation = jest.fn(() => null);
    setPuckAgentHandler(APP_ID, stubHandler({ updateOperation }));

    await call("ui_app_update_operation", {
      application_id: APP_ID,
      id: "main",
      inputs: { n1: { from: "constant", value: "en" } },
      outputs: { n9: { to: "variable", variableId: "result" } }
    });

    expect(updateOperation).toHaveBeenCalledWith("main", {
      inputs: { n1: { from: "constant", value: "en" } },
      outputs: { n9: { to: "variable", variableId: "result" } }
    });
  });

  it("shows a mapping example in the JSON schema an agent reads", () => {
    const text = schemaText("ui_app_update_operation");
    expect(text).toContain('{"from":"variable","variableId":');
    expect(text).toContain('{"to":"variable","variableId":');
  });
});

describe("ui_app_debug interaction steps", () => {
  const withWidgets = () =>
    setPuckAgentHandler(
      APP_ID,
      stubHandler({
        getSnapshot: () => ({
          ...emptySnapshot,
          components: [
            {
              id: "Button-1",
              type: "Button",
              props: { id: "Button-1", label: "Run" },
              parentId: null,
              slot: null
            },
            {
              id: "TextInput-1",
              type: "TextInput",
              props: { id: "TextInput-1", label: "Prompt" },
              parentId: null,
              slot: null
            }
          ]
        })
      })
    );

  it("rejects a step whose shape is not one of the six forms", async () => {
    withWidgets();

    await expect(
      call("ui_app_debug", {
        application_id: APP_ID,
        interact: [{ action: "change", target: "TextInput-1", value: "hi" }]
      })
    ).rejects.toThrow(
      /step 1.*action, target, value.*"click".*"change".*"seedResource"/s
    );
    expect(restFetchMock).not.toHaveBeenCalled();
  });

  it("lists the widgets that exist when a target matches none", async () => {
    withWidgets();

    await expect(
      call("ui_app_debug", {
        application_id: APP_ID,
        interact: [{ click: "Submit" }]
      })
    ).rejects.toThrow(
      /no widget matches "Submit".*Button-1 \(Button, label "Run"\).*TextInput-1 \(TextInput, label "Prompt"\)/s
    );
    expect(restFetchMock).not.toHaveBeenCalled();
  });

  it("accepts a target that matches by type or label", async () => {
    withWidgets();
    restFetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await call("ui_app_debug", {
      application_id: APP_ID,
      interact: [{ click: "Run" }, { change: "TextInput", value: "hi" }]
    });

    const body = JSON.parse(String(restFetchMock.mock.calls[0][1]?.body));
    expect(body.interact).toEqual([
      { click: "Run" },
      { change: "TextInput", value: "hi" }
    ]);
  });

  it("does not check operation ids against widgets", async () => {
    withWidgets();
    restFetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await call("ui_app_debug", {
      application_id: APP_ID,
      interact: [
        { set: { key: "op:main/in:n1", value: "hi" } },
        { run: "main" },
        { cancel: "main" },
        { seedResource: { id: "shots", items: [{ id: "a" }] } }
      ]
    });

    expect(restFetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows every step form in the JSON schema an agent reads", () => {
    const text = schemaText("ui_app_debug");
    for (const form of [
      "seedResource",
      "operationId",
      '{"click":"',
      '{"run":"'
    ]) {
      expect(text).toContain(form);
    }
  });
});
