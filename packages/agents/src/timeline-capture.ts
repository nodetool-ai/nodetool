/**
 * The capture step of timeline code capture (docs/timeline-code-capture.md).
 *
 * Guest code that imports `@nodetool-ai/sandbox-timeline` passes through
 * {@link captureTimelineScenes} before it runs. Each
 * `<receiver>.scene(name, seconds, fn, extra?)` call gets one more argument,
 * a capture record, which tells the pack what `fn` needs to be rebuilt
 * without the rest of the script: the declarations to keep as source text,
 * the pack imports, and the values to snapshot when the scene is built.
 * `v.save()` prints the retained program from these records.
 *
 * The transform only appends text inside existing lines, so every line of
 * the guest code keeps its number and stack positions stay correct.
 */

import * as acorn from "acorn";
import { analyze, type Reference, type Scope, type Variable } from "eslint-scope";

const PACK_PREFIX = "@nodetool-ai/sandbox-";
const TIMELINE_PACK = "@nodetool-ai/sandbox-timeline";

/** Globals a kept callback may use. They exist in every sandbox, including the hermetic bake. */
const SAFE_GLOBALS: ReadonlySet<string> = new Set([
  "Math", "JSON", "Number", "String", "Boolean", "Array", "Object", "Symbol",
  "Map", "Set", "WeakMap", "WeakSet", "Error", "TypeError", "RangeError",
  "RegExp", "Date", "Promise", "Intl", "BigInt", "Reflect", "Proxy",
  "Infinity", "NaN", "undefined", "isFinite", "isNaN", "parseFloat",
  "parseInt", "encodeURIComponent", "decodeURIComponent", "encodeURI",
  "decodeURI", "console", "globalThis", "structuredClone", "Uint8Array",
  "Float32Array", "Float64Array", "Int32Array", "Uint32Array",
  "ArrayBuffer", "DataView", "TextEncoder", "TextDecoder"
]);

/** Methods that change the object they are called on. A `const` used this way is not its initializer any more. */
const MUTATING_METHODS: ReadonlySet<string> = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill",
  "copyWithin", "set", "add", "delete", "clear"
]);

type AnyNode = acorn.Node & Record<string, unknown>;

interface ImportClass {
  kind: "import";
  module: string;
  /** `"*"` for a namespace import, `"default"` for a default import. */
  imported: string;
  local: string;
}
interface DeclClass {
  kind: "decl";
  /** Source offset of the declaration. The printer keeps source order. */
  at: number;
  src: string;
  deps: Dependency[];
}
type Classification =
  | ImportClass
  | { kind: "video" }
  | DeclClass
  | { kind: "snapshot" }
  | { kind: "error"; message: string };

type Dependency = { variable: Variable } | { global: string; node: AnyNode };

/** One capture record, as the pack reads it. */
interface CaptureRecord {
  src: string;
  video: string | null;
  decls: { at: number; top: boolean; src: string }[];
  imports: { m: string; i: string; l: string }[];
  snap: string[];
  errors: string[];
}

/**
 * Add a capture record to each `.scene()` call in `code`. Returns `code`
 * unchanged when it does not import the timeline pack, cannot be parsed,
 * or has no scene call to capture.
 */
export function captureTimelineScenes(code: string): string {
  if (!code.includes(TIMELINE_PACK)) return code;
  let program: acorn.Program;
  try {
    program = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      // eslint-scope reads `range` to resolve references inside a function.
      ranges: true
    });
  } catch {
    return code;
  }
  const packImport = program.body.find(
    (node) =>
      node.type === "ImportDeclaration" && node.source.value === TIMELINE_PACK
  );
  if (!packImport) return code;

  let analysis: ReturnType<typeof analyze>;
  try {
    analysis = analyze(program, { ecmaVersion: 2022, sourceType: "module" });
  } catch {
    return code;
  }
  return new Capture(
    code,
    program as unknown as AnyNode,
    analysis,
    packImport.start
  ).run();
}

class Capture {
  private readonly parents = new WeakMap<object, AnyNode>();
  private readonly references: Reference[];
  private readonly classes = new Map<Variable, Classification>();
  /** The top-level binding `video(...)` is assigned to, which prints the scene calls. */
  private videoBinding: string | null = null;

  /**
   * @param hostBoundary Offset of the pack import. A host prepends its
   * prelude (`nodetool`, `tools`, `finish`, …) to the guest's code, so every
   * top-level binding above the import is the host's, not the author's.
   */
  constructor(
    private readonly code: string,
    private readonly program: AnyNode,
    private readonly analysis: ReturnType<typeof analyze>,
    private readonly hostBoundary: number
  ) {
    forEachNode(program, (node, parent) => {
      if (parent) this.parents.set(node, parent);
    });
    this.references = analysis.scopes.flatMap((scope) => scope.references);
  }

  run(): string {
    for (const statement of this.program["body"] as AnyNode[]) {
      if (statement.type !== "VariableDeclaration") continue;
      for (const declarator of statement["declarations"] as AnyNode[]) {
        const id = declarator["id"] as AnyNode;
        const init = declarator["init"] as AnyNode | null;
        if (id.type === "Identifier" && init && this.isVideoCall(init)) {
          this.videoBinding = String(id["name"]);
        }
      }
    }
    const inserts: { at: number; text: string }[] = [];
    forEachNode(this.program, (node) => {
      const insert = this.sceneCall(node);
      if (insert) inserts.push(insert);
    });
    if (inserts.length === 0) return this.code;
    let out = this.code;
    for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) {
      out = out.slice(0, at) + text + out.slice(at);
    }
    return out;
  }

  /** The text to insert for one `.scene(name, seconds, fn, extra?)` call, or null. */
  private sceneCall(node: AnyNode): { at: number; text: string } | null {
    if (node.type !== "CallExpression") return null;
    const callee = node["callee"] as AnyNode;
    if (
      callee.type !== "MemberExpression" ||
      callee["computed"] ||
      (callee["property"] as AnyNode)["name"] !== "scene"
    ) {
      return null;
    }
    const args = node["arguments"] as AnyNode[];
    if (args.length !== 3 && args.length !== 4) return null;
    if (args.some((arg) => arg.type === "SpreadElement")) return null;
    const fn = args[2]!;
    const record = this.record(fn);
    if (!record) return null;
    const text =
      (args.length === 3 ? ", undefined, " : ", ") + printRecord(record);
    return { at: args[args.length - 1]!.end, text };
  }

  private record(fn: AnyNode): CaptureRecord | null {
    const isFunction =
      fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression";
    if (!isFunction && fn.type !== "Identifier") return null;

    const record: CaptureRecord = {
      src: isFunction ? this.code.slice(fn.start, fn.end) : String(fn["name"]),
      video: this.videoBinding,
      decls: [],
      imports: [],
      snap: [],
      errors: []
    };
    const callScope = isFunction
      ? this.analysis.acquire(fn)?.upper ?? null
      : this.referenceAt(fn)?.from ?? null;
    if (!callScope) return null;

    // Whether each visited variable prints at the top of the program. A
    // variable still being visited (a cycle) counts as top.
    const topOf = new Map<Variable, boolean>();
    const snapshots = new Set<Variable>();
    const declsAt = new Map<number, { top: boolean; src: string }>();
    const imports = new Map<string, ImportClass>();
    const errors = new Set<string>();

    const visit = (dependency: Dependency): boolean => {
      if ("global" in dependency) {
        const message = this.globalProblem(dependency.global, dependency.node);
        if (message) errors.add(message);
        return true;
      }
      const variable = dependency.variable;
      const known = topOf.get(variable);
      if (known !== undefined) return known;
      topOf.set(variable, true);
      const cls = this.classify(variable);
      switch (cls.kind) {
        case "import":
          imports.set(`${cls.module}\u0000${cls.local}`, cls);
          return true;
        case "video":
          record.video = variable.name;
          return true;
        case "snapshot":
          snapshots.add(variable);
          topOf.set(variable, false);
          return false;
        case "error":
          errors.add(cls.message);
          return true;
        case "decl": {
          let top = variable.scope.type === "module";
          for (const dep of cls.deps) {
            if (!visit(dep)) top = false;
          }
          declsAt.set(cls.at, { top, src: cls.src });
          topOf.set(variable, top);
          return top;
        }
      }
    };

    const roots: Dependency[] = isFunction
      ? this.freeDependencies(fn)
      : this.dependencyFor(fn);
    for (const root of roots) visit(root);
    for (const message of this.randomnessProblems(fn)) errors.add(message);

    for (const variable of snapshots) {
      if (resolveName(callScope, variable.name) !== variable) {
        errors.add(
          `\`${variable.name}\` is shadowed where the scene is built, so its ` +
            "value cannot be captured there. Rename one of the two."
        );
        continue;
      }
      record.snap.push(variable.name);
    }
    record.decls = [...declsAt.entries()]
      .sort(([a], [b]) => a - b)
      .map(([at, decl]) => ({ at, ...decl }));
    record.imports = [...imports.values()].map((imp) => ({
      m: imp.module,
      i: imp.imported,
      l: imp.local
    }));
    record.errors = [...errors];
    return record;
  }

  private classify(variable: Variable): Classification {
    const cached = this.classes.get(variable);
    if (cached) return cached;
    // A placeholder breaks cycles: a recursive helper refers to itself.
    this.classes.set(variable, { kind: "snapshot" });
    const cls = this.classifyUncached(variable);
    this.classes.set(variable, cls);
    return cls;
  }

  private classifyUncached(variable: Variable): Classification {
    const def = variable.defs[0];
    if (!def) return { kind: "snapshot" };
    const node = def.node as unknown as AnyNode;
    if (
      variable.scope.type === "module" &&
      def.type !== "ImportBinding" &&
      node.start < this.hostBoundary
    ) {
      return {
        kind: "error",
        message:
          `\`${variable.name}\` belongs to the host and is not available when ` +
          "the timeline is rebaked. Call it at the top level, before the " +
          "scene, and use its result."
      };
    }
    switch (def.type) {
      case "ImportBinding": {
        const declaration = def.parent as unknown as AnyNode;
        const module = String((declaration["source"] as AnyNode)["value"]);
        if (!module.startsWith(PACK_PREFIX)) {
          return {
            kind: "error",
            message: `\`${variable.name}\` comes from "${module}", which a rebake cannot import.`
          };
        }
        const imported =
          node.type === "ImportNamespaceSpecifier"
            ? "*"
            : node.type === "ImportDefaultSpecifier"
              ? "default"
              : String(
                  (node["imported"] as AnyNode)["name"] ??
                    (node["imported"] as AnyNode)["value"]
                );
        return { kind: "import", module, imported, local: variable.name };
      }
      case "Variable": {
        const declaration = def.parent as unknown as AnyNode;
        const init = node["init"] as AnyNode | null;
        if (declaration["kind"] !== "const" || !init) return { kind: "snapshot" };
        if (this.isVideoCall(init)) return { kind: "video" };
        if (
          init.type === "ArrowFunctionExpression" ||
          init.type === "FunctionExpression"
        ) {
          return this.classifyFunction(variable, init, node, `const ${this.code.slice(node.start, node.end)};`);
        }
        if (containsAwait(init) || this.isMutated(variable, node)) {
          return { kind: "snapshot" };
        }
        if (this.randomnessProblems(init).length > 0) return { kind: "snapshot" };
        const deps = this.freeDependencies(init, node);
        // A value computed from a snapshot is itself snapshotted: the
        // program keeps `headline`, not the whole fetch result it came from.
        if (deps.some((dep) => this.blocksKeeping(dep) || this.isSnapshot(dep))) {
          return { kind: "snapshot" };
        }
        return {
          kind: "decl",
          at: node.start,
          src: `const ${this.code.slice(node.start, node.end)};`,
          deps
        };
      }
      case "FunctionName":
      case "ClassName":
        return this.classifyFunction(
          variable,
          node,
          node,
          this.code.slice(node.start, node.end)
        );
      default:
        return { kind: "snapshot" };
    }
  }

  /**
   * A function or class is kept as source text. It may read a snapshot: the
   * snapshot is printed before it, inside the scene's block, so a shared
   * counter it increments starts where it stood when the scene was built.
   */
  private classifyFunction(
    variable: Variable,
    fn: AnyNode,
    declaration: AnyNode,
    src: string
  ): Classification {
    const what = fn.type === "ClassDeclaration" ? "class" : "function";
    if (fn["async"] || fn["generator"]) {
      return {
        kind: "error",
        message: `\`${variable.name}\` is an async or generator ${what}, which a scene cannot keep.`
      };
    }
    const writes = variable.references.filter(
      (ref) => ref.isWrite() && !ref.init
    );
    if (writes.length > 0) {
      return {
        kind: "error",
        message: `\`${variable.name}\` is reassigned, so its source text is not its value.`
      };
    }
    const random = this.randomnessProblems(fn);
    if (random.length > 0) return { kind: "error", message: random[0]! };
    const deps = this.freeDependencies(fn, declaration);
    for (const dep of deps) {
      if (this.blocksKeeping(dep)) {
        const name = "global" in dep ? dep.global : dep.variable.name;
        return {
          kind: "error",
          message:
            `The ${what} \`${variable.name}\` uses \`${name}\`, which a rebake ` +
            "cannot reach. Pass the value in as an argument instead."
        };
      }
    }
    return { kind: "decl", at: declaration.start, src, deps };
  }

  /**
   * True when a declaration that depends on `dep` cannot be kept as source
   * text: the dependency is an error, or a capability global.
   */
  private blocksKeeping(dep: Dependency): boolean {
    if ("global" in dep) return !SAFE_GLOBALS.has(dep.global);
    const cls = this.classify(dep.variable);
    return cls.kind === "error";
  }

  private isSnapshot(dep: Dependency): boolean {
    return "variable" in dep && this.classify(dep.variable).kind === "snapshot";
  }

  private globalProblem(name: string, node: AnyNode): string | null {
    if (SAFE_GLOBALS.has(name)) return null;
    const line = lineOf(this.code, node.start);
    return (
      `\`${name}\` (line ${line}) is not available when the timeline is ` +
      "rebaked. Call it at the top level, before the scene, and use its result."
    );
  }

  /** Direct uses of `Math.random()` / `Date.now()` / `new Date()` inside `node`. */
  private randomnessProblems(node: AnyNode): string[] {
    const problems: string[] = [];
    forEachNode(node, (child) => {
      const target =
        child.type === "CallExpression" || child.type === "NewExpression"
          ? (child["callee"] as AnyNode)
          : null;
      if (!target) return;
      const text = this.code.slice(target.start, target.end);
      const isRandom = text === "Math.random" || text === "Date.now";
      const isNewDate = child.type === "NewExpression" && text === "Date";
      if (!isRandom && !isNewDate) return;
      const ref = this.referenceAt(
        (target.type === "MemberExpression" ? target["object"] : target) as AnyNode
      );
      if (ref?.resolved) return;
      problems.push(
        `\`${text}()\` (line ${lineOf(this.code, child.start)}) gives a different ` +
          "value on every rebake. Use hash(n) or noise(seed) from the pack, or " +
          "compute the value at the top level."
      );
    });
    return problems;
  }

  private isVideoCall(init: AnyNode): boolean {
    if (init.type !== "CallExpression") return false;
    const callee = init["callee"] as AnyNode;
    if (callee.type !== "Identifier") return false;
    const variable = this.referenceAt(callee)?.resolved;
    const def = variable?.defs[0];
    if (!def || def.type !== "ImportBinding") return false;
    const source = (def.parent as unknown as AnyNode)["source"] as AnyNode;
    const spec = def.node as unknown as AnyNode;
    return (
      source["value"] === TIMELINE_PACK &&
      spec.type === "ImportSpecifier" &&
      (spec["imported"] as AnyNode)["name"] === "video"
    );
  }

  /**
   * True when code outside the initializer changes the object `variable`
   * holds, so the initializer text no longer describes the value.
   */
  private isMutated(variable: Variable, declarator: AnyNode): boolean {
    for (const ref of variable.references) {
      const id = ref.identifier as unknown as AnyNode;
      if (id.start >= declarator.start && id.end <= declarator.end) continue;
      let current: AnyNode = id;
      let parent = this.parents.get(current);
      let isMember = false;
      while (
        parent &&
        parent.type === "MemberExpression" &&
        parent["object"] === current
      ) {
        isMember = true;
        current = parent;
        parent = this.parents.get(current);
      }
      if (!parent) continue;
      if (isMember) {
        if (parent.type === "AssignmentExpression" && parent["left"] === current) return true;
        if (parent.type === "UpdateExpression") return true;
        if (parent.type === "UnaryExpression" && parent["operator"] === "delete") return true;
        if (parent.type === "CallExpression" && parent["callee"] === current) {
          const property = current["property"] as AnyNode;
          if (MUTATING_METHODS.has(String(property["name"]))) return true;
        }
      } else if (
        parent.type === "CallExpression" &&
        (parent["arguments"] as AnyNode[])[0] === id &&
        this.code.slice(
          (parent["callee"] as AnyNode).start,
          (parent["callee"] as AnyNode).end
        ) === "Object.assign"
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * The variables and globals `node` refers to that are declared outside
   * it. `self` (a declarator) is excluded, so a recursive arrow does not
   * depend on itself.
   */
  private freeDependencies(node: AnyNode, self?: AnyNode): Dependency[] {
    const deps = new Map<Variable | string, Dependency>();
    for (const ref of this.references) {
      const id = ref.identifier as unknown as AnyNode;
      if (id.start < node.start || id.end > node.end) continue;
      const variable = ref.resolved;
      if (!variable) {
        const name = ref.identifier.name;
        if (!deps.has(name)) deps.set(name, { global: name, node: id });
        continue;
      }
      const declared = variable.identifiers[0] as unknown as AnyNode | undefined;
      if (declared && declared.start >= node.start && declared.end <= node.end) {
        continue;
      }
      if (self && declared && declared.start >= self.start && declared.end <= self.end) {
        continue;
      }
      if (!deps.has(variable)) deps.set(variable, { variable });
    }
    return [...deps.values()];
  }

  private dependencyFor(identifier: AnyNode): Dependency[] {
    const ref = this.referenceAt(identifier);
    if (!ref) return [];
    return ref.resolved
      ? [{ variable: ref.resolved }]
      : [{ global: ref.identifier.name, node: identifier }];
  }

  private referenceAt(identifier: AnyNode): Reference | undefined {
    return this.references.find(
      (ref) => (ref.identifier as unknown as AnyNode).start === identifier.start
    );
  }
}

function resolveName(scope: Scope | null, name: string): Variable | null {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return null;
}

/** True when `node` awaits or yields, not counting nested functions. */
function containsAwait(node: AnyNode): boolean {
  let found = false;
  forEachNode(node, (child) => {
    if (child.type === "AwaitExpression" || child.type === "YieldExpression") {
      found = true;
    }
  }, true);
  return found;
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (code.charCodeAt(i) === 10) line++;
  return line;
}

function isNode(value: unknown): value is AnyNode {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression"
]);

/** Visit `root` and every node below it. `skipFunctions` stops at nested functions. */
function forEachNode(
  root: AnyNode,
  visit: (node: AnyNode, parent: AnyNode | null) => void,
  skipFunctions = false
): void {
  const stack: [AnyNode, AnyNode | null][] = [[root, null]];
  while (stack.length > 0) {
    const [node, parent] = stack.pop()!;
    visit(node, parent);
    if (skipFunctions && node !== root && FUNCTION_TYPES.has(node.type)) continue;
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) stack.push([item, node]);
      } else if (isNode(value)) {
        stack.push([value, node]);
      }
    }
  }
}

/**
 * Print a capture record as a JS object literal on one line. The snapshot
 * thunks are real code: each one reads its variable where the scene is
 * built. The pack calls each thunk inside its own `try`, so a variable
 * still in its temporal dead zone gives an error, not a crash.
 */
function printRecord(record: CaptureRecord): string {
  const snap = record.snap
    .map((name) => `[${JSON.stringify(name)},()=>${name}]`)
    .join(",");
  return (
    `{__ntCapture:1,src:${JSON.stringify(record.src)},` +
    `video:${JSON.stringify(record.video)},` +
    `decls:${JSON.stringify(record.decls)},` +
    `imports:${JSON.stringify(record.imports)},` +
    `snap:[${snap}],errors:${JSON.stringify(record.errors)}}`
  );
}
