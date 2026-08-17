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
  { id: "empty-ish", code: "// nothing to see\n" }
];
