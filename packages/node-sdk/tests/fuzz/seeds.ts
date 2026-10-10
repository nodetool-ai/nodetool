/**
 * Seed documents for the crash fuzzer.
 *
 * Hand-written rather than read from `packages/base-nodes` examples: the
 * corpus is Stryker's test oracle, so it has to be hermetic and byte-stable —
 * a seed that changes when another package ships a workflow would move the
 * mutation score for reasons that have nothing to do with the validator.
 *
 * Between them the four graphs reach every branch class the validator has:
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
  }
];
