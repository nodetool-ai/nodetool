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
