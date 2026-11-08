// Build-time analysis of the bundled module graph for the module contract
// (module-contract.mjs). Works on esbuild's metafile and the source of each
// bundled file, parsed with acorn after esbuild strips TypeScript.
//
//   - importedNames(): every name bundled code imports from a specifier the
//     contract governs, per importer. Static imports, `export ... from`,
//     namespace member reads, and `import()` / `require()` whose result is
//     destructured or read by member. Any other use of a namespace reads as
//     "*", the whole module.
//   - nodeClasses() and reach(): for each class with a literal `static
//     nodeType`, the contract exports its code can reach at run time. The unit is a
//     top-level declaration: a class (all its members), function or variable
//     declarator. From the class, every identifier its source mentions that
//     names a top-level binding of its file is followed, through imports and
//     re-exports, into other files. Top-level statements that are not
//     declarations, such as decorator calls and registrations, run once when
//     the bundle loads and belong to no node. A file without import or export
//     syntax (CommonJS) is one unit. A local variable that shadows a
//     top-level name counts as a use of that name, so the result can only
//     over-approximate, and a condition around a call is not evaluated.
import { readFileSync } from "node:fs";
import { parse } from "acorn";
import { transformSync } from "esbuild";

const PARSE_OPTIONS = {
  ecmaVersion: "latest",
  allowHashBang: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true
};

function javascriptOf(path) {
  const source = readFileSync(path, "utf8");
  const ts = /\.(m?ts|cts|tsx)$/.exec(path);
  if (!ts) return source;
  return transformSync(source, { loader: ts[1] === "tsx" ? "tsx" : "ts", target: "esnext" }).code;
}

function parseFile(path) {
  if (/\.(json|node|wasm|css|txt)$/.test(path)) return null;
  const code = javascriptOf(path);
  try {
    return parse(code, { ...PARSE_OPTIONS, sourceType: "module" });
  } catch {
    try {
      return parse(code, { ...PARSE_OPTIONS, sourceType: "script" });
    } catch {
      return null;
    }
  }
}

function walk(node, parents, visit) {
  if (!node || typeof node.type !== "string") return;
  if (visit(node, parents) === false) return;
  parents.push(node);
  for (const key in node) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) walk(child, parents, visit);
    else if (value && typeof value.type === "string") walk(value, parents, visit);
  }
  parents.pop();
}

const stringOf = (n) =>
  n?.type === "Literal" && typeof n.value === "string"
    ? n.value
    : n?.type === "TemplateLiteral" && n.expressions.length === 0
      ? n.quasis[0].value.cooked
      : null;
const keyName = (n) => (n.computed ? stringOf(n.property ?? n.key) : (n.property ?? n.key)?.name ?? stringOf(n.key));

/** Names read from the value of `container` (an import() or require() call). */
function usesOf(container, parents) {
  let node = container;
  let i = parents.length - 1;
  while (parents[i]?.type === "AwaitExpression" || parents[i]?.type === "ParenthesizedExpression") node = parents[i--];
  const parent = parents[i];
  if (parent?.type === "MemberExpression" && parent.object === node) return [keyName(parent) ?? "*"];
  if (parent?.type === "VariableDeclarator" && parent.init === node) {
    if (parent.id.type === "ObjectPattern" && parent.id.properties.every((p) => p.type === "Property")) {
      return parent.id.properties.map((p) => keyName(p) ?? "*");
    }
    if (parent.id.type === "Identifier") return [{ namespace: parent.id.name }];
  }
  return ["*"];
}

function isRequireCall(node) {
  return node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require" &&
    node.arguments.length === 1;
}

function declaredNames(node) {
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") return node.id ? [node.id.name] : [];
  return [];
}

function patternNames(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === "Identifier") out.push(pattern.name);
  else if (pattern.type === "ObjectPattern") for (const p of pattern.properties) patternNames(p.type === "RestElement" ? p.argument : p.value, out);
  else if (pattern.type === "ArrayPattern") for (const e of pattern.elements) patternNames(e?.type === "RestElement" ? e.argument : e, out);
  else if (pattern.type === "AssignmentPattern") patternNames(pattern.left, out);
  else if (pattern.type === "RestElement") patternNames(pattern.argument, out);
  return out;
}

/**
 * One parsed file: its top-level units, bindings, exports and node classes.
 * `uses` of a unit lists the identifiers its source mentions, `members` the
 * properties read from namespace bindings, and `dynamic` the specifiers it
 * loads with import() or require(), with the names it reads.
 */
function analyzeFile(path) {
  const ast = parseFile(path);
  const file = {
    path,
    parsed: ast !== null,
    units: [],
    bindings: new Map(),
    exports: new Map(),
    stars: [],
    nodeTypes: new Map(),
    esm: false
  };
  if (!ast) return file;
  const addUnit = (node, names) => {
    const unit = { id: file.units.length, node, names, uses: new Set(), members: [], dynamic: [] };
    file.units.push(unit);
    for (const name of names) if (!file.bindings.has(name)) file.bindings.set(name, { unit: unit.id });
    return unit;
  };

  for (const statement of ast.body) {
    if (statement.type === "ImportDeclaration") {
      file.esm = true;
      for (const s of statement.specifiers) {
        const spec = statement.source.value;
        if (s.type === "ImportSpecifier") file.bindings.set(s.local.name, { spec, name: s.imported.name ?? s.imported.value });
        else if (s.type === "ImportDefaultSpecifier") file.bindings.set(s.local.name, { spec, name: "default" });
        else file.bindings.set(s.local.name, { spec, namespace: true });
      }
      continue;
    }
    if (statement.type === "ExportAllDeclaration") {
      file.esm = true;
      if (statement.exported) file.exports.set(statement.exported.name ?? statement.exported.value, { spec: statement.source.value, namespace: true });
      else file.stars.push(statement.source.value);
      continue;
    }
    if (statement.type === "ExportNamedDeclaration") {
      file.esm = true;
      if (statement.source) {
        for (const s of statement.specifiers) {
          file.exports.set(s.exported.name ?? s.exported.value, { spec: statement.source.value, name: s.local.name ?? s.local.value });
        }
        continue;
      }
      if (statement.declaration) {
        for (const name of addDeclaration(statement.declaration)) file.exports.set(name, { local: name });
      }
      for (const s of statement.specifiers) file.exports.set(s.exported.name ?? s.exported.value, { local: s.local.name ?? s.local.value });
      continue;
    }
    if (statement.type === "ExportDefaultDeclaration") {
      file.esm = true;
      const d = statement.declaration;
      const names = (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") && d.id ? [d.id.name] : [];
      const unit = addUnit(d, names.length ? names : ["*default*"]);
      file.exports.set("default", { local: unit.names[0] });
      continue;
    }
    addDeclaration(statement);
  }

  function addDeclaration(node) {
    if (node.type === "VariableDeclaration") {
      const names = [];
      for (const d of node.declarations) {
        const own = patternNames(d.id);
        addUnit(d, own);
        names.push(...own);
      }
      return names;
    }
    const names = declaredNames(node);
    if (names.length) addUnit(node, names);
    else addUnit(node, []);
    return names;
  }

  // A CommonJS file is one unit: reaching any of it reaches all of it.
  if (!file.esm) {
    file.units = [{ id: 0, node: ast, names: ["*cjs*"], uses: new Set(), members: [], dynamic: [] }];
    file.bindings = new Map();
  }

  const namespaces = new Set([...file.bindings].filter(([, b]) => b.namespace).map(([n]) => n));
  const constants = new Map();
  for (const unit of file.units) {
    const d = unit.node;
    if (d.type === "VariableDeclarator" && d.id.type === "Identifier" && stringOf(d.init) !== null) constants.set(d.id.name, stringOf(d.init));
  }

  // Fills a unit's uses, members and dynamic loads from the source under
  // `root`, without descending into the nodes in `skip`.
  function scan(root, unit, skip = new Set()) {
    const localNamespaces = new Map();
    walk(root, [], (node, parents) => {
      if (skip.has(node)) return false;
      if (node.type === "ImportExpression" || isRequireCall(node)) {
        const spec = stringOf(node.source ?? node.arguments[0]);
        if (spec === null) return;
        const names = [];
        for (const u of usesOf(node, parents)) {
          if (typeof u === "string") names.push(u);
          else localNamespaces.set(u.namespace, spec);
        }
        unit.dynamic.push({ spec, names, local: names.length === 0 });
        return;
      }
      if (node.type !== "Identifier") return;
      const parent = parents.at(-1);
      if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
      if ((parent?.type === "Property" || parent?.type === "PropertyDefinition" || parent?.type === "MethodDefinition") &&
        parent.key === node && !parent.computed && !parent.shorthand) return;
      if (localNamespaces.has(node.name)) {
        if (parent?.type === "VariableDeclarator" && parent.id === node) return;
        const member = parent?.type === "MemberExpression" && parent.object === node ? keyName(parent) ?? "*" : "*";
        unit.dynamic.find((d) => d.spec === localNamespaces.get(node.name) && d.local)?.names.push(member);
        return;
      }
      if (namespaces.has(node.name)) {
        if (parent?.type === "ImportNamespaceSpecifier") return;
        const member = parent?.type === "MemberExpression" && parent.object === node ? keyName(parent) ?? "*" : "*";
        unit.members.push({ binding: node.name, name: member });
        return;
      }
      unit.uses.add(node.name);
    });
  }

  // Node classes. `static nodeType` set to a string, or to a top-level
  // string constant of the file, names the class's unit. A class whose
  // nodeType comes from a parameter (`desc.nodeType`) is a factory: each
  // object literal of the file with a literal `nodeType` property is then a
  // descriptor, and its node's code is the descriptor plus whatever the
  // enclosing declaration uses outside its descriptors (the factory call).
  let factory = false;
  for (const unit of [...file.units]) {
    scan(unit.node, unit);
    walk(unit.node, [], (node) => {
      if (node.type !== "PropertyDefinition" || !node.static || keyName(node) !== "nodeType") return;
      const type = stringOf(node.value) ?? (node.value?.type === "Identifier" ? constants.get(node.value.name) : null);
      if (type) file.nodeTypes.set(type, unit.id);
      else if (node.value?.type === "MemberExpression") factory = true;
    });
  }
  if (factory) {
    for (const unit of [...file.units]) {
      const descriptors = [];
      walk(unit.node, [], (node) => {
        if (node.type !== "ObjectExpression") return;
        const prop = node.properties.find((p) => p.type === "Property" && !p.computed && keyName(p) === "nodeType");
        const type = prop ? stringOf(prop.value) : null;
        if (type && !file.nodeTypes.has(type)) descriptors.push({ node, type });
      });
      if (descriptors.length === 0) continue;
      const outside = { uses: new Set(), members: [], dynamic: [] };
      scan(unit.node, outside, new Set(descriptors.map((d) => d.node)));
      for (const { node, type } of descriptors) {
        const pseudo = { id: file.units.length, node, names: [], uses: new Set(outside.uses), members: [...outside.members], dynamic: [...outside.dynamic] };
        scan(node, pseudo);
        file.units.push(pseudo);
        file.nodeTypes.set(type, pseudo.id);
      }
    }
  }
  return file;
}

/**
 * The analyzed module graph of one build. `governs(spec)` says whether the
 * contract covers a specifier; those imports end the walk.
 */
export class ModuleGraph {
  constructor(metafile, governs, cwd = process.cwd()) {
    this.metafile = metafile;
    this.governs = governs;
    this.cwd = cwd;
    this.files = new Map();
    this.exportCache = new Map();
    this.resolved = new Map();
    for (const [path, input] of Object.entries(metafile.inputs)) {
      const map = new Map();
      for (const imp of input.imports) if (imp.original !== undefined && !map.has(imp.original)) map.set(imp.original, imp.path);
      this.resolved.set(path, map);
    }
  }

  /** Bundled files, without virtual modules. */
  sourceFiles() {
    return Object.keys(this.metafile.inputs).filter((p) => !p.includes(":") && !p.startsWith("<"));
  }

  file(path) {
    let f = this.files.get(path);
    if (!f) {
      f = analyzeFile(path);
      this.files.set(path, f);
    }
    return f;
  }

  /** `{ importer: { spec: Set<name> } }` for every governed specifier. */
  importedNames() {
    const out = {};
    for (const path of this.sourceFiles()) {
      const governed = [...(this.resolved.get(path)?.keys() ?? [])].filter((s) => this.governs(s));
      if (governed.length === 0) continue;
      const f = this.file(path);
      const names = {};
      const add = (spec, list) => {
        if (!this.governs(spec)) return;
        const set = (names[spec] ??= new Set());
        for (const n of list) set.add(n);
      };
      if (!f.parsed) for (const spec of governed) add(spec, ["*"]);
      for (const [, b] of f.bindings) if (b.spec && !b.namespace) add(b.spec, [b.name]);
      for (const [, e] of f.exports) if (e.spec) add(e.spec, [e.namespace ? "*" : e.name]);
      for (const spec of f.stars) add(spec, ["*"]);
      for (const unit of f.units) {
        for (const m of unit.members) add(f.bindings.get(m.binding).spec, [m.name]);
        for (const d of unit.dynamic) add(d.spec, d.names);
      }
      // A namespace import whose binding is never read imports nothing.
      for (const spec of governed) if (!names[spec] && [...f.bindings.values()].some((b) => b.spec === spec)) names[spec] ??= new Set();
      out[path] = names;
    }
    return out;
  }

  target(importer, spec) {
    return this.resolved.get(importer)?.get(spec);
  }

  /** Every class with a literal `static nodeType`: `{ nodeType: [{ path, unit }] }`. */
  nodeClasses() {
    const out = new Map();
    for (const path of this.sourceFiles()) {
      if (/\.(json|node|wasm|css|txt)$/.test(path) || !readFileSync(path, "utf8").includes("nodeType")) continue;
      const f = this.file(path);
      for (const [type, unit] of f.nodeTypes) {
        if (!out.has(type)) out.set(type, []);
        out.get(type).push({ path, unit });
      }
    }
    return out;
  }

  /**
   * The governed exports `{ spec, name }` reached from one unit, following
   * top-level declarations across files.
   */
  reach(path, unitId) {
    const found = new Map();
    const seen = new Set();
    const stack = [[path, unitId]];
    const follow = (importer, spec, name) => {
      const targets = this.importTargets(importer, spec, name);
      for (const u of targets.units) stack.push(u);
      for (const [s, n] of targets.records) found.set(`${s}\u0000${n}`, { spec: s, name: n });
    };
    while (stack.length) {
      const [p, id] = stack.pop();
      const key = `${p}\u0000${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const f = this.file(p);
      const unit = f.units[id];
      if (!unit) continue;
      for (const name of unit.uses) {
        const b = f.bindings.get(name);
        if (!b) continue;
        if (b.unit !== undefined) stack.push([p, b.unit]);
        else if (b.spec && !b.namespace) follow(p, b.spec, b.name);
      }
      for (const m of unit.members) follow(p, f.bindings.get(m.binding).spec, m.name);
      for (const d of unit.dynamic) for (const n of d.names) follow(p, d.spec, n);
    }
    return [...found.values()];
  }

  /** What `import { name } from spec` in `importer` refers to: units and governed exports. */
  importTargets(importer, spec, name) {
    if (this.governs(spec)) return { units: [], records: [[spec, name]] };
    const target = this.target(importer, spec);
    if (!target || target.includes(":")) return EMPTY_TARGETS;
    return this.exportTargets(target, name, new Set());
  }

  /**
   * The units that define export `name` of `path` ("*" for all exports) and
   * the governed exports it re-exports, memoized. Inside a re-export cycle
   * the inner lookup contributes nothing.
   */
  exportTargets(path, name, visiting) {
    const key = `${path}\u0000${name}`;
    const cached = this.exportCache.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return EMPTY_TARGETS;
    visiting.add(key);
    const out = { units: [], records: [] };
    const f = this.file(path);
    const viaSpec = (spec, n) => {
      if (this.governs(spec)) return void out.records.push([spec, n]);
      const target = this.target(path, spec);
      if (!target || target.includes(":")) return;
      const r = this.exportTargets(target, n, visiting);
      out.units.push(...r.units);
      out.records.push(...r.records);
    };
    const entryTargets = (entry) => {
      if (entry.local !== undefined) {
        const b = f.bindings.get(entry.local);
        if (b?.unit !== undefined) out.units.push([path, b.unit]);
        else if (b?.spec) viaSpec(b.spec, b.namespace ? "*" : b.name);
      } else if (entry.spec) {
        viaSpec(entry.spec, entry.namespace ? "*" : entry.name);
      }
    };
    if (!f.esm) {
      if (f.units.length) out.units.push([path, 0]);
    } else if (name === "*") {
      for (const entry of f.exports.values()) entryTargets(entry);
      for (const spec of f.stars) viaSpec(spec, "*");
    } else if (f.exports.has(name)) {
      entryTargets(f.exports.get(name));
    } else {
      for (const spec of f.stars) viaSpec(spec, name);
    }
    visiting.delete(key);
    this.exportCache.set(key, out);
    return out;
  }
}

const EMPTY_TARGETS = { units: [], records: [] };

/**
 * Host operations each top-level function of a guest file calls through
 * `host().<op>(...)`, directly or through other top-level functions.
 */
export function hostOperations(path) {
  const ast = parseFile(path);
  const direct = new Map();
  const calls = new Map();
  for (const statement of ast.body) {
    const fn = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (fn?.type !== "FunctionDeclaration") continue;
    const ops = new Set();
    const callees = new Set();
    walk(fn.body, [], (node) => {
      if (node.type !== "CallExpression") return;
      const c = node.callee;
      if (c.type === "MemberExpression" && c.object.type === "CallExpression" && c.object.callee.type === "Identifier" &&
        c.object.callee.name === "host" && !c.computed) ops.add(c.property.name);
      if (c.type === "Identifier") callees.add(c.name);
    });
    direct.set(fn.id.name, ops);
    calls.set(fn.id.name, callees);
  }
  const out = new Map();
  for (const name of direct.keys()) {
    const ops = new Set();
    const seen = new Set();
    const stack = [name];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n) || !direct.has(n)) continue;
      seen.add(n);
      for (const op of direct.get(n)) ops.add(op);
      for (const c of calls.get(n)) stack.push(c);
    }
    out.set(name, [...ops].sort());
  }
  return out;
}
