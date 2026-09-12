import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  eventToAction,
  type AppAction,
  type AppEvent
} from "../src/actions.js";
import { messagesToEvents } from "../src/fold.js";
import {
  applyEvent,
  applyEvents,
  createInstanceState,
  type AppInstanceState,
  type InvocationState
} from "../src/state.js";

interface Mapping {
  to: string;
  variableId?: string;
}

interface Operation {
  id: string;
  workflowId: string;
  target?: { kind: "script"; scriptId: string; scriptVersion: number };
  policy: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, Mapping>;
}

interface Variable {
  id: string;
  default?: unknown;
}

interface Widget {
  type: string;
  props: Record<string, unknown> & { id: string };
}

interface WorkflowNode {
  id: string;
  data?: Record<string, unknown>;
}

interface Bundle {
  name: string;
  app: {
    schemaVersion: number;
    ui: { content: Widget[] };
    operations: Operation[];
    variables: Variable[];
  };
  workflows: Array<{
    key: string;
    name: string;
    graph: { nodes: WorkflowNode[] };
  }>;
  scripts?: Array<{
    key: string;
    name: string;
    document: {
      inputs: Array<{ name: string; type: string }>;
      outputs: Array<{ name: string; type: string }>;
      tests: Array<{ name: string }>;
      code: string;
    };
  }>;
}

const BUNDLE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool/examples/apps/directed-campaign-kit.app.json"
);

const bundle: Bundle = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));

const flattenWidgets = (widgets: ReadonlyArray<Widget>): Widget[] => {
  const flattened: Widget[] = [];
  const visit = (widget: Widget): void => {
    flattened.push(widget);
    for (const slot of ["content", "left", "right", "tab1", "tab2", "tab3"]) {
      const children = widget.props[slot];
      if (Array.isArray(children)) {
        for (const child of children) {
          if (
            typeof child === "object" &&
            child !== null &&
            "type" in child &&
            "props" in child
          ) {
            visit(child as Widget);
          }
        }
      }
    }
  };
  for (const widget of widgets) visit(widget);
  return flattened;
};

const widgets = flattenWidgets(bundle.app.ui.content);

const operation = (id: string): Operation => {
  const found = bundle.app.operations.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing operation ${id}`);
  return found;
};

const widgetById = (id: string): Widget => {
  const found = widgets.find((candidate) => candidate.props.id === id);
  if (!found) throw new Error(`Missing widget ${id}`);
  return found;
};

const button = (id: string): Widget => {
  const found = widgetById(id);
  if (found.type !== "Button") throw new Error(`${id} is not a button`);
  return found;
};

const eventsOf = (widget: Widget): AppEvent[] => {
  const events = widget.props.events;
  if (!Array.isArray(events))
    throw new Error(`${widget.props.id} has no events`);
  return events as AppEvent[];
};

const variableIds = new Set(
  bundle.app.variables.map((variable) => variable.id)
);

const actionsOf = (widget: Widget): AppAction[] =>
  eventsOf(widget).flatMap((event) => {
    const action = eventToAction(event, {
      defaultOperationId: "autofill",
      resolveVariableId: (key) => {
        if (!key?.startsWith("var:")) return null;
        const id = key.slice("var:".length);
        return variableIds.has(id) ? id : null;
      }
    });
    return action ? [action] : [];
  });

const seededState = (): AppInstanceState =>
  applyEvent(createInstanceState(), {
    type: "seedVariables",
    values: Object.fromEntries(
      bundle.app.variables.flatMap((variable) =>
        variable.default === undefined ? [] : [[variable.id, variable.default]]
      )
    )
  });

const invocation = (operationId: string): InvocationState => ({
  id: `job-${operationId}`,
  operationId,
  status: "running",
  startedAt: 1
});

const applyButton = (
  state: AppInstanceState,
  widgetId: string
): { state: AppInstanceState; actions: AppAction[] } => {
  const actions = actionsOf(button(widgetId));
  let next = state;
  for (const action of actions) {
    if (action.kind === "setVariable") {
      next = applyEvent(next, {
        type: "setVariable",
        variableId: action.variableId,
        value: action.value
      });
    } else if (action.kind === "run") {
      next = applyEvent(next, {
        type: "runStarted",
        invocation: invocation(action.operationId),
        outputKeys: Object.keys(operation(action.operationId).outputs).map(
          (nodeId) => `${action.operationId}:${nodeId}`
        )
      });
    }
  }
  return { state: next, actions };
};

const fold = (
  state: AppInstanceState,
  messages: ReadonlyArray<Record<string, unknown>>
): AppInstanceState =>
  applyEvents(
    state,
    messagesToEvents(messages, {
      resolveInvocation: (jobId) =>
        jobId ? (state.invocations[jobId] ?? null) : null,
      outputKey: (operationId, nodeId) => `${operationId}:${nodeId}`,
      outputVariable: (operationId, nodeId) => {
        const mapping = operation(operationId).outputs[nodeId];
        return mapping?.to === "variable" ? (mapping.variableId ?? null) : null;
      }
    })
  );

const outputNode = (operationId: string, variableId: string): string => {
  const found = Object.entries(operation(operationId).outputs).find(
    ([, mapping]) => mapping.variableId === variableId
  );
  if (!found) {
    throw new Error(`${operationId} does not write ${variableId}`);
  }
  return found[0];
};

describe("Directed Campaign Kit bundle", () => {
  it("wires image-triggered LLM autofill, four workflows, and empty image-model choices", () => {
    expect(bundle.name).toBe("Directed Campaign Kit");
    expect(bundle.app.schemaVersion).toBe(4);
    expect(bundle.workflows.map((workflow) => workflow.name)).toEqual([
      "Render a Directed Campaign Hero",
      "Compose Directed Campaign Formats",
      "Revise an Accepted Campaign Hero",
      "Reopen a Directed Campaign"
    ]);
    expect(bundle.app.operations.map((candidate) => candidate.id)).toEqual([
      "autofill",
      "renderHero",
      "acceptHero",
      "reviseHero",
      "acceptRevision",
      "restore"
    ]);
    expect(
      bundle.app.operations.every((candidate) => candidate.policy === "replace")
    ).toBe(true);
    expect(operation("acceptHero").workflowId).toBe("layouts");
    expect(operation("acceptRevision").workflowId).toBe("layouts");
    expect(Object.values(operation("acceptRevision").inputs)).toContainEqual({
      from: "variable",
      variableId: "recordFile"
    });
    expect(widgetById("phase-brief").props.text).toBe(
      "Stage: Ready. Add one product image and the AI will write the brief and three directions."
    );
    expect(widgetById("reference-and-models").props).toMatchObject({
      title: "Optional steering and models",
      defaultOpen: false
    });
    expect(widgetById("direction-placeholder").props).toMatchObject({
      text: "The AI-written brief and three directions will appear here before any image is generated.",
      visibleWhen: { binding: "var:phase", op: "eq", value: "brief" }
    });

    expect(bundle.scripts).toHaveLength(1);
    const script = bundle.scripts?.[0];
    expect(script).toMatchObject({
      key: "autofill",
      name: "Autofill Directed Campaign"
    });
    expect(script?.document.code).toContain("nodetool.models.generate");
    expect(script?.document.tests.map((test) => test.name)).toEqual([
      "structures a supplied model draft"
    ]);
    expect(operation("autofill")).toMatchObject({
      workflowId: "",
      target: { kind: "script", scriptId: "autofill", scriptVersion: 1 }
    });
    expect(Object.keys(operation("autofill").inputs)).toContain(
      "product_image"
    );
    expect(Object.keys(operation("autofill").outputs)).toEqual(
      expect.arrayContaining([
        "product_name",
        "campaign_message",
        "audience",
        "headline",
        "cta",
        "directions",
        "plan",
        "phase"
      ])
    );

    const productEvents = actionsOf(widgetById("product-image"));
    expect(productEvents).toEqual([
      { kind: "run", operationId: "autofill" },
      { kind: "setVariable", variableId: "phase", value: "autofilling" },
      { kind: "setVariable", variableId: "restoreGate", value: "closed" }
    ]);
    expect(widgetById("autofill-run").props.disabledWhen).toEqual({
      binding: "var:productImage",
      op: "empty"
    });
    for (const id of [
      "campaignPrompt",
      "productName",
      "campaignMessage",
      "audience",
      "headline",
      "cta"
    ]) {
      expect(
        bundle.app.variables.find((variable) => variable.id === id)?.default
      ).toBe("");
    }

    const widgetTypes = new Set(widgets.map((candidate) => candidate.type));
    for (const required of [
      "Accordion",
      "Alert",
      "Columns",
      "DocumentInput",
      "Download",
      "ImageCompare",
      "ModelSelect",
      "Progress"
    ]) {
      expect(widgetTypes.has(required), required).toBe(true);
    }
    for (const omitted of ["Gallery", "Sketch", "Tabs"]) {
      expect(widgetTypes.has(omitted), omitted).toBe(false);
    }
    const interactiveTypes = new Set([
      "Button",
      "DocumentInput",
      "Download",
      "ImageInput",
      "ModelSelect",
      "Select",
      "TextInput"
    ]);
    for (const candidate of widgets.filter((item) =>
      interactiveTypes.has(item.type)
    )) {
      expect(candidate.props.visibleWhen, candidate.props.id).toBeDefined();
    }
    for (const operationId of bundle.app.operations.map(
      (candidate) => candidate.id
    )) {
      expect(
        widgets.some(
          (candidate) => candidate.props.id === `${operationId}-progress`
        )
      ).toBe(true);
      expect(
        widgets.some(
          (candidate) => candidate.props.id === `${operationId}-error`
        )
      ).toBe(true);
      expect(actionsOf(button(`${operationId}-cancel`))).toEqual([
        { kind: "cancel", operationId }
      ]);
    }

    const modelBindings = widgets
      .filter((candidate) => candidate.type === "ModelSelect")
      .map((candidate) => [candidate.props.binding, candidate.props.modelKind]);
    expect(modelBindings).toEqual([
      ["op:renderHero/prop:hero-edit#model", "image_model"],
      ["op:reviseHero/prop:revision-edit#model", "image_model"]
    ]);

    for (const workflow of bundle.workflows) {
      for (const node of workflow.graph.nodes) {
        const model = node.data?.model;
        if (typeof model !== "object" || model === null) continue;
        expect(String((model as { id?: unknown }).id)).not.toBe("");
        expect(String((model as { provider?: unknown }).provider)).not.toBe("");
        expect(String((model as { name?: unknown }).name)).not.toBe("");
      }
    }
  });

  it("advances only on folded script outputs and clears a stale direction before editing", () => {
    let state = seededState();
    const proposed = applyButton(state, "autofill-run");
    state = proposed.state;
    expect(proposed.actions.map((action) => action.kind)).toEqual([
      "run",
      "setVariable",
      "setVariable"
    ]);
    expect(state.variables.phase).toBe("autofilling");

    state = fold(state, [
      {
        type: "output_update",
        job_id: "job-autofill",
        node_id: outputNode("autofill", "directions"),
        value:
          "### A — Stone at last light\n### B — Long road\n### C — Quiet camp",
        disposition: "replace"
      },
      {
        type: "output_update",
        job_id: "job-autofill",
        node_id: outputNode("autofill", "plan"),
        value: "captured-plan",
        disposition: "replace"
      },
      {
        type: "output_update",
        job_id: "job-autofill",
        node_id: outputNode("autofill", "phase"),
        value: "directions_ready",
        disposition: "replace"
      },
      { type: "job_update", job_id: "job-autofill", status: "completed" }
    ]);
    expect(state.variables.phase).toBe("directions_ready");
    expect(state.variables.plan).toBe("captured-plan");

    state = applyButton(state, "edit-brief").state;
    expect(state.variables).toMatchObject({
      phase: "brief",
      directions: "",
      plan: "",
      restoreGate: "closed"
    });
  });

  it("preserves the accepted original through revision failure and cancellation", () => {
    const accepted = { type: "image", uri: "asset://accepted-original" };
    let state = applyEvents(seededState(), [
      { type: "setVariable", variableId: "phase", value: "campaign_ready" },
      { type: "setVariable", variableId: "acceptedHero", value: accepted },
      {
        type: "setVariable",
        variableId: "acceptedContract",
        value: "accepted-contract"
      }
    ]);

    state = applyButton(state, "revise-hero-run").state;
    expect(state.variables.phase).toBe("revising_hero");
    state = fold(state, [
      {
        type: "job_update",
        job_id: "job-reviseHero",
        status: "failed",
        error: "provider rejected the edit"
      }
    ]);
    expect(state.variables.acceptedHero).toEqual(accepted);
    expect(state.variables.acceptedContract).toBe("accepted-contract");
    expect(state.invocations["job-reviseHero"]?.error).toBe(
      "provider rejected the edit"
    );

    state = applyButton(state, "reviseHero-retry").state;
    const cancelActions = actionsOf(button("reviseHero-cancel"));
    expect(cancelActions).toEqual([
      { kind: "cancel", operationId: "reviseHero" }
    ]);
    state = fold(state, [
      {
        type: "job_update",
        job_id: "job-reviseHero",
        status: "cancelled"
      }
    ]);
    expect(state.invocations["job-reviseHero"]?.status).toBe("cancelled");
    expect(state.variables.acceptedHero).toEqual(accepted);
    expect(state.variables.acceptedContract).toBe("accepted-contract");
  });

  it("keeps original artifacts while accepted revision outputs fold into their own slots", () => {
    const originalPortrait = {
      type: "image",
      uri: "asset://original-portrait"
    };
    const originalRecordFile = {
      type: "document",
      uri: "asset://original-record"
    };
    let state = applyEvents(seededState(), [
      { type: "setVariable", variableId: "phase", value: "revision_review" },
      {
        type: "setVariable",
        variableId: "originalPortrait",
        value: originalPortrait
      },
      {
        type: "setVariable",
        variableId: "originalRecord",
        value: "immutable-original-record"
      },
      {
        type: "setVariable",
        variableId: "recordFile",
        value: originalRecordFile
      },
      {
        type: "setVariable",
        variableId: "revisedHero",
        value: { type: "image", uri: "asset://revision-1" }
      },
      {
        type: "setVariable",
        variableId: "revisedContract",
        value: "revision-contract"
      }
    ]);

    state = applyButton(state, "accept-revision-run").state;
    expect(state.variables).toMatchObject({
      phase: "composing_revision",
      chosenVersion: "revision",
      originalRecord: "immutable-original-record",
      recordFile: originalRecordFile
    });
    const revisedPortrait = { type: "image", uri: "asset://revision-portrait" };
    state = fold(state, [
      {
        type: "output_update",
        job_id: "job-acceptRevision",
        node_id: outputNode("acceptRevision", "revisedPortrait"),
        value: revisedPortrait,
        disposition: "replace"
      },
      {
        type: "output_update",
        job_id: "job-acceptRevision",
        node_id: outputNode("acceptRevision", "phase"),
        value: "complete",
        disposition: "replace"
      },
      {
        type: "job_update",
        job_id: "job-acceptRevision",
        status: "completed"
      }
    ]);
    expect(state.variables.revisedPortrait).toEqual(revisedPortrait);
    expect(state.variables.originalPortrait).toEqual(originalPortrait);
    expect(state.variables.originalRecord).toBe("immutable-original-record");
    expect(state.variables.recordFile).toEqual(originalRecordFile);
    expect(state.variables.phase).toBe("complete");
  });
});
