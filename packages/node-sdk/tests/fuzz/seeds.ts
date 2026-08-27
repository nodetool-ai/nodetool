/**
 * Seed documents for the crash fuzzer.
 *
 * Hand-written rather than read from `packages/base-nodes` examples: the
 * corpus is Stryker's test oracle, so it has to be hermetic and byte-stable —
 * a seed that changes when another package ships a workflow would move the
 * mutation score for reasons that have nothing to do with the validator.
 *
 * The first four graphs are well-formed workflows covering the shapes a
 * validator has to read: kernel-shape and ReactFlow-shape nodes, declared and
 * dynamic slots, a Code node body, a model reference, and a control edge. The
 * last two are deliberately broken, because a check only runs on a document
 * that trips it — a mutation of a valid graph reaches a handle or a model
 * reference by luck, and mostly does not.
 */

export interface SeedGraph {
  id: string;
  /**
   * False for a document whose defects are the point. `seedRegistry` learns
   * each type's handles from the seeds that use them, so a graph carrying an
   * unknown handle would otherwise teach the registry that handle and validate
   * clean. Node types are still registered either way — an unregistered type
   * stops the validator at `unknown_node` before it reads a single handle.
   */
  teachesHandles?: boolean;
  graph: { nodes: unknown[]; edges: unknown[] };
}

/**
 * Seed node types `seedRegistry` deliberately leaves out, so `unknown_node` is
 * reachable. Every other type a seed names is registered.
 */
export const UNREGISTERED_NODE_TYPES: ReadonlySet<string> = new Set([
  "fuzz.seed.NotInRegistry"
]);

export const SEED_GRAPHS: readonly SeedGraph[] = [
  {
    id: "linear-chain",
    graph: {
      nodes: [
        {
          id: "in",
          type: "nodetool.input.StringInput",
          properties: { name: "prompt", value: "hello" }
        },
        {
          id: "up",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "!" }
        },
        { id: "out", type: "nodetool.output.StringOutput", properties: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "in",
          sourceHandle: "output",
          target: "up",
          targetHandle: "a"
        },
        {
          id: "e2",
          source: "up",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    }
  },
  {
    id: "reactflow-shape",
    graph: {
      nodes: [
        {
          id: "a",
          type: "nodetool.input.StringInput",
          data: { name: "topic", value: "fuzzing" }
        },
        {
          id: "b",
          type: "nodetool.text.Template",
          data: { template: "about {{ topic }}" },
          dynamic_inputs: { topic: { type: { type: "str" } } },
          dynamic_properties: { topic: "" }
        },
        { id: "c", type: "nodetool.output.StringOutput", data: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "output",
          target: "b",
          targetHandle: "topic"
        },
        {
          id: "e2",
          source: "b",
          sourceHandle: "output",
          target: "c",
          targetHandle: "value",
          edge_type: "control"
        }
      ]
    }
  },
  {
    id: "code-node",
    graph: {
      nodes: [
        {
          id: "src",
          type: "nodetool.input.StringInput",
          properties: { name: "text", value: "one two" }
        },
        {
          id: "code",
          type: "nodetool.code.Code",
          properties: {
            code: "const words = inputs.text.split(' ');\nawait output('count', words.length);",
            packages: [],
            // A credential the oracle's `availableSecrets` does not hold, and a
            // pinned script link its `jsScriptLookup` resolves — the two
            // sources of `missing_secret` and the whole linked-script branch.
            secrets: ["FUZZ_CODE_KEY"],
            script: { id: "fuzz-script", version: 2 }
          },
          dynamic_inputs: { text: { type: { type: "str" } } },
          dynamic_outputs: { count: { type: "int" } }
        },
        { id: "sink", type: "nodetool.output.IntegerOutput", properties: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "src",
          sourceHandle: "output",
          target: "code",
          targetHandle: "text"
        },
        {
          id: "e2",
          source: "code",
          sourceHandle: "count",
          target: "sink",
          targetHandle: "value"
        }
      ]
    }
  },
  {
    id: "model-reference",
    graph: {
      nodes: [
        {
          id: "prompt",
          type: "nodetool.input.StringInput",
          properties: { name: "q", value: "why" }
        },
        {
          id: "llm",
          type: "nodetool.agents.Agent",
          properties: {
            model: { type: "language_model", provider: "openai", id: "gpt-5" },
            prompt: ""
          }
        },
        { id: "answer", type: "nodetool.output.StringOutput", properties: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "prompt",
          sourceHandle: "output",
          target: "llm",
          targetHandle: "prompt"
        },
        {
          id: "e2",
          source: "llm",
          sourceHandle: "output",
          target: "answer",
          targetHandle: "value"
        }
      ]
    }
  },
  {
    // Every edge-level defect the validator reports, in one document: the four
    // well-formed graphs above only reach these branches when a mutation
    // happens to land on a handle, which at any given seed it mostly does not.
    id: "edge-defects",
    teachesHandles: false,
    graph: {
      nodes: [
        { id: "es1", type: "fuzz.seed.Source", properties: { seed: "one" } },
        { id: "es2", type: "fuzz.seed.Source", properties: { seed: "two" } },
        {
          id: "strict",
          type: "fuzz.seed.Strict",
          properties: {
            text: "",
            // A DSL wiring handle that outlived its edge.
            wired: { __handle: true, source: "es1", sourceHandle: "output" }
          }
        },
        {
          id: "loose",
          type: "fuzz.seed.Loose",
          properties: { label: "hi" },
          dynamic_inputs: {
            // A JSON-Schema spelling of `int`: passes the transport schema,
            // then refuses to connect.
            alias: { type: { type: "integer" } },
            count: { type: { type: "int" } },
            size: { type: { type: "int" } },
            need: { type: { type: "str" }, required: true }
          },
          dynamic_properties: { alias: 1, size: "seven" },
          dynamic_outputs: { flagged: { type: "boolean" } }
        },
        { id: "ghost", type: "fuzz.seed.NotInRegistry", properties: {} },
        {
          // A link no lookup can answer for — the other arm of the check the
          // `code-node` seed's resolvable link covers.
          id: "unlinked",
          type: "nodetool.code.Code",
          properties: {
            code: "await output('n', 1);",
            script: { id: "gone", version: 1 }
          },
          dynamic_outputs: { n: { type: "int" } }
        }
      ],
      edges: [
        {
          id: "ee1",
          source: "es1",
          sourceHandle: "output",
          target: "strict",
          targetHandle: "text"
        },
        {
          id: "ee2",
          source: "es2",
          sourceHandle: "output",
          target: "strict",
          targetHandle: "text"
        },
        {
          id: "ee3",
          source: "es1",
          sourceHandle: "output",
          target: "strict",
          targetHandle: "absent"
        },
        {
          id: "ee4",
          source: "es1",
          sourceHandle: "absent",
          target: "strict",
          targetHandle: "text"
        },
        {
          id: "ee5",
          source: "es2",
          sourceHandle: "output",
          target: "loose",
          targetHandle: "untyped"
        },
        {
          id: "ee6",
          source: "es2",
          sourceHandle: "output",
          target: "strict",
          targetHandle: ""
        },
        {
          id: "ee7",
          source: "es1",
          sourceHandle: "",
          target: "strict",
          targetHandle: "text"
        },
        {
          id: "ee8",
          source: "es1",
          sourceHandle: "output",
          target: "loose",
          targetHandle: "count"
        }
      ]
    }
  },
  {
    // Property *values*: the model-reference and asset shapes
    // `validateNodeProperties` branches on, and the three ways a model
    // selection can name something the runtime cannot route to.
    id: "property-shapes",
    teachesHandles: false,
    graph: {
      nodes: [
        {
          id: "mp1",
          type: "fuzz.seed.Model",
          properties: {
            model: {
              type: "language_model",
              provider: "nope-provider",
              id: "gpt-5"
            },
            prompt: ""
          }
        },
        {
          id: "mp2",
          type: "fuzz.seed.Model",
          properties: {
            model: { type: "language_model", id: "gpt-5" },
            prompt: "ask"
          }
        },
        {
          id: "mp3",
          type: "fuzz.seed.Model",
          properties: {
            model: {
              type: "language_model",
              provider: "openai",
              id: "gpt-4o-mini"
            },
            prompt: ""
          }
        },
        {
          id: "mp4",
          type: "fuzz.seed.Model",
          properties: {
            model: { type: "language_model", provider: "empty", id: "gpt-5" },
            prompt: "ask"
          }
        },
        {
          id: "mp5",
          type: "fuzz.seed.Model",
          properties: {
            model: { type: "language_model", provider: "openai", id: "" },
            prompt: "ask"
          }
        },
        {
          id: "mp6",
          type: "fuzz.seed.Model",
          properties: {
            model: {
              type: "language_model",
              provider: "anthropic",
              id: "claude-x"
            },
            // Nested in a list: it configures something other than this node's
            // own inputs, so its requirements say nothing about them.
            fallbacks: [
              { type: "language_model", provider: "openai", id: "gpt-5" }
            ],
            prompt: ""
          }
        },
        {
          id: "as1",
          type: "fuzz.seed.Asset",
          properties: {
            image: { type: "image", uri: "", asset_id: null, data: null }
          }
        },
        {
          id: "as2",
          type: "fuzz.seed.Asset",
          properties: { image: { type: "image", uri: "asset://one" } }
        },
        {
          id: "as3",
          type: "fuzz.seed.Asset",
          properties: { image: { type: "image", asset_id: "a1" } }
        },
        {
          id: "as4",
          type: "fuzz.seed.Asset",
          properties: { image: { type: "image", temp_id: "t1" } }
        },
        {
          id: "as5",
          type: "fuzz.seed.Asset",
          properties: { image: { type: "image", data: "" } }
        },
        {
          id: "as6",
          type: "fuzz.seed.Asset",
          properties: { image: { type: "image", data: [] } }
        },
        {
          id: "as7",
          type: "fuzz.seed.Asset",
          properties: { image: { type: "image", data: [1, 2] } }
        },
        {
          id: "as8",
          type: "fuzz.seed.Asset",
          properties: { image: "not-an-object" }
        },
        { id: "as9", type: "fuzz.seed.Asset", properties: { image: null } },
        { id: "as10", type: "fuzz.seed.Asset", properties: {} }
      ],
      edges: []
    }
  }
];

/** Bodies the Code-node analyzer is expected to handle without throwing. */
export const SEED_CODE_BODIES: readonly { id: string; code: string }[] = [
  { id: "emit", code: "await output('n', inputs.a + 1);" },
  {
    id: "stream",
    code: "for await (const item of stream('items')) {\n  await emit('out', item);\n}"
  },
  {
    id: "import",
    code: "import { parse } from '@nodetool-ai/sandbox-yaml';\nawait output('doc', parse(inputs.text));"
  },
  {
    id: "branching",
    code: "if (inputs.flag) {\n  return { a: 1 };\n}\nreturn { a: 2 };"
  },
  { id: "empty-ish", code: "// nothing to see\n" },

  // ── The streaming-input contract ─────────────────────────────────────────
  // The `stream` seed above is the one well-formed streaming body. These four
  // are each of the ways one can be wrong, which is where the checks live.
  {
    id: "stream-unknown",
    code:
      "for await (const item of stream('missing')) {\n" +
      "  await emit('out', item);\n" +
      "}\n" +
      "await output('n', inputs.items.length);"
  },
  {
    id: "stream-unconnected",
    code:
      "const head = await stream.first('text');\n" +
      "for await (const item of stream.any()) {\n" +
      "  await emit('out', item);\n" +
      "}\n" +
      "await output('n', head);"
  },
  {
    id: "stream-computed",
    code:
      "const handle = inputs.a;\n" +
      "for await (const item of stream(handle)) {\n" +
      "  await output('n', item);\n" +
      "}"
  },
  {
    id: "stream-no-emit",
    code:
      "const rows = [];\n" +
      "for await (const row of stream('items')) {\n" +
      "  rows.push(row);\n" +
      "}\n" +
      "return { n: rows.length };"
  },

  // ── Module declarations ──────────────────────────────────────────────────
  // All four `code_module` shapes at once: a top-level export, a Node builtin,
  // a private host bridge, and both dynamic resolutions.
  {
    id: "module-defects",
    code:
      "import fs from 'fs';\n" +
      "import bridge from 'nodetool:host';\n" +
      "export const shared = 1;\n" +
      "const lazy = await import('./other.js');\n" +
      "const legacy = require('util');\n" +
      "await output('n', fs && bridge && lazy && legacy ? 1 : 0);"
  },

  // ── Return shapes the legacy contract branches on ────────────────────────
  {
    id: "return-shapes",
    code:
      "if (inputs.flag) {\n" +
      "  return 42;\n" +
      "}\n" +
      "switch (inputs.a) {\n" +
      "  case 1:\n" +
      "    break;\n" +
      "  default:\n" +
      "    return { n: 1, extra: 2 };\n" +
      "}\n" +
      "try {\n" +
      "  return { ...inputs, n: 3 };\n" +
      "} catch (err) {\n" +
      "  return [err];\n" +
      "} finally {\n" +
      "  console.log('done');\n" +
      "}"
  },
  {
    id: "return-ternary",
    code:
      "const key = 'n';\n" +
      "return inputs.flag ? { [key]: 1 } : { n: 2, doc: inputs.text };"
  },

  // ── The emit contract's own edge cases ───────────────────────────────────
  {
    id: "emit-extras",
    code:
      "const handle = 'out';\n" +
      "await output(handle, 1);\n" +
      "await emit('not-a-handle', 2);\n" +
      "return { ignored: true };"
  },

  // Names other runtimes have and this sandbox does not, one of them behind
  // the `typeof` guard that makes reading it legal.
  {
    id: "absent-globals",
    code:
      "if (typeof structuredClone === 'undefined') {\n" +
      "  await output('n', btoa(inputs.text));\n" +
      "} else {\n" +
      "  await output('n', inputs.a);\n" +
      "}"
  }
];
