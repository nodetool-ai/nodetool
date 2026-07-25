/**
 * Builds an in-memory app document for a workflow that has none: one
 * WorkflowInput per Input node, a Run button, a progress bar, and a display
 * widget per Output node picked by output type.
 *
 * Mirrors `web/src/components/appbuilder/generateAppDoc.ts`, minus the two-column
 * layout (mobile stacks anyway) and minus saving — authoring an app is the web
 * builder's job, so mobile only falls back to a generated document at render
 * time and never writes one back to `workflow.app_doc`.
 */
import {
  APP_SCHEMA_VERSION,
  DEFAULT_OPERATION_ID,
  type ApplicationDocument,
  type PuckData,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../types/workflow";
import { extractWorkflowIO, type WorkflowOutputIO } from "./workflowIO";

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Deterministic id factory; suffixes duplicates so ids stay unique. */
const idFactory = () => {
  const used = new Set<string>();
  return (base: string): string => {
    let id = base;
    let n = 2;
    while (used.has(id)) {id = `${base}-${n++}`;}
    used.add(id);
    return id;
  };
};

const STRUCTURED_OUTPUT = /(dataframe|json|dict|list|record|table)/;

export const displayWidgetForOutput = (nodeType: string): string => {
  const tail = nodeType.slice(nodeType.lastIndexOf(".") + 1).toLowerCase();
  if (tail.includes("image")) {return "Image";}
  if (tail.includes("audio")) {return "Audio";}
  if (tail.includes("video")) {return "Video";}
  if (STRUCTURED_OUTPUT.test(tail)) {return "Json";}
  if (/(string|text|markdown)/.test(tail)) {return "Markdown";}
  // Generic Output / Preview nodes carry no type — the Output widget dispatches
  // on the runtime value's shape.
  if (tail === "output" || tail === "preview") {return "Output";}
  return "Json";
};

interface ComponentNode {
  type: string;
  props: Record<string, unknown> & { id: string };
}

const outputWidget = (output: WorkflowOutputIO, id: string): ComponentNode => {
  const type = displayWidgetForOutput(output.nodeType);
  const props: Record<string, unknown> & { id: string } = {
    id,
    binding: output.name,
  };
  switch (type) {
    case "Image":
      Object.assign(props, {
        fit: "contain",
        height: 280,
        placeholder: "Your result appears here",
      });
      break;
    case "Markdown":
      Object.assign(props, { text: "" });
      break;
    case "Audio":
    case "Video":
    case "Output":
      Object.assign(props, { placeholder: "Your result appears here" });
      break;
    default:
      break;
  }
  return { type, props };
};

export const generateAppData = (workflow: Workflow): PuckData => {
  const io = extractWorkflowIO(workflow);
  const nextId = idFactory();

  const inputContent: ComponentNode[] = io.inputs.map((input) => ({
    type: "WorkflowInput",
    props: {
      id: nextId(`in-${slugify(input.name)}`),
      binding: input.name,
      events: [],
    },
  }));
  inputContent.push({
    type: "Button",
    props: {
      id: nextId("btn-run"),
      label: "Run",
      variant: "contained",
      color: "primary",
      events: [{ trigger: "click", kind: "run", key: "", value: "" }],
    },
  });

  const outputs = io.outputs.filter((output) => output.name !== "chunk");
  const resultsContent: ComponentNode[] = [
    { type: "Progress", props: { id: nextId("progress-run"), label: "" } },
  ];
  for (const output of outputs) {
    const slug = slugify(output.name);
    if (outputs.length > 1) {
      resultsContent.push({
        type: "Heading",
        props: { id: nextId(`lbl-${slug}`), text: output.label, level: "3" },
      });
    }
    resultsContent.push(outputWidget(output, nextId(`out-${slug}`)));
  }

  return {
    root: { props: { title: workflow.name ?? "" } },
    content: [
      {
        type: "Container",
        props: {
          id: nextId("panel-try"),
          title: "Try it",
          content: inputContent,
        },
      },
      {
        type: "Container",
        props: {
          id: nextId("panel-results"),
          title: "Results",
          content: resultsContent,
        },
      },
    ],
    zones: {},
  };
};

export const generateAppDoc = (workflow: Workflow): ApplicationDocument => ({
  schemaVersion: APP_SCHEMA_VERSION,
  ui: generateAppData(workflow),
  operations: [
    {
      id: DEFAULT_OPERATION_ID,
      name: "Run",
      workflowId: workflow.id,
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [],
});
