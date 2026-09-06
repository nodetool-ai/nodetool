#!/usr/bin/env node
// Rot detector for the shipped example workflows (packages/*/examples/**/*.json
// and the repo-root examples/workflows/*.json):
// nodes get renamed, properties change, models get deprecated, and a shipped
// example that references a now-unknown node type or a missing required
// property is broken for every new install. `nodetool validate` catches this
// statically — unknown node types, missing required properties, unselected
// models, dangling/mis-typed edges — without running the workflow.
//
// This is the CI guardrail (Phase 0 of docs/plans/examples-revamp.md): every
// example must validate with --warnings-as-errors, so a warning-level drift
// (an unselected model, say) fails the gate too, not just hard errors. It
// runs against the built CLI (packages/cli/dist), since validate loads the
// node registry from the decorator packages' dist output.
//
// The weekly scheduled workflow (workflow-example-validation.yaml) covers the
// self-healing side — it re-validates on the same drift and opens a repair PR
// via Claude. This script is the fast, blocking PR/push gate that catches
// drift before it merges at all.
//
// Speed: the validator itself takes milliseconds per graph, but building the
// node registry takes seconds — so spawning `nodetool validate` per file paid
// that cost hundreds of times over. Instead this file doubles as a worker
// (see `isMainThread` below): a pool of worker threads each builds the
// registry once and then pulls graphs off a shared queue. Results are printed
// in input order regardless of the order they finish in.

import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cliValidate = join(repoRoot, "packages/cli/dist/validate/index.js");
const cliRender = join(repoRoot, "packages/cli/dist/commands/validate.js");

// Examples whose graphs drive nodes that exist only in the Python worker. The
// TypeScript registry cannot know those types, so `unknown_node` for exactly
// these names is expected — and nothing else is: every other issue in these
// files still fails the gate. The list is also checked from the other side. A
// name that stops firing (the node got a TypeScript port, or the example
// stopped using it) fails the gate too, so an exemption cannot outlive the
// reason it was written.
//
// Nothing else belongs here. A type that was *removed* from the registry with
// a NODE_TYPE_MIGRATIONS entry is not unknown: `validateGraph` migrates the
// graph first, exactly as `Graph.loadFromDict` does at run time.
const PYTHON_ONLY_NODES = {
  "examples/workflows/lib_librosa_mfcc_cli.json": ["lib.librosa.analysis.MFCC"],
  "examples/workflows/lib_pedalboard_reverb_cli.json": ["lib.pedalboard.Reverb"]
};

/**
 * Drop the `unknown_node` issues naming a declared Python-only type, and
 * report which of them actually fired. Counts and `ok` are recomputed from
 * what is left, so a file with nothing but exempt issues renders as valid.
 */
function withoutPythonOnlyNodes(report, allowed) {
  if (allowed.length === 0) return { report, exercised: [] };
  const allow = new Set(allowed);
  const exercised = new Set();
  const issues = report.issues.filter((issue) => {
    const exempt =
      issue.code === "unknown_node" && allow.has(issue.nodeType ?? "");
    if (exempt) exercised.add(issue.nodeType);
    return !exempt;
  });
  const counts = { errors: 0, warnings: 0, info: 0 };
  for (const issue of issues) {
    if (issue.severity === "error") counts.errors += 1;
    else if (issue.severity === "warning") counts.warnings += 1;
    else counts.info += 1;
  }
  return {
    report: { ...report, issues, counts, ok: counts.errors === 0 },
    exercised: [...exercised]
  };
}

// ---------------------------------------------------------------------------
// Worker: validate one graph file per request, reusing one registry.
// ---------------------------------------------------------------------------

if (!isMainThread) {
  const { runValidate } = await import(pathToFileURL(cliValidate).href);
  const { renderValidation } = await import(pathToFileURL(cliRender).href);

  // Every target here is a JSON file, so the DB is never consulted.
  const deps = {
    loadFromDb: async () => {
      throw new Error("example validation never resolves a workflow by id");
    }
  };

  parentPort.on("message", async (job) => {
    if (job === null) {
      parentPort.close();
      return;
    }
    let output = null;
    let exercised = [];
    try {
      const { report } = await runValidate(job.path, deps);
      const filtered = withoutPythonOnlyNodes(report, job.pythonOnlyNodes ?? []);
      exercised = filtered.exercised;
      if (!filtered.report.ok || filtered.report.counts.warnings > 0) {
        output = renderValidation(filtered.report).join("\n");
      }
    } catch (err) {
      output = err instanceof Error ? (err.stack ?? err.message) : String(err);
    }
    parentPort.postMessage({ index: job.index, output, exercised });
  });

  // Ready for the first job.
  parentPort.postMessage({ ready: true });
} else {
  await main();
}

// ---------------------------------------------------------------------------
// Main thread.
// ---------------------------------------------------------------------------

// Walk packages/**/examples/**/*.json — mirrors the `find packages -path
// '*examples*' -name '*.json'` used by workflow-example-validation.yaml — and
// examples/workflows/*.json at the repo root. The root tree sat outside the
// scan, so a stale model id or node type there drifted with the gate green —
// and those are the CLI-facing examples examples/workflows/README.md tells
// people to run.
function findExamples(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findExamples(full));
    } else if (entry.endsWith(".json") && full.includes("/examples/")) {
      results.push(full);
    }
  }
  return results;
}

// `*.app.json` files are ApplicationBundles: an app document plus the full
// graphs of the workflows it binds. They used to be skipped here, on the
// grounds that `scripts/build-example-apps.mjs` validated them by running
// `nodetool app debug --no-run`. It does not: `app debug` checks widget
// bindings and never consults the node registry, and no CI workflow runs
// build-example-apps at all. The result was that the bundles users actually
// install had no gate on node types, properties, edges, or providers — and
// five of them shipped `provider: "huggingface_fal_ai"`, which the runtime
// cannot construct. Validate each embedded graph with the same validator the
// plain examples get.
function expandBundle(file) {
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { parseError: err.message, workflows: [] };
  }
  const workflows = Array.isArray(bundle?.workflows) ? bundle.workflows : [];
  return {
    parseError: workflows.length === 0 ? "bundle declares no workflows" : null,
    workflows: workflows.map((wf, i) => ({
      label: wf?.name || wf?.key || `workflow[${i}]`,
      graph: wf?.graph
    }))
  };
}

/**
 * Check one shipped composition: it parses, its group is a group clip with
 * children, every parameter names a type the runtime knows and a pointer that
 * lands on a child field, and instantiating it with its defaults yields a
 * document the timeline validator accepts. Returns a problem description, or
 * null when the composition is sound.
 */
async function checkComposition(file) {
  let composition;
  try {
    composition = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return `not parsable JSON: ${err.message}`;
  }
  const paramTypes = new Set(["string", "number", "color", "boolean"]);
  const problems = [];
  if (typeof composition?.id !== "string" || typeof composition?.name !== "string") {
    problems.push("bundle has no id or name");
  }
  if (composition?.group?.mediaType !== "group") {
    problems.push('group is not a clip with mediaType "group"');
  }
  const children = Array.isArray(composition?.children) ? composition.children : [];
  if (children.length === 0) problems.push("composition declares no children");
  for (const [name, param] of Object.entries(composition?.params ?? {})) {
    if (!paramTypes.has(param?.type)) {
      problems.push(`param "${name}" has unknown type "${param?.type}"`);
    }
    const segments = typeof param?.path === "string" && param.path.startsWith("/")
      ? param.path.slice(1).split("/")
      : null;
    let cursor = children;
    for (const segment of segments ?? []) {
      cursor = cursor == null ? undefined : cursor[segment];
    }
    if (segments === null || cursor === undefined) {
      problems.push(`param "${name}" path "${param?.path}" resolves to nothing`);
    }
  }
  if (problems.length > 0) return problems.join("; ");

  const { instantiateComposition } = await import("@nodetool-ai/timeline");
  const { validateTimelineSequence } = await import(
    "@nodetool-ai/execution/timeline-debug"
  );
  let clips;
  try {
    clips = instantiateComposition(composition, { startMs: 0 });
  } catch (err) {
    return `does not instantiate: ${err.message}`;
  }
  const trackIds = [...new Set(clips.map((clip) => clip.trackId))];
  const tracks = trackIds.map((id, index) => ({
    id,
    name: id,
    type: "overlay",
    index,
    visible: true,
    locked: false
  }));
  const report = validateTimelineSequence(
    { tracks, clips, markers: [] },
    { fps: 30, width: 1920, height: 1080 }
  );
  if (report.errors.length > 0) {
    return report.errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
  }
  return null;
}

/**
 * Check one shipped storyboard: it parses, every shot carries the text a
 * director writes, and every `package://` still and clip it names is a file
 * that exists. Returns a problem description, or null when the board is sound.
 */
function checkStoryboard(file) {
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return `not parsable JSON: ${err.message}`;
  }
  const shots = bundle?.document?.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    return "bundle declares no shots";
  }
  const problems = [];
  for (const [index, shot] of shots.entries()) {
    const where = shot?.slug ? `shot "${shot.slug}"` : `shot ${index}`;
    if (typeof shot?.action !== "string" || shot.action.trim() === "") {
      problems.push(`${where} has no action text`);
    }
    for (const [what, ref] of [
      ["still", shot?.keyframe],
      ["clip", shot?.clip]
    ]) {
      const match = /^package:\/\/([^/]+)\/(.+)$/.exec(ref?.uri ?? "");
      if (!match) {
        problems.push(`${where} has no package:// ${what}`);
        continue;
      }
      const onDisk = join(
        repoRoot,
        "packages/base-nodes/nodetool/assets",
        match[1],
        ...match[2].split("/")
      );
      if (!statSafe(onDisk)) {
        problems.push(`${where} ${what} is missing: ${ref.uri}`);
      }
    }
  }
  return problems.length > 0 ? problems.join("\n") : null;
}

// A recipe manifest carries no graph either: it names the shipped example
// workflows its chain runs, in order. What rots is a step whose example was
// renamed — the app drops such a recipe from its Examples page and the site's
// bundle generator fails, so catch it here with the rest of the examples.
function checkRecipe(file, exampleNames) {
  let recipe;
  try {
    recipe = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return `not parsable JSON: ${err.message}`;
  }
  const problems = [];
  const slug = basename(file, ".recipe.json");
  if (recipe?.slug !== slug) {
    problems.push(`declares slug "${recipe?.slug}" but the file is ${slug}.recipe.json`);
  }
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length === 0) {
    return "recipe declares no steps";
  }
  const named = [];
  for (const [index, step] of steps.entries()) {
    const where = step?.example ? `step "${step.example}"` : `step ${index}`;
    for (const [what, name] of [
      ["example", step?.example],
      ["alternative", step?.alternative?.example]
    ]) {
      if (what === "alternative" && !step?.alternative) continue;
      if (typeof name !== "string" || !exampleNames.has(name)) {
        problems.push(`${where} names ${what} "${name}", which no shipped example matches`);
        continue;
      }
      if (what === "example") named.push(name);
    }
    if (typeof step?.role !== "string" || step.role.trim() === "") {
      problems.push(`${where} has no role text`);
    }
    if (typeof step?.handoff !== "string" || step.handoff.trim() === "") {
      problems.push(`${where} has no handoff text`);
    }
  }
  if (!named.includes(recipe?.hero)) {
    problems.push(`hero "${recipe?.hero}" is not one of its steps`);
  }
  return problems.length > 0 ? problems.join("\n") : null;
}

function statSafe(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

function indent(text) {
  return text
    .split("\n")
    .map((line) => `        ${line}`)
    .join("\n");
}

// Hand the queue to a pool of workers, each of which builds the node registry
// once. A worker asks for the next job as soon as it finishes the last one, so
// a slow graph does not stall a shard. Resolves to one entry per job, in job
// order.
function runPool(jobs) {
  const size = Math.max(1, Math.min(availableParallelism(), jobs.length));
  const results = new Array(jobs.length).fill(null);
  let next = 0;

  return Promise.all(
    Array.from({ length: size }, () => {
      const worker = new Worker(fileURLToPath(import.meta.url));
      return new Promise((resolveWorker, rejectWorker) => {
        const send = () => {
          if (next >= jobs.length) {
            worker.postMessage(null);
            return;
          }
          const index = next++;
          worker.postMessage({
            index,
            path: jobs[index].path,
            pythonOnlyNodes: jobs[index].pythonOnlyNodes ?? []
          });
        };
        worker.on("message", (msg) => {
          if (!msg.ready) {
            results[msg.index] = {
              output: msg.output,
              exercised: msg.exercised ?? []
            };
          }
          send();
        });
        worker.on("error", rejectWorker);
        worker.on("exit", resolveWorker);
      });
    })
  ).then(() => results);
}

async function main() {
  const packageExamples = findExamples(join(repoRoot, "packages")).sort();
  const rootExamples = findExamples(join(repoRoot, "examples/workflows")).sort();

  if (rootExamples.length === 0) {
    console.error(
      "No example JSON files found under examples/workflows/ — check the search path."
    );
    process.exit(1);
  }

  const examples = [...packageExamples, ...rootExamples];
  const bundles = examples.filter((f) => f.endsWith(".app.json"));
  const storyboards = examples.filter((f) => f.endsWith(".storyboard.json"));
  const compositions = examples.filter((f) => f.endsWith(".composition.json"));
  const recipes = examples.filter((f) => f.endsWith(".recipe.json"));
  const workflowExamples = examples.filter(
    (f) =>
      !f.endsWith(".app.json") &&
      !f.endsWith(".storyboard.json") &&
      !f.endsWith(".composition.json") &&
      !f.endsWith(".recipe.json")
  );

  if (packageExamples.length === 0) {
    console.error(
      "No example JSON files found under packages/**/examples/ — check the search path."
    );
    process.exit(1);
  }

  if (bundles.length === 0) {
    console.error(
      "No *.app.json bundles found under packages/**/examples/ — check the search path."
    );
    process.exit(1);
  }

  if (storyboards.length === 0) {
    console.error(
      "No *.storyboard.json bundles found under packages/**/examples/ — check the search path."
    );
    process.exit(1);
  }

  if (compositions.length === 0) {
    console.error(
      "No *.composition.json bundles found under packages/**/examples/ — check the search path."
    );
    process.exit(1);
  }

  if (recipes.length === 0) {
    console.error(
      "No *.recipe.json manifests found under packages/**/examples/ — check the search path."
    );
    process.exit(1);
  }

  console.log(
    `Validating ${workflowExamples.length} example workflow(s), ` +
      `${bundles.length} app bundle(s), ` +
      `${storyboards.length} storyboard(s), ` +
      `${compositions.length} composition(s), and ` +
      `${recipes.length} recipe(s)...\n`
  );

  // Each job is one graph to validate; `failure` short-circuits a job the
  // main thread already knows is broken (an unparseable bundle, say).
  const jobs = [];
  for (const file of workflowExamples) {
    const label = file.slice(repoRoot.length + 1);
    jobs.push({
      label,
      path: file,
      pythonOnlyNodes: PYTHON_ONLY_NODES[label] ?? []
    });
  }

  const declaredFiles = Object.keys(PYTHON_ONLY_NODES).filter(
    (label) => !jobs.some((job) => job.label === label)
  );
  if (declaredFiles.length > 0) {
    console.error(
      `PYTHON_ONLY_NODES names ${declaredFiles.length} file(s) the scan does not ` +
        `reach:\n  ${declaredFiles.join("\n  ")}\nRemove the entry or fix the path.`
    );
    process.exit(1);
  }

  // Each bundle's embedded workflows are written to a scratch file and run
  // through the same validator, so a bundle graph is held to exactly the
  // standard a standalone example graph is.
  const scratch = mkdtempSync(join(tmpdir(), "validate-app-bundles-"));
  for (const [b, file] of bundles.entries()) {
    const rel = file.slice(repoRoot.length + 1);
    const { parseError, workflows } = expandBundle(file);
    if (parseError) {
      jobs.push({ label: rel, failure: parseError });
      continue;
    }
    for (const [i, wf] of workflows.entries()) {
      const label = `${rel} › ${wf.label}`;
      if (!wf.graph) {
        jobs.push({ label, failure: "bundled workflow has no graph" });
        continue;
      }
      const scratchFile = join(scratch, `${b}-${i}.json`);
      writeFileSync(
        scratchFile,
        JSON.stringify({ name: wf.label, graph: wf.graph })
      );
      jobs.push({ label, path: scratchFile, scrub: scratchFile });
    }
  }

  // A storyboard bundle carries no graph, so the node registry has nothing to
  // say about it. What rots instead is its media: a still or clip renamed in
  // the asset directory leaves the shipped board pointing at a 404. Check the
  // text and the files here, where the rest of the shipped examples are checked.
  for (const file of storyboards) {
    jobs.push({ label: file.slice(repoRoot.length + 1), failure: checkStoryboard(file) });
  }
  // A composition is a document fragment, not a graph: what rots is a
  // parameter pointer that no longer lands on a child field, or a clip the
  // timeline validator has stopped accepting.
  for (const file of compositions) {
    jobs.push({
      label: file.slice(repoRoot.length + 1),
      failure: await checkComposition(file)
    });
  }
  // A recipe is checked against the workflow examples this scan already found,
  // by the name each step gives — the same name the app resolves at runtime.
  const exampleNames = new Set(
    workflowExamples.map((file) => basename(file, ".json"))
  );
  for (const file of recipes) {
    jobs.push({
      label: file.slice(repoRoot.length + 1),
      failure: checkRecipe(file, exampleNames)
    });
  }

  const pending = jobs.filter((job) => job.path !== undefined);
  const outputs = await runPool(pending);
  for (const [i, job] of pending.entries()) {
    job.output = outputs[i].output;
    // An exemption that no longer fires is stale: the node was ported to
    // TypeScript, or the example stopped using it. Either way the entry now
    // hides whatever else it would cover, so it fails the gate.
    const unused = (job.pythonOnlyNodes ?? []).filter(
      (type) => !outputs[i].exercised.includes(type)
    );
    if (unused.length > 0) {
      job.output = [
        job.output,
        `stale PYTHON_ONLY_NODES entry in scripts/validate-examples.mjs — ` +
          `no longer reported as unknown: ${unused.join(", ")}`
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  rmSync(scratch, { recursive: true, force: true });

  let failures = 0;
  for (const job of jobs) {
    const output = job.failure ?? job.output;
    if (!output) {
      console.log(`  ok    ${job.label}`);
      continue;
    }
    failures += 1;
    console.log(`  FAIL  ${job.label}`);
    // A bundle graph was validated through a scratch file; report it under the
    // bundle path the reader can actually open.
    console.log(
      indent(job.scrub ? output.replaceAll(job.scrub, job.label) : output)
    );
  }

  console.log(`\n${jobs.length - failures}/${jobs.length} graphs validate cleanly.`);

  if (failures > 0) {
    console.error(
      `\n${failures} graph(s) failed validation. Fix the graph to match the current node registry, or run:\n` +
        `  npm run dev:nodetool -- validate "<path>" --json\n` +
        `to see the full report for a single file.\n` +
        `For a bundled app graph, the path is the *.app.json file; the failing\n` +
        `workflow is named after the › in the line above.`
    );
    process.exit(1);
  }
}
