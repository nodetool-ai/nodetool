#!/usr/bin/env node
/**
 * `npm run test:affected:native` — run only the ctest tests that depend on
 * changed files, the native counterpart of `npm run test:affected`.
 *
 * Changed files come from the same rules as `scripts/test-affected.mjs`: the
 * merge-base with origin/main plus the working tree and untracked files,
 * `--base <ref>`, or explicit paths. Documentation selects nothing.
 *
 * Every `native/<name>/` directory whose CMake files declare ctest tests is a
 * project. Its build directory is `--build <name>=<dir>`, else
 * `NODETOOL_<NAME>_BUILD_DIR` (NODETOOL_GRAPH_RUNNER_BUILD_DIR for
 * graph-runner), else `native/<name>/build`. A project with changed files
 * under it but no finished configure in that directory is reported with the
 * command that configures it, and fails the run. A project with no changed
 * file of its own is checked only against a File API reply an earlier run
 * left, since it can still compile or load another project's files (the node
 * editor builds graph-runner). Such a project is never reconfigured. A
 * project that lists another in `dependsOn` treats that project's changed
 * files as its own, since it always builds them: graph-runner and the node
 * editor build native/jobs.
 *
 * The dependency model of each test is read from the build directory:
 *
 *   - `ctest --show-only=json-v1` lists the tests and their commands;
 *   - the CMake File API (codemodel-v2, cmakeFiles-v1) gives each target's
 *     sources, artifacts and dependencies, and the files CMake read while
 *     configuring. When the build has no reply yet, or a configure input is
 *     newer than the reply, the script writes the query files and re-runs
 *     `cmake <build>` on the existing cache. It passes no `-D` options, so no
 *     cache value changes and FetchContent reuses what it already populated;
 *   - compiler depfiles (`*.o.d` under CMakeFiles for Makefile generators,
 *     `ninja -t deps` for Ninja) map each object to the headers it includes.
 *
 * A test depends on the sources and headers of the target its command runs,
 * of every target whose artifact appears in its arguments, and of every target
 * those depend on transitively, utility targets included. A file or directory
 * of the repository that appears in its arguments (a node or `cmake -P`
 * script, a font directory) is an input too, and a JavaScript script brings
 * its relative-import closure. An executable whose file name appears in that
 * closure (graph-runner's scripts spawn `nodetool-graph-runner`) is treated as
 * run by the test. The text match can only add targets, never drop one.
 *
 * JavaScript bundles are matched conservatively, without esbuild metafiles.
 * The bundle scripts load guest modules through plugins and read files the
 * metafile does not list, so its input list would be incomplete.
 *
 *   - A test that loads the guest bundle (a `guest*.js` or `guest*.bin`
 *     argument) or the GPU catalog depends on everything under
 *     native/graph-runner/guest/ and parity/, and on every file under
 *     packages/<pkg>/src and every packages/<pkg>/package.json.
 *   - A test that loads a bundle written into the build directory, or that
 *     depends on a utility target, depends on every JavaScript file of its
 *     project. In graph-runner it also depends on the guest bundle's inputs,
 *     because every unit-test bundle imports guest modules.
 *
 * The whole project is selected when a CMake input changed (anything CMake
 * read while configuring, and any CMakeLists.txt, *.cmake, preset or toolchain
 * file under the project that no test runs as a script), when a changed C or
 * C++ file under the project is compiled by no target, when the build has no
 * depfiles, or when another file under the project maps to no test input.
 * A target without depfiles (never built) selects its tests for any changed
 * header.
 *
 * Flags: `--base <ref>`, `--all`, `--dry-run` (print the plan), `--json`
 * (print the plan as JSON), `--build <name>=<dir>`, `--project <name>`,
 * `--jobs <n>` (build parallelism, default 2), explicit file paths, and
 * arguments after `--`, which go to ctest. `--all` skips projects without a
 * build instead of failing. A run first executes the prepare steps the
 * selected tests need (graph-runner: the guest bundle and the GPU catalog that
 * scripts/check-native-graph-runner.mjs builds), then builds only the targets
 * those tests need, then runs ctest. It runs every selected project, lists the
 * failing ones, and exits with the first failing status.
 * It adds no sandbox of its own: callers wrap it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { changedFiles, DOC_ONLY } from "./test-affected.mjs";

const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const CPP_SOURCE = /\.(c|cc|cpp|cxx|c\+\+|m|mm)$/i;
const CPP_HEADER = /\.(h|hh|hpp|hxx|h\+\+|inc|inl|ipp|tpp|ixx|cppm)$/i;
const JS_FILE = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/;
const BUNDLE_ARG = /\.(mjs|cjs|js|json|bin)$/;
const CMAKE_BUILD_FILE = /(^|\/)(CMakeLists\.txt|[^/]*\.cmake|CMake(User)?Presets\.json|[^/]*toolchain[^/]*)$/i;
const GUEST_BUNDLE = /^guest[^/]*\.(js|bin)$/;

/** Inputs of the graph-runner guest bundle and of every bundle that imports it. */
export const GUEST_INPUTS = [
  /^native\/graph-runner\/(guest|parity)\//,
  /^packages\/[^/]+\/(src\/|package\.json$)/
];

/**
 * Per-project settings beyond the defaults. `prepare` lists build steps that
 * run outside CMake: a test whose arguments contain the path stored in
 * `cacheVar` needs that step, as `scripts/check-native-graph-runner.mjs` runs it.
 * A step with `linkedTarget` is also needed by every test that links that
 * target, for tests that find the file through a compiled-in path.
 * `dependsOn` names the projects whose sources the project's build compiles
 * through add_subdirectory.
 */
export const PROJECTS = {
  "graph-runner": {
    envVar: "NODETOOL_GRAPH_RUNNER_BUILD_DIR",
    configureArgs: ["-DCMAKE_BUILD_TYPE=Release"],
    dependsOn: ["jobs", "kernels"],
    prepare: [
      { cacheVar: "NODETOOL_GUEST_BUNDLE", label: "guest bundle", script: "native/graph-runner/guest/build.mjs" },
      { cacheVar: "NODETOOL_GPU_CATALOG", label: "GPU catalog", script: "native/graph-runner/guest/host/gpu-catalog.mjs" }
    ],
    bundleInputs: GUEST_INPUTS
  },
  // The editor's local-run tests load the graph runner's guest bundle from the
  // path in NODETOOL_GUEST_BUNDLE (native/node-editor/cmake/GraphRunner.cmake).
  "node-editor": {
    dependsOn: ["jobs", "kernels"],
    prepare: [
      {
        cacheVar: "NODETOOL_GUEST_BUNDLE",
        label: "guest bundle",
        script: "native/graph-runner/guest/build.mjs",
        linkedTarget: "nodetool_graph_runner"
      }
    ],
    bundleInputs: GUEST_INPUTS
  }
};

export function projectConfig(name) {
  const config = PROJECTS[name] ?? {};
  return {
    envVar: config.envVar ?? `NODETOOL_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BUILD_DIR`,
    configureArgs: config.configureArgs ?? [],
    prepare: config.prepare ?? [],
    bundleInputs: config.bundleInputs ?? [],
    dependsOn: config.dependsOn ?? []
  };
}

const toPosix = (p) => p.split(sep).join("/");

/** Repository-relative POSIX path, or null for a path outside the repository. */
export function repoPath(absolute, root = repoRoot) {
  const rel = toPosix(relative(root, absolute));
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : rel;
}

const under = (file, dir) => file === dir || file.startsWith(`${dir}/`);

/** native/<name>/ directories whose CMake files declare ctest tests. */
export function discoverProjects(root = repoRoot) {
  const nativeDir = join(root, "native");
  if (!existsSync(nativeDir)) return [];
  const projects = [];
  for (const entry of readdirSync(nativeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(nativeDir, entry.name);
    if (!existsSync(join(dir, "CMakeLists.txt"))) continue;
    if (cmakeFilesUnder(dir).some((file) => /\b(add_test|enable_testing|include\s*\(\s*CTest\s*\))/.test(readFileSync(file, "utf8")))) {
      projects.push(entry.name);
    }
  }
  return projects.sort();
}

function cmakeFilesUnder(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "_deps") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        // Build trees hold generated CMake files.
        if (!existsSync(join(path, "CMakeCache.txt"))) walk(path);
      } else if (entry.name === "CMakeLists.txt" || entry.name.endsWith(".cmake")) {
        found.push(path);
      }
    }
  };
  walk(dir);
  return found;
}

/** The build directory of a project, and where the choice came from. */
export function resolveBuildDir(name, overrides, env, root = repoRoot) {
  if (overrides[name]) return { dir: resolve(overrides[name]), source: "--build" };
  const { envVar } = projectConfig(name);
  if (env[envVar]) return { dir: resolve(env[envVar]), source: envVar };
  return { dir: join(root, "native", name, "build"), source: "default" };
}

/** The exact command that configures a project's default build directory. */
export function configureCommand(name) {
  const dir = `native/${name}`;
  return ["cmake", "-S", dir, "-B", `${dir}/build`, ...projectConfig(name).configureArgs].join(" ");
}

export function readCache(buildDir) {
  const cache = {};
  const path = join(buildDir, "CMakeCache.txt");
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([^#/][^:=]*):[A-Z]+=(.*)$/.exec(line);
    if (match) cache[match[1]] = match[2];
  }
  return cache;
}

// ---------------------------------------------------------------- depfiles

/**
 * Parse a Makefile-syntax depfile. Relative paths are resolved against `cwd`,
 * the directory the compiler ran in.
 */
export function parseMakeDepfile(text, cwd) {
  const joined = text.replace(/\\\r?\n/g, " ");
  const colon = joined.search(/:(\s|$)/);
  if (colon < 0) return null;
  const tokens = [];
  let current = "";
  const rest = joined.slice(colon + 1);
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === "\\" && rest[i + 1] === " ") {
      current += " ";
      i++;
    } else if (ch === "$" && rest[i + 1] === "$") {
      current += "$";
      i++;
    } else if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return { object: joined.slice(0, colon).trim(), files: tokens.map((t) => resolve(cwd, t)) };
}

/** Parse `ninja -t deps` output: an object line, then indented dependencies. */
export function parseNinjaDeps(text, buildDir) {
  const entries = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (/^\S/.test(line)) {
      const object = line.replace(/:\s+#deps.*$/, "").replace(/:$/, "");
      current = { object, files: [] };
      entries.push(current);
    } else if (current) {
      current.files.push(resolve(buildDir, line.trim()));
    }
  }
  return entries;
}

/** The target an object belongs to, from its `CMakeFiles/<target>.dir/` segment. */
export function targetOfObject(objectPath) {
  const match = /(?:^|[/\\])CMakeFiles[/\\]([^/\\]+)\.dir[/\\]/.exec(objectPath);
  return match ? match[1] : null;
}

function findMakeDepfiles(buildDir) {
  const found = [];
  const walk = (dir, insideTargetDir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".cmake") continue;
        // Under _deps, FetchContent's build trees hold objects; its source
        // trees are large and hold none.
        if (basename(dir) === "_deps" && !entry.name.endsWith("-build")) continue;
        walk(path, insideTargetDir || entry.name.endsWith(".dir"));
      } else if (insideTargetDir && /\.(o|obj)\.d$/.test(entry.name)) {
        found.push(path);
      }
    }
  };
  walk(buildDir, false);
  return found;
}

/** Every object's dependency list in a build directory, for either generator. */
export function readDepfiles(buildDir, cache) {
  const generator = cache?.CMAKE_GENERATOR ?? "";
  if (/Ninja/.test(generator)) {
    const ninja = cache.CMAKE_MAKE_PROGRAM || "ninja";
    const result = spawnSync(ninja, ["-C", buildDir, "-t", "deps"], { encoding: "utf8", maxBuffer: 1 << 30 });
    if (result.status !== 0) return [];
    return parseNinjaDeps(result.stdout, buildDir);
  }
  return findMakeDepfiles(buildDir).flatMap((path) => {
    // The compiler runs in the directory that holds CMakeFiles/.
    const cwd = path.slice(0, path.lastIndexOf(`${sep}CMakeFiles${sep}`));
    const parsed = parseMakeDepfile(readFileSync(path, "utf8"), cwd);
    return parsed ? [{ ...parsed, object: path }] : [];
  });
}

// ---------------------------------------------------------------- File API

const QUERY_KINDS = ["codemodel-v2", "cmakeFiles-v1"];

function latestReplyIndex(buildDir) {
  const replyDir = join(buildDir, ".cmake", "api", "v1", "reply");
  if (!existsSync(replyDir)) return null;
  const indexes = readdirSync(replyDir).filter((f) => /^index-.*\.json$/.test(f)).sort();
  return indexes.length ? join(replyDir, indexes.at(-1)) : null;
}

/** Read a File API reply into targets and configure inputs. Null when absent. */
export function readFileApi(buildDir) {
  const indexPath = latestReplyIndex(buildDir);
  if (!indexPath) return null;
  const replyDir = dirname(indexPath);
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const objectFile = (kind) => index.reply?.[kind]?.jsonFile;
  if (!objectFile("codemodel-v2") || !objectFile("cmakeFiles-v1")) return null;
  const codemodel = JSON.parse(readFileSync(join(replyDir, objectFile("codemodel-v2")), "utf8"));
  const cmakeFiles = JSON.parse(readFileSync(join(replyDir, objectFile("cmakeFiles-v1")), "utf8"));
  const sourceDir = codemodel.paths.source;
  const topBuild = codemodel.paths.build;
  const configs = codemodel.configurations ?? [];
  const config = configs.find((c) => c.name === "Release") ?? configs[0];
  const targets = (config?.targets ?? []).map((ref) => {
    const t = JSON.parse(readFileSync(join(replyDir, ref.jsonFile), "utf8"));
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      generatorProvided: t.isGeneratorProvided === true,
      buildDir: resolve(topBuild, t.paths?.build ?? "."),
      artifacts: (t.artifacts ?? []).map((a) => resolve(topBuild, a.path)),
      sources: (t.sources ?? []).map((s) => ({ path: resolve(sourceDir, s.path), compiled: s.compileGroupIndex !== undefined, generated: s.isGenerated === true })),
      dependencies: (t.dependencies ?? []).map((d) => d.id)
    };
  });
  const cmakeInputs = (cmakeFiles.inputs ?? [])
    .filter((input) => !input.isGenerated && !input.isExternal)
    .map((input) => resolve(sourceDir, input.path));
  return { sourceDir, config: configs.length > 1 ? config.name : null, targets, cmakeInputs, indexPath };
}

function replyIsStale(api) {
  const replyTime = statSync(api.indexPath).mtimeMs;
  return api.cmakeInputs.some((input) => {
    try {
      return statSync(input).mtimeMs > replyTime;
    } catch {
      return true;
    }
  });
}

/**
 * Read the File API reply, writing the query and re-running `cmake <build>`
 * first when the reply is missing or older than a configure input.
 */
export function ensureFileApi(buildDir, log) {
  let api = readFileApi(buildDir);
  if (api && !replyIsStale(api)) return api;
  const queryDir = join(buildDir, ".cmake", "api", "v1", "query");
  mkdirSync(queryDir, { recursive: true });
  for (const kind of QUERY_KINDS) writeFileSync(join(queryDir, kind), "");
  log(`${api ? "Refreshing" : "Requesting"} the CMake File API reply: cmake ${buildDir}`);
  // Configure output goes to stderr so `--json` stays parseable.
  const result = spawnSync("cmake", [buildDir], { stdio: ["ignore", 2, 2] });
  if (result.status !== 0) throw new Error(`cmake ${buildDir} failed (${result.error?.message ?? result.status})`);
  api = readFileApi(buildDir);
  if (!api) throw new Error(`cmake ${buildDir} wrote no File API reply`);
  return api;
}

// ---------------------------------------------------------------- generator rules

/**
 * Utility targets whose generated build rules mention `path`: how a bundle a
 * custom target writes is traced back to that target, since the File API
 * omits custom commands. Null when the generator's rules cannot be read.
 */
export function producersOf(paths, targets, buildDir, cache) {
  const utilities = targets.filter((t) => t.type === "UTILITY" && !t.generatorProvided);
  const generator = cache?.CMAKE_GENERATOR ?? "";
  const found = new Map(paths.map((p) => [p, new Set()]));
  if (/Makefiles/.test(generator)) {
    for (const target of utilities) {
      const rules = join(target.buildDir, "CMakeFiles", `${target.name}.dir`, "build.make");
      if (!existsSync(rules)) continue;
      const text = readFileSync(rules, "utf8");
      for (const path of paths) if (text.includes(path)) found.get(path).add(target.name);
    }
    return found;
  }
  if (/Ninja/.test(generator) && existsSync(join(buildDir, "build.ninja"))) {
    const blocks = readFileSync(join(buildDir, "build.ninja"), "utf8").split(/\n(?=build )/);
    for (const block of blocks) {
      for (const target of utilities) {
        if (!block.includes(`CMakeFiles/${target.name}`)) continue;
        for (const path of paths) if (block.includes(path)) found.get(path).add(target.name);
      }
    }
    return found;
  }
  return null;
}

// ---------------------------------------------------------------- JavaScript

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;

/** A JavaScript file and every file it reaches through relative imports. */
export function importClosure(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file) || !statSync(file).isFile()) continue;
    seen.add(file);
    if (!JS_FILE.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      queue.push(resolve(dirname(file), match[1]));
    }
  }
  return [...seen];
}

// ---------------------------------------------------------------- model

function argPaths(arg) {
  const paths = [arg];
  const eq = arg.indexOf("=");
  if (eq > 0) paths.push(arg.slice(eq + 1));
  return paths.filter((p) => isAbsolute(p)).map((p) => resolve(p));
}

/**
 * Build a project's dependency model. Pure apart from the injected readers,
 * so fixtures can drive it.
 *
 * `fs` supplies `isDirectory(abs)`, `isFile(abs)`, `closure(abs)` (a script's
 * relative-import closure) and `readText(abs)`.
 */
export function buildModel({
  name,
  root = repoRoot,
  buildDir,
  ctest,
  api,
  depfiles,
  cache = {},
  producers = null,
  fs,
  config = projectConfig(name)
}) {
  const projectDir = `native/${name}`;
  const rel = (abs) => repoPath(abs, root);
  const byId = new Map(api.targets.map((t) => [t.id, t]));
  const byName = new Map(api.targets.map((t) => [t.name, t]));
  const byArtifact = new Map();
  for (const t of api.targets) for (const a of t.artifacts) byArtifact.set(a, t);
  const executables = api.targets.filter((t) => t.type === "EXECUTABLE");

  // Files each target compiles: its listed sources plus depfile headers.
  const compiled = new Map(api.targets.map((t) => [t.name, new Set(t.sources.map((s) => rel(s.path)).filter(Boolean))]));
  const withDepfiles = new Set();
  for (const entry of depfiles) {
    const target = targetOfObject(entry.object);
    if (!target || !compiled.has(target)) continue;
    withDepfiles.add(target);
    for (const file of entry.files) {
      const path = rel(file);
      if (path) compiled.get(target).add(path);
    }
  }
  const missingDepfiles = new Set(
    api.targets.filter((t) => t.sources.some((s) => s.compiled) && !withDepfiles.has(t.name)).map((t) => t.name)
  );
  const allCompiled = new Map();
  for (const [target, files] of compiled) {
    for (const file of files) {
      if (!allCompiled.has(file)) allCompiled.set(file, []);
      allCompiled.get(file).push(target);
    }
  }

  const closureOf = (names) => {
    const seen = new Set();
    const queue = [...names];
    while (queue.length) {
      const n = queue.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      for (const id of byName.get(n)?.dependencies ?? []) {
        const dep = byId.get(id);
        if (dep) queue.push(dep.name);
      }
    }
    return seen;
  };

  const prepareByPath = new Map();
  for (const step of config.prepare) {
    if (cache[step.cacheVar]) prepareByPath.set(resolve(cache[step.cacheVar]), step);
  }

  const tests = [];
  for (const entry of ctest.tests ?? []) {
    const command = entry.command ?? [];
    const runs = new Set();
    const files = new Set();
    const dirs = new Set();
    const prepare = new Set();
    const generatedArgs = [];
    let guest = false;
    let bundle = false;
    for (const arg of command) {
      for (const path of argPaths(arg)) {
        const artifact = byArtifact.get(path);
        if (artifact) {
          runs.add(artifact.name);
          continue;
        }
        if (prepareByPath.has(path)) {
          prepare.add(prepareByPath.get(path).label);
          guest = true;
          continue;
        }
        const repoRel = rel(path);
        const insideBuild = !relative(buildDir, path).startsWith("..");
        if (insideBuild) {
          if (GUEST_BUNDLE.test(basename(path))) guest = true;
          else if (BUNDLE_ARG.test(path)) {
            bundle = true;
            generatedArgs.push(path);
          }
          continue;
        }
        if (!repoRel) continue;
        if (fs.isDirectory(path)) dirs.add(repoRel);
        else if (fs.isFile(path)) {
          for (const file of JS_FILE.test(path) ? fs.closure(path) : [path]) {
            const fileRel = rel(file);
            if (!fileRel) continue;
            files.add(fileRel);
            // A script that names an executable is treated as running it.
            if (!JS_FILE.test(file)) continue;
            const text = fs.readText(file);
            for (const exe of executables) {
              for (const artifact of exe.artifacts) {
                const stem = basename(artifact).replace(/\.exe$/i, "");
                const pattern = new RegExp(`(^|[^\\w-])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`);
                if (pattern.test(text)) runs.add(exe.name);
              }
            }
          }
        }
      }
    }
    const extraTargets = new Set();
    for (const path of generatedArgs) {
      const names = producers?.get(path);
      if (producers && names?.size) for (const n of names) extraTargets.add(n);
      else if (!producers) {
        for (const t of api.targets) if (t.type === "UTILITY" && !t.generatorProvided) extraTargets.add(t.name);
      }
    }
    const closure = closureOf([...runs, ...extraTargets]);
    for (const step of config.prepare) {
      if (step.linkedTarget && cache[step.cacheVar] && closure.has(step.linkedTarget)) {
        prepare.add(step.label);
        guest = true;
      }
    }
    if ([...closure].some((n) => byName.get(n)?.type === "UTILITY" && !byName.get(n).generatorProvided)) bundle = true;
    const compiledFiles = new Set();
    for (const n of closure) for (const f of compiled.get(n) ?? []) compiledFiles.add(f);
    tests.push({
      name: entry.name,
      known: command.length > 0,
      runs: [...runs],
      buildTargets: [...new Set([...runs, ...extraTargets])].sort(),
      closure,
      compiledFiles,
      files,
      dirs: [...dirs],
      guest,
      bundle,
      prepare: [...prepare],
      missingDepfiles: [...closure].filter((n) => missingDepfiles.has(n))
    });
  }

  const scriptFiles = new Set(tests.flatMap((t) => [...t.files]));
  return {
    name,
    projectDir,
    buildDir,
    config: api.config,
    tests,
    allCompiled,
    hasDepfiles: withDepfiles.size > 0,
    cmakeInputs: new Set(api.cmakeInputs.map(rel).filter(Boolean)),
    scriptFiles,
    bundleInputs: config.bundleInputs
  };
}

// ---------------------------------------------------------------- selection

const isCpp = (f) => CPP_SOURCE.test(f) || CPP_HEADER.test(f);

/**
 * Select the tests of one project for a set of changed files. Returns
 * `{ all, reason, selected: [{ test, trigger, why }], notes, leftOut }`.
 */
export function selectTests(model, changed, { all = false } = {}) {
  const files = changed.filter((f) => !DOC_ONLY.test(f));
  const inProject = (f) => under(f, model.projectDir);
  const everything = (trigger, why) => ({
    all: true,
    reason: `${trigger}: ${why}`,
    selected: model.tests.map((t) => ({ test: t.name, trigger, why, triggers: 1 })),
    notes: [],
    leftOut: 0
  });
  if (all) return everything("--all", "every test selected");

  for (const f of files) {
    if (model.cmakeInputs.has(f)) return everything(f, "CMake read it while configuring");
    if (inProject(f) && CMAKE_BUILD_FILE.test(f) && !model.scriptFiles.has(f)) {
      return everything(f, "CMake build file of the project");
    }
    if (isCpp(f) && !model.hasDepfiles && model.allCompiled.size > 0 && (inProject(f) || model.allCompiled.has(f))) {
      return everything(f, "the build has no compiler depfiles");
    }
    if (isCpp(f) && inProject(f) && !model.allCompiled.has(f)) {
      return everything(f, "C/C++ file compiled by no target in this build (new, or never built)");
    }
  }

  // Each test keeps its most direct trigger: a compiled file before a script,
  // a script before a bundle input.
  const selected = new Map();
  const notes = [];
  for (const f of files) {
    let matches = 0;
    const pick = (test, rank, why) => {
      matches++;
      const current = selected.get(test.name);
      if (!current) selected.set(test.name, { test: test.name, trigger: f, why, rank, triggers: 1 });
      else {
        current.triggers++;
        if (rank < current.rank) Object.assign(current, { trigger: f, why, rank });
      }
    };
    const guestInput = GUEST_INPUTS.some((p) => p.test(f));
    const bundleInput = (inProject(f) && JS_FILE.test(f)) || model.bundleInputs.some((p) => p.test(f));
    for (const test of model.tests) {
      if (!test.known && inProject(f)) {
        pick(test, 0, "test has no command to trace");
      } else if (test.compiledFiles.has(f)) {
        const target = [...test.runs, ...test.closure].find((n) => model.allCompiled.get(f)?.includes(n));
        pick(test, 1, `compiled into ${target}`);
      } else if (test.files.has(f)) {
        pick(test, 2, "script or argument of the test");
      } else if (test.dirs.some((d) => under(f, d))) {
        pick(test, 3, "inside a directory the test reads");
      } else if (test.guest && guestInput) {
        pick(test, 4, "input of the guest bundle");
      } else if (test.bundle && bundleInput) {
        pick(test, 5, "JavaScript input of a test bundle");
      } else if (CPP_HEADER.test(f) && test.missingDepfiles.length > 0) {
        pick(test, 6, `${test.missingDepfiles[0]} has no depfiles (not built yet)`);
      }
    }
    if (matches > 0 || !inProject(f)) continue;
    const targets = model.allCompiled.get(f);
    if (targets) notes.push({ file: f, note: `compiled only into ${targets.join(", ")}, which no test runs` });
    else if (guestInput || bundleInput) notes.push({ file: f, note: "JavaScript that no test loads" });
    else return everything(f, "file under the project that maps to no test input");
  }
  const list = model.tests
    .filter((t) => selected.has(t.name))
    .map((t) => {
      const { test, trigger, why, triggers } = selected.get(t.name);
      return { test, trigger, why, triggers };
    });
  return { all: false, reason: null, selected: list, notes, leftOut: model.tests.length - list.length };
}

/**
 * Targets to build and prepare steps to run for the selected tests. ctest
 * reports no command for a test whose executable was never built, so such a
 * test cannot be traced to its target: `buildAll` then builds every target.
 */
export function executionPlan(model, selection) {
  const names = new Set(selection.selected.map((s) => s.test));
  const tests = model.tests.filter((t) => names.has(t.name));
  const untraced = tests.filter((t) => !t.known).map((t) => t.name);
  return {
    targets: [...new Set(tests.flatMap((t) => t.buildTargets))].sort(),
    buildAll: untraced.length > 0,
    untraced,
    prepare: [...new Set(tests.flatMap((t) => t.prepare))]
  };
}

export function ctestRegex(names) {
  return `^(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;
}

/** Whether a non-documentation file under native/<name>/ changed. */
/** A changed file under the project, or under a project it depends on. */
export function projectHasOwnChanges(name, files) {
  const dirs = [name, ...projectConfig(name).dependsOn].map((dir) => `native/${dir}`);
  return files.some((f) => dirs.some((dir) => under(f, dir)) && !DOC_ONLY.test(f));
}

/** Exit status for a plan: an unconfigured project with changes fails a run. */
export function planStatus(plans, { dryRun }) {
  return !dryRun && plans.some((p) => p.status === "unconfigured") ? 1 : 0;
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const dash = argv.indexOf("--");
  const own = dash >= 0 ? argv.slice(0, dash) : argv;
  const opts = {
    passthrough: dash >= 0 ? argv.slice(dash + 1) : [],
    dryRun: false,
    json: false,
    all: false,
    base: undefined,
    jobs: 2,
    builds: {},
    projects: [],
    files: []
  };
  for (let i = 0; i < own.length; i++) {
    const arg = own[i];
    const value = () => {
      const next = own[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--all") opts.all = true;
    else if (arg === "--base") opts.base = value();
    else if (arg === "--jobs") opts.jobs = Number(value());
    else if (arg === "--project") opts.projects.push(value());
    else if (arg === "--build") {
      const [name, ...dir] = value().split("=");
      if (!name || dir.length === 0) throw new Error("--build takes <name>=<dir>");
      opts.builds[name] = dir.join("=");
    } else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}`);
    else opts.files.push(toPosix(relative(repoRoot, resolve(arg))));
  }
  if (!Number.isInteger(opts.jobs) || opts.jobs < 1) throw new Error("--jobs takes a positive integer");
  return opts;
}

/** The readers `buildModel` uses on a real checkout. */
export function diskReaders() {
  return {
    isDirectory: (p) => existsSync(p) && statSync(p).isDirectory(),
    isFile: (p) => existsSync(p) && statSync(p).isFile(),
    closure: importClosure,
    readText: (p) => readFileSync(p, "utf8")
  };
}

/** Load the model of a configured build directory. */
export function loadModel(name, buildDir, cache, log, { refresh = true } = {}) {
  const api = refresh ? ensureFileApi(buildDir, log) : readFileApi(buildDir);
  if (!api) return null;
  const result = spawnSync("ctest", ["--test-dir", buildDir, "--show-only=json-v1"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`ctest --show-only failed in ${buildDir}: ${result.stderr}`);
  const ctest = JSON.parse(result.stdout);
  const generated = [];
  for (const test of ctest.tests ?? []) {
    for (const arg of test.command ?? []) {
      for (const path of argPaths(arg)) {
        if (!relative(buildDir, path).startsWith("..") && BUNDLE_ARG.test(path)) generated.push(path);
      }
    }
  }
  return buildModel({
    name,
    buildDir,
    ctest,
    api,
    depfiles: readDepfiles(buildDir, cache),
    cache,
    producers: producersOf([...new Set(generated)], api.targets, buildDir, cache),
    fs: diskReaders()
  });
}

function sameDir(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * One plan per project: `unconfigured` (changes under it, no build), `skipped`
 * (`--all` without a build), or `selected`. Projects nothing selects are
 * left out. `load` reads a configured build's model.
 */
export function planProjects({ names, files, builds = {}, env = {}, all = false, root = repoRoot, load }) {
  const plans = [];
  for (const name of names) {
    const { dir, source } = resolveBuildDir(name, builds, env, root);
    const cache = readCache(dir);
    const own = projectHasOwnChanges(name, files);
    const why = !cache
      ? `no CMakeCache.txt in ${dir} (${source})`
      : !sameDir(cache.CMAKE_HOME_DIRECTORY ?? "", join(root, "native", name))
        ? `${dir} is configured for ${cache.CMAKE_HOME_DIRECTORY}`
        : !existsSync(join(dir, "CTestTestfile.cmake"))
          ? `configuring ${dir} did not finish (no CTestTestfile.cmake)`
          : null;
    if (why) {
      const status = all ? "skipped" : own ? "unconfigured" : null;
      if (status) plans.push({ name, status, buildDir: dir, reason: why, configure: configureCommand(name) });
      continue;
    }
    if (!all && files.every((f) => DOC_ONLY.test(f))) continue;
    // A project with no changed file of its own can still compile or load one
    // (the node editor builds graph-runner). It is checked only against a reply
    // an earlier run left, so an unrelated change never reconfigures it.
    const model = load(name, dir, cache, { refresh: all || own });
    if (!model) continue;
    const selection = selectTests(model, files, { all });
    if (selection.selected.length === 0 && selection.notes.length === 0) continue;
    plans.push({ name, status: "selected", buildDir: dir, model, selection, ...executionPlan(model, selection) });
  }
  return plans;
}

function printPlan(plans, reason) {
  console.log(`Affected native test plan (${reason}):`);
  if (plans.length === 0) console.log("  nothing: no native project depends on the changed files.");
  for (const plan of plans) {
    console.log(`\nnative/${plan.name} (build: ${plan.buildDir})`);
    if (plan.status !== "selected") {
      console.log(`  ${plan.status === "unconfigured" ? "NOT CONFIGURED" : "skipped"}: ${plan.reason}`);
      console.log(`  configure it with: ${plan.configure}`);
      console.log(`  or pass --build ${plan.name}=<dir>, or set ${projectConfig(plan.name).envVar}`);
      continue;
    }
    const { selection } = plan;
    const total = plan.model.tests.length;
    if (selection.all) console.log(`  every test (${total}): ${selection.reason}`);
    else console.log(`  ${selection.selected.length} of ${total} tests selected, ${selection.leftOut} left out`);
    const width = Math.max(0, ...selection.selected.map((s) => s.test.length));
    if (!selection.all) {
      for (const s of selection.selected) {
        const more = s.triggers > 1 ? `, +${s.triggers - 1} more` : "";
        console.log(`    ${s.test.padEnd(width)}  ${s.trigger} (${s.why}${more})`);
      }
    }
    for (const n of selection.notes) console.log(`  not tested: ${n.file} (${n.note})`);
    if (plan.prepare.length) console.log(`  prepare: ${plan.prepare.join(", ")}`);
    if (plan.buildAll) console.log(`  build targets: all (never built, so untraceable: ${plan.untraced.join(" ")})`);
    else if (plan.targets.length) console.log(`  build targets: ${plan.targets.join(" ")}`);
  }
}

function jsonPlan(plans, reason) {
  return {
    reason,
    projects: plans.map((p) =>
      p.status === "selected"
        ? {
            name: p.name,
            status: p.status,
            buildDir: p.buildDir,
            all: p.selection.all,
            reason: p.selection.reason,
            total: p.model.tests.length,
            leftOut: p.selection.leftOut,
            selected: p.selection.selected,
            notes: p.selection.notes,
            prepare: p.prepare,
            targets: p.targets,
            buildAll: p.buildAll
          }
        : { name: p.name, status: p.status, buildDir: p.buildDir, reason: p.reason, configure: p.configure }
    )
  };
}

/**
 * Runs every selected project with tests, so one failing project does not hide
 * the results of the others. Returns the failures in plan order.
 */
export function runPlans(plans, executePlan) {
  const failed = [];
  for (const plan of plans) {
    if (plan.status !== "selected" || plan.selection.selected.length === 0) continue;
    const code = executePlan(plan);
    if (code !== 0) failed.push({ name: plan.name, code });
  }
  return failed;
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function execute(plan, opts) {
  const config = projectConfig(plan.name);
  const cache = readCache(plan.buildDir);
  for (const step of config.prepare) {
    if (!plan.prepare.includes(step.label)) continue;
    const status = run(process.execPath, [join(repoRoot, step.script), resolve(cache[step.cacheVar])]);
    if (status !== 0) return status;
  }
  const cfg = plan.model.config ? ["--config", plan.model.config] : [];
  if (plan.buildAll || plan.targets.length) {
    const targets = plan.buildAll ? [] : ["--target", ...plan.targets];
    const status = run("cmake", ["--build", plan.buildDir, ...cfg, ...targets, "--parallel", String(opts.jobs)]);
    if (status !== 0) return status;
  }
  const names = plan.selection.selected.map((s) => s.test);
  return run("ctest", [
    "--test-dir", plan.buildDir,
    ...(plan.model.config ? ["-C", plan.model.config] : []),
    "-R", ctestRegex(names),
    "--output-on-failure", "--no-tests=error",
    ...opts.passthrough
  ]);
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(
      "Usage: npm run test:affected:native -- [files...] [--base <ref>] [--all] [--dry-run] [--json]\n" +
        "         [--build <name>=<dir>] [--project <name>] [--jobs <n>] [-- <ctest args>]"
    );
    return 0;
  }
  const log = (message) => console.error(message);
  let files = [];
  let reason = "--all";
  if (!opts.all) {
    const found = opts.files.length ? { files: [...opts.files].sort(), base: null } : changedFiles(opts.base);
    files = found.files;
    reason = opts.files.length
      ? `${files.length} file(s) given on the command line`
      : found.base
        ? `${files.length} changed file(s) vs ${found.base.slice(0, 12)} + working tree`
        : `${files.length} changed file(s) in the working tree`;
  }
  const plans = planProjects({
    names: opts.projects.length ? opts.projects : discoverProjects(),
    files,
    builds: opts.builds,
    env: process.env,
    all: opts.all,
    load: (name, dir, cache, options) => loadModel(name, dir, cache, log, options)
  });
  if (opts.json) console.log(JSON.stringify(jsonPlan(plans, reason), null, 2));
  else printPlan(plans, reason);

  if (opts.dryRun) return 0;
  // Configured projects run first, so a missing build does not hide results.
  const failed = runPlans(plans, (plan) => execute(plan, opts));
  if (failed.length) {
    console.error(`\nFailed: ${failed.map((f) => `native/${f.name}`).join(", ")}`);
    return failed[0].code;
  }
  const status = planStatus(plans, opts);
  if (status !== 0) {
    const missing = plans.filter((p) => p.status === "unconfigured").map((p) => p.name);
    console.error(`\nNot tested, no configured build: ${missing.join(", ")}. Configure them, or pass --build <name>=<dir>.`);
  }
  return status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`test-affected-native: ${error.message}`);
    process.exitCode = 1;
  }
}
