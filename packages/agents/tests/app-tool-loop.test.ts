/**
 * Tests for the App Builder headless tool-loop surface
 * (`src/evals/surfaces/app.ts`):
 *   - `createAppToolBridge`: headless execution of the `ui_app_*` tool contract
 *     against an in-memory Puck document tree (top-level content + slot props).
 *   - `APP_TOOL_LOOP_CASES`: each case is solvable end-to-end via
 *     `runToolLoopEval` driven by a scripted provider — no network.
 */
import { describe, it, expect } from "vitest";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import { WIDGET_CATALOG } from "@nodetool-ai/app-runtime";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createAppToolBridge,
  APP_TOOL_LOOP_CASES
} from "../src/evals/surfaces/app.js";

// --- scripted provider -------------------------------------------------------

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider that replays one scripted list of tool calls through the tool
 * `execute` closures (mirroring how a real provider's `generateLoop` dispatches
 * self-executing tools), then ends the turn.
 */
function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

const APP = "app-under-test";

// --- createAppToolBridge -----------------------------------------------------

describe("createAppToolBridge", () => {
  it("exposes exactly the 19 ui_app_* tools the frontend registers", () => {
    const bridge = createAppToolBridge();
    const names = bridge.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "ui_app_add_component",
        "ui_app_add_operation",
        "ui_app_add_resource",
        "ui_app_declare_variable",
        "ui_app_get_binding_targets",
        "ui_app_get_snapshot",
        "ui_app_list_component_types",
        "ui_app_list_operations",
        "ui_app_list_resources",
        "ui_app_list_variables",
        "ui_app_remove_component",
        "ui_app_remove_operation",
        "ui_app_remove_resource",
        "ui_app_remove_variable",
        "ui_app_select_component",
        "ui_app_set_title",
        "ui_app_update_component",
        "ui_app_update_operation",
        "ui_app_update_variable"
      ].sort()
    );
  });

  it("adds two top-level widgets and lists them in a snapshot", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "Heading"
    });
    await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "TextInput"
    });

    const snap = (await byName["ui_app_get_snapshot"].execute({
      application_id: APP
    })) as {
      ok: boolean;
      applicationId: string;
      components: { type: string; parentId: string | null }[];
    };
    expect(snap.ok).toBe(true);
    // Snapshot carries the application id, matching the real getSnapshot shape.
    expect(snap.applicationId).toBe(APP);
    expect(snap.components.map((c) => c.type)).toEqual(["Heading", "TextInput"]);
    expect(snap.components.every((c) => c.parentId === null)).toBe(true);

    const final = bridge.finalState();
    expect(final.components).toHaveLength(2);
    // Adding does NOT change the selection (matches PuckAgentBinder.addComponent
    // — selection is only touched by ui_app_select_component).
    expect(final.selectedId).toBeNull();
  });

  it("lists component types including the layout slots", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const listed = (await byName["ui_app_list_component_types"].execute({
      application_id: APP
    })) as {
      types: { type: string; fields: { name: string; type: string }[] }[];
    };
    const columns = listed.types.find((t) => t.type === "Columns");
    expect(columns?.fields.filter((f) => f.type === "slot").map((f) => f.name)).toEqual([
      "left",
      "right"
    ]);
  });

  it("offers every widget in the shared catalog, not a subset", async () => {
    // This list used to be a hand-copied subset, so a model driving the bridge
    // never saw the widgets the editor had gained since (Table, Tabs, the
    // resource widgets, …) and the eval scored a smaller surface than ships.
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const listed = (await byName["ui_app_list_component_types"].execute({
      application_id: APP
    })) as {
      types: { type: string; label: string; fields: { name: string }[] }[];
    };
    expect(listed.types.map((t) => t.type).sort()).toEqual(
      Object.keys(WIDGET_CATALOG).sort()
    );
    const table = listed.types.find((t) => t.type === "Table");
    expect(table?.label).toBe("Table");
    expect(table?.fields.map((f) => f.name)).toContain("binding");

    const snap = (await byName["ui_app_get_snapshot"].execute({
      application_id: APP
    })) as { componentTypes: string[] };
    expect(snap.componentTypes.sort()).toEqual(Object.keys(WIDGET_CATALOG).sort());
  });

  it("nests a widget inside the Tabs widget's slots", async () => {
    const bridge = createAppToolBridge({
      components: [{ type: "Tabs", id: "tabs-1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "Table",
      parent_id: "tabs-1",
      slot: "tab2"
    });
    const nested = bridge.finalState().components.find((c) => c.type === "Table");
    expect(nested).toMatchObject({ parentId: "tabs-1", slot: "tab2" });
  });

  it("nests a widget inside a Panel's content slot", async () => {
    const bridge = createAppToolBridge({
      components: [{ type: "Container", id: "panel-1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const added = (await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "Text",
      parent_id: "panel-1",
      slot: "content"
    })) as { ok: boolean; component: { parentId: string; slot: string } };
    expect(added.ok).toBe(true);
    expect(added.component.parentId).toBe("panel-1");
    expect(added.component.slot).toBe("content");

    const final = bridge.finalState();
    const text = final.components.find((c) => c.type === "Text");
    expect(text?.parentId).toBe("panel-1");
    expect(text?.slot).toBe("content");
  });

  it("add with an unknown parent silently no-ops (matches the real tool)", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    // The real puckDataOps.addComponent leaves the tree unchanged for an
    // unknown parent and still returns ok:true, echoing the caller's slot.
    const added = (await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "Text",
      parent_id: "does-not-exist",
      slot: "content"
    })) as {
      ok: boolean;
      component: { parentId: string | null; slot: string | null };
    };
    expect(added.ok).toBe(true);
    expect(added.component.parentId).toBe("does-not-exist");
    expect(added.component.slot).toBe("content");
    // Nothing was actually inserted, and the phantom node isn't selected.
    expect(bridge.finalState().components).toHaveLength(0);
    expect(bridge.finalState().selectedId).toBeNull();
  });

  it("removing a Panel drops its nested children too", async () => {
    const bridge = createAppToolBridge({
      components: [
        {
          type: "Container",
          id: "panel-1",
          slots: { content: [{ type: "Text", id: "text-1" }] }
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    expect(bridge.finalState().components).toHaveLength(2);
    const result = (await byName["ui_app_remove_component"].execute({
      application_id: APP,
      id: "panel-1"
    })) as { ok: boolean; removed_id: string | null };
    expect(result.ok).toBe(true);
    expect(bridge.finalState().components).toHaveLength(0);
  });

  it("update_component merges props but never changes the id", async () => {
    const bridge = createAppToolBridge({
      components: [{ type: "Button", id: "btn-1", props: { label: "Run" } }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_update_component"].execute({
      application_id: APP,
      id: "btn-1",
      props: { label: "Submit", id: "hacked" }
    });
    const btn = bridge.finalState().components.find((c) => c.id === "btn-1");
    expect(btn?.props.label).toBe("Submit");
    // Id override is ignored.
    expect(bridge.finalState().components.map((c) => c.id)).toEqual(["btn-1"]);
  });

  it("update_component returns an error result for an unknown id", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const result = (await byName["ui_app_update_component"].execute({
      application_id: APP,
      id: "nope",
      props: { label: "x" }
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No widget/);
  });

  it("adds an unknown widget type permissively (matches the real tool)", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    // The real tool/handler doesn't validate type — Puck inserts any string —
    // so the bridge must not error on an unrecognized type.
    const added = (await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "NotAWidget"
    })) as { ok: boolean; component: { type: string } };
    expect(added.ok).toBe(true);
    expect(added.component.type).toBe("NotAWidget");
    expect(bridge.finalState().components).toHaveLength(1);
  });

  it("selecting an unknown id clears the selection (mirrors Puck)", async () => {
    const bridge = createAppToolBridge({
      components: [{ type: "Button", id: "btn-1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_select_component"].execute({
      application_id: APP,
      id: "btn-1"
    });
    expect(bridge.finalState().selectedId).toBe("btn-1");

    await byName["ui_app_select_component"].execute({
      application_id: APP,
      id: "does-not-exist"
    });
    expect(bridge.finalState().selectedId).toBeNull();
  });

  it("removing a parent clears a selection nested under it", async () => {
    const bridge = createAppToolBridge({
      components: [
        {
          type: "Container",
          id: "panel-1",
          slots: { content: [{ type: "Text", id: "text-1" }] }
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_select_component"].execute({
      application_id: APP,
      id: "text-1"
    });
    expect(bridge.finalState().selectedId).toBe("text-1");

    // Removing the panel drops the nested Text too, so the selection must clear.
    await byName["ui_app_remove_component"].execute({
      application_id: APP,
      id: "panel-1"
    });
    expect(bridge.finalState().components).toHaveLength(0);
    expect(bridge.finalState().selectedId).toBeNull();
  });

  it("generated ids never collide with an explicitly seeded id", async () => {
    // Seed a widget whose id matches the generated `${type}-${n}` pattern.
    const bridge = createAppToolBridge({
      components: [{ type: "Heading", id: "Heading-1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_add_component"].execute({
      application_id: APP,
      type: "Heading"
    });
    const ids = bridge.finalState().components.map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // no duplicates
    expect(ids).toContain("Heading-1");
  });

  it("set_title updates the snapshot root props", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_app_set_title"].execute({
      application_id: APP,
      title: "My App"
    });
    expect(bridge.finalState().title).toBe("My App");
    const snap = (await byName["ui_app_get_snapshot"].execute({
      application_id: APP
    })) as { rootProps: { title?: string } };
    expect(snap.rootProps.title).toBe("My App");
  });
});

// --- document meta tools (shared app-runtime doc-ops) ------------------------

describe("createAppToolBridge document meta", () => {
  const bridgeTools = (bridge: ReturnType<typeof createAppToolBridge>) =>
    Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

  it("adds, updates, lists, and removes an operation", async () => {
    const bridge = createAppToolBridge({ workflowId: "wf-app" });
    const byName = bridgeTools(bridge);

    const added = (await byName["ui_app_add_operation"].execute({
      application_id: APP,
      name: "Translate Title",
      target_workflow_id: "wf-app",
      inputs: { "in-1": { from: "widget" } }
    })) as { ok: boolean; operation: { id: string; policy: string } };
    expect(added.ok).toBe(true);
    // Id is derived from the name by the shared doc-ops.
    expect(added.operation.id).toBe("translate_title");
    expect(added.operation.policy).toBe("replace");

    // Mappings merge per node id, so one input can be remapped alone.
    await byName["ui_app_update_operation"].execute({
      application_id: APP,
      id: "translate_title",
      policy: "queue",
      inputs: { "in-2": { from: "constant", value: 7 } }
    });
    const listed = (await byName["ui_app_list_operations"].execute({
      application_id: APP
    })) as { operations: { id: string; policy: string; inputs: object }[] };
    expect(listed.operations).toHaveLength(1);
    expect(listed.operations[0].policy).toBe("queue");
    expect(listed.operations[0].inputs).toEqual({
      "in-1": { from: "widget" },
      "in-2": { from: "constant", value: 7 }
    });

    const removed = (await byName["ui_app_remove_operation"].execute({
      application_id: APP,
      id: "translate_title"
    })) as { ok: boolean; removed_id: string | null };
    expect(removed.ok).toBe(true);
    expect(bridge.finalState().operations).toEqual([]);
  });

  it("update_operation returns an error result for an unknown id", async () => {
    const byName = bridgeTools(createAppToolBridge());
    const result = (await byName["ui_app_update_operation"].execute({
      application_id: APP,
      id: "nope",
      policy: "parallel"
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No operation/);
  });

  it("only lets a user-scoped variable persist", async () => {
    const bridge = createAppToolBridge();
    const byName = bridgeTools(bridge);

    const instance = (await byName["ui_app_declare_variable"].execute({
      application_id: APP,
      id: "draft",
      scope: "instance",
      persist: true
    })) as { variable: { persist: boolean } };
    expect(instance.variable.persist).toBe(false);

    const user = (await byName["ui_app_declare_variable"].execute({
      application_id: APP,
      id: "theme",
      scope: "user",
      persist: true
    })) as { variable: { persist: boolean } };
    expect(user.variable.persist).toBe(true);

    // Narrowing the scope clears persist, the same rule the parser enforces.
    const narrowed = (await byName["ui_app_update_variable"].execute({
      application_id: APP,
      id: "theme",
      scope: "instance"
    })) as { variable: { persist: boolean } };
    expect(narrowed.variable.persist).toBe(false);

    await byName["ui_app_remove_variable"].execute({
      application_id: APP,
      id: "draft"
    });
    const listed = (await byName["ui_app_list_variables"].execute({
      application_id: APP
    })) as { variables: { id: string }[] };
    expect(listed.variables.map((v) => v.id)).toEqual(["theme"]);
    expect(bridge.finalState().variables.map((v) => v.id)).toEqual(["theme"]);
  });

  it("adds a resource binding defaulting to read-only, and removes it", async () => {
    const bridge = createAppToolBridge();
    const byName = bridgeTools(bridge);

    const added = (await byName["ui_app_add_resource"].execute({
      application_id: APP,
      name: "Shots",
      kind: "timeline",
      project_id: "proj-1"
    })) as { resource: { id: string; operations: string[] } };
    expect(added.resource).toMatchObject({
      id: "shots",
      operations: ["read"]
    });
    expect(bridge.finalState().resources).toHaveLength(1);

    await byName["ui_app_remove_resource"].execute({
      application_id: APP,
      id: "shots"
    });
    expect(bridge.finalState().resources).toEqual([]);
  });

  it("rejects a resource binding with no scope", async () => {
    const byName = bridgeTools(createAppToolBridge());
    await expect(
      byName["ui_app_add_resource"].execute({
        application_id: APP,
        kind: "asset"
      })
    ).rejects.toThrow(/needs a scope/);
  });

  it("reports the implicit operation's binding tokens for the host workflow", async () => {
    const byName = bridgeTools(
      createAppToolBridge({
        workflowId: "wf-app",
        workflow: {
          inputs: [{ nodeId: "in-1", name: "prompt", label: "Prompt" }],
          outputs: [{ nodeId: "out-1", name: "answer", label: "Answer" }],
          variables: ["channel"]
        }
      })
    );
    const targets = (await byName["ui_app_get_binding_targets"].execute({
      application_id: APP
    })) as {
      operations: {
        operationId: string;
        ioAvailable: boolean;
        inputs: { binding: string }[];
        outputs: { binding: string }[];
      }[];
      variables: { binding: string }[];
    };
    expect(targets.operations).toHaveLength(1);
    expect(targets.operations[0].operationId).toBe("main");
    expect(targets.operations[0].ioAvailable).toBe(true);
    expect(targets.operations[0].inputs[0].binding).toBe("op:main/in:in-1");
    expect(targets.operations[0].outputs[0].binding).toBe("op:main/out:out-1");
    // SetVariable channels show up next to declared variables.
    expect(targets.variables.map((v) => v.binding)).toEqual(["var:channel"]);
  });

  it("reports no node targets for an operation over another workflow", async () => {
    const byName = bridgeTools(
      createAppToolBridge({
        workflowId: "wf-app",
        workflow: {
          inputs: [{ nodeId: "in-1", name: "prompt", label: "Prompt" }],
          outputs: [],
          variables: []
        }
      })
    );
    await byName["ui_app_add_operation"].execute({
      application_id: APP,
      id: "other",
      target_workflow_id: "wf-elsewhere"
    });
    const targets = (await byName["ui_app_get_binding_targets"].execute({
      application_id: APP
    })) as {
      operations: { ioAvailable: boolean; inputs: unknown[] }[];
    };
    expect(targets.operations[0]).toMatchObject({
      ioAvailable: false,
      inputs: []
    });
  });
});

// --- APP_TOOL_LOOP_CASES via runToolLoopEval ---------------------------------

describe("APP_TOOL_LOOP_CASES", () => {
  it("build-form: title + heading + text input + button passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_app_set_title", args: { application_id: APP, title: "Ask the AI" } },
      { name: "ui_app_add_component", args: { application_id: APP, type: "Heading" } },
      { name: "ui_app_add_component", args: { application_id: APP, type: "TextInput" } },
      { name: "ui_app_add_component", args: { application_id: APP, type: "Button" } }
    ];
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "test-model",
      cases: [APP_TOOL_LOOP_CASES[0]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("nest-in-panel: nesting a Text inside the seeded Panel passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_app_get_snapshot", args: { application_id: APP } },
      {
        name: "ui_app_add_component",
        args: {
          application_id: APP,
          type: "Text",
          parent_id: "panel-1",
          slot: "content"
        }
      }
    ];
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "test-model",
      cases: [APP_TOOL_LOOP_CASES[1]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("relabel-and-remove: relabel the button and delete the text passes", async () => {
    const script: ScriptedCall[] = [
      {
        name: "ui_app_update_component",
        args: { application_id: APP, id: "btn-1", props: { label: "Submit" } }
      },
      { name: "ui_app_remove_component", args: { application_id: APP, id: "text-1" } }
    ];
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "test-model",
      cases: [APP_TOOL_LOOP_CASES[2]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("bind-widgets-to-workflow: binding both widgets to the looked-up tokens passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_app_get_binding_targets", args: { application_id: APP } },
      {
        name: "ui_app_update_component",
        args: {
          application_id: APP,
          id: "input-1",
          props: { binding: "op:main/in:in-1" }
        }
      },
      {
        name: "ui_app_update_component",
        args: {
          application_id: APP,
          id: "text-1",
          props: { binding: "op:main/out:out-1" }
        }
      }
    ];
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "test-model",
      cases: [APP_TOOL_LOOP_CASES[3]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("declare-and-bind-variable: declaring a persisted variable and binding the Switch passes", async () => {
    const script: ScriptedCall[] = [
      {
        name: "ui_app_declare_variable",
        args: {
          application_id: APP,
          id: "dark_mode",
          name: "Dark mode",
          scope: "user",
          persist: true
        }
      },
      {
        name: "ui_app_update_component",
        args: {
          application_id: APP,
          id: "switch-1",
          props: { binding: "var:dark_mode" }
        }
      }
    ];
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "test-model",
      cases: [APP_TOOL_LOOP_CASES[4]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("tabbed-results: nesting a Table in the Tabs widget's first tab passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_app_list_component_types", args: { application_id: APP } },
      {
        name: "ui_app_get_binding_targets",
        args: { application_id: APP }
      },
      {
        name: "ui_app_add_component",
        args: {
          application_id: APP,
          type: "Table",
          parent_id: "tabs-1",
          slot: "tab1",
          props: { binding: "op:main/out:out-1" }
        }
      }
    ];
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "test-model",
      cases: [APP_TOOL_LOOP_CASES[5]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });
});
