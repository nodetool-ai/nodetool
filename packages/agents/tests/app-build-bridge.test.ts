/**
 * Tests for the promoted App Builder bridge (`src/app-build/bridge.ts`) — the
 * parts the eval surface does not use: the `ui_app_finish` termination tool and
 * the `document()` / `loadDocument()` round-trip a repair round resumes
 * through.
 */
import { describe, it, expect } from "vitest";
import {
  createAppToolBridge,
  type AppToolBridge
} from "../src/app-build/bridge.js";

const APP = "app-under-test";

function toolsOf(bridge: AppToolBridge) {
  return Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
}

describe("ui_app_finish", () => {
  it("is absent unless the caller asks for it", () => {
    expect(createAppToolBridge().tools.map((t) => t.name)).not.toContain(
      "ui_app_finish"
    );
  });

  it("records the model's summary in the final state", async () => {
    const bridge = createAppToolBridge({ finishTool: true });
    expect(bridge.finalState().finished).toBe(false);

    await toolsOf(bridge)["ui_app_finish"].execute({
      application_id: APP,
      summary: "A prompt box and a Run button."
    });

    const final = bridge.finalState();
    expect(final.finished).toBe(true);
    expect(final.finishSummary).toBe("A prompt box and a Run button.");
  });
});

describe("document round-trip", () => {
  it("resumes editing a document a previous round produced", async () => {
    // Round one: build a titled app with a nested widget and an operation.
    const first = createAppToolBridge();
    const t1 = toolsOf(first);
    await t1["ui_app_set_title"].execute({
      application_id: APP,
      title: "Ask the AI"
    });
    await t1["ui_app_add_component"].execute({
      application_id: APP,
      type: "Container",
      props: { title: "Details" }
    });
    await t1["ui_app_add_component"].execute({
      application_id: APP,
      type: "TextInput",
      parent_id: "Container-1",
      slot: "content"
    });
    await t1["ui_app_add_operation"].execute({
      application_id: APP,
      id: "main",
      target_workflow_id: "wf-app"
    });
    const doc = first.document();

    // Round two: a fresh bridge picks the document up where round one left it.
    const second = createAppToolBridge();
    second.loadDocument(doc);
    const t2 = toolsOf(second);

    const resumed = second.finalState();
    expect(resumed.title).toBe("Ask the AI");
    expect(resumed.components.map((c) => c.type)).toEqual([
      "Container",
      "TextInput"
    ]);
    expect(resumed.operations.map((o) => o.id)).toEqual(["main"]);

    // Editing a widget the previous round placed reaches it.
    await t2["ui_app_update_component"].execute({
      application_id: APP,
      id: "TextInput-2",
      props: { binding: "op:main/in:in-1" }
    });
    // A widget added now must not reuse an id the loaded document already owns.
    const added = (await t2["ui_app_add_component"].execute({
      application_id: APP,
      type: "Container"
    })) as { component: { id: string } };
    expect(added.component.id).not.toBe("Container-1");

    const final = second.finalState();
    expect(
      final.components.find((c) => c.id === "TextInput-2")?.props.binding
    ).toBe("op:main/in:in-1");
    expect(final.components.filter((c) => c.type === "Container")).toHaveLength(
      2
    );
    // The nesting survived the round-trip.
    expect(final.components.find((c) => c.id === "TextInput-2")?.parentId).toBe(
      "Container-1"
    );

    // Round one's bridge is untouched by round two's edits.
    expect(first.finalState().components).toHaveLength(2);
  });
});

describe("ui_app_get_binding_targets", () => {
  const workflow = (prefix: string) => ({
    inputs: [{ nodeId: `${prefix}-in`, name: "prompt", label: "prompt" }],
    outputs: [{ nodeId: `${prefix}-out`, name: "text", label: "text" }],
    variables: []
  });

  it("reports node targets for every loaded workflow, not just the host", async () => {
    const bridge = createAppToolBridge({
      workflowId: "wf-draft",
      workflow: workflow("draft"),
      workflows: {
        "wf-draft": workflow("draft"),
        "wf-publish": workflow("publish")
      }
    });
    const tools = toolsOf(bridge);
    for (const [id, workflowId] of [
      ["draft", "wf-draft"],
      ["publish", "wf-publish"]
    ]) {
      await tools["ui_app_add_operation"].execute({
        application_id: APP,
        id,
        target_workflow_id: workflowId
      });
    }

    const targets = (await tools["ui_app_get_binding_targets"].execute({
      application_id: APP
    })) as {
      operations: Array<{
        operationId: string;
        ioAvailable: boolean;
        inputs: Array<{ binding: string }>;
        outputs: Array<{ binding: string }>;
      }>;
    };

    expect(targets.operations.map((o) => o.operationId)).toEqual([
      "draft",
      "publish"
    ]);
    expect(targets.operations.every((o) => o.ioAvailable)).toBe(true);
    expect(targets.operations[1]?.inputs.map((i) => i.binding)).toEqual([
      "op:publish/in:publish-in"
    ]);
    expect(targets.operations[1]?.outputs.map((o) => o.binding)).toEqual([
      "op:publish/out:publish-out"
    ]);
  });

  it("still reports no surface for a workflow it has not loaded", async () => {
    const bridge = createAppToolBridge({
      workflowId: "wf-draft",
      workflow: workflow("draft")
    });
    const tools = toolsOf(bridge);
    await tools["ui_app_add_operation"].execute({
      application_id: APP,
      id: "publish",
      target_workflow_id: "wf-publish"
    });

    const targets = (await tools["ui_app_get_binding_targets"].execute({
      application_id: APP
    })) as { operations: Array<{ ioAvailable: boolean }> };
    expect(targets.operations[0]?.ioAvailable).toBe(false);
  });
});
