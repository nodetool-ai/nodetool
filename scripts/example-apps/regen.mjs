// Regeneration checking for the shipped example apps.
//
// The curated bundles in packages/base-nodes/nodetool/examples/apps/ are
// hand-approved: `build-example-apps.mjs` writes them from the spec in
// apps.mjs, and a human reviews what changes. `--regen` asks a different
// question — would `nodetool app build` produce this app today? — by deriving
// a BuildSpec from a shipped bundle, building it, and diffing the result.
//
// The diff never becomes a write. A build is a model run, so two builds of one
// spec differ in ids, wording, and layout; drift here is a signal to read, not
// a patch to apply.
//
// Everything in this module is pure so it can be unit-tested without a model
// (packages/agents/tests/example-apps-regen.test.ts).

/** Widget props that hold nested widgets, per the app schema's layout slots. */
const SLOT_PROPS = ["content", "left", "right", "tab1", "tab2", "tab3"];

/** Every widget in a document, flattened, with its container's id. */
export function flattenWidgets(document) {
  const out = [];
  const visit = (widget, container) => {
    if (!widget || typeof widget !== "object" || !widget.type) return;
    const props = widget.props ?? {};
    out.push({
      id: props.id ?? "",
      type: widget.type,
      binding: props.binding ?? "",
      label: props.label ?? props.text ?? "",
      container,
      events: props.events ?? [],
      layout: SLOT_PROPS.some((slot) => Array.isArray(props[slot]))
    });
    for (const slot of SLOT_PROPS) {
      const children = props[slot];
      if (Array.isArray(children)) {
        for (const child of children) visit(child, props.id ?? container);
      }
    }
  };
  for (const widget of document.ui?.content ?? []) visit(widget, undefined);
  for (const zone of Object.values(document.ui?.zones ?? {})) {
    for (const widget of zone ?? []) visit(widget, undefined);
  }
  return out;
}

const isOutputNode = (node) =>
  node.type.includes(".output.") || node.type.endsWith("base_node.Preview");

/**
 * Node id → declared name, per operation. A bundle binds by node id, a spec
 * binds by name, so every comparison happens in name space — otherwise two
 * builds of the same app would differ on ids alone.
 */
function nameIndex(bundle) {
  const graphs = new Map(bundle.workflows.map((w) => [w.key, w.graph]));
  const index = new Map();
  for (const operation of bundle.app.operations ?? []) {
    const graph = graphs.get(operation.workflowId);
    const names = new Map();
    for (const node of graph?.nodes ?? []) {
      if (node.type.startsWith("nodetool.input.") || isOutputNode(node)) {
        names.set(node.id, node.data?.name || node.id);
      }
    }
    index.set(operation.id, names);
  }
  return index;
}

/** Rewrite a bundle binding token into the spec's name-based vocabulary. */
export function bindingToSpec(binding, index) {
  const match = /^op:([^/]+)\/(in|out):(.+)$/.exec(binding);
  if (!match) return binding;
  const [, operationId, kind, nodeId] = match;
  const name = index.get(operationId)?.get(nodeId);
  return name ? `op:${operationId}/${kind}:${name}` : binding;
}

/** Input/output declarations of an operation, read off its carried graph. */
function operationIO(bundle, operation) {
  const graph = bundle.workflows.find((w) => w.key === operation.workflowId)?.graph;
  const inputs = [];
  const outputs = [];
  for (const node of graph?.nodes ?? []) {
    const name = node.data?.name || node.id;
    if (node.type.startsWith("nodetool.input.")) {
      inputs.push({
        name,
        type: node.type.replace("nodetool.input.", "").toLowerCase(),
        example: node.data?.value ?? ""
      });
    } else if (isOutputNode(node)) {
      outputs.push({ name, type: "any" });
    }
  }
  return { inputs, outputs };
}

/**
 * A BuildSpec that describes a shipped bundle: the same operations, variables,
 * widgets, and one interaction per operation that runs it and expects every
 * display widget it feeds to fill in.
 *
 * Widgets a spec cannot express — bound to a node property
 * (`op:<id>/prop:<node>#<prop>`), or purely decorative — are reported as
 * `dropped` rather than written into a spec that would not validate.
 */
export function specFromBundle(bundle) {
  const index = nameIndex(bundle);
  const operations = (bundle.app.operations ?? []).map((operation) => {
    const io = operationIO(bundle, operation);
    const workflow = bundle.workflows.find((w) => w.key === operation.workflowId);
    return {
      id: operation.id,
      objective: workflow?.description || `Run the "${workflow?.name ?? operation.workflowId}" workflow`,
      inputs: io.inputs,
      outputs: io.outputs,
      streaming: false
    };
  });

  const dropped = [];
  const widgets = [];
  for (const widget of flattenWidgets(bundle.app)) {
    // Two shapes a bundle allows and the spec has no words for: a widget bound
    // to a node property, and a decorative one — no binding, no events, no
    // children — that shows literal text.
    const decorative =
      widget.binding === "" && widget.events.length === 0 && !widget.layout;
    if (widget.binding.includes("/prop:") || decorative) {
      dropped.push(widget);
      continue;
    }
    widgets.push({
      role: widget.id,
      type: widget.type,
      binding: bindingToSpec(widget.binding, index),
      label: widget.label,
      ...(widget.container ? { container: widget.container } : {})
    });
  }

  const variables = (bundle.app.variables ?? []).map((variable) => {
    const readingOperations = (bundle.app.operations ?? [])
      .filter((operation) =>
        Object.values(operation.inputs ?? {}).some(
          (mapping) => mapping.variableId === variable.id
        )
      )
      .map((operation) => operation.id);
    // A spec variable belongs to one operation. Curated apps also have
    // variables a widget fills and an operation only reads, so an unwritten
    // one is attributed to its first reader rather than left blank.
    const writtenBy =
      (bundle.app.operations ?? []).find((operation) =>
        Object.values(operation.outputs ?? {}).some(
          (mapping) => mapping.variableId === variable.id
        )
      )?.id ??
      readingOperations[0] ??
      operations[0]?.id ??
      "";
    const readBy = [
      ...readingOperations,
      ...widgets
        .filter((widget) => widget.binding === `var:${variable.id}`)
        .map((widget) => widget.role)
    ];
    return {
      id: variable.id,
      scope: variable.scope === "instance" ? "instance" : "app",
      persist: variable.persist === true,
      writtenBy,
      readBy
    };
  });

  const interactions = operations.map((operation) => ({
    name: operation.id,
    steps: [
      ...operation.inputs
        .filter((input) => input.example !== "" && input.example !== null)
        .map((input) => ({
          set: {
            key: input.name,
            value: input.example,
            operationId: operation.id
          }
        })),
      { run: operation.id }
    ],
    expect: widgets
      .filter((widget) => widget.binding.startsWith(`op:${operation.id}/out:`))
      .map((widget) => ({ widget: widget.role, check: "nonEmpty" }))
  }));

  return {
    spec: {
      title: bundle.name,
      operations,
      variables,
      widgets,
      interactions
    },
    dropped
  };
}

/** The parts of a bundle two builds can be compared on. */
export function summarizeBundle(bundle) {
  const index = nameIndex(bundle);
  return {
    operations: (bundle.app.operations ?? []).map((operation) => ({
      id: operation.id,
      policy: operation.policy ?? "replace",
      reads: Object.values(operation.inputs ?? {})
        .map((mapping) => mapping.variableId)
        .filter(Boolean)
        .sort(),
      writes: Object.values(operation.outputs ?? {})
        .map((mapping) => mapping.variableId)
        .filter(Boolean)
        .sort()
    })),
    variables: (bundle.app.variables ?? []).map((variable) => ({
      id: variable.id,
      scope: variable.scope,
      persist: variable.persist === true
    })),
    // Ids are authored per build, so widgets are compared on what they show,
    // not on what they are called.
    widgets: flattenWidgets(bundle.app)
      .map(
        (widget) =>
          `${widget.type} ${bindingToSpec(widget.binding, index) || "—"} ("${widget.label}")`
      )
      .sort(),
    workflows: bundle.workflows.length
  };
}

function diffCounted(shipped, rebuilt, label, lines) {
  const counts = new Map();
  for (const key of shipped) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const key of rebuilt) counts.set(key, (counts.get(key) ?? 0) - 1);
  for (const [key, delta] of [...counts].sort()) {
    for (let i = 0; i < delta; i += 1) lines.push(`  - missing ${label}: ${key}`);
    for (let i = 0; i > delta; i -= 1) lines.push(`  + extra ${label}: ${key}`);
  }
}

/** What a rebuild changed, as report lines. Empty means no drift. */
export function diffBundles(shipped, rebuilt) {
  const a = summarizeBundle(shipped);
  const b = summarizeBundle(rebuilt);
  const lines = [];

  if (a.workflows !== b.workflows) {
    lines.push(`  workflows carried: ${a.workflows} → ${b.workflows}`);
  }

  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const shippedOps = byId(a.operations);
  const rebuiltOps = byId(b.operations);
  for (const [id, operation] of shippedOps) {
    const other = rebuiltOps.get(id);
    if (!other) {
      lines.push(`  - missing operation: ${id}`);
      continue;
    }
    if (operation.policy !== other.policy) {
      lines.push(`  operation ${id}: policy ${operation.policy} → ${other.policy}`);
    }
    if (operation.reads.join(",") !== other.reads.join(",")) {
      lines.push(
        `  operation ${id}: reads [${operation.reads}] → [${other.reads}]`
      );
    }
    if (operation.writes.join(",") !== other.writes.join(",")) {
      lines.push(
        `  operation ${id}: writes [${operation.writes}] → [${other.writes}]`
      );
    }
  }
  for (const id of rebuiltOps.keys()) {
    if (!shippedOps.has(id)) lines.push(`  + extra operation: ${id}`);
  }

  const shippedVars = byId(a.variables);
  const rebuiltVars = byId(b.variables);
  for (const [id, variable] of shippedVars) {
    const other = rebuiltVars.get(id);
    if (!other) {
      lines.push(`  - missing variable: ${id}`);
      continue;
    }
    if (variable.scope !== other.scope || variable.persist !== other.persist) {
      lines.push(
        `  variable ${id}: ${variable.scope}/persist=${variable.persist} → ${other.scope}/persist=${other.persist}`
      );
    }
  }
  for (const id of rebuiltVars.keys()) {
    if (!shippedVars.has(id)) lines.push(`  + extra variable: ${id}`);
  }

  diffCounted(a.widgets, b.widgets, "widget", lines);
  return lines;
}
