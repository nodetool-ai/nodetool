// Builds the shipped example app bundles.
//
// Input:  scripts/example-apps/apps.mjs — the curated spec (docs/plans/example-apps.md)
//         packages/base-nodes/nodetool/examples/nodetool-base/*.json — the graphs
// Output: packages/base-nodes/nodetool/examples/apps/<slug>.app.json — ApplicationBundles
//         web/public/app-preview/<slug>.json + manifest.json — preview bundles
//
// A bundle carries the app document plus the full graph of every workflow its
// operations bind. Operations reference bundle-local keys; installing rewrites
// them to real workflow ids (packages/app-runtime/src/bundle.ts). Each carried
// workflow declares a `sourceId`, which is what keeps two apps that bind the
// same template — Photo Studio and Concept Studio both bind Image Enhance —
// from creating two workflow rows on install.
//
// Everything the spec names is resolved by **name** against the real graphs:
// a workflow, input, output, or node property that no longer exists fails the
// build rather than shipping a binding that resolves to nothing.
//
// This replaces the old per-template generator, which wrote an `app_doc` onto
// every example. The build strips any `app_doc` still on an example JSON, so
// "no example carries an app_doc" is enforced here rather than remembered.
//
//   node scripts/build-example-apps.mjs                 # build + validate
//   node scripts/build-example-apps.mjs --app vary-image # one app only
//   node scripts/build-example-apps.mjs --skip-validate # build only
//   node scripts/build-example-apps.mjs --check         # fail if outputs would change
//
// `--regen` is a separate question, answered by `nodetool app build`: would the
// build harness produce these apps today? It derives a BuildSpec from each
// shipped bundle, builds it, and reports the drift. It writes nothing — the
// curated bundles stay hand-approved.
//
//   node scripts/build-example-apps.mjs --regen -p anthropic -m claude-sonnet-5
//   node scripts/build-example-apps.mjs --regen -p ... -m ... --app photo-studio

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { EXAMPLE_APPS } from "./example-apps/apps.mjs";
import { diffBundles, specFromBundle } from "./example-apps/regen.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = "nodetool-base";
const EXAMPLES = path.join(
  ROOT,
  "packages/base-nodes/nodetool/examples",
  PACKAGE
);
const APPS_OUT = path.join(ROOT, "packages/base-nodes/nodetool/examples/apps");
const ART = path.join(ROOT, "packages/base-nodes/nodetool/assets", PACKAGE);
const PREVIEW = path.join(ROOT, "web/public/app-preview");

const APP_SCHEMA_VERSION = 3;
const BUNDLE_SCHEMA_VERSION = 1;

const argv = process.argv.slice(2);
const args = new Set(argv);
const skipValidate = args.has("--skip-validate");
const checkOnly = args.has("--check");
const regen = args.has("--regen");

/** Value of a `--flag value` pair, or its short alias. */
const flagValue = (...names) => {
  for (const name of names) {
    const at = argv.indexOf(name);
    if (at >= 0 && argv[at + 1]) return argv[at + 1];
  }
  return undefined;
};

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

// ── Template graphs ──────────────────────────────────────────────────────────

const isOutputNode = (node) =>
  node.type.includes(".output.") || node.type.endsWith("base_node.Preview");

/** Load a template, index its Input/Output nodes by name, and drop `app_doc`. */
function loadTemplate(name) {
  const file = path.join(EXAMPLES, `${name}.json`);
  if (!fs.existsSync(file)) fail(`no template named "${name}" (${file})`);
  const raw = fs.readFileSync(file, "utf8");
  const example = JSON.parse(raw);

  // Apps live in bundles now; a template carrying an app_doc is a leftover.
  if (example.app_doc !== undefined) {
    delete example.app_doc;
    writeFile(file, `${JSON.stringify(example, null, 2)}\n`);
  }

  const inputs = new Map();
  const outputs = new Map();
  for (const node of example.graph.nodes) {
    if (node.type.startsWith("nodetool.input.")) {
      if (node.data?.name) inputs.set(node.data.name, node);
    } else if (isOutputNode(node)) {
      outputs.set(node.data?.name || node.id, node);
    }
  }
  return {
    name,
    description: example.description ?? "",
    graph: example.graph,
    inputs,
    outputs
  };
}

// ── Widgets ──────────────────────────────────────────────────────────────────

const inputBinding = (op, nodeId) => `op:${op}/in:${nodeId}`;
const outputBinding = (op, nodeId) => `op:${op}/out:${nodeId}`;
const propBinding = (op, nodeId, prop) => `op:${op}/prop:${nodeId}#${prop}`;
const execBinding = (op, field) => `op:${op}/exec#${field}`;
const varBinding = (id) => `var:${id}`;

const READ_WIDGET = {
  Markdown: (base) => ({ type: "Markdown", props: { ...base, text: "" } }),
  Image: (base) => ({
    type: "Image",
    props: {
      ...base,
      fit: "contain",
      height: 280,
      placeholder: "Your result appears here"
    }
  }),
  Video: (base) => ({
    type: "Video",
    props: { ...base, height: 320, placeholder: "Your video appears here" }
  }),
  Audio: (base) => ({
    type: "Audio",
    props: { ...base, placeholder: "Your audio appears here" }
  }),
  Table: (base) => ({ type: "Table", props: base }),
  Json: (base) => ({ type: "Json", props: base })
};

/** Per-app widget id allocator: readable, deterministic, collision-free. */
function idFactory() {
  const taken = new Set();
  return (parts) => {
    const base = slugify(parts.filter(Boolean).join("-")) || "w";
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
    return id;
  };
}

const runEvents = (operationIds) =>
  operationIds.map((operationId) => ({
    trigger: "click",
    kind: "run",
    operationId,
    key: "",
    value: ""
  }));

const changeRun = (operationId, pace) => [
  {
    trigger: "change",
    kind: "run",
    operationId,
    pace: pace ?? "live",
    key: "",
    value: ""
  }
];

/**
 * One control widget. `ctx` carries the app's operation table (operation id →
 * { key, template }), the id allocator, and the preview value sink.
 */
function buildControl(control, ctx) {
  const nextId = ctx.nextId;

  const opInput = (op, name) => {
    const operation = ctx.operations.get(op);
    if (!operation)
      fail(`${ctx.app.name}: control names unknown operation "${op}"`);
    const node = operation.template.inputs.get(name);
    if (!node) {
      fail(
        `${ctx.app.name}: operation "${op}" (${operation.template.name}) has no input named "${name}"`
      );
    }
    return { operation, node };
  };

  // `text`, `model`, `select` and `slider` take either an input name or
  // `{ node, prop }`.
  // An input name binds the template's Input node; `{ node, prop }` binds a
  // property on a node inside the graph, so no Input node is needed.
  const inputTarget = (kind, name) => {
    const { operation, node } = opInput(control.op, name);
    ctx.seedInputValue(control.op, node);
    const portId = operation.kind === "script" ? node.name : node.id;
    return {
      binding: inputBinding(control.op, portId),
      idParts: [kind === "slider" ? "slider" : "in", control.op, name]
    };
  };

  const propTarget = (kind, target) => {
    const operation = ctx.operations.get(control.op);
    if (!operation)
      fail(`${ctx.app.name}: ${kind} names unknown operation "${control.op}"`);
    if (operation.kind === "script") {
      fail(
        `${ctx.app.name}: ${kind} cannot bind a node property on script operation "${control.op}"`
      );
    }
    const { node, prop } = target;
    const graphNode = operation.template.graph.nodes.find((n) => n.id === node);
    if (!graphNode) {
      fail(
        `${ctx.app.name}: ${kind} binds node "${node}", which ${operation.template.name} does not have`
      );
    }
    if (!Object.prototype.hasOwnProperty.call(graphNode.data ?? {}, prop)) {
      fail(
        `${ctx.app.name}: ${kind} binds property "${prop}" on node "${node}" (${graphNode.type}), which ${operation.template.name} does not set`
      );
    }
    const binding = propBinding(control.op, node, prop);
    if (control.default !== undefined) ctx.values[binding] = control.default;
    return { binding, idParts: [kind, control.op, node, prop] };
  };

  const variableTarget = (id) => {
    ctx.useVariable(id);
    return {
      binding: varBinding(id),
      idParts: ["in", id]
    };
  };

  if (control.note !== undefined) {
    return {
      type: "Text",
      props: { id: nextId(["note"]), text: control.note }
    };
  }

  // A run button lists the operations it starts; `run: true` on a slider or an
  // audio drop zone means "re-run on change" instead.
  if (Array.isArray(control.run)) {
    for (const op of control.run) {
      if (!ctx.operations.has(op)) {
        fail(`${ctx.app.name}: run button targets unknown operation "${op}"`);
      }
    }
    if (
      control.disabledWhen !== undefined &&
      !ctx.operations.has(control.disabledWhen)
    ) {
      fail(
        `${ctx.app.name}: disabledWhen names unknown operation "${control.disabledWhen}"`
      );
    }
    return {
      type: "Button",
      props: {
        id: nextId(["btn", control.run.join("-")]),
        label: control.label,
        variant: "contained",
        color: "primary",
        events: runEvents(control.run),
        ...(control.disabledWhen
          ? {
              disabledWhen: {
                binding: execBinding(control.disabledWhen, "running"),
                op: "notEmpty"
              }
            }
          : {})
      }
    };
  }

  if (control.textVar !== undefined) {
    ctx.useVariable(control.textVar);
    return {
      type: "TextInput",
      props: {
        id: nextId(["in", control.textVar]),
        binding: varBinding(control.textVar),
        label: control.label,
        multiline: control.multiline === true,
        events: []
      }
    };
  }

  if (control.image !== undefined) {
    const { binding, idParts } =
      typeof control.image === "string"
        ? variableTarget(control.image)
        : inputTarget("image", control.image.input);
    return {
      type: "ImageInput",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        events: []
      }
    };
  }

  if (control.video !== undefined) {
    const { binding, idParts } =
      typeof control.video === "string"
        ? variableTarget(control.video)
        : inputTarget("video", control.video.input);
    if (control.demo !== undefined) ctx.values[binding] = control.demo;
    return {
      type: "VideoInput",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        events: []
      }
    };
  }

  if (control.switch !== undefined) {
    ctx.useVariable(control.switch);
    return {
      type: "Switch",
      props: {
        id: nextId(["in", control.switch]),
        binding: varBinding(control.switch),
        label: control.label,
        events: []
      }
    };
  }

  if (control.input !== undefined) {
    const { operation, node } = opInput(control.op, control.input);
    const portId = operation.kind === "script" ? node.name : node.id;
    return {
      type: "WorkflowInput",
      props: {
        id: nextId(["in", control.op, control.input]),
        binding: inputBinding(control.op, portId),
        label: control.label,
        events: []
      }
    };
  }

  if (control.text !== undefined) {
    const { binding, idParts } =
      typeof control.text === "string"
        ? inputTarget("text", control.text)
        : propTarget("text", control.text);
    return {
      type: "TextInput",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        multiline: control.multiline === true,
        events: []
      }
    };
  }

  if (control.model !== undefined) {
    const { binding, idParts } =
      typeof control.model === "string"
        ? inputTarget("model", control.model)
        : propTarget("model", control.model);
    return {
      type: "ModelSelect",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        modelKind: control.modelKind,
        task: control.task,
        events: []
      }
    };
  }

  if (control.number !== undefined) {
    const { operation, node } = opInput(control.op, control.number);
    ctx.seedInputValue(control.op, node);
    const portId = operation.kind === "script" ? node.name : node.id;
    return {
      type: "NumberInput",
      props: {
        id: nextId(["in", control.op, control.number]),
        binding: inputBinding(control.op, portId),
        label: control.label,
        min: control.min,
        max: control.max,
        events: []
      }
    };
  }

  if (control.select !== undefined) {
    const { binding, idParts } =
      typeof control.select === "string"
        ? inputTarget("select", control.select)
        : propTarget("select", control.select);
    return {
      type: "Select",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        options: control.options.map((value) => ({ value })),
        events: []
      }
    };
  }

  if (control.color !== undefined) {
    const { operation, node } = opInput(control.op, control.color);
    ctx.seedInputValue(control.op, node);
    const portId = operation.kind === "script" ? node.name : node.id;
    return {
      type: "ColorInput",
      props: {
        id: nextId(["in", control.op, control.color]),
        binding: inputBinding(control.op, portId),
        label: control.label,
        events: []
      }
    };
  }

  if (control.audio !== undefined) {
    const { binding, idParts } =
      typeof control.audio === "string"
        ? variableTarget(control.audio)
        : inputTarget("audio", control.audio.input);
    return {
      type: "AudioInput",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        events: control.run ? changeRun(control.op, "release") : []
      }
    };
  }

  if (control.slider !== undefined) {
    const { binding, idParts } =
      typeof control.slider === "string"
        ? inputTarget("slider", control.slider)
        : propTarget("slider", control.slider);
    return {
      type: "Slider",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        min: control.min ?? 0,
        max: control.max ?? 100,
        step: control.step ?? 1,
        events: control.run
          ? changeRun(control.op, control.pace ?? "release")
          : []
      }
    };
  }

  fail(`${ctx.app.name}: unrecognized control ${JSON.stringify(control)}`);
}

function buildResult(result, ctx) {
  const nextId = ctx.nextId;
  const items = [];

  if (result.progress !== undefined) {
    if (!ctx.operations.has(result.progress)) {
      fail(
        `${ctx.app.name}: progress names unknown operation "${result.progress}"`
      );
    }
    items.push({
      type: "Progress",
      props: {
        id: nextId(["progress", result.progress]),
        binding: execBinding(result.progress, "progress"),
        label: result.label
      }
    });
    return items;
  }

  if (result.activity !== undefined) {
    if (!ctx.operations.has(result.activity)) {
      fail(`${ctx.app.name}: activity names unknown operation "${result.activity}"`);
    }
    items.push({
      type: "Text",
      props: {
        id: nextId(["activity", result.activity]),
        binding: execBinding(result.activity, "activity"),
        text: ""
      }
    });
    return items;
  }

  if (result.note !== undefined) {
    items.push({
      type: "Text",
      props: { id: nextId(["note"]), text: result.note }
    });
    return items;
  }

  if (result.error !== undefined) {
    if (!ctx.operations.has(result.error)) {
      fail(`${ctx.app.name}: error names unknown operation "${result.error}"`);
    }
    const binding = execBinding(result.error, "error");
    items.push({
      type: "Alert",
      props: {
        id: nextId(["error", result.error]),
        binding,
        title: result.label ?? "Generation failed",
        text: "",
        severity: "error",
        visibleWhen: { binding, op: "notEmpty" }
      }
    });
    return items;
  }

  let binding;
  let idParts;
  if (result.showVar !== undefined) {
    ctx.useVariable(result.showVar);
    binding = varBinding(result.showVar);
    idParts = ["out", result.showVar];
  } else {
    const operation = ctx.operations.get(result.op);
    if (!operation)
      fail(`${ctx.app.name}: result names unknown operation "${result.op}"`);
    const port = operation.template.outputs.get(result.show);
    if (!port) {
      fail(
        `${ctx.app.name}: operation "${result.op}" (${operation.template.name}) has no output named "${result.show}"`
      );
    }
    const portId = operation.kind === "script" ? port.name : port.id;
    binding = outputBinding(result.op, portId);
    idParts = ["out", result.op, result.show];
    ctx.displayed.add(`${result.op}:${portId}`);
  }

  const make = READ_WIDGET[result.as ?? "Markdown"];
  if (!make) fail(`${ctx.app.name}: unknown display widget "${result.as}"`);
  if (result.label) {
    items.push({
      type: "Heading",
      props: {
        id: nextId(["lbl", ...idParts.slice(1)]),
        text: result.label,
        level: "3"
      }
    });
  }
  items.push(make({ id: nextId(idParts), binding }));
  if (result.demo !== undefined) ctx.values[binding] = result.demo;
  return items;
}

// ── App document ─────────────────────────────────────────────────────────────

function buildApp(app, templates) {
  const nextId = idFactory();
  const values = {};
  const declaredVariables = new Set((app.variables ?? []).map((v) => v.id));
  const displayed = new Set();

  const operations = new Map();
  for (const operation of app.operations) {
    if (operation.script !== undefined) {
      const script = app.scripts?.[operation.script];
      if (!script) {
        fail(
          `${app.name}: operation "${operation.id}" names unknown script key "${operation.script}"`
        );
      }
      operations.set(operation.id, {
        spec: operation,
        key: operation.script,
        kind: "script",
        template: {
          name: script.name,
          inputs: new Map(
            script.document.inputs.map((port) => [port.name, port])
          ),
          outputs: new Map(
            script.document.outputs.map((port) => [port.name, port])
          )
        }
      });
      continue;
    }
    const templateName = app.workflows[operation.workflow];
    if (!templateName) {
      fail(
        `${app.name}: operation "${operation.id}" names unknown workflow key "${operation.workflow}"`
      );
    }
    operations.set(operation.id, {
      spec: operation,
      key: operation.workflow,
      kind: "workflow",
      template: templates.get(templateName)
    });
  }

  const explicitModelBindings = new Set();
  for (const section of app.sections ?? []) {
    for (const control of section.controls ?? []) {
      if (
        control.model &&
        typeof control.model === "object" &&
        control.model.node &&
        control.model.prop
      ) {
        explicitModelBindings.add(
          `${control.op}:${control.model.node}:${control.model.prop}`
        );
      }
    }
  }

  const modelControlsForSection = (section) => {
    const operationIds = new Set();
    for (const control of section.controls ?? []) {
      if (control.op) operationIds.add(control.op);
      if (Array.isArray(control.run)) {
        for (const operationId of control.run) operationIds.add(operationId);
      }
    }
    for (const result of section.results ?? []) {
      if (result.op) operationIds.add(result.op);
      if (result.progress) operationIds.add(result.progress);
      if (result.error) operationIds.add(result.error);
    }

    const controls = [];
    for (const operationId of operationIds) {
      const operation = operations.get(operationId);
      if (!operation || operation.kind === "script") continue;
      for (const node of operation.template.graph.nodes) {
        const model = node.data?.model;
        if (
          !model ||
          typeof model !== "object" ||
          typeof model.type !== "string" ||
          !model.type.endsWith("_model")
        ) {
          continue;
        }
        const key = `${operationId}:${node.id}:model`;
        if (explicitModelBindings.has(key)) continue;
        explicitModelBindings.add(key);
        controls.push({
          op: operationId,
          model: { node: node.id, prop: "model" },
          modelKind: model.type,
          label: `${node.data?.title || operation.spec.name} model`
        });
      }
    }
    return controls;
  };

  const ctx = {
    app,
    operations,
    nextId,
    values,
    displayed,
    useVariable: (id) => {
      if (!declaredVariables.has(id)) {
        fail(
          `${app.name}: widget binds variable "${id}", which the app does not declare`
        );
      }
    },
    // A text/number/select control seeds the preview with the graph's own
    // default, which is what makes the screenshot look filled in.
    seedInputValue: (op, node) => {
      const value = node.data?.value;
      if (value === undefined || value === null || typeof value === "object")
        return;
      values[inputBinding(op, node.id)] = value;
    }
  };

  const defaultContent = [
    {
      type: "Heading",
      props: {
        id: nextId(["title"]),
        text: app.showEmoji === false ? app.name : `${app.emoji} ${app.name}`,
        level: "1"
      }
    },
    { type: "Text", props: { id: nextId(["tagline"]), text: app.tagline } }
  ];
  const content = app.content ? structuredClone(app.content) : defaultContent;
  if (!app.content && app.note) {
    content.push({
      type: "Text",
      props: { id: nextId(["app-note"]), text: app.note }
    });
  }

  for (const section of app.content ? [] : app.sections) {
    const sourceControls = [
      ...modelControlsForSection(section),
      ...(section.controls ?? [])
    ];
    const controls = sourceControls.map((control) =>
      buildControl(control, ctx)
    );
    const results = (section.results ?? []).flatMap((result) =>
      buildResult(result, ctx)
    );
    const left = {
      type: "Container",
      props: {
        id: nextId(["panel", section.title]),
        title: section.title,
        content: controls
      }
    };
    if (results.length === 0) {
      content.push(left);
      continue;
    }
    content.push({
      type: "Columns",
      props: {
        id: nextId(["cols", section.title]),
        gap: 24,
        left: [left],
        right: [
          {
            type: "Container",
            props: {
              id: nextId(["panel", section.title, "results"]),
              title: "Results",
              content: results
            }
          }
        ]
      }
    });
  }

  // Operation mappings key on node IDs, so a renamed node never breaks an app.
  const documentOperations = app.operations.map((operation) => {
    const entry = operations.get(operation.id);
    const template = entry.template;
    const inputs = {};
    for (const [name, mapping] of Object.entries(operation.inputs ?? {})) {
      const port = template.inputs.get(name);
      if (!port) {
        fail(
          `${app.name}: operation "${operation.id}" maps input "${name}", which ${template.name} does not have`
        );
      }
      if (
        mapping.from === "variable" &&
        !declaredVariables.has(mapping.variableId)
      ) {
        fail(
          `${app.name}: operation "${operation.id}" reads undeclared variable "${mapping.variableId}"`
        );
      }
      inputs[entry.kind === "script" ? port.name : port.id] = mapping;
    }
    const outputs = {};
    for (const [name, mapping] of Object.entries(operation.outputs ?? {})) {
      const port = template.outputs.get(name);
      if (!port) {
        fail(
          `${app.name}: operation "${operation.id}" maps output "${name}", which ${template.name} does not have`
        );
      }
      if (
        mapping.to === "variable" &&
        !declaredVariables.has(mapping.variableId)
      ) {
        fail(
          `${app.name}: operation "${operation.id}" writes undeclared variable "${mapping.variableId}"`
        );
      }
      outputs[entry.kind === "script" ? port.name : port.id] = mapping;
    }
    const result = {
      id: operation.id,
      name: operation.name,
      workflowId: entry.kind === "script" ? "" : operation.workflow,
      inputs,
      outputs,
      policy: operation.policy ?? "replace",
      ...(operation.timeoutMs ? { timeoutMs: operation.timeoutMs } : {})
    };
    if (entry.kind === "script") {
      result.target = {
        kind: "script",
        scriptId: operation.script,
        scriptVersion: 1
      };
    }
    return result;
  });

  const document = {
    schemaVersion: documentOperations.some((operation) => operation.target)
      ? 4
      : APP_SCHEMA_VERSION,
    // No root title: the first widget is already a Heading carrying the app
    // name, and the runtime renders a root title as a heading of its own — so
    // setting both printed the name twice on every example.
    ui: { root: { props: {} }, content, zones: {} },
    operations: documentOperations,
    resources: [],
    variables: (app.variables ?? []).map((variable) => ({
      id: variable.id,
      name: variable.name,
      type: variable.type ? { type: variable.type, optional: true } : null,
      default: variable.default,
      scope: variable.scope,
      persist: variable.scope === "user" && variable.persist === true
    }))
  };

  for (const variable of app.variables ?? []) {
    if (variable.default !== undefined) {
      values[varBinding(variable.id)] = variable.default;
    }
  }

  return { document, values };
}

function buildBundle(app, templates) {
  const { document, values } = buildApp(app, templates);
  const workflows = Object.entries(app.workflows).map(([key, templateName]) => {
    const template = templates.get(templateName);
    const graph = structuredClone(template.graph);
    for (const [nodeId, model] of Object.entries(
      app.modelOverrides?.[key] ?? {}
    )) {
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        fail(
          `${app.name}: model override names unknown node "${nodeId}" in ${template.name}`
        );
      }
      if (!node.data?.model) {
        fail(
          `${app.name}: model override targets node "${nodeId}" without a model in ${template.name}`
        );
      }
      node.data.model = model;
    }
    return {
      key,
      name: template.name,
      description: template.description,
      // Stable across installs: a second app binding the same template reuses
      // the workflow row this one created instead of duplicating it.
      sourceId: `${PACKAGE}/${template.name}`,
      graph,
      version: null,
      graphHash: null
    };
  });
  const scripts = Object.entries(app.scripts ?? {}).map(([key, script]) => ({
    key,
    name: script.name,
    sourceId: `${PACKAGE}/${script.name}`,
    document: script.document,
    version: null
  }));
  return {
    bundle: {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      name: app.name,
      description: app.description,
      app: document,
      workflows,
      ...(scripts.length > 0 ? { scripts } : {})
    },
    values
  };
}

// ── Writing ──────────────────────────────────────────────────────────────────

let changed = 0;

function writeFile(file, contents) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (existing === contents) return false;
  if (checkOnly) {
    fail(
      `${path.relative(ROOT, file)} is out of date — run node scripts/build-example-apps.mjs`
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
  changed += 1;
  return true;
}

/**
 * The preview bundle the screenshot rig renders: the app document plus, per
 * carried workflow, only the Input/Output nodes — enough to resolve every
 * binding the way the runtime does, without shipping whole graphs to the web
 * build. `values` is keyed by the same binding tokens the widgets carry.
 */
function previewFor(app, bundle, values) {
  const artFile = path.join(ART, `${Object.values(app.workflows)[0]}.jpg`);
  let image = null;
  if (fs.existsSync(artFile)) {
    image = `/app-preview/img/${app.slug}.jpg`;
    const target = path.join(PREVIEW, "img", `${app.slug}.jpg`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(artFile, target);
  }
  return {
    slug: app.slug,
    name: app.name,
    emoji: app.emoji,
    description: app.description,
    tagline: app.tagline,
    note: app.note ?? null,
    featured: app.featured === true,
    image,
    app: bundle.app,
    workflows: bundle.workflows.map((workflow) => ({
      key: workflow.key,
      name: workflow.name,
      graph: {
        nodes: workflow.graph.nodes.filter(
          (node) =>
            node.type.startsWith("nodetool.input.") || isOutputNode(node)
        ),
        edges: []
      }
    })),
    ...(bundle.scripts ? { scripts: bundle.scripts } : {}),
    values
  };
}

// ── Regeneration check ───────────────────────────────────────────────────────
// Reads the shipped bundles and builds each one again through the harness. It
// touches nothing under APPS_OUT or PREVIEW, so it can never overwrite a
// curated app.

/** Build one derived spec through `nodetool app build --json`. */
function buildFromSpec(specFile, outDir, provider, model) {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "./packages/cli/src/nodetool.ts",
      "app",
      "build",
      specFile,
      "--provider",
      provider,
      "--model",
      model,
      "--json",
      "--out",
      outDir
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--conditions=nodetool-dev" }
    }
  );
  const stdout = (result.stdout ?? "").trim();
  if (!stdout) {
    return {
      error:
        (result.stderr ?? "").trim().split("\n").slice(-5).join("\n") ||
        `exited ${result.status}`
    };
  }
  try {
    return { report: JSON.parse(stdout) };
  } catch {
    return { error: "app build printed no parseable report" };
  }
}

function runRegen() {
  const provider = flagValue("--provider", "-p");
  const model = flagValue("--model", "-m");
  if (!provider || !model) {
    fail("--regen needs --provider and --model — a rebuild is a model run");
  }
  const only = flagValue("--app");
  const apps = only
    ? EXAMPLE_APPS.filter((app) => app.slug === only)
    : EXAMPLE_APPS;
  if (apps.length === 0) fail(`no example app with slug "${only}"`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "example-apps-regen-"));
  let failed = 0;
  let drifted = 0;

  for (const app of apps) {
    const bundleFile = path.join(APPS_OUT, `${app.slug}.app.json`);
    if (!fs.existsSync(bundleFile)) {
      fail(`no shipped bundle for "${app.slug}" — run the build first`);
    }
    const shipped = JSON.parse(fs.readFileSync(bundleFile, "utf8"));
    const { spec, dropped } = specFromBundle(shipped);
    const specFile = path.join(work, `${app.slug}.spec.json`);
    fs.writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const { report, error } = buildFromSpec(
      specFile,
      path.join(work, app.slug),
      provider,
      model
    );
    if (error || !report?.bundle) {
      failed += 1;
      console.log(
        `❌ ${app.slug}: ${error ?? report?.verdict?.reason ?? "no bundle"}`
      );
      continue;
    }
    const lines = diffBundles(shipped, report.bundle);
    if (dropped.length > 0) {
      lines.push(
        `  (${dropped.length} property-bound widget(s) have no spec token and were not asked for)`
      );
    }
    if (lines.length === 0) {
      console.log(`✅ ${app.slug}: no drift`);
    } else {
      drifted += 1;
      console.log(`≠  ${app.slug}: $${(report.cost?.usd ?? 0).toFixed(4)}`);
      for (const line of lines) console.log(line);
    }
  }

  console.log(
    `\nregen: ${apps.length} app(s) · drifted: ${drifted} · failed: ${failed} · specs in ${work}`
  );
  console.log("nothing was written — the shipped bundles stay hand-approved");
  // Drift is expected between two model runs, so only a build that produced no
  // bundle at all is an error.
  process.exit(failed > 0 ? 1 : 0);
}

if (regen) runRegen();

// ── Main ─────────────────────────────────────────────────────────────────────

const only = flagValue("--app");
const selectedApps = only
  ? EXAMPLE_APPS.filter((app) => app.slug === only)
  : EXAMPLE_APPS;
if (selectedApps.length === 0) fail(`no example app with slug "${only}"`);

const templateNames = new Set();
for (const app of selectedApps) {
  for (const name of Object.values(app.workflows)) templateNames.add(name);
}
const templates = new Map(
  [...templateNames].map((name) => [name, loadTemplate(name)])
);

// Any template not bound by an app still must not carry an app_doc.
if (!only) {
  for (const file of fs
    .readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".json"))) {
    const name = file.replace(/\.json$/, "");
    if (!templates.has(name)) loadTemplate(name);
  }
}

fs.mkdirSync(APPS_OUT, { recursive: true });
fs.mkdirSync(path.join(PREVIEW, "img"), { recursive: true });

const manifest = [];
const liveSlugs = new Set();
const bundleFiles = [];
const debugInteractions = new Map();

for (const app of selectedApps) {
  const { bundle, values } = buildBundle(app, templates);
  const bundleFile = path.join(APPS_OUT, `${app.slug}.app.json`);
  writeFile(bundleFile, `${JSON.stringify(bundle, null, 2)}\n`);
  bundleFiles.push(bundleFile);

  const preview = previewFor(app, bundle, values);
  writeFile(
    path.join(PREVIEW, `${app.slug}.json`),
    `${JSON.stringify(preview, null, 2)}\n`
  );
  liveSlugs.add(app.slug);
  if (Array.isArray(app.debugInteractions)) {
    debugInteractions.set(app.slug, app.debugInteractions);
  }
  manifest.push({
    slug: app.slug,
    name: app.name,
    emoji: app.emoji,
    featured: app.featured === true,
    workflows: bundle.workflows.length
  });
}

if (!only) {
  writeFile(
    path.join(PREVIEW, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

// Prune previews and bundles for apps that no longer exist, so the marketing
// rig never renders a retired one.
let pruned = 0;
for (const file of only ? [] : fs.readdirSync(PREVIEW)) {
  if (!file.endsWith(".json") || file === "manifest.json") continue;
  const slug = file.replace(/\.json$/, "");
  if (liveSlugs.has(slug)) continue;
  if (checkOnly) fail(`stale preview bundle ${file}`);
  fs.rmSync(path.join(PREVIEW, file));
  const img = path.join(PREVIEW, "img", `${slug}.jpg`);
  if (fs.existsSync(img)) fs.rmSync(img);
  pruned += 1;
}
for (const file of only ? [] : fs.readdirSync(path.join(PREVIEW, "img"))) {
  if (liveSlugs.has(file.replace(/\.jpg$/, ""))) continue;
  if (checkOnly) fail(`stale preview image ${file}`);
  fs.rmSync(path.join(PREVIEW, "img", file));
  pruned += 1;
}
for (const file of only ? [] : fs.readdirSync(APPS_OUT)) {
  if (!file.endsWith(".app.json")) continue;
  if (liveSlugs.has(file.replace(/\.app\.json$/, ""))) continue;
  if (checkOnly) fail(`stale app bundle ${file}`);
  fs.rmSync(path.join(APPS_OUT, file));
  pruned += 1;
}

console.log(
  `apps: ${selectedApps.length} · workflows bound: ${templates.size} · files written: ${changed} · pruned: ${pruned}`
);
console.log(`bundles  → ${path.relative(ROOT, APPS_OUT)}`);
console.log(`previews → ${path.relative(ROOT, PREVIEW)}`);

// ── Validation ───────────────────────────────────────────────────────────────
// Every bundle goes through the same static wiring check an agent would run:
// `nodetool app debug <bundle> --no-run`. It resolves each widget binding
// against the carried graphs, so a broken app fails the build.

if (skipValidate || checkOnly) process.exit(0);

const outDir = fs.mkdtempSync(path.join(ROOT, "nodetool-debug-examples-"));
let failed = 0;
for (const file of bundleFiles) {
  const name = path.basename(file);
  const slug = path.basename(file, ".app.json");
  const args = [
    "tsx",
    "./packages/cli/src/nodetool.ts",
    "app",
    "debug",
    file,
    "--no-run",
    "--out",
    path.join(outDir, slug)
  ];
  const interactions = debugInteractions.get(slug);
  if (interactions) {
    args.push("--interact", JSON.stringify(interactions));
  }
  const result = spawnSync(
    "npx",
    args,
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--conditions=nodetool-dev" }
    }
  );
  const ok = result.status === 0;
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (!ok) {
    failed += 1;
    console.log((result.stdout ?? "").trim());
    console.error(
      (result.stderr ?? "").trim().split("\n").slice(-10).join("\n")
    );
  }
}
fs.rmSync(outDir, { recursive: true, force: true });
if (failed > 0) fail(`${failed} bundle(s) failed validation`);
console.log(`validated ${bundleFiles.length} bundle(s)`);
