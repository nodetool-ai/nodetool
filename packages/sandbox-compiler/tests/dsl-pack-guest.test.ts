/**
 * The guest surface of `@nodetool-ai/sandbox-dsl`, in the sandbox and against
 * the live node registry.
 *
 * `dsl-pack.test.ts` next door pins the pack's shape — the manifest, discovery,
 * per-namespace resolution — on a few representative namespaces. This file asks
 * the questions that only hold if every part works: does each of the 72
 * declared modules initialize in QuickJS, does every node type the wrappers
 * name exist in the registry a workflow runs against, and does the graph the
 * guest returns survive the validator the server puts in front of a saved
 * workflow.
 *
 * The wiring rules are the rest: what a handle does when a program treats it as
 * text, what a second consumer of one output produces, and what happens on the
 * failure paths a model reaches by guessing. Each of those is a fact worth one
 * exact assertion, because the DSL exists to turn a runtime surprise into an
 * error at the line that caused it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { runInSandbox } from "@nodetool-ai/agents";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { NodeRegistry, validateGraph } from "@nodetool-ai/node-sdk";

import { packDir, resolveFor } from "./pack-harness.js";

const SPECIFIER = "@nodetool-ai/sandbox-dsl";
const INPUT = `${SPECIFIER}/nodetool.input`;
const OUTPUT = `${SPECIFIER}/nodetool.output`;
const TEXT = `${SPECIFIER}/nodetool.text`;

interface ManifestModule {
  readonly name: string;
  readonly kind: string;
  readonly file?: string;
}

/** The pack's declared guest modules, straight from its manifest. */
function manifestModules(): readonly ManifestModule[] {
  const parsed = JSON.parse(
    readFileSync(join(packDir(SPECIFIER), "package.json"), "utf8")
  ) as { nodetool: { sandboxModules: readonly ManifestModule[] } };
  return parsed.nodetool.sandboxModules;
}

/** `nodetool.image` → `@nodetool-ai/sandbox-dsl/nodetool.image`; `.` → the root. */
function specifierFor(name: string): string {
  return name === "." ? SPECIFIER : `${SPECIFIER}/${name}`;
}

const ALL_SPECIFIERS = manifestModules().map((module) => specifierFor(module.name));

interface GuestRun {
  readonly success: boolean;
  readonly error?: string;
  readonly result: unknown;
}

/** Run one guest program with `declared` resolved from the pack. */
async function runGuest(code: string, declared: string[]): Promise<GuestRun> {
  const { resolution } = await resolveFor([SPECIFIER], declared);
  const result = await runInSandbox({ code, modules: resolution });
  return { success: result.success, error: result.error, result: result.result };
}

interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly properties: Record<string, unknown>;
  readonly is_streaming_output?: boolean;
}

interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly sourceHandle: string;
  readonly target: string;
  readonly targetHandle: string;
}

interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Run a program that returns a graph, and fail loudly when it did not. */
async function buildGraph(code: string, declared: string[]): Promise<Graph> {
  const run = await runGuest(code, declared);
  if (!run.success) throw new Error(`guest program failed: ${run.error}`);
  return run.result as Graph;
}

/** The registry a workflow built from this DSL is validated and run against. */
function liveRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  return registry;
}

interface Wrapper {
  readonly file: string;
  readonly nodeType: string;
  readonly outputNames: readonly string[];
}

/**
 * Every `createNode(...)` call the pack ships, read from the built guest files.
 *
 * Reading the text is the point: this is what a program in the sandbox
 * executes, whatever the generator would emit today.
 */
function shippedWrappers(): readonly Wrapper[] {
  const dir = join(packDir(SPECIFIER), "sandbox", "generated");
  const wrappers: Wrapper[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".js") || file === "index.js") continue;
    const source = readFileSync(join(dir, file), "utf8");
    const calls = source.matchAll(/createNode\("([^"]+)",[^,]+,\s*\{([^}]*)\}/g);
    for (const call of calls) {
      const names = /outputNames:\s*\[([^\]]*)\]/.exec(call[2] ?? "");
      wrappers.push({
        file,
        nodeType: call[1] ?? "",
        outputNames: (names?.[1] ?? "")
          .split(",")
          .map((name) => name.trim().replace(/"/g, ""))
          .filter((name) => name.length > 0)
      });
    }
  }
  return wrappers;
}

/**
 * How many `createNode(` calls the pack ships, counted by a pattern too simple
 * to miss one — the yardstick {@link shippedWrappers}'s detailed regex is held
 * against. The import each generated module opens with (`import { createNode }`)
 * carries no paren, so it is not counted.
 */
function shippedWrapperCount(): number {
  const dir = join(packDir(SPECIFIER), "sandbox", "generated");
  let count = 0;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".js") || file === "index.js") continue;
    const source = readFileSync(join(dir, file), "utf8");
    count += (source.match(/createNode\(/g) ?? []).length;
  }
  return count;
}

describe("every namespace module in the guest", () => {
  it("initializes, and exports only node factories", async () => {
    const namespaces = manifestModules()
      .map((module) => module.name)
      .filter((name) => name !== ".");
    const imports = namespaces
      .map((name, index) => `import * as m${index} from "${specifierFor(name)}";`)
      .join("\n");
    const entries = namespaces
      .map((name, index) => `[${JSON.stringify(name)}, m${index}]`)
      .join(",\n");
    const run = await runGuest(
      `
        ${imports}
        const modules = [${entries}];
        return modules.map(([name, module]) => ({
          name,
          exports: Object.keys(module).length,
          nonFunctions: Object.keys(module).filter(
            (key) => typeof module[key] !== "function"
          )
        }));
      `,
      ALL_SPECIFIERS
    );
    expect(run.error).toBeUndefined();
    const loaded = run.result as { name: string; exports: number; nonFunctions: string[] }[];
    expect(loaded.map((entry) => entry.name)).toEqual(namespaces);
    expect(loaded.filter((entry) => entry.exports === 0)).toEqual([]);
    expect(loaded.filter((entry) => entry.nonFunctions.length > 0)).toEqual([]);
  });

  it("reaches the same factories through the root, one property per namespace", async () => {
    const namespaces = manifestModules()
      .map((module) => module.name)
      .filter((name) => name !== ".");
    const run = await runGuest(
      `
        import * as dsl from "${SPECIFIER}";
        import { collect } from "${TEXT}";
        return {
          builders: ["createNode", "isOutputHandle", "workflow"].every(
            (key) => typeof dsl[key] === "function"
          ),
          sameFactory: dsl.text.collect === collect,
          namespaces: Object.keys(dsl).filter((key) => typeof dsl[key] === "object").length
        };
      `,
      [SPECIFIER, TEXT]
    );
    expect(run.error).toBeUndefined();
    // The root re-exports every namespace under a shortened key, so the count
    // matches the manifest even though the names differ (`nodetool.text` is
    // reached as `text`).
    expect(run.result).toEqual({
      builders: true,
      sameFactory: true,
      namespaces: namespaces.length
    });
  });
});

describe("every node type the DSL offers", () => {
  it("exists in the live node registry", () => {
    const registry = liveRegistry();
    const wrappers = shippedWrappers();
    // A regex that matched half the wrappers would make the assertion below
    // vacuous, so check it caught every `createNode(` the pack ships. This was
    // a hardcoded total, which went stale the first time the pack was
    // regenerated — it read 472 against a 457-wrapper pack and failed CI on
    // main for a day.
    expect(wrappers.length).toBeGreaterThan(0);
    expect(wrappers.length).toBe(shippedWrapperCount());
    // The pack ships one artifact for every platform, but base-nodes
    // registers `lib.apple.*` only on darwin (base-nodes/src/index.ts) —
    // off a Mac those wrappers are expected to miss, and nothing else is.
    const platformGated = (type: string) =>
      process.platform !== "darwin" && type.startsWith("lib.apple.");
    const unknown = wrappers
      .filter(
        (wrapper) =>
          !registry.has(wrapper.nodeType) && !platformGated(wrapper.nodeType)
      )
      .map((wrapper) => `${wrapper.file}: ${wrapper.nodeType}`);
    expect(unknown).toEqual([]);
  });

  it("covers the registry with no duplicate wrapper for one type", () => {
    const registry = liveRegistry();
    const wrappers = shippedWrappers();
    const types = wrappers.map((wrapper) => wrapper.nodeType);
    expect(new Set(types).size).toBe(types.length);
    // Nothing forces the DSL to be total, but today it is: a node the registry
    // has and the DSL lacks is a node an agent cannot reach from here.
    expect([...registry.list()].filter((type) => !types.includes(type))).toEqual([]);
  });

  it("names only output slots the node really has", () => {
    const registry = liveRegistry();
    for (const wrapper of shippedWrappers()) {
      // A type the registry lacks is judged by the totality test above,
      // which knows which misses are platform-gated.
      if (!registry.has(wrapper.nodeType)) continue;
      const slots = (registry.getMetadata(wrapper.nodeType)?.outputs ?? []).map(
        (output) => output.name
      );
      for (const declared of wrapper.outputNames) {
        expect(
          slots,
          `${wrapper.nodeType} declares output "${declared}"`
        ).toContain(declared);
      }
    }
  });

  it("declares every output slot, except the one node that declares none", () => {
    const registry = liveRegistry();
    const incomplete = shippedWrappers()
      .filter((wrapper) => {
        const slots = (registry.getMetadata(wrapper.nodeType)?.outputs ?? []).map(
          (output) => output.name
        );
        return slots.some((slot) => !wrapper.outputNames.includes(slot));
      })
      .map((wrapper) => wrapper.nodeType);
    // Preview has an `output` slot in its metadata and an empty `outputNames`
    // in the wrapper, so `preview({...}).output()` throws "has several outputs"
    // for a node with exactly one. Remove it from this list once the generator
    // emits the slot.
    expect(incomplete).toEqual(["nodetool.workflows.base_node.Preview"]);
  });
});

describe("the graph workflow() returns", () => {
  it("passes the validator that guards a saved workflow", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { collect } from "${TEXT}";
        import { output } from "${OUTPUT}";

        const prompt = stringInput({ name: "prompt", value: "a fox in snow" });
        const tokens = collect({ input_item: prompt.output() });
        return workflow(output({ name: "tokens", value: tokens.output() }));
      `,
      [SPECIFIER, INPUT, TEXT, OUTPUT]
    );
    const report = validateGraph(graph, liveRegistry());
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("keeps one node behind two consumers, and one edge per consumer", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { output } from "${OUTPUT}";

        const prompt = stringInput({ name: "prompt", value: "shared" });
        return workflow(
          output({ name: "first", value: prompt.output() }),
          output({ name: "second", value: prompt.output() })
        );
      `,
      [SPECIFIER, INPUT, OUTPUT]
    );
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "output",
      "output_2",
      "string_input"
    ]);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}.${edge.targetHandle}`)).toEqual(
      ["string_input->output.value", "string_input->output_2.value"]
    );
    expect(validateGraph(graph, liveRegistry()).issues.filter((i) => i.severity === "error")).toEqual(
      []
    );
  });

  it("drops a node no terminal reaches", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { output } from "${OUTPUT}";

        stringInput({ name: "orphan", value: "never wired" });
        const used = stringInput({ name: "used", value: "wired" });
        return workflow(output({ name: "out", value: used.output() }));
      `,
      [SPECIFIER, INPUT, OUTPUT]
    );
    expect(graph.nodes).toHaveLength(2);
    expect(
      graph.nodes.find((node) => node.type === "nodetool.input.StringInput")?.properties
    ).toEqual({ name: "used", value: "wired" });
    // The orphan took the plain id, so the wired node is the second one. Ids
    // count every node built, not every node kept.
    expect(graph.nodes.map((node) => node.id)).toContain("string_input_2");
  });

  it("marks a streaming node and names its slot on the edge", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { loadTextFolder } from "${TEXT}";
        import { output } from "${OUTPUT}";

        const files = loadTextFolder({ folder: "/tmp/notes" });
        return workflow(
          output({ name: "path", value: files.output("path") }),
          output({ name: "text", value: files.output("text") })
        );
      `,
      [SPECIFIER, TEXT, OUTPUT]
    );
    const loader = graph.nodes.find(
      (node) => node.type === "nodetool.text.LoadTextFolder"
    );
    expect(loader?.is_streaming_output).toBe(true);
    expect(graph.edges.map((edge) => edge.sourceHandle).sort()).toEqual(["path", "text"]);
  });

  /**
   * `createNode` takes an `opts.id` and rejects a second node under it, but no
   * generated wrapper forwards a second argument — every one is
   * `function f(inputs)`. So a program cannot pin an id through the DSL, and
   * the duplicate-id guard is unreachable from a namespace import. The second
   * argument is accepted and dropped, which is the quiet half of the problem.
   */
  it("drops the id a program passes to a wrapper", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { output } from "${OUTPUT}";

        const prompt = stringInput({ name: "prompt", value: "x" }, { id: "the_prompt" });
        return workflow(output({ name: "out", value: prompt.output() }, { id: "the_out" }));
      `,
      [SPECIFIER, INPUT, OUTPUT]
    );
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["output", "string_input"]);
  });

  it("pins an id only through createNode, which then refuses a duplicate", async () => {
    const graph = await buildGraph(
      `
        import { createNode, workflow } from "${SPECIFIER}";
        const prompt = createNode(
          "nodetool.input.StringInput",
          { name: "prompt", value: "x" },
          { id: "the_prompt", outputNames: ["output"], defaultOutput: "output" }
        );
        return workflow(
          createNode(
            "nodetool.output.Output",
            { name: "out", value: prompt.output() },
            { id: "the_out", outputNames: ["output"], defaultOutput: "output" }
          )
        );
      `,
      [SPECIFIER]
    );
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["the_out", "the_prompt"]);
    expect(validateGraph(graph, liveRegistry()).issues.filter((i) => i.severity === "error")).toEqual(
      []
    );

    const clash = await runGuest(
      `
        import { createNode } from "${SPECIFIER}";
        createNode("nodetool.input.StringInput", { name: "a", value: "1" }, { id: "same" });
        return createNode("nodetool.input.StringInput", { name: "b", value: "2" }, { id: "same" });
      `,
      [SPECIFIER]
    );
    expect(clash.success).toBe(false);
    expect(clash.error).toMatch(/Duplicate node id "same"/);
  });

  it("starts a second workflow() from an empty registry", async () => {
    const run = await runGuest(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { output } from "${OUTPUT}";

        const build = (value) => {
          const prompt = stringInput({ name: "prompt", value });
          return workflow(output({ name: "out", value: prompt.output() }));
        };
        return [build("first"), build("second")];
      `,
      [SPECIFIER, INPUT, OUTPUT]
    );
    expect(run.error).toBeUndefined();
    const [first, second] = run.result as [Graph, Graph];
    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    expect(first.edges).toEqual(second.edges);
  });
});

describe("a handle", () => {
  it("refuses concatenation, and the message says what to do instead", async () => {
    const run = await runGuest(
      `
        import { stringInput } from "${INPUT}";
        const prompt = stringInput({ name: "prompt", value: "x" });
        return "prefix " + prompt.output();
      `,
      [SPECIFIER, INPUT]
    );
    expect(run.success).toBe(false);
    expect(run.error).toContain("string_input.output");
    expect(run.error).toContain("Pass it as the property value itself");
    // "Pass it as the property value" answers the one-handle case only. A
    // prompt built from several upstream values needs a node, and the message
    // has to name it — without that, a model rewrites the same template until
    // it gives up.
    expect(run.error).toContain("template({");
    expect(run.error).toContain("{{name}}");
  });

  it("refuses String() and template interpolation the same way", async () => {
    const run = await runGuest(
      `
        import { stringInput } from "${INPUT}";
        const prompt = stringInput({ name: "prompt", value: "x" });
        const errors = [];
        for (const convert of [
          () => String(prompt.output()),
          () => \`\${prompt.output()}\`,
          () => prompt.output() + ""
        ]) {
          try { convert(); errors.push(null); }
          catch (error) { errors.push(error.message); }
        }
        return errors;
      `,
      [SPECIFIER, INPUT]
    );
    expect(run.error).toBeUndefined();
    const errors = run.result as (string | null)[];
    expect(errors.filter((message) => message === null)).toEqual([]);
    expect(errors.every((message) => message?.includes("A handle wires an edge"))).toBe(true);
  });

  it("is recognizable, frozen, and carries the source it wires from", async () => {
    const run = await runGuest(
      `
        import { isOutputHandle } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        const prompt = stringInput({ name: "prompt", value: "x" });
        const handle = prompt.output();
        return {
          isHandle: isOutputHandle(handle),
          plainObject: isOutputHandle({ source: "string_input" }),
          nullish: isOutputHandle(null),
          source: handle.source,
          sourceHandle: handle.sourceHandle,
          frozen: Object.isFrozen(handle)
        };
      `,
      [SPECIFIER, INPUT]
    );
    expect(run.error).toBeUndefined();
    expect(run.result).toEqual({
      isHandle: true,
      plainObject: false,
      nullish: false,
      source: "string_input",
      sourceHandle: "output",
      frozen: true
    });
  });

  it("names the available slots when a program asks for one that does not exist", async () => {
    const run = await runGuest(
      `
        import { loadTextFolder } from "${TEXT}";
        return loadTextFolder({ folder: "/tmp" }).output("contents");
      `,
      [SPECIFIER, TEXT]
    );
    expect(run.success).toBe(false);
    expect(run.error).toContain("Unknown output slot 'contents'");
    expect(run.error).toContain("text, path, texts, paths");
  });

  it("refuses a bare output() on a node with several slots", async () => {
    const run = await runGuest(
      `
        import { loadTextFolder } from "${TEXT}";
        return loadTextFolder({ folder: "/tmp" }).output();
      `,
      [SPECIFIER, TEXT]
    );
    expect(run.success).toBe(false);
    expect(run.error).toMatch(/has several outputs; name one/);
  });
});

describe("the failure paths a program reaches by guessing", () => {
  it("refuses workflow() with no terminal", async () => {
    const run = await runGuest(
      `
        import { workflow } from "${SPECIFIER}";
        return workflow();
      `,
      [SPECIFIER]
    );
    expect(run.success).toBe(false);
    expect(run.error).toMatch(/workflow\(\) requires at least one terminal node/);
  });

  it("refuses a terminal that is not a node from this program", async () => {
    const run = await runGuest(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        const prompt = stringInput({ name: "prompt", value: "x" });
        return workflow(prompt.output());
      `,
      [SPECIFIER, INPUT]
    );
    expect(run.success).toBe(false);
    expect(run.error).toMatch(/not a node from this program/);
  });

  it("refuses a handle left over from an earlier workflow() call", async () => {
    const run = await runGuest(
      `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { output } from "${OUTPUT}";
        const prompt = stringInput({ name: "prompt", value: "x" });
        workflow(output({ name: "out", value: prompt.output() }));
        return workflow(prompt);
      `,
      [SPECIFIER, INPUT, OUTPUT]
    );
    expect(run.success).toBe(false);
    expect(run.error).toMatch(/already spent/);
  });

  it("refuses inputs that are not an object", async () => {
    const run = await runGuest(
      `
        import { stringInput } from "${INPUT}";
        const errors = [];
        for (const inputs of [null, "prompt", [1, 2]]) {
          try { stringInput(inputs); errors.push(null); }
          catch (error) { errors.push(error.message); }
        }
        return errors;
      `,
      [SPECIFIER, INPUT]
    );
    expect(run.error).toBeUndefined();
    expect(run.result).toEqual([
      "createNode(nodeType, inputs): inputs must be an object",
      "createNode(nodeType, inputs): inputs must be an object",
      "createNode(nodeType, inputs): inputs must be an object"
    ]);
  });

  it("builds a node whose required input is missing, and the validator catches it", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { textList } from "${SPECIFIER}/nodetool.constant";
        import { output } from "${OUTPUT}";

        const texts = textList({});
        return workflow(output({ name: "out", value: texts.output() }));
      `,
      [SPECIFIER, `${SPECIFIER}/nodetool.constant`, OUTPUT]
    );
    expect(
      graph.nodes.find((node) => node.type === "nodetool.constant.TextList")?.properties
    ).toEqual({});
    expect(
      validateGraph(graph, liveRegistry()).issues.filter(
        (issue) => issue.severity === "error"
      )
    ).toContainEqual(
      expect.objectContaining({
        code: "property",
        nodeId: "text_list",
        message: 'Required property "value" is not set'
      })
    );
  });

  /**
   * A misspelled input name is invisible to the guest: the wrapper takes any
   * object, and the types that would catch it are erased — which is exactly
   * where a model writes. So the graph builds, and the node would run on its
   * default with the author's value reaching nothing.
   *
   * `validateGraph` is what catches it, as a warning naming the property and
   * listing the ones the node really takes. That warning is the only thing
   * standing between a typo and a silently inert node.
   */
  it("builds a misspelled input into the graph, and the validator names it", async () => {
    const graph = await buildGraph(
      `
        import { workflow } from "${SPECIFIER}";
        import { collect } from "${TEXT}";
        import { output } from "${OUTPUT}";

        const tokens = collect({ input_itm: "a typo for input_item" });
        return workflow(output({ name: "out", value: tokens.output() }));
      `,
      [SPECIFIER, TEXT, OUTPUT]
    );
    expect(
      graph.nodes.find((node) => node.type === "nodetool.text.Collect")?.properties
    ).toEqual({ input_itm: "a typo for input_item" });

    const issues = validateGraph(graph, liveRegistry()).issues;
    const unknown = issues.filter((issue) => issue.code === "unknown_property");
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.severity).toBe("warning");
    expect(unknown[0]?.message).toContain('"input_itm"');
    // The message has to carry the fix, not just the complaint.
    expect(unknown[0]?.message).toContain("input_item");
    // A warning, so the graph is still accepted — a saved workflow carrying a
    // stale property from a node refactor must not stop running.
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("building the same program twice", () => {
  const program = `
    import { workflow } from "${SPECIFIER}";
    import { stringInput } from "${INPUT}";
    import { collect } from "${TEXT}";
    import { output } from "${OUTPUT}";

    const a = stringInput({ name: "a", value: "one" });
    const b = stringInput({ name: "b", value: "two" });
    const tokens = collect({ input_item: a.output() });
    return workflow(
      output({ name: "tokens", value: tokens.output() }),
      output({ name: "echo", value: b.output() })
    );
  `;
  const declared = [SPECIFIER, INPUT, TEXT, OUTPUT];

  it("yields byte-identical graph JSON, ids included", async () => {
    const first = await buildGraph(program, declared);
    const second = await buildGraph(program, declared);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    // Ids come from the node type, not from a counter over the whole program,
    // so a diff of two builds shows only what the author changed. The order is
    // the breadth-first walk back from the terminals.
    expect(first.nodes.map((node) => node.id)).toEqual([
      "output",
      "output_2",
      "collect",
      "string_input_2",
      "string_input"
    ]);
  });
});
