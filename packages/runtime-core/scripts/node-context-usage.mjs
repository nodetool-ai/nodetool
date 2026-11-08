#!/usr/bin/env node
// Lists the ProcessingContext members that node code uses, with the
// TypeScript checker rather than text search. Node code is the source of
// @nodetool-ai/node-sdk and of every node package (`*-nodes`, `nodes-utils`)
// that depends on it. Workspace imports resolve to the built declarations, so
// run `npm run build:packages` first.
//
// A member counts as used when node code
//   - reads, calls or destructures it from a value typed ProcessingContext
//     (including unions, Pick<> and other mapped types over it),
//   - tests it with `"name" in context`,
//   - passes the context where a structural type with that member is expected,
//   - casts the context to a type with that member.
//
// Usage (from the repository root):
//   node packages/runtime-core/scripts/node-context-usage.mjs          summary
//   node packages/runtime-core/scripts/node-context-usage.mjs --json   report
//   node packages/runtime-core/scripts/node-context-usage.mjs --check  fail when
//     node code uses a member that node-context-members.json lacks
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packagesDir = join(repoRoot, "packages");
const MEMBERS_JSON = join(packagesDir, "runtime-core", "node-context-members.json");
const CONTEXT_FILE = /packages\/runtime\/(src\/context\.ts|dist\/context\.d\.ts)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "tests", "__tests__", "test"]);

/** node-sdk plus the node packages that depend on it. */
export function nodePackages() {
  const names = ["node-sdk"];
  for (const name of readdirSync(packagesDir).sort()) {
    if (!/-nodes$/.test(name) && name !== "nodes-utils") continue;
    const manifestPath = join(packagesDir, name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    if (deps["@nodetool-ai/node-sdk"]) names.push(name);
  }
  return names;
}

function sourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) sourceFiles(path, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

function isContextClass(symbol) {
  if (!symbol || symbol.getName() !== "ProcessingContext") return false;
  return (symbol.declarations ?? []).some(
    (d) => ts.isClassDeclaration(d) && CONTEXT_FILE.test(d.getSourceFile().fileName.replaceAll("\\", "/"))
  );
}

function isContextMemberDeclaration(declaration) {
  const parent = declaration.parent;
  return parent !== undefined && ts.isClassDeclaration(parent) && isContextClass(parent.symbol);
}

// Helpers outside the node packages that receive the whole context are
// followed into their source when they live in one of these packages: the
// guest runs them as real package modules, so the members they use count.
const FOLLOWED_PACKAGES = new Set(["runtime", "runtime-core", "protocol"]);

/** The source file and function a built declaration came from, or null. */
function sourceOf(declaration) {
  const file = declaration.getSourceFile().fileName.replaceAll("\\", "/");
  const match = /packages\/([^/]+)\/(?:dist\/(.+)\.d\.ts|src\/(.+)\.ts)$/.exec(file);
  if (!match || !FOLLOWED_PACKAGES.has(match[1])) return null;
  const src = join(packagesDir, match[1], "src", `${match[2] ?? match[3]}.ts`);
  const name = declaration.name && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
  return existsSync(src) && name ? { pkg: match[1], file: src, name } : null;
}

function functionsNamed(sourceFile, name) {
  const found = [];
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText() === name && node.body) {
      found.push(node);
    } else if (ts.isVariableDeclaration(node) && node.name.getText() === name && node.initializer) {
      found.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function scan({ packages = nodePackages() } = {}) {
  const rootNames = packages.flatMap((name) => sourceFiles(join(packagesDir, name, "src")));
  const scannedPackages = new Set(packages);
  const follow = new Map();
  let result;
  for (;;) {
    const followFiles = [...new Set([...follow.values()].map((f) => f.file))];
    result = scanProgram(rootNames, followFiles, follow, scannedPackages);
    const before = follow.size;
    for (const target of result.followed) follow.set(`${target.file}#${target.name}`, target);
    if (follow.size === before) break;
  }
  return { ...result.report, packages };
}

function scanProgram(rootNames, followFiles, follow, scannedPackages) {
  const program = ts.createProgram({
    rootNames: [...rootNames, ...followFiles],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      resolveJsonModule: true,
      experimentalDecorators: true,
      types: ["node"],
      jsx: ts.JsxEmit.ReactJSX
    }
  });
  const checker = program.getTypeChecker();
  const scanned = new Set(rootNames.map((f) => resolve(f)));

  let contextClass = null;
  let helper = null;
  const members = new Map();
  const escapes = [];
  const followed = [];
  const record = (name, via, node, detail) => {
    const file = relative(repoRoot, node.getSourceFile().fileName);
    const pkg = file.split("/")[1];
    let entry = members.get(name);
    if (!entry) {
      entry = { member: name, sites: 0, packages: new Set(), via: new Set(), examples: [] };
      members.set(name, entry);
    }
    entry.sites++;
    entry.packages.add(helper ? `${pkg}:${helper}` : pkg);
    entry.via.add(helper ? `helper` : via);
    if (entry.examples.length < 3) {
      const { line } = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
      entry.examples.push(`${file}:${line + 1}${detail ? ` (${detail})` : ""}`);
    }
  };

  const typeHasContext = (type) => {
    if (!type) return false;
    if (type.isUnion() || type.isIntersection()) return type.types.some(typeHasContext);
    return isContextClass(type.getSymbol());
  };
  const contextMemberNames = () =>
    new Set(contextClass ? checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(contextClass)).map((p) => p.getName()) : []);
  const isPublic = (symbol) =>
    (symbol.declarations ?? []).every(
      (d) => !(ts.getCombinedModifierFlags(d) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))
    );

  const recordProperty = (symbol, name, via, node, detail) => {
    if (!symbol) return false;
    const declarations = symbol.declarations ?? [];
    const hit = declarations.find(isContextMemberDeclaration);
    if (!hit) return false;
    contextClass ??= hit.parent.symbol;
    record(name, via, node, detail);
    return true;
  };

  const propertyOf = (type, name) => {
    const types = type.isUnion() ? type.types : [type];
    for (const t of types) {
      const p = checker.getPropertyOfType(t, name);
      if (p) return p;
    }
    return undefined;
  };

  // Members a structural target type asks of the context passed into it.
  const recordStructural = (target, via, node, detail) => {
    if (!target || typeHasContext(target)) return;
    if (target.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
    const names = contextMemberNames();
    const types = target.isUnion() ? target.types : [target];
    for (const t of types) {
      if (!(t.flags & ts.TypeFlags.Object)) continue;
      for (const prop of checker.getPropertiesOfType(t)) {
        if (names.has(prop.getName())) record(prop.getName(), via, node, detail);
        else if (via === "cast") record(`!${prop.getName()}`, via, node, detail);
      }
    }
  };

  const calleeName = (call) => {
    const expr = call.expression;
    return ts.isPropertyAccessExpression(expr) ? expr.name.text : ts.isIdentifier(expr) ? expr.text : expr.getText();
  };

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      recordProperty(checker.getSymbolAtLocation(node.name), node.name.text, "access", node);
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      const name = node.argumentExpression.text;
      const type = checker.getNonNullableType(checker.getTypeAtLocation(node.expression));
      recordProperty(propertyOf(type, name), name, "access", node);
    } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
      const key = node.propertyName ?? node.name;
      if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) {
        const type = checker.getNonNullableType(checker.getTypeAtLocation(node.parent));
        recordProperty(propertyOf(type, key.text), key.text, "destructure", node);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      ts.isStringLiteralLike(node.left) &&
      typeHasContext(checker.getTypeAtLocation(node.right))
    ) {
      if (contextMemberNames().has(node.left.text) || !contextClass) record(node.left.text, "in", node);
      else record(`!${node.left.text}`, "in", node);
    } else if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      let inner = node.expression;
      while ((ts.isAsExpression(inner) || ts.isParenthesizedExpression(inner)) && !typeHasContext(checker.getTypeAtLocation(inner))) {
        inner = inner.expression;
      }
      const target = checker.getTypeAtLocation(node);
      if (typeHasContext(checker.getTypeAtLocation(inner)) && !typeHasContext(target)) {
        recordStructural(target, "cast", node, checker.typeToString(target).slice(0, 80));
      }
    } else if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments) {
      for (const arg of node.arguments) {
        if (!typeHasContext(checker.getTypeAtLocation(arg))) continue;
        const target = checker.getContextualType(arg);
        if (target && typeHasContext(target)) {
          const declaration = checker.getResolvedSignature(node)?.getDeclaration();
          const file = declaration?.getSourceFile().fileName.replaceAll("\\", "/");
          if (!file || scanned.has(resolve(file))) continue;
          const own = /packages\/([^/]+)\/dist\//.exec(file);
          if (own && scannedPackages.has(own[1])) continue;
          const source = sourceOf(declaration);
          if (source) {
            followed.push(source);
            continue;
          }
          if (/node_modules\/(typescript|@typescript)\//.test(file)) continue;
          const { line } = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
          escapes.push({
            callee: calleeName(node),
            declaredIn: relative(repoRoot, file),
            site: `${relative(repoRoot, node.getSourceFile().fileName)}:${line + 1}`
          });
        } else {
          recordStructural(target, "structural", arg, `argument of ${calleeName(node)}`);
        }
      }
    } else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const value = ts.isPropertyAssignment(node) ? node.initializer : node.name;
      if (typeHasContext(checker.getTypeAtLocation(value))) {
        let target;
        if (ts.isPropertyAssignment(node)) {
          target = checker.getContextualType(node.initializer);
        } else {
          const objectType = checker.getContextualType(node.parent);
          const prop = objectType && propertyOf(objectType, node.name.text);
          target = prop ? checker.getTypeOfSymbol(prop) : undefined;
        }
        recordStructural(target, "structural", node, `property ${node.name.getText()}`);
      }
    }
    ts.forEachChild(node, visit);
  };

  const files = program.getSourceFiles().filter((f) => scanned.has(resolve(f.fileName)));
  const runAll = () => {
    for (const file of files) ts.forEachChild(file, visit);
    for (const target of follow.values()) {
      const sourceFile = program.getSourceFile(target.file);
      if (!sourceFile) continue;
      helper = target.name;
      for (const fn of functionsNamed(sourceFile, target.name)) visit(fn);
      helper = null;
    }
  };
  // Two passes: the first finds the ProcessingContext class symbol, which the
  // structural and `in` checks compare against.
  runAll();
  members.clear();
  escapes.length = 0;
  followed.length = 0;
  runAll();
  if (!contextClass) throw new Error("No access to ProcessingContext found; are the packages built?");

  const declared = checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(contextClass))
    .filter(isPublic);
  const used = [...members.values()]
    .filter((m) => !m.member.startsWith("!"))
    .sort((a, b) => a.member.localeCompare(b.member))
    .map((m) => ({ ...m, packages: [...m.packages].sort(), via: [...m.via].sort() }));
  const notOnContext = [...members.values()]
    .filter((m) => m.member.startsWith("!"))
    .map((m) => ({ member: m.member.slice(1), examples: m.examples }));
  const uniqueEscapes = new Map();
  for (const e of escapes) {
    const key = `${e.callee} ${e.declaredIn}`;
    const entry = uniqueEscapes.get(key) ?? { callee: e.callee, declaredIn: e.declaredIn, sites: [] };
    entry.sites.push(e.site);
    uniqueEscapes.set(key, entry);
  }
  return {
    followed,
    report: {
      files: files.length,
      helpers: [...follow.values()].map((t) => `${t.pkg}:${t.name}`).sort(),
      contextMembers: declared.length,
      used,
      notOnContext,
      escapes: [...uniqueEscapes.values()].sort((a, b) => a.callee.localeCompare(b.callee))
    }
  };
}

function main(argv) {
  const report = scan();
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  if (argv.includes("--check")) {
    const declared = new Set(JSON.parse(readFileSync(MEMBERS_JSON, "utf8")).members.map((m) => m.name));
    const missing = report.used.filter((m) => !declared.has(m.member));
    if (missing.length > 0) {
      console.error(`Node code uses ProcessingContext members that NodeContext does not declare:`);
      for (const m of missing) console.error(`  ${m.member}  ${m.examples[0]}`);
      console.error(`Add them to NodeContext (packages/runtime-core/src/node-context.ts), then run`);
      console.error(`  node packages/runtime-core/scripts/node-context-members.mjs`);
      return 1;
    }
    console.log(`NodeContext declares all ${report.used.length} members node code uses.`);
    return 0;
  }
  console.log(`Scanned ${report.files} files in ${report.packages.length} packages.`);
  console.log(`Node code uses ${report.used.length} of ${report.contextMembers} public ProcessingContext members.\n`);
  for (const m of report.used) {
    console.log(`${m.member.padEnd(32)} ${String(m.sites).padStart(4)}  ${m.via.join(",").padEnd(22)} ${m.packages.join(" ")}`);
  }
  if (report.notOnContext.length > 0) {
    console.log("\nNames node code asks of a context that ProcessingContext does not declare:");
    for (const m of report.notOnContext) console.log(`  ${m.member}  ${m.examples[0]}`);
  }
  if (report.helpers.length > 0) {
    console.log(`\nFollowed into helpers: ${report.helpers.join(" ")}`);
  }
  if (report.escapes.length > 0) {
    console.log("\nCalls that hand the whole context to code the scan does not follow:");
    for (const e of report.escapes) console.log(`  ${e.callee} (${e.declaredIn}) x${e.sites.length}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
