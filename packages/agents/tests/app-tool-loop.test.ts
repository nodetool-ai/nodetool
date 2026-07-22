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

const WF = "wf-under-test";

// --- createAppToolBridge -----------------------------------------------------

describe("createAppToolBridge", () => {
  it("exposes exactly the 7 ui_app_* tools", () => {
    const bridge = createAppToolBridge();
    const names = bridge.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "ui_app_add_component",
        "ui_app_get_snapshot",
        "ui_app_list_component_types",
        "ui_app_remove_component",
        "ui_app_select_component",
        "ui_app_set_title",
        "ui_app_update_component"
      ].sort()
    );
  });

  it("adds two top-level widgets and lists them in a snapshot", async () => {
    const bridge = createAppToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_app_add_component"].execute({
      workflow_id: WF,
      type: "Heading"
    });
    await byName["ui_app_add_component"].execute({
      workflow_id: WF,
      type: "TextInput"
    });

    const snap = (await byName["ui_app_get_snapshot"].execute({
      workflow_id: WF
    })) as {
      ok: boolean;
      workflowId: string;
      components: { type: string; parentId: string | null }[];
    };
    expect(snap.ok).toBe(true);
    // Snapshot carries the workflow id, matching the real getSnapshot shape.
    expect(snap.workflowId).toBe(WF);
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
      workflow_id: WF
    })) as {
      types: { type: string; fields: { name: string; type: string }[] }[];
    };
    const columns = listed.types.find((t) => t.type === "Columns");
    expect(columns?.fields.filter((f) => f.type === "slot").map((f) => f.name)).toEqual([
      "left",
      "right"
    ]);
  });

  it("nests a widget inside a Panel's content slot", async () => {
    const bridge = createAppToolBridge({
      components: [{ type: "Container", id: "panel-1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const added = (await byName["ui_app_add_component"].execute({
      workflow_id: WF,
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
      workflow_id: WF,
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
      workflow_id: WF,
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
      workflow_id: WF,
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
      workflow_id: WF,
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
      workflow_id: WF,
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
      workflow_id: WF,
      id: "btn-1"
    });
    expect(bridge.finalState().selectedId).toBe("btn-1");

    await byName["ui_app_select_component"].execute({
      workflow_id: WF,
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
      workflow_id: WF,
      id: "text-1"
    });
    expect(bridge.finalState().selectedId).toBe("text-1");

    // Removing the panel drops the nested Text too, so the selection must clear.
    await byName["ui_app_remove_component"].execute({
      workflow_id: WF,
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
      workflow_id: WF,
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
      workflow_id: WF,
      title: "My App"
    });
    expect(bridge.finalState().title).toBe("My App");
    const snap = (await byName["ui_app_get_snapshot"].execute({
      workflow_id: WF
    })) as { rootProps: { title?: string } };
    expect(snap.rootProps.title).toBe("My App");
  });
});

// --- APP_TOOL_LOOP_CASES via runToolLoopEval ---------------------------------

describe("APP_TOOL_LOOP_CASES", () => {
  it("build-form: title + heading + text input + button passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_app_set_title", args: { workflow_id: WF, title: "Ask the AI" } },
      { name: "ui_app_add_component", args: { workflow_id: WF, type: "Heading" } },
      { name: "ui_app_add_component", args: { workflow_id: WF, type: "TextInput" } },
      { name: "ui_app_add_component", args: { workflow_id: WF, type: "Button" } }
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
      { name: "ui_app_get_snapshot", args: { workflow_id: WF } },
      {
        name: "ui_app_add_component",
        args: {
          workflow_id: WF,
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
        args: { workflow_id: WF, id: "btn-1", props: { label: "Submit" } }
      },
      { name: "ui_app_remove_component", args: { workflow_id: WF, id: "text-1" } }
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
});
