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
    id: "planned-output-nested-call-argument",
    inputs: ["text"],
    output: "n",
    code: "wrap(pass(await output('n', inputs.text)));"
  },
  {
    id: "planned-one-unawaited-call",
    inputs: ["text"],
    output: "n",
    code: "const key = getSecret('K');\nawait output('n', inputs.text + key);"
  },
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

/** Module sources for `exportedNames`: every export form it reads. */
export const SEED_MODULE_SOURCES: readonly { id: string; source: string }[] = [
  { id: "export-function", source: "export function a() {}" },
  { id: "export-class", source: "export class B {}" },
  { id: "export-const-many", source: "export const c = 1, d = 2;" },
  {
    id: "export-destructured",
    source:
      "export const { e, f: g, ...h } = {};\nexport const [i, , j = 1] = [];"
  },
  { id: "export-default", source: "export default function () {}" },
  { id: "export-default-expr", source: "export default 1;" },
  {
    id: "export-specifiers",
    source: "const k = 1, l = 2;\nexport { k, l as m, l as 'n-o' };"
  },
  { id: "export-from", source: "export { p, q as r } from './x.js';" },
  { id: "export-namespace", source: "export * as ns from './x.js';" },
  { id: "export-namespace-string", source: "export * as 's-t' from './x.js';" },
  { id: "export-star", source: "export const u = 1;\nexport * from './x.js';" },
  {
    id: "export-star-last",
    source: "export * from './x.js';\nexport const v = 1;"
  },
  { id: "export-none", source: "const w = 1;\nimport { z } from './x.js';" },
  { id: "export-bare-list", source: "export {};" },
  { id: "export-syntax-error", source: "export const = ;" },
  { id: "export-function-var", source: "export var x1 = function () {}, x2;" }
];

/** Bodies that exercise one analyzer construct each; pinned by `analyzerFacts`. */
export const SEED_ANALYZER_BODIES: readonly { id: string; code: string }[] = [
  {
    id: "flow-if-else-both-return",
    code: "if (a) { return { n: 1 }; } else { return { n: 2 }; }"
  },
  {
    id: "flow-if-else-one-return",
    code: "if (a) { return { n: 1 }; } else { x(); }"
  },
  {
    id: "flow-if-else-other-return",
    code: "if (a) { x(); } else { return { n: 2 }; }"
  },
  { id: "flow-if-no-else", code: "if (a) { return { n: 1 }; }" },
  { id: "flow-block-return", code: "{ x(); return { n: 1 }; }" },
  { id: "flow-block-plain", code: "{ x(); }" },
  { id: "flow-throw", code: "throw new Error('no');" },
  { id: "flow-throw-after", code: "x(); throw new Error('no'); y();" },
  {
    id: "flow-try-return",
    code: "try { return { n: 1 }; } catch (e) { return { n: 2 }; }"
  },
  {
    id: "flow-try-return-catch-plain",
    code: "try { return { n: 1 }; } catch (e) { x(); }"
  },
  {
    id: "flow-try-plain-catch-return",
    code: "try { x(); } catch (e) { return { n: 2 }; }"
  },
  {
    id: "flow-try-return-no-handler",
    code: "try { return { n: 1 }; } finally { x(); }"
  },
  { id: "flow-try-plain-no-handler", code: "try { x(); } finally { y(); }" },
  {
    id: "flow-try-finally-return",
    code: "try { x(); } finally { return { n: 1 }; }"
  },
  {
    id: "flow-try-finally-return-catch",
    code: "try { x(); } catch (e) { y(); } finally { return { n: 1 }; }"
  },
  {
    id: "flow-switch-no-default",
    code: "switch (a) { case 1: return { n: 1 }; }"
  },
  {
    id: "flow-switch-default-returns",
    code: "switch (a) { case 1: return { n: 1 }; default: return { n: 2 }; }"
  },
  {
    id: "flow-switch-break",
    code: "switch (a) { case 1: x(); break; default: return { n: 2 }; }"
  },
  {
    id: "flow-switch-last-plain",
    code: "switch (a) { case 1: return { n: 1 }; default: x(); }"
  },
  {
    id: "flow-switch-fallthrough",
    code: "switch (a) { default: x(); case 1: return { n: 1 }; }"
  },
  {
    id: "flow-switch-default-first-break-last",
    code: "switch (a) { default: return { n: 1 }; case 1: x(); break; }"
  },
  { id: "flow-switch-empty", code: "switch (a) {}" },
  { id: "flow-label-return", code: "outer: return { n: 1 };" },
  { id: "flow-label-plain", code: "outer: x();" },
  { id: "flow-loop-return", code: "while (a) { return { n: 1 }; }" },
  {
    id: "flow-return-then-statement",
    code: "if (a) return { n: 1 }; return { n: 2 };"
  },
  {
    id: "flow-nested-function-return",
    code: "function f() { return 1; }\nconst g = () => { return 2; };\nconst h = function () { return 3; };\nreturn { n: f() + g() + h() };"
  },
  {
    id: "flow-class-method-return",
    code: "class K { m() { return 1; } }\nreturn { n: new K().m() };"
  },
  {
    id: "flow-return-in-loop-nested",
    code: "for (const x of a) { if (x) { return { n: x }; } }"
  },
  {
    id: "flow-return-in-try-nested",
    code: "try { if (a) { return { n: 1 }; } } catch (e) { return { n: 2 }; }"
  },
  { id: "shape-bare-return", code: "return;" },
  { id: "shape-ternary", code: "return a ? { n: 1, out: 2 } : { n: 1 };" },
  {
    id: "shape-nested-ternary",
    code: "return a ? (b ? { n: 1 } : 5) : { out: 2 };"
  },
  { id: "shape-array", code: "return [1, 2];" },
  { id: "shape-template", code: "return `x`;" },
  { id: "shape-function", code: "return function () {};" },
  { id: "shape-arrow", code: "return () => 1;" },
  { id: "shape-literal-null", code: "return null;" },
  { id: "shape-literal-number", code: "return 5;" },
  { id: "shape-identifier", code: "const r = {};\nreturn r;" },
  { id: "shape-await", code: "return await f();" },
  { id: "shape-spread", code: "return { n: 1, ...a };" },
  { id: "shape-computed", code: "return { [a]: 1, n: 2 };" },
  { id: "shape-computed-ident-key", code: "return { [n]: 1 };" },
  { id: "shape-string-key", code: "return { 'n': 1, 'out': 2 };" },
  { id: "shape-number-key", code: "return { 1: 1, n: 2 };" },
  {
    id: "shape-method-and-getter",
    code: "return { m() {}, get g() { return 1; }, n: 1 };"
  },
  { id: "shape-shorthand", code: "const n = 1;\nreturn { n };" },
  {
    id: "shape-last-return-wins",
    code: "if (a) { return { n: 1 }; }\nreturn { out: 2 };"
  },
  {
    id: "shape-last-return-opaque",
    code: "if (a) { return { n: 1 }; }\nreturn r;"
  },
  {
    id: "shape-last-return-ternary",
    code: "if (a) { return { n: 1 }; }\nreturn a ? { n: 1 } : { out: 2 };"
  },
  {
    id: "shape-last-return-empty",
    code: "if (a) { return { n: 1 }; }\nreturn {};"
  },
  {
    id: "shape-hidden-handle",
    code: "return { n: 1, _private: 2, 'x y': 3, out: 4 };"
  },
  {
    id: "emit-only-literals",
    code: "emit('n', 1); output('out', 2); emit('n', 3);"
  },
  { id: "emit-nonliteral", code: "emit(name, 1);" },
  { id: "emit-no-args", code: "emit();" },
  { id: "emit-number-first", code: "output(1, 2);" },
  { id: "emit-template-first", code: "emit(`n`, 1);" },
  { id: "emit-method", code: "x.emit('n', 1); x.output('out', 2);" },
  { id: "emit-other-callee", code: "send('n', 1);" },
  { id: "emit-in-function", code: "function f() { emit('n', 1); }\nf();" },
  { id: "emit-and-return", code: "emit('n', 1);\nreturn { out: 2 };" },
  { id: "emit-hidden-name", code: "emit('_hidden', 1); emit('out', 2);" },
  { id: "stream-call", code: "for await (const x of stream('items')) {}" },
  {
    id: "stream-first-open",
    code: "await stream.first('a'); stream.open('text');"
  },
  { id: "stream-other-member", code: "stream.close('a'); stream.map('b');" },
  { id: "stream-any", code: "for await (const x of stream.any()) {}" },
  { id: "stream-nonliteral", code: "stream(name); stream.first(name);" },
  { id: "stream-no-args", code: "stream(); stream.first(); stream.open();" },
  { id: "stream-number-arg", code: "stream(1); stream.first(2);" },
  {
    id: "stream-computed-member",
    code: "stream['first']('a'); stream[any]();"
  },
  {
    id: "stream-other-object",
    code: "x.stream('a'); x.stream.first('b'); y.first('c');"
  },
  {
    id: "stream-non-identifier-property",
    code: "stream.first.call(null, 'a');"
  },
  {
    id: "stream-bound-var",
    code: "const stream = make();\nstream('a'); stream.any();"
  },
  {
    id: "stream-bound-param",
    code: "function f(stream) { return stream('a'); }\nf(x);"
  },
  {
    id: "stream-and-inputs",
    code: "const v = inputs.text;\nfor await (const x of stream('items')) {}"
  },
  { id: "inputs-member", code: "return { n: inputs.a + inputs.text };" },
  { id: "inputs-string-key", code: "return { n: inputs['a'] };" },
  { id: "inputs-dynamic-key", code: "return { n: inputs[key] };" },
  { id: "inputs-number-key", code: "return { n: inputs[0] };" },
  { id: "inputs-spread", code: "return { ...inputs };" },
  { id: "inputs-call-arg", code: "return f(inputs);" },
  { id: "inputs-property-name", code: "return opts.inputs;" },
  { id: "inputs-computed-property", code: "return opts[inputs];" },
  { id: "inputs-object-key", code: "return { inputs: 1 };" },
  { id: "inputs-shorthand", code: "return { inputs };" },
  { id: "inputs-computed-key", code: "return { [inputs]: 1 };" },
  { id: "inputs-method-key", code: "return { inputs() {} };" },
  { id: "inputs-optional-member", code: "return inputs?.a;" },
  { id: "inputs-shadowed", code: "const inputs = { z: 1 };\nreturn inputs.a;" },
  {
    id: "inputs-shadowed-param",
    code: "const f = (inputs) => inputs.a;\nreturn f({});"
  },
  { id: "inputs-hidden-name", code: "return inputs._hidden + inputs.a;" },
  {
    id: "inputs-reserved-name",
    code: "return inputs.constructor + inputs.text;"
  },
  { id: "inputs-assign-target", code: "inputs.a = 1;" },
  { id: "inputs-callee", code: "inputs.a();" },
  {
    id: "typeof-guard",
    code: "if (typeof maybe !== 'undefined') { x(maybe); }"
  },
  { id: "typeof-member", code: "typeof a.b;" },
  { id: "typeof-literal", code: "typeof 1;" },
  { id: "unary-not-typeof", code: "void maybe; !other; -num;" },
  { id: "typeof-call", code: "typeof f();" },
  {
    id: "bound-var-forms",
    code: "var a1 = 1; let b1 = 2; const { c1, d1: e1, ...f1 } = {}; const [g1, , h1 = 1, ...i1] = [];"
  },
  {
    id: "bound-function-forms",
    code: "function fn(p1, { q1 }, [r1], s1 = 1, ...t1) {}\nconst fe = function named(u1) {};\nconst fa = (v1, w1) => v1;"
  },
  {
    id: "bound-class-forms",
    code: "class C1 {}\nconst C2 = class C3 {};\nconst C4 = class {};"
  },
  { id: "bound-catch", code: "try { x(); } catch (err) { y(err); }" },
  {
    id: "bound-catch-destructured",
    code: "try { x(); } catch ({ message, code: c }) { y(message, c); }"
  },
  { id: "bound-catch-no-param", code: "try { x(); } catch { y(); }" },
  {
    id: "bound-import",
    code: "import def, * as ns from 'mod';\nimport { a2, b2 as c2 } from 'mod2';"
  },
  {
    id: "bound-assignment",
    code: "g2 = 1; [h2, i2] = [1, 2]; ({ j2, k2: l2 } = {}); m2 += 1;"
  },
  { id: "bound-assignment-member", code: "obj.prop = 1; obj['k'] = 2;" },
  {
    id: "bound-pattern-rest-and-default",
    code: "const { a3 = 1, b3: { c3 }, ...d3 } = {};\nconst [e3 = 2, [f3]] = [];"
  },
  {
    id: "bound-assignment-pattern-default",
    code: "({ a4 = 1 } = {}); [b4 = 2] = [];"
  },
  {
    id: "bound-for-forms",
    code: "for (const k1 of a) {}\nfor (let k2 in a) {}\nfor (var k3 = 0; k3 < 1; k3++) {}"
  },
  { id: "bound-function-decl-no-id", code: "export default function () {}" },
  {
    id: "free-reads",
    code: "return { n: a + b, out: f(c), doc: `${d}`, [e]: 1 };"
  },
  { id: "free-property-names", code: "return o.p + o[q] + o.r.s;" },
  {
    id: "free-object-keys",
    code: "return { k1: v1, 'k2': v2, [k3]: v3, k4 };"
  },
  {
    id: "free-method-and-field",
    code: "class K { m() { return z; } f = y; static s = 1; get g() { return 1; } [c]() {} }\nreturn new K();"
  },
  { id: "free-labels", code: "lbl: for (;;) { break lbl; continue lbl; }" },
  { id: "free-meta-property", code: "new.target; import.meta;" },
  {
    id: "free-import-export-specifiers",
    code: "import { a5 as b5 } from 'm';\nexport { b5 as c5 };\nexport { d5 };"
  },
  { id: "free-declarator-id", code: "const x6 = y6;" },
  {
    id: "free-function-id",
    code: "function f6() { return g6; }\nconst h6 = function i6() { return j6; };"
  },
  {
    id: "free-class-id",
    code: "class C6 extends D6 {}\nconst E6 = class F6 extends G6 {};"
  },
  { id: "free-unary", code: "typeof u1; void u2; !u3; delete u4.p;" },
  { id: "free-shorthand-twice", code: "return { s1, s2 };" },
  { id: "free-shorthand-pattern", code: "const { p7 } = {};\nreturn p7;" },
  { id: "free-member-chains", code: "a8.b8.c8(d8).e8;" },
  { id: "free-optional-chain", code: "a9?.b9?.[c9]?.(d9);" },
  { id: "free-computed-member-ident", code: "return arr[idx];" },
  { id: "free-update-assign", code: "n1++; --n2; n3 += 1;" },
  { id: "free-template-tag", code: "return tag`x${y1}`;" },
  { id: "free-arrow-params-default", code: "const f = (p = dflt) => p;" },
  {
    id: "free-nested-shadow",
    code: "const v = 1;\nconst f = () => { const w = v + u; return w; };\nreturn f();"
  },
  { id: "free-labeled-statement-ident", code: "ident: x();" },
  { id: "walk-deep", code: "return { n: [1, [2, [3, { a: b }]]] };" },
  { id: "walk-sequence-and-new", code: "(a, b); new C(d); c = e ? f : g;" },
  { id: "dynamic-import", code: "const m = await import('x');" },
  { id: "dynamic-require", code: "const m = require('x');" },
  { id: "dynamic-require-method", code: "x.require('y'); const r = require;" },
  { id: "dynamic-both", code: "require('a'); import('b');" },
  { id: "dynamic-neither", code: "const importer = 1;" },
  {
    id: "import-forms",
    code: "import a from 'a';\nimport * as b from 'b';\nimport { c, d as e } from 'c';\nimport { 'f-g' as h } from 'd';\nimport 'side';"
  },
  {
    id: "import-and-export",
    code: "import { a } from 'a';\nexport const b = a;"
  },
  { id: "export-only", code: "export default 1;" },
  { id: "export-all", code: "export * from 'a';" },
  { id: "export-named-from", code: "export { x as y } from 'a';" },
  { id: "parse-wrapped-await", code: "const x = await f();\nreturn { n: x };" },
  { id: "parse-wrapped-only", code: "return await f(), 1;" },
  { id: "parse-error-line-3", code: "const a = 1;\nconst b = 2;\nconst = ;" },
  { id: "parse-error-no-body", code: "}" },
  { id: "parse-empty", code: "" },
  { id: "parse-only-comments", code: "/* nothing */" },
  { id: "parse-return-top", code: "return 1;" },
  { id: "parse-await-top", code: "await x;" },
  { id: "parse-strict-reserved", code: "const yield1 = 1; let await2 = 2;" },
  { id: "parse-labeled-fn", code: "a: function f() {}" },
  {
    id: "inferred-hidden-and-valid",
    code: "return { good: 1, _bad: 2, 'has space': 3 };"
  },
  {
    id: "inferred-emit-wins-over-return",
    code: "emit('e1', 1);\nreturn { r1: 1 };"
  },
  {
    id: "inferred-last-two-returns",
    code: "if (a) { return { first: 1 }; }\nreturn { second: 2 };"
  },
  {
    id: "inferred-skip-empty-last",
    code: "if (a) { return { first: 1 }; }\nreturn {};"
  },
  {
    id: "inferred-skip-ternary-last",
    code: "if (a) { return { first: 1 }; }\nreturn a ? { b: 1 } : { c: 2 };"
  },
  {
    id: "inferred-skip-opaque-last",
    code: "if (a) { return { first: 1 }; }\nreturn { ...a };"
  },
  {
    id: "inferred-skip-non-object-last",
    code: "if (a) { return { first: 1 }; }\nreturn 5;"
  },
  {
    id: "inferred-skip-bare-last",
    code: "if (a) { return { first: 1 }; }\nreturn;"
  },
  { id: "inferred-all-hidden", code: "return { _a: 1, _b: 2 };" },
  {
    id: "inferred-inputs-and-stream",
    code: "inputs.i1; inputs._h; stream('s1'); stream.first('s1'); stream('_s');"
  },
  {
    id: "inferred-stream-before-inputs",
    code: "stream('s1'); inputs.i1; inputs.s1;"
  }
];
