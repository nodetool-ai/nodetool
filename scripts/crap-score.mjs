#!/usr/bin/env node
/**
 * CRAP scores for the repository's TypeScript, ported from
 * https://github.com/unclebob/crapper (its TypeScript rules only).
 *
 *   CRAP = CC² × (1 − coverage)³ + CC
 *
 * CC is cyclomatic complexity: 1 plus each `if`, loop, `catch`, `?:`,
 * `case`/`default`, `&&`, `||`, `??`, logical assignment, and `?.`.
 * Coverage comes from LCOV. A function with branch records (`BRDA`) is scored
 * by those branches, otherwise by line hits. A function the report does not
 * mention scores 0%.
 *
 * Entries are functions that are not nested inside another entry: top-level
 * functions and arrow functions, the functions an exported value wraps
 * (`memo(() => …)`), top-level object-literal members, and every class
 * member. A route callback (`app.get("/users", handler)`) is its own entry
 * named `GET /users`. Every other nested callback counts toward the function
 * that encloses it.
 *
 * Run `node scripts/crap-score.mjs --help` for the options.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";


const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const CPP_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cxx", ".mm"]);
const EXTENSIONS = new Set([...TS_EXTENSIONS, ...CPP_EXTENSIONS]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".metrics",
  ".turbo",
  "third_party",
  "_deps",
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "spec",
  "specs",
  "e2e"
]);
export const HELP = `Usage: node scripts/crap-score.mjs [options] [path-or-filter ...]

Score TypeScript and C/C++ functions with CRAP = CC² × (1 − coverage)³ + CC and
print them worst first. 1–5 is low risk, 5–30 is worth a look, 30+ is complex
and under-tested.

C/C++ complexity uses clang-tidy's readability-function-size check
(CC = branches + 1). Pass --build <dir> for a CMake compile_commands.json
directory and --lcov <file> for llvm-cov/lcov coverage.

Options:
  -h, --help             Print this help and exit.
  --root <path>          Project root. Default: the current directory.
  --changed              Analyze files changed in the working tree.
  --base <ref>           Analyze files changed since the merge-base with <ref>,
                         plus the working tree. Implies --changed.
  --build <dir>          CMake build directory with compile_commands.json for
                         clang-tidy C/C++ analysis.
  --clang-tidy <path>    Path to clang-tidy binary (default: CLANG_TIDY env,
                         PATH, or Homebrew LLVM).
  --extra-arg <arg>      Extra compiler flag passed to clang-tidy. Repeatable.
  --no-coverage          Score complexity only. Coverage and CRAP are N/A.
  --lcov <file>          Read this LCOV report. May be repeated. Default: the
                         coverage/lcov.info of each workspace that owns an
                         analyzed file, and of the root.
  --run-coverage         Before scoring, run the tests related to the analyzed
                         TypeScript files with coverage in each owning workspace
                         (Vitest or Jest) and read the LCOV they write.
  --threshold <number>   Exit 2 when the worst CRAP score is above this.
  --top <n>              Print only the n worst rows.
  --json                 Print JSON instead of the table.

Arguments:
  path      File or directory to analyze.
  filter    When the argument is not a path, only files whose path contains
            this text are analyzed.

Files: .ts, .tsx, .mts, .cts, .c, .cc, .cpp, .cxx, .mm. Declaration files,
*.test.*, *.spec.*, *_test.*, *_tests.*, test_*.*, build* directories, and
${[...SKIP_DIRS].join(", ")} are skipped.
`;

const TEST_FILE =
  /(?:\.(?:test|spec)\.(?:ts|tsx|mts|cts)$)|(?:(?:^|[\\/])test_[^\\/]+\.(?:c|cc|cpp|cxx|mm)$)|(?:_(?:test|tests)\.(?:c|cc|cpp|cxx|mm)$)/;
const CLANG_TIDY_CONFIG = JSON.stringify({
  CheckOptions: {
    "readability-function-size.BranchThreshold": 0,
    "readability-function-size.LineThreshold": 0,
    "readability-function-size.StatementThreshold": 0
  }
});
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all", "use"]);
const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken
]);
const DECISIONS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.DefaultClause
]);
// Expressions that wrap a value without changing which function it names.
const TRANSPARENT = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression,
  ts.SyntaxKind.NonNullExpression
]);

// ---------------------------------------------------------------------------
// Score

export function crapScore(complexity, coveragePct) {
  if (coveragePct === null) {
    return null;
  }
  const uncovered = 1 - coveragePct / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}

function round(value) {
  return value === null ? null : Math.round(value * 10000) / 10000;
}

/** Worst CRAP first. Unscored rows follow scored rows, by complexity. */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if ((a.crap === null) !== (b.crap === null)) {
      return a.crap === null ? 1 : -1;
    }
    const diff = a.crap === null ? b.complexity - a.complexity : b.crap - a.crap;
    return diff || a.file.localeCompare(b.file) || a.line - b.line;
  });
}

// ---------------------------------------------------------------------------
// Functions and complexity

function isDecision(node) {
  if (DECISIONS.has(node.kind)) {
    return true;
  }
  if (ts.isBinaryExpression(node)) {
    return LOGICAL_OPERATORS.has(node.operatorToken.kind);
  }
  // `a?.b`, `a?.[0]` and `a?.()` each carry their own `?.` token. The rest of
  // the chain (`.c` in `a?.b.c`) does not.
  return Boolean(node.questionDotToken);
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function unwrapParent(node) {
  let current = node.parent;
  while (current && TRANSPARENT.has(current.kind)) {
    current = current.parent;
  }
  return current;
}

function nameText(sf, name) {
  if (!name) {
    return null;
  }
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(sf);
}

function literalText(node) {
  const current = unwrap(node);
  if (current && (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current))) {
    return current.text;
  }
  return null;
}

function routeMethod(call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return null;
  }
  const method = callee.name.text.toLowerCase();
  return ROUTE_METHODS.has(method) ? method : null;
}

/** Path from the call's own string argument or a preceding `.route("/path")`. */
function routePath(call) {
  for (const argument of call.arguments) {
    const text = literalText(argument);
    if (text !== null) {
      return text;
    }
  }
  let current = call.expression;
  while (current) {
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isCallExpression(current)) {
      if (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === "route") {
        return current.arguments.length > 0 ? literalText(current.arguments[0]) : null;
      }
      current = current.expression;
    } else {
      return null;
    }
  }
  return null;
}

/** `GET /users` when `node` is a callback passed to a route method, else null. */
function routeLabel(node) {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
    return null;
  }
  const call = unwrapParent(node);
  if (!call || !ts.isCallExpression(call) || !call.arguments.some((argument) => unwrap(argument) === node)) {
    return null;
  }
  const method = routeMethod(call);
  if (method === null) {
    return null;
  }
  const path = routePath(call);
  return path ? `${method.toUpperCase()} ${path}` : method.toUpperCase();
}

function unwrap(node) {
  let current = node;
  while (current && TRANSPARENT.has(current.kind)) {
    current = current.expression;
  }
  return current;
}

function className(sf, node) {
  if (node.name) {
    return node.name.text;
  }
  if (ts.isClassDeclaration(node)) {
    return "default";
  }
  const owner = unwrapParent(node);
  if (owner && ts.isVariableDeclaration(owner)) {
    return nameText(sf, owner.name);
  }
  return "(anonymous class)";
}

function classPath(sf, node) {
  const names = [];
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isClassLike(current)) {
      names.unshift(className(sf, current));
    }
  }
  return names.join(".");
}

/** The function a class member is, or null when the member has no body. */
function memberFunction(node) {
  if (
    (ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.body
  ) {
    return node;
  }
  if (ts.isPropertyDeclaration(node) && node.initializer) {
    const value = unwrap(node.initializer);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
      return value;
    }
  }
  return null;
}

function memberName(sf, member) {
  if (ts.isConstructorDeclaration(member)) {
    return "constructor";
  }
  const name = nameText(sf, member.name);
  if (ts.isGetAccessorDeclaration(member)) {
    return `get ${name}`;
  }
  if (ts.isSetAccessorDeclaration(member)) {
    return `set ${name}`;
  }
  return name;
}

/**
 * Name of a function that is not a class member or a route: its declaration,
 * the variable or property it is assigned to, or the variable whose
 * initializer wraps it (`const Card = memo(() => …)` is `Card`).
 */
function functionName(sf, node) {
  if (ts.isFunctionDeclaration(node)) {
    return node.name ? node.name.text : "default";
  }
  const segments = [];
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    segments.push(nameText(sf, node.name));
  }
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) {
      segments.unshift(nameText(sf, current.name));
    } else if (ts.isVariableDeclaration(current)) {
      segments.unshift(nameText(sf, current.name));
      break;
    } else if (ts.isExportAssignment(current)) {
      segments.unshift("default");
      break;
    } else if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      segments.unshift(current.left.getText(sf));
      break;
    } else if (
      !TRANSPARENT.has(current.kind) &&
      !ts.isCallExpression(current) &&
      !ts.isObjectLiteralExpression(current) &&
      !ts.isArrayLiteralExpression(current)
    ) {
      break;
    }
  }
  if (segments.length === 0) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    return `(anonymous:${line})`;
  }
  return segments.join(".");
}

function lineOf(sf, position) {
  return sf.getLineAndCharacterOfPosition(position).line + 1;
}

/** McCabe complexity: 1 plus each decision, leaving out nested entries and classes. */
function complexityOf(root, isEntry) {
  let score = 1;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current !== root && (isEntry(current) || ts.isClassLike(current))) {
      continue;
    }
    if (isDecision(current)) {
      score += 1;
    }
    ts.forEachChild(current, (child) => {
      stack.push(child);
    });
  }
  return score;
}

function scriptKind(path) {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/**
 * The scored functions of one source file, in source order, each with its
 * name, 1-based line span, and cyclomatic complexity.
 */
export function functionsInSource(source, path) {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const found = [];

  const add = (node, span, name) => {
    found.push({ node, name, line: lineOf(sf, span.getStart(sf)), endLine: lineOf(sf, span.getEnd()) });
  };

  const visit = (node, insideEntry) => {
    if (node.parent && ts.isClassLike(node.parent)) {
      const fn = memberFunction(node);
      if (fn) {
        add(fn, node, `${classPath(sf, node)}.${memberName(sf, node)}`);
        ts.forEachChild(node, (child) => visit(child, true));
        return;
      }
    }
    const route = routeLabel(node);
    if (route !== null) {
      add(node, node, route);
      ts.forEachChild(node, (child) => visit(child, true));
      return;
    }
    if (!insideEntry && isFunctionLike(node) && node.body) {
      add(node, node, functionName(sf, node));
      ts.forEachChild(node, (child) => visit(child, true));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, insideEntry));
  };
  visit(sf, false);

  const entryNodes = new Set(found.map((entry) => entry.node));
  const used = new Map();
  return found
    .sort((a, b) => a.node.pos - b.node.pos)
    .map(({ node, name, line, endLine }) => {
      const count = (used.get(name) ?? 0) + 1;
      used.set(name, count);
      return {
        name: count === 1 ? name : `${name}#${count}`,
        file: path,
        line,
        endLine,
        complexity: complexityOf(node, (candidate) => entryNodes.has(candidate))
      };
    });
}

// ---------------------------------------------------------------------------
// C/C++ complexity via clang-tidy

const CLANG_TIDY_WARNING =
  /^(.+?):(\d+):(\d+): warning: function '(.+)' exceeds recommended size\/complexity thresholds \[readability-function-size\]$/;
const CLANG_TIDY_NOTE =
  /^(.+?):(\d+):(\d+): note: (\d+) (lines including whitespace and comments|branches) \(threshold \d+\)$/;

export function findClangTidy(explicitPath = null) {
  const candidates = [
    explicitPath,
    process.env.CLANG_TIDY,
    "clang-tidy",
    "/opt/homebrew/opt/llvm/bin/clang-tidy",
    "/usr/local/opt/llvm/bin/clang-tidy"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(sep) || candidate.includes("/")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

/**
 * Parse `clang-tidy --checks=-*,readability-function-size` output into
 * `{ name, file, line, endLine, complexity }` entries.
 * `allowedFiles` (optional Set of absolute paths) filters out headers or
 * files outside the analyzed set.
 */
export function parseClangTidyComplexity(output, root, allowedFiles = null) {
  const byKey = new Map();
  let current = null;
  for (const rawLine of output.split(/\r?\n/)) {
    const warn = rawLine.match(CLANG_TIDY_WARNING);
    if (warn) {
      const absFile = resolve(root, warn[1]);
      if (allowedFiles && !allowedFiles.has(absFile)) {
        current = null;
        continue;
      }
      const line = Number(warn[2]);
      const name = warn[4];
      const relFile = relative(root, absFile).split(sep).join("/");
      const key = `${relFile}:${line}:${name}`;
      current = byKey.get(key) ?? { name, file: relFile, absFile, line, lines: 0, branches: 0 };
      byKey.set(key, current);
      continue;
    }
    if (!current) {
      continue;
    }
    const note = rawLine.match(CLANG_TIDY_NOTE);
    if (note) {
      const noteLine = Number(note[2]);
      if (noteLine !== current.line) {
        continue;
      }
      const value = Number(note[4]);
      if (note[5] === "branches") {
        current.branches = Math.max(current.branches, value);
      } else {
        current.lines = Math.max(current.lines, value);
      }
    }
  }

  const ordered = [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const usedByFile = new Map();
  return ordered.map(({ name, file, absFile, line, lines, branches }) => {
    const used = usedByFile.get(file) ?? new Map();
    usedByFile.set(file, used);
    const count = (used.get(name) ?? 0) + 1;
    used.set(name, count);
    return {
      name: count === 1 ? name : `${name}#${count}`,
      file,
      absFile,
      line,
      endLine: line + lines,
      complexity: branches + 1
    };
  });
}

function cmakeProjectOf(file, root) {
  for (let dir = dirname(file); dir.startsWith(root); dir = dirname(dir)) {
    if (existsSync(join(dir, "CMakeLists.txt"))) {
      return dir;
    }
    if (dir === root) {
      break;
    }
  }
  return dirname(file);
}

function detectBuildDir(projectDir) {
  for (const name of ["build", "build-sanitize", "build-debug", "build-release"]) {
    const candidate = join(projectDir, name);
    if (existsSync(join(candidate, "compile_commands.json"))) {
      return candidate;
    }
  }
  return null;
}

export function functionsInCppFiles(files, root, options = {}) {
  if (files.length === 0) {
    return [];
  }
  const binary = findClangTidy(options.clangTidy ?? null);
  if (!binary) {
    throw new Error(
      "clang-tidy not found. Install LLVM or pass --clang-tidy <path> (or set CLANG_TIDY)."
    );
  }
  const explicitBuild = options.build ? resolve(root, options.build) : null;
  if (explicitBuild && !existsSync(join(explicitBuild, "compile_commands.json"))) {
    throw new Error(`${join(explicitBuild, "compile_commands.json")} not found. Configure with -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`);
  }
  const extraArgs = options.extraArgs ?? [];
  const groups = new Map();
  for (const file of files) {
    const projectDir = cmakeProjectOf(file, root);
    const buildDir = explicitBuild ?? detectBuildDir(projectDir);
    const key = buildDir ? `p:${buildDir}` : `d:${projectDir}`;
    const group = groups.get(key) ?? { buildDir, projectDir, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }

  const allowed = new Set(files.map((file) => resolve(file)));
  const entries = [];
  for (const { buildDir, projectDir, files: batch } of groups.values()) {
    const args = [
      "--checks=-*,readability-function-size",
      `--config=${CLANG_TIDY_CONFIG}`,
      "--header-filter=^$",
      "--quiet"
    ];
    if (buildDir) {
      args.push("-p", buildDir);
      for (const flag of extraArgs) {
        args.push(`--extra-arg=${flag}`);
      }
      args.push(...batch);
    } else {
      args.push(...batch, "--", "-std=c++20");
      for (const dir of [join(projectDir, "include"), join(projectDir, "src"), projectDir]) {
        if (existsSync(dir)) {
          args.push(`-I${dir}`);
        }
      }
      args.push(...extraArgs);
    }
    const result = spawnSync(binary, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024
    });
    if (result.error) {
      throw new Error(`clang-tidy failed: ${result.error.message}`);
    }
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    entries.push(...parseClangTidyComplexity(combined, root, allowed));
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Coverage

/** `SF` path → `{ lines: Map<line, hit 0|1>, branches: Map<line, Map<"block,branch", hit 0|1>> }`. */
export function parseLcov(text) {
  const files = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      current = { lines: new Map(), branches: new Map() };
      files.set(line.slice(3), current);
    } else if (line === "end_of_record") {
      current = null;
    } else if (current && line.startsWith("DA:")) {
      const [lineNo, hits] = line.slice(3).split(",");
      const hit = Number(hits) > 0 ? 1 : 0;
      current.lines.set(Number(lineNo), Math.max(hit, current.lines.get(Number(lineNo)) ?? 0));
    } else if (current && line.startsWith("BRDA:")) {
      const [lineNo, block, branch, taken] = line.slice(5).split(",");
      const hit = taken !== "-" && Number(taken) > 0 ? 1 : 0;
      const onLine = current.branches.get(Number(lineNo)) ?? new Map();
      onLine.set(`${block},${branch}`, Math.max(hit, onLine.get(`${block},${branch}`) ?? 0));
      current.branches.set(Number(lineNo), onLine);
    }
  }
  return files;
}

/** Add `from`'s hits to `into`: a line or branch counts as hit when any report hit it. */
function mergeRecord(into, from) {
  for (const [line, hit] of from.lines) {
    into.lines.set(line, Math.max(hit, into.lines.get(line) ?? 0));
  }
  for (const [line, branches] of from.branches) {
    const onLine = into.branches.get(line) ?? new Map();
    for (const [key, hit] of branches) {
      onLine.set(key, Math.max(hit, onLine.get(key) ?? 0));
    }
    into.branches.set(line, onLine);
  }
}

/**
 * Percentage of a line span covered. Branch records win when the span has
 * any. A span with no instrumented lines is 0%.
 */
export function percentForSpan(record, start, end) {
  let covered = 0;
  let total = 0;
  for (const [line, branches] of record.branches) {
    if (line >= start && line <= end) {
      for (const hit of branches.values()) {
        covered += hit;
        total += 1;
      }
    }
  }
  if (total > 0) {
    return (100 * covered) / total;
  }
  for (const [line, hit] of record.lines) {
    if (line >= start && line <= end) {
      covered += hit;
      total += 1;
    }
  }
  return total === 0 ? 0 : (100 * covered) / total;
}

/**
 * Read LCOV reports into one map keyed by absolute source path. A relative
 * `SF` path resolves against the directory that holds the report's
 * `coverage/` folder, which is where Vitest and Jest write it from.
 */
export function loadLcov(reports, root) {
  const merged = new Map();
  for (const report of reports) {
    if (!existsSync(report)) {
      continue;
    }
    const reportDir = dirname(report);
    const bases = basename(reportDir) === "coverage" ? [dirname(reportDir), root] : [reportDir, root];
    for (const [file, record] of parseLcov(readFileSync(report, "utf8"))) {
      const absolute = isAbsolute(file)
        ? file
        : (bases.map((base) => resolve(base, file)).find((candidate) => existsSync(candidate)) ?? resolve(bases[0], file));
      const existing = merged.get(absolute);
      if (existing) {
        mergeRecord(existing, record);
      } else {
        merged.set(absolute, record);
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Files

function isTsExtension(path) {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && TS_EXTENSIONS.has(path.slice(dot)) && !path.endsWith(".d.ts") && !/\.d\.[mc]ts$/.test(path);
}

export function isCppFile(path) {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && CPP_EXTENSIONS.has(path.slice(dot));
}

function hasExtension(path) {
  return isTsExtension(path) || isCppFile(path);
}

export function isSourceFile(path) {
  return hasExtension(path) && !TEST_FILE.test(path);
}

function isSkippedDirName(name) {
  return SKIP_DIRS.has(name) || name.startsWith(".") || name.startsWith("build");
}

function walk(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!isSkippedDirName(entry.name)) {
        walk(join(dir, entry.name), found);
      }
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Added and modified files since `base` (or HEAD), plus untracked files. */
function changedFiles(root, base) {
  const top = git(root, ["rev-parse", "--show-toplevel"]).trim();
  const since = base ? git(root, ["merge-base", base, "HEAD"]).trim() : "HEAD";
  const names = [
    ...git(root, ["diff", "--name-only", "--diff-filter=d", "-z", since, "--", "."]).split("\0"),
    ...git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", "."]).split("\0")
  ];
  const limit = resolve(root);
  return names
    .filter(Boolean)
    .map((name) => resolve(top, name))
    .filter((path) => (path === limit || path.startsWith(limit + sep)) && existsSync(path));
}

function inSkippedDir(root, path) {
  return relative(root, path).split(sep).slice(0, -1).some((part) => isSkippedDirName(part));
}

export function selectFiles(options) {
  const root = resolve(options.root);
  const paths = [];
  const filters = [];
  for (const arg of options.positionals) {
    const candidate = resolve(root, arg);
    if (existsSync(candidate)) {
      paths.push(candidate);
    } else {
      filters.push(arg);
    }
  }
  let files;
  if (options.changed) {
    files = changedFiles(root, options.base).filter((path) => isSourceFile(path) && !inSkippedDir(root, path));
    if (paths.length > 0) {
      files = files.filter((file) => paths.some((path) => file === path || file.startsWith(path + sep)));
    }
  } else if (paths.length > 0) {
    files = paths.flatMap((path) => (statSync(path).isDirectory() ? walk(path, []) : hasExtension(path) ? [path] : []));
  } else {
    files = walk(root, []);
  }
  if (filters.length > 0) {
    files = files.filter((file) => filters.some((filter) => relative(root, file).split(sep).join("/").includes(filter)));
  }
  return [...new Set(files)].sort();
}

/** The nearest directory at or below `root` with a package.json. */
function workspaceOf(file, root) {
  for (let dir = dirname(file); dir.startsWith(root); dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    if (dir === root) {
      break;
    }
  }
  return root;
}

function groupByWorkspace(files, root) {
  const groups = new Map();
  for (const file of files) {
    const workspace = workspaceOf(file, root);
    groups.set(workspace, [...(groups.get(workspace) ?? []), file]);
  }
  return groups;
}

/** The command that runs a workspace's tests related to `files` with LCOV output. */
export function coverageCommand(workspace, files) {
  const manifest = JSON.parse(readFileSync(join(workspace, "package.json"), "utf8"));
  const test = manifest.scripts?.test ?? "";
  if (/vitest/.test(test)) {
    return [
      "npx",
      ["vitest", "related", "--run", "--passWithNoTests", "--coverage.enabled", "--coverage.provider=v8",
        "--coverage.reporter=lcov", "--coverage.reportsDirectory=coverage", "--coverage.reportOnFailure", ...files]
    ];
  }
  if (/jest/.test(test)) {
    return [
      "npx",
      ["jest", "--coverage", "--coverageReporters=lcov", "--coverageDirectory=coverage", "--passWithNoTests",
        "--findRelatedTests", ...files]
    ];
  }
  return null;
}

function runCoverage(root, files) {
  const tsFiles = files.filter((file) => !isCppFile(file));
  if (files.some((file) => isCppFile(file))) {
    process.stderr.write(
      "crap: C/C++ coverage is not auto-run; generate LCOV with llvm-cov export --format=lcov and pass --lcov <file>.\n"
    );
  }
  for (const [workspace, owned] of groupByWorkspace(tsFiles, root)) {
    const command = coverageCommand(workspace, owned);
    const name = relative(root, workspace) || ".";
    if (!command) {
      process.stderr.write(`crap: ${name} has no Vitest or Jest test script; its functions score 0%.\n`);
      continue;
    }
    rmSync(join(workspace, "coverage", "lcov.info"), { force: true });
    process.stderr.write(`crap: running coverage in ${name}\n`);
    const result = spawnSync(command[0], command[1], { cwd: workspace, stdio: ["ignore", "inherit", "inherit"] });
    if (result.status !== 0) {
      process.stderr.write(`crap: tests in ${name} exited ${result.status}; scoring the coverage they wrote.\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI

function take(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function number(args, index, option) {
  const value = Number(take(args, index, option));
  if (!Number.isFinite(value)) {
    throw new Error(`${option} requires a number`);
  }
  return value;
}

export function parseArgs(args) {
  const options = {
    root: process.cwd(),
    positionals: [],
    changed: false,
    base: null,
    build: null,
    clangTidy: null,
    extraArgs: [],
    noCoverage: false,
    lcov: [],
    runCoverage: false,
    threshold: null,
    top: null,
    json: false,
    help: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--root":
        options.root = take(args, index++, arg);
        break;
      case "--changed":
        options.changed = true;
        break;
      case "--base":
        options.base = take(args, index++, arg);
        options.changed = true;
        break;
      case "--build":
        options.build = take(args, index++, arg);
        break;
      case "--clang-tidy":
        options.clangTidy = take(args, index++, arg);
        break;
      case "--extra-arg": {
        const value = args[index + 1];
        if (value === undefined) {
          throw new Error(`${arg} requires a value`);
        }
        index += 1;
        options.extraArgs.push(value);
        break;
      }
      case "--no-coverage":
        options.noCoverage = true;
        break;
      case "--lcov":
        options.lcov.push(take(args, index++, arg));
        break;
      case "--run-coverage":
        options.runCoverage = true;
        break;
      case "--threshold":
        options.threshold = number(args, index++, arg);
        break;
      case "--top":
        options.top = number(args, index++, arg);
        break;
      case "--json":
        options.json = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.positionals.push(arg);
    }
  }
  if (options.noCoverage && (options.runCoverage || options.lcov.length > 0)) {
    throw new Error("--no-coverage cannot be combined with --run-coverage or --lcov");
  }
  return options;
}

/** Score `files`. `coverage` is null for --no-coverage, else the merged LCOV map. */
export function analyze(files, root, coverage, cppOptions = {}) {
  const entries = [];
  const cppFiles = [];
  for (const file of files) {
    if (isCppFile(file)) {
      cppFiles.push(file);
      continue;
    }
    const path = relative(root, file).split(sep).join("/");
    const record = coverage?.get(file);
    for (const fn of functionsInSource(readFileSync(file, "utf8"), path)) {
      const pct = coverage === null ? null : record ? round(percentForSpan(record, fn.line, fn.endLine)) : 0;
      entries.push({ ...fn, coverage: pct, crap: round(crapScore(fn.complexity, pct)) });
    }
  }
  if (cppFiles.length > 0) {
    for (const { absFile, ...fn } of functionsInCppFiles(cppFiles, root, cppOptions)) {
      const record = coverage?.get(absFile);
      const pct = coverage === null ? null : record ? round(percentForSpan(record, fn.line, fn.endLine)) : 0;
      entries.push({ ...fn, coverage: pct, crap: round(crapScore(fn.complexity, pct)) });
    }
  }
  return sortEntries(entries);
}

export function formatTable(entries) {
  const nameWidth = Math.min(60, Math.max(8, ...entries.map((entry) => entry.name.length)));
  const header = `${"CRAP".padStart(8)} ${"CC".padStart(4)} ${"Cov%".padStart(6)}  ${"Function".padEnd(nameWidth)}  Location`;
  const rows = entries.map((entry) => {
    const crap = entry.crap === null ? "N/A" : entry.crap.toFixed(1);
    const cov = entry.coverage === null ? "N/A" : entry.coverage.toFixed(1);
    const name = entry.name.length > nameWidth ? `${entry.name.slice(0, nameWidth - 1)}…` : entry.name;
    return `${crap.padStart(8)} ${String(entry.complexity).padStart(4)} ${cov.padStart(6)}  ${name.padEnd(nameWidth)}  ${entry.file}:${entry.line}`;
  });
  return [header, "-".repeat(header.length), ...rows, ""].join("\n");
}

function defaultReports(files, root) {
  const dirs = new Set([root, ...groupByWorkspace(files, root).keys()]);
  return [...dirs].map((dir) => join(dir, "coverage", "lcov.info"));
}

export function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${HELP}`);
    return 1;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const root = resolve(options.root);
  const files = selectFiles(options);
  if (files.length === 0) {
    process.stdout.write(options.json ? "[]\n" : "No TypeScript or C/C++ files to analyze.\n");
    return 0;
  }
  let coverage = null;
  if (!options.noCoverage) {
    if (options.runCoverage) {
      runCoverage(root, files);
    }
    const reports = options.lcov.length > 0 ? options.lcov.map((report) => resolve(root, report)) : defaultReports(files, root);
    const found = reports.filter((report) => existsSync(report));
    if (found.length === 0) {
      process.stderr.write("crap: no LCOV report found; every function scores 0%. Pass --run-coverage, --lcov, or --no-coverage.\n");
    }
    coverage = loadLcov(found, root);
  }
  const entries = analyze(files, root, coverage, {
    build: options.build,
    clangTidy: options.clangTidy,
    extraArgs: options.extraArgs
  });
  const shown = options.top === null ? entries : entries.slice(0, options.top);
  process.stdout.write(options.json ? `${JSON.stringify(shown, null, 2)}\n` : formatTable(shown));
  if (options.threshold !== null) {
    const worst = entries.find((entry) => entry.crap !== null);
    if (worst && worst.crap > options.threshold) {
      process.stderr.write(
        `CRAP threshold exceeded: ${worst.crap.toFixed(1)} > ${options.threshold} (${worst.name} at ${worst.file}:${worst.line})\n`
      );
      return 2;
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
