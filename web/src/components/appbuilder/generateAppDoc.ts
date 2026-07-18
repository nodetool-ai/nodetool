/**
 * Auto-generates a Puck app document from a workflow graph: one WorkflowInput
 * widget per Input node, a Run button, a Progress bar, and a display widget per
 * Output node picked by output type. Mirrors the template generator's layout
 * (Try-it panel + Results panel in two columns) and its deterministic
 * slug-based ids, so regenerating the same graph yields the same doc.
 */
import type { Data } from "@puckeditor/core";

import { Workflow } from "../../stores/ApiTypes";
import { extractWorkflowIO, WorkflowOutputIO } from "./workflowIO";
import { APP_DATA_VERSION, AppDocument } from "./appData";
import type { ComponentNode } from "./puck/puckDataOps";

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
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
};

type DisplayWidgetType =
  | "Image"
  | "Audio"
  | "Video"
  | "Markdown"
  | "Json"
  | "Output";

const STRUCTURED_OUTPUT = /(dataframe|json|dict|list|record|table)/;

export const displayWidgetForOutput = (
  nodeType: string
): DisplayWidgetType => {
  const tail = nodeType.slice(nodeType.lastIndexOf(".") + 1).toLowerCase();
  if (tail.includes("image")) return "Image";
  if (tail.includes("audio")) return "Audio";
  if (tail.includes("video")) return "Video";
  if (STRUCTURED_OUTPUT.test(tail)) return "Json";
  if (/(string|text|markdown)/.test(tail)) return "Markdown";
  // Generic Output / Preview nodes carry no type — the Output widget dispatches
  // on the runtime value's shape (media ref, string, structured).
  if (tail === "output" || tail === "preview") return "Output";
  return "Json";
};

const outputWidget = (
  output: WorkflowOutputIO,
  id: string
): ComponentNode => {
  const widget = displayWidgetForOutput(output.nodeType);
  const props: Record<string, unknown> & { id: string } = {
    id,
    binding: output.name
  };
  switch (widget) {
    case "Image":
      Object.assign(props, {
        fit: "contain",
        height: 280,
        placeholder: "Your result appears here"
      });
      break;
    case "Video":
      Object.assign(props, {
        height: 320,
        placeholder: "Your video appears here"
      });
      break;
    case "Audio":
      Object.assign(props, { placeholder: "Your audio appears here" });
      break;
    case "Markdown":
      Object.assign(props, { text: "" });
      break;
    case "Output":
      Object.assign(props, { placeholder: "Your result appears here" });
      break;
    case "Json":
      break;
  }
  return { type: widget, props };
};

export const generateAppData = (workflow: Workflow): Data => {
  const io = extractWorkflowIO(workflow);
  const nextId = idFactory();

  const tryContent: ComponentNode[] = io.inputs.map((input) => ({
    type: "WorkflowInput",
    props: {
      id: nextId(`in-${slugify(input.name)}`),
      binding: input.name,
      events: []
    }
  }));
  tryContent.push({
    type: "Button",
    props: {
      id: nextId("btn-run"),
      label: "Run",
      variant: "contained",
      color: "primary",
      events: [{ trigger: "click", kind: "run", key: "", value: "" }]
    }
  });

  const outputs = io.outputs.filter((o) => o.name !== "chunk");
  const resultsContent: ComponentNode[] = [
    { type: "Progress", props: { id: nextId("progress-run"), label: "" } }
  ];
  for (const output of outputs) {
    const slug = slugify(output.name);
    if (outputs.length > 1) {
      resultsContent.push({
        type: "Heading",
        props: {
          id: nextId(`lbl-${slug}`),
          text: output.label,
          level: "3"
        }
      });
    }
    resultsContent.push(outputWidget(output, nextId(`out-${slug}`)));
  }

  const tryPanel: ComponentNode = {
    type: "Container",
    props: { id: nextId("panel-try"), title: "Try it", content: tryContent }
  };
  const resultsPanel: ComponentNode = {
    type: "Container",
    props: {
      id: nextId("panel-results"),
      title: "Results",
      content: resultsContent
    }
  };

  return {
    root: { props: { title: workflow.name ?? "" } },
    content: [
      {
        type: "Columns",
        props: {
          id: nextId("cols-main"),
          gap: 24,
          left: [tryPanel],
          right: [resultsPanel]
        }
      }
    ],
    zones: {}
  } as Data;
};

export const generateAppDoc = (workflow: Workflow): AppDocument => ({
  version: APP_DATA_VERSION,
  data: generateAppData(workflow)
});
