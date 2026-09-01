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
    outputs,
    nodeIds: new Set(example.graph.nodes.map((n) => n.id))
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
    props: { ...base, fit: "contain", height: 280, placeholder: "Your result appears here" }
  }),
  Video: (base) => ({
    type: "Video",
    props: { ...base, height: 320, placeholder: "Your video appears here" }
  }),
  Audio: (base) => ({ type: "Audio", props: { ...base, placeholder: "Your audio appears here" } }),
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
  { trigger: "change", kind: "run", operationId, pace: pace ?? "live", key: "", value: "" }
];

/**
 * One control widget. `ctx` carries the app's operation table (operation id →
 * { key, template }), the id allocator, and the preview value sink.
 */
function buildControl(control, ctx) {
  const nextId = ctx.nextId;

  const opInput = (op, name) => {
    const operation = ctx.operations.get(op);
    if (!operation) fail(`${ctx.app.name}: control names unknown operation "${op}"`);
    const node = operation.template.inputs.get(name);
    if (!node) {
      fail(
        `${ctx.app.name}: operation "${op}" (${operation.template.name}) has no input named "${name}"`
      );
    }
    return node;
  };

  if (control.note !== undefined) {
    return { type: "Text", props: { id: nextId(["note"]), text: control.note } };
  }

  // A run button lists the operations it starts; `run: true` on a slider or an
  // audio drop zone means "re-run on change" instead.
  if (Array.isArray(control.run)) {
    for (const op of control.run) {
      if (!ctx.operations.has(op)) {
        fail(`${ctx.app.name}: run button targets unknown operation "${op}"`);
      }
    }
    return {
      type: "Button",
      props: {
        id: nextId(["btn", control.run.join("-")]),
        label: control.label,
        variant: "contained",
        color: "primary",
        events: runEvents(control.run)
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
    ctx.useVariable(control.image);
    return {
      type: "ImageInput",
      props: {
        id: nextId(["in", control.image]),
        binding: varBinding(control.image),
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
    const node = opInput(control.op, control.input);
    return {
      type: "WorkflowInput",
      props: {
        id: nextId(["in", control.op, control.input]),
        binding: inputBinding(control.op, node.id),
        label: control.label,
        events: []
      }
    };
  }

  if (control.text !== undefined) {
    const node = opInput(control.op, control.text);
    ctx.seedInputValue(control.op, node);
    return {
      type: "TextInput",
      props: {
        id: nextId(["in", control.op, control.text]),
        binding: inputBinding(control.op, node.id),
        label: control.label,
        multiline: control.multiline === true,
        events: []
      }
    };
  }

  if (control.number !== undefined) {
    const node = opInput(control.op, control.number);
    ctx.seedInputValue(control.op, node);
    return {
      type: "NumberInput",
      props: {
        id: nextId(["in", control.op, control.number]),
        binding: inputBinding(control.op, node.id),
        label: control.label,
        min: control.min,
        max: control.max,
        events: []
      }
    };
  }

  if (control.select !== undefined) {
    const node = opInput(control.op, control.select);
    ctx.seedInputValue(control.op, node);
    return {
      type: "Select",
      props: {
        id: nextId(["in", control.op, control.select]),
        binding: inputBinding(control.op, node.id),
        label: control.label,
        options: control.options.map((value) => ({ value })),
        events: []
      }
    };
  }

  if (control.color !== undefined) {
    const node = opInput(control.op, control.color);
    ctx.seedInputValue(control.op, node);
    return {
      type: "ColorInput",
      props: {
        id: nextId(["in", control.op, control.color]),
        binding: inputBinding(control.op, node.id),
        label: control.label,
        events: []
      }
    };
  }

  if (control.audio !== undefined) {
    const node = opInput(control.op, control.audio);
    return {
      type: "AudioInput",
      props: {
        id: nextId(["in", control.op, control.audio]),
        binding: inputBinding(control.op, node.id),
        label: control.label,
        events: control.run ? changeRun(control.op, "release") : []
      }
    };
  }

  if (control.slider !== undefined) {
    const operation = ctx.operations.get(control.op);
    if (!operation) fail(`${ctx.app.name}: slider names unknown operation "${control.op}"`);
    let binding;
    let idParts;
    if (typeof control.slider === "string") {
      const node = opInput(control.op, control.slider);
      binding = inputBinding(control.op, node.id);
      idParts = ["slider", control.op, control.slider];
      ctx.seedInputValue(control.op, node);
    } else {
      const { node, prop } = control.slider;
      if (!operation.template.nodeIds.has(node)) {
        fail(
          `${ctx.app.name}: slider binds node "${node}", which ${operation.template.name} does not have`
        );
      }
      binding = propBinding(control.op, node, prop);
      idParts = ["slider", control.op, node, prop];
      if (control.default !== undefined) ctx.values[binding] = control.default;
    }
    return {
      type: "Slider",
      props: {
        id: nextId(idParts),
        binding,
        label: control.label,
        min: control.min ?? 0,
        max: control.max ?? 100,
        step: control.step ?? 1,
        events: control.run ? changeRun(control.op, control.pace ?? "release") : []
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
      fail(`${ctx.app.name}: progress names unknown operation "${result.progress}"`);
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

  if (result.note !== undefined) {
    items.push({ type: "Text", props: { id: nextId(["note"]), text: result.note } });
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
    if (!operation) fail(`${ctx.app.name}: result names unknown operation "${result.op}"`);
    const node = operation.template.outputs.get(result.show);
    if (!node) {
      fail(
        `${ctx.app.name}: operation "${result.op}" (${operation.template.name}) has no output named "${result.show}"`
      );
    }
    binding = outputBinding(result.op, node.id);
    idParts = ["out", result.op, result.show];
    ctx.displayed.add(`${result.op}:${node.id}`);
  }

  const make = READ_WIDGET[result.as ?? "Markdown"];
  if (!make) fail(`${ctx.app.name}: unknown display widget "${result.as}"`);
  if (result.label) {
    items.push({
      type: "Heading",
      props: { id: nextId(["lbl", ...idParts.slice(1)]), text: result.label, level: "3" }
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
    const templateName = app.workflows[operation.workflow];
    if (!templateName) {
      fail(`${app.name}: operation "${operation.id}" names unknown workflow key "${operation.workflow}"`);
    }
    operations.set(operation.id, {
      spec: operation,
      key: operation.workflow,
      template: templates.get(templateName)
    });
  }

  const ctx = {
    app,
    operations,
    nextId,
    values,
    displayed,
    useVariable: (id) => {
      if (!declaredVariables.has(id)) {
        fail(`${app.name}: widget binds variable "${id}", which the app does not declare`);
      }
    },
    // A text/number/select control seeds the preview with the graph's own
    // default, which is what makes the screenshot look filled in.
    seedInputValue: (op, node) => {
      const value = node.data?.value;
      if (value === undefined || value === null || typeof value === "object") return;
      values[inputBinding(op, node.id)] = value;
    }
  };

  const content = [
    {
      type: "Heading",
      props: { id: nextId(["title"]), text: `${app.emoji} ${app.name}`, level: "1" }
    },
    { type: "Text", props: { id: nextId(["tagline"]), text: app.tagline } }
  ];
  if (app.note) {
    content.push({ type: "Text", props: { id: nextId(["app-note"]), text: app.note } });
  }

  for (const section of app.sections) {
    const controls = (section.controls ?? []).map((control) => buildControl(control, ctx));
    const results = (section.results ?? []).flatMap((result) => buildResult(result, ctx));
    const left = {
      type: "Container",
      props: { id: nextId(["panel", section.title]), title: section.title, content: controls }
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
    const template = operations.get(operation.id).template;
    const inputs = {};
    for (const [name, mapping] of Object.entries(operation.inputs ?? {})) {
      const node = template.inputs.get(name);
      if (!node) {
        fail(`${app.name}: operation "${operation.id}" maps input "${name}", which ${template.name} does not have`);
      }
      if (mapping.from === "variable" && !declaredVariables.has(mapping.variableId)) {
        fail(`${app.name}: operation "${operation.id}" reads undeclared variable "${mapping.variableId}"`);
      }
      inputs[node.id] = mapping;
    }
    const outputs = {};
    for (const [name, mapping] of Object.entries(operation.outputs ?? {})) {
      const node = template.outputs.get(name);
      if (!node) {
        fail(`${app.name}: operation "${operation.id}" maps output "${name}", which ${template.name} does not have`);
      }
      if (mapping.to === "variable" && !declaredVariables.has(mapping.variableId)) {
        fail(`${app.name}: operation "${operation.id}" writes undeclared variable "${mapping.variableId}"`);
      }
      outputs[node.id] = mapping;
    }
    return {
      id: operation.id,
      name: operation.name,
      workflowId: operation.workflow,
      inputs,
      outputs,
      policy: operation.policy ?? "replace",
      ...(operation.timeoutMs ? { timeoutMs: operation.timeoutMs } : {})
    };
  });

  const document = {
    schemaVersion: APP_SCHEMA_VERSION,
    // No root title: the first widget is already a Heading carrying the app's
    // emoji and name, and the runtime renders a root title as a heading of its
    // own — so setting both printed the name twice on every example.
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
    return {
      key,
      name: template.name,
      description: template.description,
      // Stable across installs: a second app binding the same template reuses
      // the workflow row this one created instead of duplicating it.
      sourceId: `${PACKAGE}/${template.name}`,
      graph: template.graph,
      version: null,
      graphHash: null
    };
  });
  return {
    bundle: {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      name: app.name,
      description: app.description,
      app: document,
      workflows
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
    fail(`${path.relative(ROOT, file)} is out of date — run node scripts/build-example-apps.mjs`);
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
          (node) => node.type.startsWith("nodetool.input.") || isOutputNode(node)
        ),
        edges: []
      }
    })),
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
      console.log(`❌ ${app.slug}: ${error ?? report?.verdict?.reason ?? "no bundle"}`);
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

const templateNames = new Set();
for (const app of EXAMPLE_APPS) {
  for (const name of Object.values(app.workflows)) templateNames.add(name);
}
const templates = new Map(
  [...templateNames].map((name) => [name, loadTemplate(name)])
);

// Any template not bound by an app still must not carry an app_doc.
for (const file of fs.readdirSync(EXAMPLES).filter((f) => f.endsWith(".json"))) {
  const name = file.replace(/\.json$/, "");
  if (!templates.has(name)) loadTemplate(name);
}

fs.mkdirSync(APPS_OUT, { recursive: true });
fs.mkdirSync(path.join(PREVIEW, "img"), { recursive: true });

const manifest = [];
const liveSlugs = new Set();
const bundleFiles = [];

for (const app of EXAMPLE_APPS) {
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
  manifest.push({
    slug: app.slug,
    name: app.name,
    emoji: app.emoji,
    featured: app.featured === true,
    workflows: bundle.workflows.length
  });
}

writeFile(
  path.join(PREVIEW, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

// Prune previews and bundles for apps that no longer exist, so the marketing
// rig never renders a retired one.
let pruned = 0;
for (const file of fs.readdirSync(PREVIEW)) {
  if (!file.endsWith(".json") || file === "manifest.json") continue;
  const slug = file.replace(/\.json$/, "");
  if (liveSlugs.has(slug)) continue;
  if (checkOnly) fail(`stale preview bundle ${file}`);
  fs.rmSync(path.join(PREVIEW, file));
  const img = path.join(PREVIEW, "img", `${slug}.jpg`);
  if (fs.existsSync(img)) fs.rmSync(img);
  pruned += 1;
}
for (const file of fs.readdirSync(path.join(PREVIEW, "img"))) {
  if (liveSlugs.has(file.replace(/\.jpg$/, ""))) continue;
  if (checkOnly) fail(`stale preview image ${file}`);
  fs.rmSync(path.join(PREVIEW, "img", file));
  pruned += 1;
}
for (const file of fs.readdirSync(APPS_OUT)) {
  if (!file.endsWith(".app.json")) continue;
  if (liveSlugs.has(file.replace(/\.app\.json$/, ""))) continue;
  if (checkOnly) fail(`stale app bundle ${file}`);
  fs.rmSync(path.join(APPS_OUT, file));
  pruned += 1;
}

console.log(
  `apps: ${EXAMPLE_APPS.length} · workflows bound: ${templates.size} · files written: ${changed} · pruned: ${pruned}`
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
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "./packages/cli/src/nodetool.ts",
      "app",
      "debug",
      file,
      "--no-run",
      "--out",
      path.join(outDir, path.basename(file, ".app.json"))
    ],
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
    console.error((result.stderr ?? "").trim().split("\n").slice(-10).join("\n"));
  }
}
fs.rmSync(outDir, { recursive: true, force: true });
if (failed > 0) fail(`${failed} bundle(s) failed validation`);
console.log(`validated ${bundleFiles.length} bundle(s)`);
