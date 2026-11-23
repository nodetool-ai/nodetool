#!/usr/bin/env node
/**
 * `npm run lint:native` — run clang-tidy and clazy on the native C++ that a
 * change touches, and fail on findings in the changed lines.
 *
 *   node scripts/native-lint.mjs --build native/timeline/build-sanitize [--base <ref>]
 *   node scripts/native-lint.mjs --build <dir> --files native/x/src/a.cpp ...
 *   node scripts/native-lint.mjs --build <dir> --self-test
 *
 * The build directory must hold a Clang `compile_commands.json`. The checks
 * are native/.clang-tidy (memory safety and undefined behavior) and the clazy
 * checks in CLAZY_CHECKS (Qt lifetime and threading). Existing code is not
 * linted as a whole: only the translation units of changed files run, and a
 * finding fails the run only when it sits on a line the change added or
 * edited. Findings elsewhere in a changed file are printed as context.
 *
 * Changed files come from `git diff --unified=0 <base>` (the working tree, so
 * local edits count) plus untracked files. The base defaults to the merge
 * base with origin/main. `--files` treats every line of the named files as
 * changed. A changed header is checked through its same-name source in the
 * same directory, or else through one translation unit that includes it
 * according to the build's Ninja dependency log. Before analysis the objects
 * of the selected translation units are built, so a partial build still has
 * its generated moc and uic headers.
 *
 * clazy runs when `clazy-standalone` is on PATH (or NT_CLAZY names it).
 * `--require-clazy` makes a missing clazy an error, as CI does. `--paths
 * <prefix>...` limits the run to changed files under those prefixes, for a
 * build that compiles another project's sources too.
 *
 * Exit status: 0 clean, 1 findings on changed lines, 2 the tools could not
 * analyze a selected file (a compiler error, a missing tool or build).
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Qt checks that find lifetime, threading and dangling-reference bugs. Style
 * and performance checks are left out. See native/AGENTS.md rules 11 to 13.
 */
export const CLAZY_CHECKS = [
  "assert-with-side-effects",
  "auto-unexpected-qstringbuilder",
  "child-event-qobject-cast",
  "connect-3arg-lambda",
  "connect-non-signal",
  "install-event-filter",
  "lambda-in-connect",
  "lambda-unique-connection",
  "post-event",
  "returning-data-from-temporary",
  "strict-iterators",
  "temporary-iterator",
  "thread-with-slots",
  "virtual-call-ctor",
  "writing-to-temporary",
  "wrong-qevent-cast"
];

const SOURCE_EXT = new Set([".c", ".cc", ".cpp", ".cxx"]);
const HEADER_EXT = new Set([".h", ".hh", ".hpp", ".hxx"]);
const EXCLUDED = /(?:^|\/)(?:third_party|build[^/]*|_deps)\//;

/** Native C or C++ files this lint owns: under native/, not vendored or generated. */
export function isLintable(file) {
  const ext = extname(file);
  return file.startsWith("native/") && (SOURCE_EXT.has(ext) || HEADER_EXT.has(ext)) && !EXCLUDED.test(file);
}

/**
 * Lines each file gained in a `git diff --unified=0` patch, as inclusive
 * [first, last] ranges on the new side. Deleted files and pure deletions
 * contribute nothing.
 */
export function parseDiff(patch) {
  const changed = new Map();
  let file = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      file = target === "/dev/null" ? null : target.replace(/^b\//, "");
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) {
        if (!changed.has(file)) changed.set(file, []);
        changed.get(file).push([start, start + count - 1]);
      }
    }
  }
  return changed;
}

/**
 * Diagnostics from clang-tidy or clazy output. `check` is the clang-tidy
 * check name, or `clazy-<name>` for clazy, or `clang-diagnostic-<flag>` for
 * a compiler warning. Notes are dropped.
 */
export function parseDiagnostics(output, directory) {
  const out = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^(.+?):(\d+):(\d+): (warning|error): (.*?)(?: \[([^\]]+)\])?$/);
    if (!match) continue;
    let check = match[6] ?? "clang-diagnostic-error";
    if (check.startsWith("-Wclazy-")) check = check.slice(2);
    else if (check.startsWith("-W")) check = `clang-diagnostic-${check.slice(2)}`;
    else if (check.includes(",")) check = check.split(",")[0];
    out.push({
      file: resolve(directory, match[1]),
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4],
      message: match[5],
      check
    });
  }
  return out;
}

/**
 * Splits findings into those that fail the run (on a changed line), context
 * (elsewhere in a changed file) and tool errors. Compiler warnings
 * (`clang-diagnostic-*` warnings) belong to the compile step and are dropped.
 * Files outside `changed` are ignored. `changed` keys are repository-relative.
 */
export function classify(diagnostics, changed, root) {
  const seen = new Set();
  const result = { blocking: [], context: [], errors: [] };
  for (const d of diagnostics) {
    const file = relative(root, d.file).split(sep).join("/");
    const key = `${file}:${d.line}:${d.column}:${d.check}:${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { ...d, file };
    if (d.severity === "error" && d.check.startsWith("clang-diagnostic-")) {
      result.errors.push(entry);
      continue;
    }
    if (d.check.startsWith("clang-diagnostic-")) continue;
    const ranges = changed.get(file);
    if (!ranges) continue;
    const onChangedLine = ranges.some(([first, last]) => d.line >= first && d.line <= last);
    (onChangedLine ? result.blocking : result.context).push(entry);
  }
  const order = (a, b) => a.file.localeCompare(b.file) || a.line - b.line;
  result.blocking.sort(order);
  result.context.sort(order);
  return result;
}

/** Headers and the objects that include them, from `ninja -t deps` output. */
export function parseNinjaDeps(output, buildDir) {
  const includers = new Map();
  let object = null;
  for (const line of output.split("\n")) {
    const head = line.match(/^(\S.*?): #deps \d+/);
    if (head) {
      object = resolve(buildDir, head[1]);
      continue;
    }
    const dep = line.trim();
    if (object && dep && line.startsWith(" ")) {
      const header = resolve(buildDir, dep);
      if (!includers.has(header)) includers.set(header, []);
      includers.get(header).push(object);
    }
  }
  return includers;
}

/**
 * The translation units to analyze: each changed source in the database,
 * and for each changed header its same-name source or one includer.
 * Returns the database entries and the headers no unit covers.
 */
export function selectUnits({ files, entries, root, includers = null }) {
  const bySource = new Map(entries.map((e) => [resolve(e.directory, e.file), e]));
  const byObject = new Map(entries.filter((e) => e.output).map((e) => [resolve(e.directory, e.output), e]));
  const units = new Map();
  const uncovered = [];
  for (const file of files) {
    const abs = resolve(root, file);
    const ext = extname(file);
    if (SOURCE_EXT.has(ext)) {
      if (bySource.has(abs)) units.set(abs, bySource.get(abs));
      continue;
    }
    const stem = join(dirname(abs), basename(abs, ext));
    const sibling = [...SOURCE_EXT].map((e) => stem + e).find((s) => bySource.has(s));
    if (sibling) {
      units.set(sibling, bySource.get(sibling));
      continue;
    }
    const includer = (includers?.get(abs) ?? []).map((o) => byObject.get(o)).find(Boolean);
    if (includer) units.set(resolve(includer.directory, includer.file), includer);
    else uncovered.push(file);
  }
  return { units: [...units.values()], uncovered };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A header filter that matches exactly the changed headers, or nothing. */
export function headerFilter(files, root) {
  const headers = files.filter((f) => HEADER_EXT.has(extname(f))).map((f) => escapeRegex(resolve(root, f)));
  return headers.length ? `^(${headers.join("|")})$` : "^$";
}

function run(program, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(program, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", (error) => resolvePromise({ status: null, output: `${program}: ${error.message}` }));
    child.on("close", (status) => resolvePromise({ status, output }));
  });
}

async function pool(tasks, jobs) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker));
  return results;
}

function which(program) {
  const found = spawnSync("sh", ["-c", `command -v "${program}"`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : null;
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`);
  return result.stdout;
}

function changedLines(root, base) {
  const changed = parseDiff(git(root, ["diff", "--unified=0", "--no-color", "--no-ext-diff", base, "--", "native/"]));
  for (const file of git(root, ["ls-files", "--others", "--exclude-standard", "--", "native/"]).split("\n")) {
    if (file) changed.set(file, [[1, Number.MAX_SAFE_INTEGER]]);
  }
  return changed;
}

/** Builds the selected objects so generated headers exist. */
function prepare(buildDir, units) {
  if (!existsSync(join(buildDir, "build.ninja"))) return null;
  const outputs = units.filter((u) => u.output).map((u) => relative(buildDir, resolve(u.directory, u.output)));
  if (outputs.length === 0) return null;
  const result = spawnSync("ninja", ["-C", buildDir, ...outputs], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0 ? null : (result.stdout ?? "") + (result.stderr ?? "");
}

function ninjaIncluders(buildDir) {
  if (!existsSync(join(buildDir, "build.ninja"))) return null;
  const result = spawnSync("ninja", ["-C", buildDir, "-t", "deps"], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
  return result.status === 0 ? parseNinjaDeps(result.stdout, buildDir) : null;
}

/**
 * Runs both tools over the changed files' units. `changed` maps
 * repository-relative paths to changed line ranges.
 */
export async function lint({ root, buildDir, changed, clazy, jobs, prepareUnits = true, log = console.log }) {
  const dbPath = join(buildDir, "compile_commands.json");
  if (!existsSync(dbPath)) throw new Error(`${dbPath} not found. Configure with -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`);
  const entries = JSON.parse(readFileSync(dbPath, "utf8"));
  const files = [...changed.keys()];
  const needIncluders = files.some((f) => HEADER_EXT.has(extname(f)));
  const { units, uncovered } = selectUnits({
    files,
    entries,
    root,
    includers: needIncluders ? ninjaIncluders(buildDir) : null
  });
  for (const file of uncovered) log(`Not analyzed (no translation unit in ${relative(root, buildDir)}): ${file}`);
  if (units.length === 0) {
    log("No changed native translation units in this build.");
    return { blocking: [], context: [], errors: [], units: 0 };
  }
  if (prepareUnits) {
    const failure = prepare(buildDir, units);
    if (failure) {
      log(failure);
      throw new Error("Building the selected objects failed");
    }
  }
  const filter = headerFilter(files, root);
  const config = join(root, "native/.clang-tidy");
  const tasks = [];
  for (const unit of units) {
    const file = resolve(unit.directory, unit.file);
    tasks.push(() =>
      run("clang-tidy", ["-p", buildDir, `--config-file=${config}`, `--header-filter=${filter}`, "--quiet", file])
    );
    if (clazy) {
      tasks.push(() =>
        run(clazy.program, [
          "-p",
          buildDir,
          `--checks=${CLAZY_CHECKS.join(",")}`,
          `--header-filter=${filter}`,
          `--extra-arg=-resource-dir=${clazy.resourceDir}`,
          file
        ])
      );
    }
  }
  log(`Analyzing ${units.length} translation unit(s) with clang-tidy${clazy ? " and clazy" : ""}, ${jobs} at a time.`);
  const results = await pool(tasks, jobs);
  const diagnostics = [];
  const failures = [];
  for (const result of results) {
    if (result.status === null) failures.push(result.output);
    diagnostics.push(...parseDiagnostics(result.output, root));
  }
  const classified = classify(diagnostics, changed, root);
  // A unit picked for a header has its own errors in an unchanged file; they still mean the analysis is void.
  for (const d of diagnostics) {
    if (d.severity === "error" && d.check.startsWith("clang-diagnostic-")) {
      const file = relative(root, d.file).split(sep).join("/");
      if (!changed.has(file)) classified.errors.push({ ...d, file });
    }
  }
  if (failures.length) classified.errors.push(...failures.map((message) => ({ file: "", line: 0, message, check: "tool" })));
  return { ...classified, units: units.length };
}

function report(result, log) {
  const annotate = Boolean(process.env.GITHUB_ACTIONS);
  const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const d of result.context) {
    log(`${d.file}:${d.line}: context (unchanged line): ${d.message} [${d.check}]`);
  }
  for (const d of result.blocking) {
    log(`${d.file}:${d.line}:${d.column}: ${d.message} [${d.check}]`);
    if (annotate) log(`::error file=${d.file},line=${d.line},col=${d.column},title=${d.check}::${escape(d.message)}`);
  }
  for (const d of result.errors) log(`analysis error: ${d.file}${d.line ? `:${d.line}` : ""}: ${d.message}`);
  log(
    `${result.units} unit(s) analyzed: ${result.blocking.length} finding(s) on changed lines, ` +
      `${result.context.length} elsewhere in changed files, ${result.errors.length} analysis error(s).`
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = result.blocking.map((d) => `| \`${d.file}:${d.line}\` | ${d.check} | ${d.message.replace(/\|/g, "\\|")} |`);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "### Native lint (clang-tidy, clazy)",
        "",
        `${result.units} unit(s), ${result.blocking.length} finding(s) on changed lines, ${result.context.length} context, ${result.errors.length} errors.`,
        ...(rows.length ? ["", "| Location | Check | Message |", "|---|---|---|", ...rows] : []),
        ""
      ].join("\n") + "\n"
    );
  }
}

function findClazy(required) {
  const program = process.env.NT_CLAZY || which("clazy-standalone");
  if (!program) {
    if (required) throw new Error("clazy-standalone not found (set NT_CLAZY or install clazy)");
    return null;
  }
  // clazy built outside the LLVM tree cannot find Clang's builtin headers by itself.
  const clang = process.env.NT_CLANG || "clang++";
  const dir = spawnSync(clang, ["-print-resource-dir"], { encoding: "utf8" });
  if (dir.status !== 0) throw new Error(`${clang} -print-resource-dir failed`);
  return { program, resourceDir: dir.stdout.trim() };
}

const PLANT = `#include <QObject>

int* plantOwner() { return new int(1); }

int plantUseAfterFree() {
  int* value = new int(1);
  delete value;
  return *value;
}

void plantConnect(QObject* sender, QObject* receiver) {
  int local = 0;
  QObject::connect(sender, &QObject::destroyed, [receiver] { receiver->deleteLater(); });
  QObject::connect(sender, &QObject::destroyed, receiver, [&local] { ++local; });
}
`;

/**
 * Proves the checks fire: a scratch source with one planted defect per tool,
 * compiled with the Qt flags of a unit from the real build, must produce
 * each expected finding on its changed lines.
 */
async function selfTest({ root, buildDir, clazy, jobs, log }) {
  const entries = JSON.parse(readFileSync(join(buildDir, "compile_commands.json"), "utf8"));
  const donor = entries.find((e) => /QtCore/.test(e.command ?? e.arguments?.join(" ") ?? ""));
  if (!donor) throw new Error(`No unit in ${buildDir} includes QtCore; the plant needs Qt flags`);
  const tokens = donor.arguments ?? donor.command.split(/\s+/);
  const flags = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (["-isystem", "-iquote", "-I", "-F"].includes(token)) {
      flags.push(token, resolve(donor.directory, tokens[++i]));
    } else if (/^-(?:I|F|isystem|iquote)./.test(token)) {
      const [, flag, path] = token.match(/^(-(?:isystem|iquote|I|F))(.*)$/);
      flags.push(`${flag}${isAbsolute(path) ? path : resolve(donor.directory, path)}`);
    } else if (/^-(?:D|std=|fPIC)/.test(token)) {
      flags.push(token);
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), "nt-native-lint-"));
  try {
    const file = join(scratch, "plant.cpp");
    writeFileSync(file, PLANT);
    writeFileSync(
      join(scratch, "compile_commands.json"),
      JSON.stringify([{ directory: scratch, file, arguments: ["clang++", ...flags, "-c", file] }])
    );
    const changedPlant = new Map([[relative(root, file).split(sep).join("/"), [[1, PLANT.split("\n").length]]]]);
    const result = await lint({ root, buildDir: scratch, changed: changedPlant, clazy, jobs, prepareUnits: false, log });
    const found = new Set(result.blocking.map((d) => d.check));
    const expected = [
      "cppcoreguidelines-owning-memory",
      "clang-analyzer-cplusplus.NewDelete",
      ...(clazy ? ["clazy-connect-3arg-lambda", "clazy-lambda-in-connect"] : [])
    ];
    const missing = expected.filter((check) => !found.has(check));
    if (result.errors.length || missing.length) {
      report(result, log);
      throw new Error(`Self-test failed. Missing: ${missing.join(", ") || "none"}`);
    }
    log(`Self-test passed: ${expected.join(", ")} reported on the plant.`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const opts = { build: null, base: null, files: null, selfTest: false, requireClazy: false, noClazy: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--build") opts.build = argv[++i];
    else if (arg === "--base") opts.base = argv[++i];
    else if (arg === "--jobs") opts.jobs = Number(argv[++i]);
    else if (arg === "--self-test") opts.selfTest = true;
    else if (arg === "--require-clazy") opts.requireClazy = true;
    else if (arg === "--no-clazy") opts.noClazy = true;
    else if (arg === "--paths") {
      opts.paths = [];
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.paths.push(argv[++i]);
    }
    else if (arg === "--files") {
      opts.files = [];
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.files.push(argv[++i]);
    } else throw new Error(`Unknown argument ${arg}`);
  }
  if (!opts.build) throw new Error("--build <dir> is required");
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const buildDir = resolve(process.cwd(), opts.build);
  const jobs = opts.jobs || availableParallelism();
  const log = (line) => console.log(line);
  if (!which("clang-tidy")) throw new Error("clang-tidy not found");
  const clazy = opts.noClazy ? null : findClazy(opts.requireClazy);
  if (!clazy && !opts.noClazy) log("clazy-standalone not found: running clang-tidy only.");
  if (opts.selfTest) {
    await selfTest({ root, buildDir, clazy, jobs, log });
    return 0;
  }
  let changed;
  if (opts.files) {
    changed = new Map(
      opts.files.map((f) => [relative(root, resolve(process.cwd(), f)).split(sep).join("/"), [[1, Number.MAX_SAFE_INTEGER]]])
    );
  } else {
    const base = opts.base ?? git(root, ["merge-base", "origin/main", "HEAD"]).trim();
    changed = changedLines(root, base);
  }
  for (const file of [...changed.keys()]) {
    const inScope = !opts.paths || opts.paths.some((prefix) => file.startsWith(prefix));
    if (!isLintable(file) || !inScope) changed.delete(file);
  }
  const result = await lint({ root, buildDir, changed, clazy, jobs, log });
  report(result, log);
  if (result.errors.length) return 2;
  return result.blocking.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`native-lint: ${error.message}`);
    process.exitCode = 2;
  }
}
