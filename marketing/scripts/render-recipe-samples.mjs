// Renders the recipe samples by running the shipped example workflows against
// live models, then writes the manifest generate-recipes.mjs reads.
//
//   node scripts/render-recipe-samples.mjs                 # every recipe
//   node scripts/render-recipe-samples.mjs --only trailer  # one, by slug fragment
//   node scripts/render-recipe-samples.mjs --dry-run       # print the plan
//
// This spends real money on whatever keys the machine holds. It is not on any
// CI path and nothing in the build runs it — the artifacts it writes are
// checked in, and this is the record of how they were made.
//
// The plan and the routing table are in recipe-samples.mjs. What this file
// does is execute them: seed each workflow's input nodes from the step before,
// swap every model reference through ROUTES, run it on the kernel, and write
// what came back. A model reference with no ROUTES entry that this machine
// cannot reach fails the render rather than being silently dropped.
//
// Composition (contact sheets, web encodes) is deliberately last and separate:
// a failed encode should not cost another round of generation.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROUTES, PLAN } from "./recipe-samples.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MARKETING, "..");
const EXAMPLES = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base",
);
/**
 * Where to run the `nodetool` CLI from. Normally the repo itself; set
 * NODETOOL_REPO when rendering from a git worktree, whose per-package
 * node_modules npm never installed (the CLI fails to resolve its own deps).
 */
const CLI_ROOT = process.env.NODETOOL_REPO ?? REPO_ROOT;
const WORK = path.join(REPO_ROOT, "nodetool-debug/recipe-samples");
const MANIFEST = path.join(__dirname, "recipe-samples.manifest.json");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ONLY = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
/** Re-run steps whose artifact is already on disk. Every one of them spends. */
const FORCE = argv.includes("--force");

const EXT = { image: "png", video: "mp4", audio: "mp3" };

function fail(message) {
  console.error(`render-recipe-samples: ${message}`);
  process.exit(1);
}

function log(message) {
  console.error(message);
}

/** Block for `ms`, since every caller here is synchronous. */
function sleep(ms) {
  execFileSync("sleep", [String(Math.ceil(ms / 1000))], { stdio: "ignore" });
}

/**
 * Run the CLI with its stdout landing in a file (a pipe truncates base64).
 *
 * No shell: the arguments are prompts and absolute paths, and the redirect is
 * an open file descriptor handed to the child rather than a `>` in a command
 * string. Quoting a prompt into `sh -c` is a losing game — a backslash escapes
 * out of any quoting scheme applied one character at a time.
 *
 * Retries on failure with a widening backoff. The reason is Replicate: an
 * account under $5 of credit is throttled to 6 predictions a minute with a
 * burst of one, and a chain that hands each step's output to the next hits
 * that immediately. A rate limit is not a reason to lose the generations
 * already paid for upstream.
 */
function cli(args, stdoutFile) {
  const backoff = [0, 20_000, 45_000, 90_000];
  for (let attempt = 0; attempt < backoff.length; attempt += 1) {
    if (backoff[attempt] > 0) {
      log(`    retry ${attempt} after ${backoff[attempt] / 1000}s`);
      sleep(backoff[attempt]);
    }
    const stdout = fs.openSync(stdoutFile, "w");
    try {
      execFileSync("npm", ["run", "--silent", "dev:nodetool", "--", ...args], {
        cwd: CLI_ROOT,
        stdio: ["ignore", stdout, "inherit"],
      });
      return;
    } catch (error) {
      if (attempt === backoff.length - 1) throw error;
    } finally {
      fs.closeSync(stdout);
    }
  }
}

/**
 * Sniff a media format from its leading bytes.
 *
 * Not from the extension: NodeTool's ImageRef carries no mime type, and the
 * Replicate path hands back WebP bytes for a node whose output is just
 * "image". Writing those to `.png` and declaring `image/png` downstream is how
 * a later provider ends up answering "File type not supported".
 */
function sniff(bytes) {
  const head = bytes.subarray(0, 12);
  const ascii = head.toString("latin1");
  if (ascii.startsWith("\x89PNG")) return { ext: "png", mime: "image/png", type: "image" };
  if (head[0] === 0xff && head[1] === 0xd8) {
    return { ext: "jpg", mime: "image/jpeg", type: "image" };
  }
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp", type: "image" };
  }
  if (ascii.slice(4, 8) === "ftyp") return { ext: "mp4", mime: "video/mp4", type: "video" };
  if (ascii.startsWith("ID3") || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
    return { ext: "mp3", mime: "audio/mpeg", type: "audio" };
  }
  if (ascii.startsWith("OggS")) return { ext: "ogg", mime: "audio/ogg", type: "audio" };
  if (ascii.startsWith("\x1a\x45\xdf\xa3")) {
    return { ext: "webm", mime: "video/webm", type: "video" };
  }
  return null;
}

/** Read a produced artifact back as the data URI an input node accepts. */
function asRef(file) {
  const bytes = fs.readFileSync(file);
  const kind = sniff(bytes);
  if (!kind) fail(`cannot tell what ${path.basename(file)} is from its bytes`);
  return {
    type: kind.type,
    uri: `data:${kind.mime};base64,${bytes.toString("base64")}`,
  };
}

/**
 * Rewrite every model reference in a graph through ROUTES.
 *
 * A reference is any object carrying a `provider` string, wherever it sits —
 * a top-level property, a settings object, an entry in a list. Returns the
 * routes that were actually applied, which is what the page's model list is
 * built from: nothing about it is typed by hand.
 */
function applyRoutes(graph, applied) {
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.provider === "string" && typeof value.id === "string") {
      const key = `${value.provider}:${value.id}`;
      const route = ROUTES[key];
      if (route) {
        applied.set(key, route);
        value.provider = route.provider;
        value.id = route.id;
        value.name = route.name;
        Object.assign(value, route.extra ?? {});
      } else {
        // Not routed: the graph runs it as shipped. Record it so the page can
        // say so, rather than listing only the models that were redirected.
        applied.set(key, {
          provider: value.provider,
          id: value.id,
          name: value.name ?? value.id,
          grade: "exact",
          why: "run as the workflow ships it",
        });
      }
    }
    for (const item of Object.values(value)) walk(item);
  };
  walk(graph);
}

/** Drop a node from the graph, rewiring what it fed from what fed it. */
function bypass(graph, nodeId) {
  const into = graph.edges.filter((e) => e.target === nodeId);
  if (into.length === 0) fail(`cannot bypass "${nodeId}": nothing feeds it`);
  const source = into[0];
  for (const edge of graph.edges) {
    if (edge.source === nodeId) {
      edge.source = source.source;
      edge.sourceHandle = source.sourceHandle;
    }
  }
  graph.edges = graph.edges.filter((e) => e.target !== nodeId);
  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
}

/** Downscale a clip so a later step does not carry a 100 MB data URI. */
function downscale(file, width) {
  const out = file.replace(/\.mp4$/, `-${width}.mp4`);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-y", "-i", file, "-vf", `scale=${width}:-2`, "-c:v",
     "libx264", "-crf", "30", "-preset", "slow", "-an", "-movflags",
     "+faststart", out],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return out;
}

/** One `generate` step: a direct provider call, no workflow. */
function runGenerate(step, outDir) {
  const out = path.join(outDir, `${step.id}.png`);
  log(`  ${step.id}: generate ${step.generate.provider}/${step.generate.model}`);
  if (DRY) return { kind: "file", value: out };
  cli(
    [
      "generate",
      step.generate.provider,
      step.generate.model,
      step.generate.prompt,
      "--aspect-ratio",
      step.generate.aspect,
      "-o",
      out,
    ],
    "/dev/null",
  );
  // `generate` picks the extension the provider returned.
  const produced = [".png", ".jpg", ".webp"]
    .map((ext) => out.replace(/\.png$/, ext))
    .find((f) => fs.existsSync(f));
  if (!produced) fail(`${step.id}: generate wrote nothing`);
  return { kind: "file", value: produced };
}

/** One workflow step: seed, route, run, save. */
function runWorkflow(step, outDir, outputs, applied) {
  const file = path.join(EXAMPLES, `${step.workflow}.json`);
  if (!fs.existsSync(file)) fail(`${step.id}: no example named "${step.workflow}"`);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));

  applyRoutes(doc.graph, applied);
  for (const nodeId of step.bypass ?? []) bypass(doc.graph, nodeId);
  // Node data that is not exposed as a graph input (a bed's duration).
  for (const [nodeId, patch] of Object.entries(step.overrides ?? {})) {
    const node = doc.graph.nodes.find((n) => n.id === nodeId);
    if (!node) fail(`${step.id}: no node "${nodeId}" to override`);
    Object.assign(node.data, patch);
  }

  const seeded = new Set();
  for (const node of doc.graph.nodes) {
    if (!String(node.type).startsWith("nodetool.input.")) continue;
    const seed = step.seeds?.[node.data?.name];
    if (!seed) continue;
    if ("value" in seed) {
      node.data.value = seed.value;
    } else if (DRY) {
      // Nothing has been produced yet; a dry run only checks that the plan's
      // step ids and input names line up.
      seeded.add(node.data.name);
      continue;
    } else {
      const source = outputs.get(seed.from);
      if (!source) fail(`${step.id}: step "${seed.from}" produced nothing to seed from`);
      if (source.kind === "text") {
        node.data.value = source.value;
      } else {
        const file = seed.downscale
          ? downscale(source.value, seed.downscale)
          : source.value;
        node.data.value = asRef(file);
      }
    }
    seeded.add(node.data.name);
  }
  const missing = Object.keys(step.seeds ?? {}).filter((k) => !seeded.has(k));
  if (missing.length > 0) fail(`${step.id}: no input node named ${missing.join(", ")}`);

  const wf = path.join(outDir, `${step.id}.workflow.json`);
  fs.writeFileSync(wf, JSON.stringify(doc, null, 1));
  log(`  ${step.id}: run "${step.workflow}"`);
  if (DRY) return null;

  const stdout = path.join(outDir, `${step.id}.out.json`);
  cli(["workflows", "run", wf, "--json"], stdout);
  const parsed = JSON.parse(fs.readFileSync(stdout, "utf8"));

  let produced = null;
  let index = 0;
  for (const values of Object.values(parsed.outputs ?? {})) {
    // A fan-out step (the hook factory) returns a list, so number them rather
    // than writing every image to one path and keeping only the last.
    const items = [].concat(values).flat();
    for (const value of items) {
      if (value && typeof value === "object" && typeof value.data === "string") {
        const bytes = Buffer.from(value.data, "base64");
        const suffix = items.length > 1 ? `-${index}` : "";
        const kind = sniff(bytes);
        const out = path.join(
          outDir,
          `${step.id}${suffix}.${kind?.ext ?? EXT[value.type] ?? "bin"}`,
        );
        fs.writeFileSync(out, bytes);
        produced = produced ?? { kind: "file", value: out };
        index += 1;
        log(`    → ${path.basename(out)}`);
      } else if (typeof value === "string") {
        fs.writeFileSync(path.join(outDir, `${step.id}.txt`), value);
        produced = produced ?? { kind: "text", value };
        log(`    → ${value.slice(0, 90)}`);
      }
    }
  }
  if (produced === null) fail(`${step.id}: the run produced no output`);
  return produced;
}

/** An artifact this step already produced, so a re-run does not re-spend. */
function cachedArtifact(step, outDir) {
  for (const ext of ["png", "jpg", "webp", "mp4", "mp3", "txt"]) {
    const file = path.join(outDir, `${step.id}.${ext}`);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      return ext === "txt"
        ? { kind: "text", value: fs.readFileSync(file, "utf8") }
        : { kind: "file", value: file };
    }
  }
  return null;
}

/** Read a step's models without running it, for the cached path. */
function recordRoutes(step, applied) {
  const file = path.join(EXAMPLES, `${step.workflow}.json`);
  if (!fs.existsSync(file)) return;
  applyRoutes(JSON.parse(fs.readFileSync(file, "utf8")).graph, applied);
}

function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const manifest = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    : {};
  // Cross-recipe seeds (the ad engine reuses the SKU packshot) resolve through
  // one shared map keyed "<recipe>:<step>", so a partial `--only` run can still
  // read what an earlier full run produced.
  const outputs = new Map();
  for (const [recipe, entry] of Object.entries(manifest)) {
    for (const [id, file] of Object.entries(entry.artifacts ?? {})) {
      const abs = path.join(WORK, recipe, path.basename(file));
      if (fs.existsSync(abs)) {
        outputs.set(`${recipe}:${id}`, { kind: "file", value: abs });
      }
    }
  }

  for (const plan of PLAN) {
    if (ONLY && !plan.recipe.includes(ONLY)) continue;
    log(`\n${plan.recipe}`);
    const outDir = path.join(WORK, plan.recipe);
    fs.mkdirSync(outDir, { recursive: true });
    const applied = new Map();
    const artifacts = {};

    for (const step of plan.steps) {
      const cached = cachedArtifact(step, outDir);
      let produced;
      if (cached && !FORCE) {
        const label =
          cached.kind === "file" ? path.basename(cached.value) : "saved text";
        log(`  ${step.id}: reuse ${label}`);
        produced = cached;
        // A reused step still contributes its models to the page's list.
        if (step.workflow) recordRoutes(step, applied);
      } else {
        produced = step.generate
          ? runGenerate(step, outDir)
          : runWorkflow(step, outDir, outputs, applied);
        if (!DRY) sleep(12_000);
      }
      if (produced) {
        outputs.set(step.id, produced);
        outputs.set(`${plan.recipe}:${step.id}`, produced);
        if (produced.kind === "file") {
          artifacts[step.id] = path.basename(produced.value);
        }
      }
    }

    if (DRY) continue;
    const GRADES = new Set(["exact", "upgrade", "substitute"]);
    const ungraded = [...applied.values()].filter((r) => !GRADES.has(r.grade));
    if (ungraded.length > 0) {
      fail(`${plan.recipe}: ungraded route(s) ${ungraded.map((r) => r.id).join(", ")}`);
    }
    manifest[plan.recipe] = {
      artifacts,
      producedBy: [...applied.entries()].map(([shipped, route]) => ({
        shipped,
        ran: `${route.provider}:${route.id}`,
        grade: route.grade,
        why: route.why,
      })),
    };
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    log(`  manifest: ${Object.keys(artifacts).length} artifacts, ${applied.size} models`);
  }
}

main();
