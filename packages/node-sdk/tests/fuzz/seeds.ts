/**
 * Seed documents for the crash fuzzer.
 *
 * Hand-written rather than read from `packages/base-nodes` examples: the
 * corpus is Stryker's test oracle, so it has to be hermetic and byte-stable —
 * a seed that changes when another package ships a workflow would move the
 * mutation score for reasons that have nothing to do with the validator.
 *
 * Between them the graphs reach every branch class the validator has:
 * kernel-shape and ReactFlow-shape nodes, declared and dynamic slots, a Code
 * node body, a model reference, and a control edge.
 */

export interface SeedGraph {
  id: string;
  graph: { nodes: unknown[]; edges: unknown[] };
}

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
            packages: []
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
    id: "cycle-faults",
    graph: {
      nodes: [
        {
          id: "c1",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "c2",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "c3",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "tail",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "d1",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "d2",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "d3",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "d4",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "self",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "ctl1",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "ctl2",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        },
        {
          id: "loop",
          type: "nodetool.control.Loop",
          properties: { a: "", b: "" }
        },
        {
          id: "body",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "" }
        }
      ],
      edges: [
        {
          id: "c-12",
          source: "c1",
          sourceHandle: "output",
          target: "c2",
          targetHandle: "a"
        },
        {
          id: "c-23",
          source: "c2",
          sourceHandle: "output",
          target: "c3",
          targetHandle: "a"
        },
        {
          id: "c-31",
          source: "c3",
          sourceHandle: "output",
          target: "c1",
          targetHandle: "a"
        },
        {
          id: "c-3t",
          source: "c3",
          sourceHandle: "output",
          target: "tail",
          targetHandle: "a"
        },
        {
          id: "d-12",
          source: "d1",
          sourceHandle: "output",
          target: "d2",
          targetHandle: "a"
        },
        {
          id: "d-13",
          source: "d1",
          sourceHandle: "output",
          target: "d3",
          targetHandle: "a"
        },
        {
          id: "d-24",
          source: "d2",
          sourceHandle: "output",
          target: "d4",
          targetHandle: "a"
        },
        {
          id: "d-34",
          source: "d3",
          sourceHandle: "output",
          target: "d4",
          targetHandle: "b"
        },
        {
          id: "self-1",
          source: "self",
          sourceHandle: "output",
          target: "self",
          targetHandle: "a"
        },
        {
          id: "self-2",
          source: "self",
          sourceHandle: "output",
          target: "self",
          targetHandle: "b"
        },
        {
          id: "ghost-self",
          source: "nowhere",
          sourceHandle: "output",
          target: "nowhere",
          targetHandle: "a"
        },
        {
          id: "ghost-edge",
          source: "c1",
          sourceHandle: "output",
          target: "nowhere",
          targetHandle: "a"
        },
        {
          id: "ctl-12",
          source: "ctl1",
          sourceHandle: "output",
          target: "ctl2",
          targetHandle: "a",
          edge_type: "control"
        },
        {
          id: "ctl-21",
          source: "ctl2",
          sourceHandle: "output",
          target: "ctl1",
          targetHandle: "a"
        },
        {
          id: "loop-body",
          source: "loop",
          sourceHandle: "output",
          target: "body",
          targetHandle: "a"
        },
        {
          id: "loop-back",
          source: "body",
          sourceHandle: "output",
          target: "loop",
          targetHandle: "next"
        },
        {
          id: "loop-cond",
          source: "body",
          sourceHandle: "output",
          target: "loop",
          targetHandle: "condition"
        }
      ]
    }
  },
  {
    id: "wiring-faults",
    graph: {
      nodes: [
        {
          id: "src",
          type: "nodetool.input.StringInput",
          properties: { name: "s", value: "x" }
        },
        {
          id: "src2",
          type: "nodetool.input.StringInput",
          properties: { name: "s2", value: "y" }
        },
        {
          id: "sum",
          type: "nodetool.text.Concat",
          properties: { a: "", b: "", n: 1 },
          dynamic_inputs: { extra: { type: { type: "string" } } },
          dynamic_properties: { extra: 5 }
        },
        {
          id: "mix",
          type: "nodetool.text.Template",
          data: { template: "{{ q }}" },
          dynamic_inputs: { q: { type: { type: "int" } } },
          dynamic_properties: { q: "not a number" }
        },
        {
          id: "ghost",
          type: "nodetool.does.NotExist",
          properties: {}
        },
        { id: "sink", type: "nodetool.output.StringOutput", properties: {} },
        { type: "nodetool.output.StringOutput", properties: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "src",
          sourceHandle: "output",
          target: "sum",
          targetHandle: "n"
        },
        {
          id: "e2",
          source: "src",
          sourceHandle: "output",
          target: "sink",
          targetHandle: "value"
        },
        {
          id: "e3",
          source: "src2",
          sourceHandle: "output",
          target: "sink",
          targetHandle: "value"
        },
        {
          id: "e4",
          source: "sum",
          sourceHandle: "output",
          target: "sum",
          targetHandle: "a"
        },
        {
          id: "e5",
          source: "src",
          sourceHandle: "output",
          target: "sum",
          targetHandle: "extra"
        },
        {
          id: "e6",
          source: "src",
          sourceHandle: "output",
          target: "mix",
          targetHandle: "undeclared_slot"
        },
        {
          id: "e7",
          source: "src",
          sourceHandle: "missing_out",
          target: "sink"
        },
        { id: "e8", source: "src", target: "sink", targetHandle: "value" },
        {
          id: "e9",
          source: "src",
          sourceHandle: "output",
          target: "nowhere",
          targetHandle: "value"
        }
      ]
    }
  },
  {
    id: "asset-values",
    graph: {
      nodes: [
        {
          id: "asset-null",
          type: "nodetool.image.Crop",
          properties: { image: null }
        },
        {
          id: "asset-empty-object",
          type: "nodetool.image.Crop",
          properties: { image: {} }
        },
        {
          id: "asset-blank-fields",
          type: "nodetool.image.Crop",
          properties: {
            image: { uri: "", asset_id: "", temp_id: "", data: "" }
          }
        },
        {
          id: "asset-empty-data-array",
          type: "nodetool.image.Crop",
          properties: { image: { data: [] } }
        },
        {
          id: "asset-null-data",
          type: "nodetool.image.Crop",
          properties: { image: { data: null } }
        },
        {
          id: "asset-uri",
          type: "nodetool.image.Crop",
          properties: { image: { uri: "file:///a.png" } }
        },
        {
          id: "asset-asset-id",
          type: "nodetool.image.Crop",
          properties: { image: { asset_id: "abc" } }
        },
        {
          id: "asset-temp-id",
          type: "nodetool.image.Crop",
          properties: { image: { temp_id: "tmp" } }
        },
        {
          id: "asset-string-data",
          type: "nodetool.image.Crop",
          properties: { image: { data: "AAAA" } }
        },
        {
          id: "asset-array-data",
          type: "nodetool.image.Crop",
          properties: { image: { data: [1, 2] } }
        },
        {
          id: "asset-bare-string",
          type: "nodetool.image.Crop",
          properties: { image: "file:///a.png" }
        },
        {
          id: "asset-number",
          type: "nodetool.image.Crop",
          properties: { image: 7 }
        },
        {
          id: "asset-array",
          type: "nodetool.image.Crop",
          properties: { image: [] }
        }
      ],
      edges: []
    }
  },
  {
    id: "model-faults",
    graph: {
      nodes: [
        {
          id: "no-provider",
          type: "nodetool.agents.Agent",
          properties: { model: { type: "language_model", id: "gpt-5" } }
        },
        {
          id: "bad-provider",
          type: "nodetool.agents.Agent",
          properties: {
            model: { type: "language_model", provider: "nope", id: "x" }
          }
        },
        {
          id: "bad-model",
          type: "nodetool.agents.Agent",
          properties: {
            model: { type: "language_model", provider: "openai", id: "gpt-nop" }
          }
        },
        {
          id: "unset",
          type: "nodetool.agents.Agent",
          properties: {
            model: { type: "language_model", provider: "", id: "" }
          }
        }
      ],
      edges: []
    }
  }
];

/**
 * One Code-node body and the node around it. Every field but `id` and `code`
 * defaults to the shape the mutants run under: inputs `a`, `text`, `flag`,
 * `items` with `items` wired, outputs `n`, `out`, `doc`, and no catalog.
 */
export interface CodeSeed {
  id: string;
  code: string;
  availableInputs?: readonly string[];
  connectedInputs?: readonly string[];
  declaredOutputs?: readonly string[];
  connectedOutputs?: readonly string[];
  /** Resolve imports against the stub catalog from `seedCatalog()`. */
  catalog?: boolean;
}

/** Bodies the Code-node analyzer is expected to handle without throwing. */
export const SEED_CODE_BODIES: readonly CodeSeed[] = [
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
  {
    id: "wrapper-escape-call",
    code: "}).call();\nawait output('n', 1);\n(async function(){"
  },
  {
    id: "wrapper-escape",
    code: "});\nawait output('n', 1);\n(async function(){"
  },
  {
    id: "function-only-syntax",
    code: "const total = (new.target ?? 0) + inputs.a;\nreturn { n: total, out: 2, doc: 3 };"
  },
  {
    id: "export-module",
    code: "export const x = 1;\nreturn { n: 1, out: 2, doc: 3 };"
  },
  {
    id: "node-builtin",
    code: "import fs from 'fs';\nimport { join } from 'node:path';\nreturn { n: 1, out: 2, doc: 3 };"
  },
  {
    id: "private-bridge",
    code: "import bridge from 'nodetool:media';\nreturn { n: bridge, out: 2, doc: 3 };"
  },
  {
    id: "dynamic-module",
    code: "const m = await import('left-pad');\nconst r = require('fs');\nreturn { n: m, out: r, doc: 3 };"
  },
  {
    id: "return-shapes",
    code: "if (inputs.flag) {\n  return 5;\n}\nif (inputs.a) {\n  return { n: 1, extra: 2 };\n}\nreturn { n: 1, out: 2, doc: 3 };"
  },
  {
    id: "fall-through",
    code: "if (inputs.flag) {\n  return { n: 1, out: 2, doc: 3 };\n}"
  },
  {
    id: "undefined-names",
    code: "const total = missingHelper(inputs.nope) + inputs.a;\nreturn { n: total, out: ghost, doc: inputs.text };"
  },
  {
    id: "opaque-inputs",
    code: "const key = inputs.a;\nreturn { n: inputs[key], out: { ...inputs }, doc: 1 };"
  },
  {
    id: "emit-dynamic-name",
    code: "await output(inputs.a, 1);\nawait emit(`dyn${inputs.text}`, 2);"
  },
  {
    id: "emit-undeclared-return",
    code: "await output('n', 1);\nawait output('zzz', 2);\nif (inputs.flag) return 5;\nreturn undefined;"
  },
  {
    id: "stream-unknown",
    code: "for await (const x of stream('nope', 'other')) {\n  await emit('out', x);\n}"
  },
  {
    id: "stream-dynamic-name",
    code: "for await (const x of stream(inputs.a)) {\n  await emit('out', x);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-unconnected",
    code: "for await (const x of stream('a', 'text')) {\n  await emit('out', x);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-input-read",
    code: "for await (const x of stream('items')) {\n  await emit('out', x + inputs.items);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-any",
    code: "for await (const x of stream.any()) {\n  await emit('out', x);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-return-contract",
    code: "for await (const x of stream('items')) {\n  total += x;\n}\nreturn { n: 1, out: 2, doc: 3 };"
  },
  { id: "empty-outputs", code: "  \n\t" },
  { id: "empty-one-output", code: "", declaredOutputs: ["n"] },
  {
    id: "empty-one-connected",
    code: "",
    declaredOutputs: [],
    connectedOutputs: ["x"]
  },
  {
    id: "empty-two-connected",
    code: "",
    declaredOutputs: [],
    connectedOutputs: ["x", "y"]
  },
  {
    id: "catalog-imports",
    catalog: true,
    code: [
      "import a from '@nodetool-ai/sandbox-nodetool';",
      "import b from '@nodetool-ai/sandbox-nodetool/media';",
      "import c from '@nodetool-ai/sandbox-nodetoolx';",
      "import d from 'left-pad';",
      "import d2 from 'left-pad';",
      "import e from 'fs/promises';",
      "import f from 'node:nope';",
      "import g from 'fsx';",
      "import h from 'nodetool:media';",
      "import i from '@nodetool-ai/sandbox-csv';",
      "import j from '@nodetool-ai/sandbox-dates';",
      "import k from 'ready-pack';",
      "import l from 'skipped-pack';",
      "return { n: a, out: b, doc: c };"
    ].join("\n")
  },
  {
    id: "catalog-one-import",
    catalog: true,
    code: "import d from 'left-pad';\nreturn { n: d, out: 2, doc: 3 };"
  },
  {
    id: "catalog-no-pack-import",
    catalog: true,
    code: "import a from '@nodetool-ai/sandbox-nodetool';\nreturn { n: a, out: 2, doc: 3 };"
  },
  {
    id: "dynamic-import-only",
    code: "const m = await import('x');\nreturn { n: m, out: 2, doc: 3 };"
  },
  {
    id: "dynamic-require-only",
    code: "const r = require('x');\nreturn { n: r, out: 2, doc: 3 };"
  },
  {
    id: "require-not-called",
    code: "const r = require;\nreturn { n: r, out: 2, doc: 3 };"
  },
  { id: "absent-one", code: "return { n: btoa('x'), out: 1, doc: 2 };" },
  {
    id: "absent-many",
    code: "return { n: btoa('x'), out: atob('y'), doc: structuredClone(1) };"
  },
  { id: "bare-input-one", code: "return { n: a, out: 1, doc: 2 };" },
  { id: "bare-input-many", code: "return { n: a + text, out: 1, doc: 2 };" },
  {
    id: "bare-and-unknown",
    code: "return { n: a + text + ghost, out: 1, doc: 2 };"
  },
  {
    id: "unknown-inputs-many",
    code: "return { n: inputs.p + inputs.q + inputs.a, out: inputs.text, doc: inputs.flag };"
  },
  {
    id: "stream-unknown-one",
    code: "for await (const x of stream('nope')) {\n  await emit('out', x);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-unconnected-one",
    code: "for await (const x of stream('a')) {\n  await emit('out', x);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-input-read-many",
    connectedInputs: ["items", "text"],
    code: "for await (const x of stream('items')) {\n  await emit('out', x + inputs.items + inputs.text);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-any-connected",
    connectedInputs: ["items", "text"],
    code: "for await (const x of stream.any()) {\n  await emit('out', x);\n}\nawait output('n', 1);\nawait output('doc', 2);"
  },
  {
    id: "stream-return-no-emit-one-input",
    availableInputs: ["items"],
    code: "for await (const x of stream('items')) {\n  total += x;\n}"
  },
  { id: "no-return-outputs", code: "const x = 1;" },
  { id: "no-return-one-output", declaredOutputs: ["n"], code: "const x = 1;" },
  {
    id: "no-return-connected",
    declaredOutputs: [],
    connectedOutputs: ["x", "y"],
    code: "const x = 1;"
  },
  {
    id: "no-return-no-outputs",
    declaredOutputs: [],
    code: "const x = 1;"
  },
  {
    id: "fall-through-one-output",
    declaredOutputs: ["n"],
    code: "if (inputs.flag) {\n  return { n: 1 };\n}"
  },
  {
    id: "fall-through-no-outputs",
    declaredOutputs: [],
    code: "if (inputs.flag) {\n  return { n: 1 };\n}"
  },
  {
    id: "non-object-one-output",
    declaredOutputs: ["n"],
    code: "if (inputs.flag) {\n  return 5;\n}\nreturn { n: 1 };"
  },
  {
    id: "non-object-no-outputs",
    declaredOutputs: [],
    code: "if (inputs.flag) {\n  return 5;\n}\nreturn { n: 1 };"
  },
  {
    id: "non-object-twice",
    code: "if (inputs.flag) {\n  return 5;\n}\nif (inputs.a) {\n  return 6;\n}\nreturn { n: 1, out: 2, doc: 3 };"
  },
  {
    id: "missing-one-undeclared-one",
    declaredOutputs: ["n", "out"],
    code: "return { n: 1, extra: 2 };"
  },
  {
    id: "missing-many-undeclared-many",
    code: "return { zzz: 1, yyy: 2 };"
  },
  {
    id: "opaque-return",
    code: "const o = inputs.a;\nreturn { ...o };"
  },
  {
    id: "return-connected-only",
    declaredOutputs: [],
    connectedOutputs: ["x"],
    code: "return { x: 1, y: 2 };"
  },
  {
    id: "emit-undeclared-many",
    code: "await output('n', 1);\nawait output('out', 1);\nawait output('doc', 1);\nawait output('p', 2);\nawait output('q', 2);"
  },
  {
    id: "emit-missing-one",
    declaredOutputs: ["n", "out"],
    code: "await output('n', 1);"
  },
  {
    id: "emit-connected-only",
    declaredOutputs: [],
    connectedOutputs: ["x", "y"],
    code: "await output('x', 1);\nawait output('z', 2);"
  },
  {
    id: "emit-return-ignored",
    code: "await output('n', 1);\nawait output('out', 1);\nawait output('doc', 1);\nreturn 5;"
  },
  {
    id: "emit-bare-return",
    code: "await output('n', 1);\nawait output('out', 1);\nawait output('doc', 1);\nreturn;"
  },
  {
    id: "emit-undefined-return",
    code: "await output('n', 1);\nawait output('out', 1);\nawait output('doc', 1);\nreturn undefined;"
  },
  {
    id: "unused-one-input",
    code: "await output('n', inputs.a + inputs.text + inputs.flag);\nawait output('out', 1);\nawait output('doc', 1);"
  },
  {
    id: "unused-all-inputs-read",
    code: "await output('n', inputs.a + inputs.text + inputs.flag + inputs.items);\nawait output('out', 1);\nawait output('doc', 1);"
  },
  {
    id: "empty-no-outputs",
    code: "",
    declaredOutputs: [],
    connectedOutputs: []
  },
  { id: "syntax-error-with-line", code: "const x = 1;\nconst = ;" },
  { id: "syntax-error-no-line", code: "}) ; (async function(){" },
  {
    id: "single-node-builtin",
    code: "import fs from 'fs';\nreturn { n: fs, out: 2, doc: 3 };"
  },
  {
    id: "emit-one-declared-with-connected",
    declaredOutputs: ["n"],
    connectedOutputs: ["x"],
    code: "await output('x', 1);"
  },
  {
    id: "emit-return-identifier",
    code: "await output('n', 1);\nawait output('out', 1);\nawait output('doc', 1);\nreturn inputs;"
  }
];

/** A Code step as the workflow planner writes it: the body and the handles it is wired to. */
export interface PlannedStepSeed {
  id: string;
  code: string;
  inputs: readonly string[];
  output: string;
}

/** Bodies `plannedCodeStepProblems` has to judge, one planner mistake each. */
export const SEED_PLANNED_STEPS: readonly PlannedStepSeed[] = [
  {
    id: "planned-clean",
    inputs: ["text"],
    output: "n",
    code: "await output('n', inputs.text);"
  },
  {
    id: "planned-syntax-error",
    inputs: ["text"],
    output: "n",
    code: "const = ;"
  },
  {
    id: "planned-output-in-for",
    inputs: ["items"],
    output: "n",
    code: "for (const x of inputs.items) {\n  await output('n', x);\n}"
  },
  {
    id: "planned-output-in-callback",
    inputs: ["items"],
    output: "n",
    code: "inputs.items.forEach(async (x) => {\n  await output('n', x);\n});"
  },
  {
    id: "planned-output-in-function-expression",
    inputs: ["items"],
    output: "n",
    code: "inputs.items.map(function (x) {\n  return output('n', x);\n});"
  },
  {
    id: "planned-output-after-callback",
    inputs: ["items"],
    output: "n",
    code: "const k = inputs.items.map((x) => x);\nawait output('n', k);"
  },
  {
    id: "planned-callee-not-output",
    inputs: ["items"],
    output: "n",
    code: "for (const x of inputs.items) {\n  await emit('n', x);\n}\nawait output('n', 1);"
  },
  {
    id: "planned-member-callee",
    inputs: ["items"],
    output: "n",
    code: "for (const x of inputs.items) {\n  api.output('n', x);\n}\nawait output('n', 1);"
  },
  {
    id: "planned-unwired-one-none",
    inputs: [],
    output: "n",
    code: "await output('n', inputs.ghost);"
  },
  {
    id: "planned-unwired-one-wired",
    inputs: ["text"],
    output: "n",
    code: "await output('n', inputs.text + inputs.ghost);"
  },
  {
    id: "planned-unwired-many-wired-many",
    inputs: ["text", "flag"],
    output: "n",
    code: "await output('n', inputs.text + inputs.flag + inputs.p + inputs.q);"
  },
  {
    id: "planned-own-property-read",
    inputs: ["text"],
    output: "n",
    code: "await output('n', inputs.text + inputs.code);"
  },
  {
    id: "planned-unread-one",
    inputs: ["text", "flag"],
    output: "n",
    code: "await output('n', inputs.text);"
  },
  {
    id: "planned-unread-many",
    inputs: ["text", "flag", "items"],
    output: "n",
    code: "await output('n', 1);"
  },
  {
    id: "planned-opaque-inputs",
    inputs: ["text", "flag"],
    output: "n",
    code: "const k = 'text';\nawait output('n', inputs[k]);"
  },
  {
    id: "planned-whole-inputs",
    inputs: ["text", "flag"],
    output: "n",
    code: "await output('n', { ...inputs });"
  },
  {
    id: "planned-stream-reads",
    inputs: ["items"],
    output: "n",
    code: "for await (const x of stream('items')) {\n  total += x;\n}\nawait output('n', 1);"
  },
  {
    id: "planned-stream-dynamic",
    inputs: ["items", "text"],
    output: "n",
    code: "for await (const x of stream(inputs.k)) {\n  total += x;\n}\nawait output('n', 1);"
  },
  {
    id: "planned-stream-any",
    inputs: ["items", "text"],
    output: "n",
    code: "for await (const x of stream.any()) {\n  total += x;\n}\nawait output('n', 1);"
  },
  {
    id: "planned-unawaited-global",
    inputs: ["text"],
    output: "n",
    code: "const k = getSecret('K');\nconst r = fetch(inputs.text);\nconst s = sleep(5);\nawait output('n', 1);"
  },
  {
    id: "planned-unawaited-member",
    inputs: ["text"],
    output: "n",
    code: "const f = workspace.read(inputs.text);\nconst m = media.fetch(inputs.text);\nawait output('n', 1);"
  },
  {
    id: "planned-unawaited-unknown-object",
    inputs: ["text"],
    output: "n",
    code: "const f = other.read(inputs.text);\nconst g = workspace[inputs.text]();\nconst h = unknownFn(inputs.text);\nconst i = 5;\nconst j = await fetch(inputs.text);\nawait output('n', 1);"
  },
  {
    id: "planned-model-host",
    inputs: ["text"],
    output: "n",
    code: "const r = await fetch('https://api.openai.com/v1/chat');\nawait output('n', inputs.text);"
  },
  {
    id: "planned-model-host-last",
    inputs: ["text"],
    output: "n",
    code: "const r = await fetch('https://api.deepseek.com/x');\nawait output('n', inputs.text);"
  },
  {
    id: "planned-no-output",
    inputs: ["text"],
    output: "n",
    code: "const k = inputs.text;"
  },
  {
    id: "planned-wrong-output",
    inputs: ["text"],
    output: "n",
    code: "await output('a', inputs.text);\nawait output('b', 1);"
  }
];

/** Pre-`inputs` bodies that read an input as a global of its own name. */
export const SEED_MIGRATION_BODIES: readonly { id: string; code: string }[] = [
  {
    id: "migrate-global-read",
    code: "return { n: a + text, out: flag, doc: items };"
  },
  { id: "migrate-shorthand", code: "return { a, text };" },
  {
    id: "migrate-string-and-comment",
    code: "// a text\nconst s = 'a text';\nreturn { n: s };"
  },
  { id: "migrate-object-key", code: "return { a: 1, text: 2 };" },
  {
    id: "migrate-member-property",
    code: "const o = {};\nreturn o.a + o.text;"
  },
  {
    id: "migrate-shadowed-const",
    code: "const a = 1;\nreturn { n: a + text };"
  },
  {
    id: "migrate-shadowed-param",
    code: "const f = (text) => text + a;\nreturn { n: f(1) };"
  },
  {
    id: "migrate-shadowed-function",
    code: "function flag() { return 1; }\nreturn { n: flag() + a };"
  },
  { id: "migrate-binds-inputs", code: "const inputs = {};\nreturn { n: a };" },
  { id: "migrate-already-inputs", code: "return { n: inputs.a };" },
  { id: "migrate-syntax-error", code: "const = a;" },
  { id: "migrate-no-reads", code: "return { n: 1 };" },
  {
    id: "migrate-call-and-template",
    code: "return { n: `${a}-${text}`, out: flag(items) };"
  },
  {
    id: "migrate-destructure-default",
    code: "const { x = a } = {};\nconst [y = text] = [];\nreturn { x, y };"
  },
  { id: "migrate-unknown-global", code: "return { n: ghost + a };" }
];
