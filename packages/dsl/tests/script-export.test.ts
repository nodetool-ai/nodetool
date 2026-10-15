import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

import { validateCodeNodeBody } from "@nodetool-ai/node-sdk";
import { workflowToScript, type ScriptTarget } from "../src/script-export.js";

type Graph = Parameters<typeof workflowToScript>[0];

/** Hello + " world" → Output, and the same text through an If node. */
const greeter: Graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "greeting", value: "Hello" }
    },
    { id: "c1", type: "nodetool.constant.String", data: { value: " world" } },
    { id: "cat", type: "nodetool.text.Concat", data: {} },
    { id: "cond", type: "nodetool.constant.Bool", data: { value: false } },
    { id: "if", type: "nodetool.control.If", data: {} },
    { id: "o1", type: "nodetool.output.Output", data: { name: "joined" } },
    { id: "o2", type: "nodetool.output.Output", data: { name: "when_true" } },
    { id: "o3", type: "nodetool.output.Output", data: { name: "when_false" } },
    { id: "note", type: "nodetool.workflows.base_node.Comment", data: {} }
  ],
  edges: [
    { source: "in1", sourceHandle: "output", target: "cat", targetHandle: "a" },
    { source: "c1", sourceHandle: "output", target: "cat", targetHandle: "b" },
    { source: "cat", sourceHandle: "output", target: "o1", targetHandle: "value" },
    { source: "cat", sourceHandle: "output", target: "if", targetHandle: "value" },
    { source: "cond", sourceHandle: "output", target: "if", targetHandle: "condition" },
    { source: "if", sourceHandle: "if_true", target: "o2", targetHandle: "value" },
    { source: "if", sourceHandle: "if_false", target: "o3", targetHandle: "value" }
  ]
};

/** A list iterated item by item: emitted, and taken then collected. */
const iterated: Graph = {
  nodes: [
    { id: "l", type: "nodetool.constant.List", data: { value: ["a", "b", "c"] } },
    { id: "fe", type: "nodetool.control.ForEach", data: {} },
    { id: "tk", type: "nodetool.control.Take", data: { n: 2 } },
    { id: "col", type: "nodetool.control.Collect", data: {} },
    { id: "oi", type: "nodetool.output.Output", data: { name: "items" } },
    { id: "oc", type: "nodetool.output.Output", data: { name: "collected" } }
  ],
  edges: [
    { source: "l", sourceHandle: "output", target: "fe", targetHandle: "input_list" },
    { source: "fe", sourceHandle: "output", target: "oi", targetHandle: "value" },
    { source: "fe", sourceHandle: "output", target: "tk", targetHandle: "input_item" },
    { source: "tk", sourceHandle: "output", target: "col", targetHandle: "input_item" },
    { source: "col", sourceHandle: "output", target: "oc", targetHandle: "value" }
  ]
};

const FLOW_ENTRY = pathToFileURL(resolve(__dirname, "../src/flow/index.ts")).href;

/**
 * Run a generated Node.js script in this process and return what it prints.
 * The script imports `@nodetool-ai/dsl/flow`, which is pointed at the source
 * tree here, and reads its inputs from `process.argv[2]` as it would on a
 * command line.
 */
async function runNodeScript(
  code: string,
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-script-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "script.mjs");
  writeFileSync(
    file,
    code
      .replace(/^#!.*\n/, "")
      .replace('"@nodetool-ai/dsl/flow"', JSON.stringify(FLOW_ENTRY))
  );
  const argv = process.argv;
  process.argv = ["node", file, JSON.stringify(inputs)];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await import(/* @vite-ignore */ pathToFileURL(file).href);
    return JSON.parse(String(log.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
  } finally {
    log.mockRestore();
    process.argv = argv;
  }
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("workflowToScript", () => {
  test("declares the workflow's inputs and outputs as script ports", () => {
    const script = workflowToScript(greeter, { target: "sandbox" });
    expect(script.inputs).toEqual([{ name: "greeting", type: "str" }]);
    expect(script.outputs.map((port) => port.name)).toEqual([
      "joined",
      "when_true",
      "when_false"
    ]);
    expect(script.outputs[0]).toEqual({ name: "joined", type: "str" });
    expect(script.unsupported).toEqual([]);
  });

  test("the sandbox body calls nodes through the flow pack and passes the Code node check", () => {
    const script = workflowToScript(greeter, {
      target: "sandbox",
      workflowName: "Greeter"
    });
    expect(script.code).toContain('import "@nodetool-ai/sandbox-nodetool/flow";');
    expect(script.code).toContain(
      'import { callNode as runNode, streamNode } from "@nodetool-ai/sandbox-flow";'
    );
    expect(script.code).toContain('value: inputs.greeting ?? "Hello"');
    expect(script.code).toContain('await call("nodetool.text.Concat"');
    expect(script.code).not.toContain("nodetool.workflows.base_node.Comment");

    const issues = validateCodeNodeBody({
      code: script.code,
      declaredOutputs: script.outputs.map((port) => port.name),
      availableInputs: script.inputs.map((port) => port.name)
    });
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(issues.map((issue) => issue.code)).not.toContain("code_unused_input");
  });

  test("the Node.js script runs every node and skips the branch an If did not take", async () => {
    const script = workflowToScript(greeter, { target: "node" });
    expect(script.code.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(await runNodeScript(script.code, { greeting: "Hi" })).toEqual({
      joined: "Hi world",
      when_false: "Hi world"
    });
  });

  test("a stream is emitted to an output item by item and collected for a node that consumes streams", async () => {
    const script = workflowToScript(iterated, { target: "node" });
    expect(script.unsupported).toEqual([]);
    expect(script.code).toContain('await callStreaming("nodetool.control.ForEach"');
    expect(await runNodeScript(script.code, {})).toEqual({
      items: ["a", "b", "c"],
      collected: ["a", "b"]
    });
  });

  test("a node fed one item at a time is refused before anything runs", async () => {
    const graph: Graph = {
      nodes: [
        ...iterated.nodes.filter((node) => node.id === "l" || node.id === "fe"),
        { id: "up", type: "nodetool.text.Concat", data: { b: "!" } },
        { id: "o", type: "nodetool.output.Output", data: { name: "upper" } }
      ],
      edges: [
        iterated.edges[0]!,
        { source: "fe", sourceHandle: "output", target: "up", targetHandle: "a" },
        { source: "up", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    for (const target of ["sandbox", "node"] satisfies ScriptTarget[]) {
      const script = workflowToScript(graph, { target });
      expect(script.unsupported).toEqual([
        expect.objectContaining({ node_id: "up", node_type: "nodetool.text.Concat" })
      ]);
      expect(script.code).toContain("throwUnsupported(");
    }
    const script = workflowToScript(graph, { target: "node" });
    await expect(runNodeScript(script.code, {})).rejects.toThrow(
      /cannot run as a script:\n- nodetool\.text\.Concat \(up\) receives "output"/
    );
  });

  test("a control edge is refused on the node it drives", () => {
    const script = workflowToScript(
      {
        nodes: [
          { id: "a", type: "nodetool.constant.String", data: { value: "x" } },
          { id: "b", type: "nodetool.constant.String", data: { value: "y" } }
        ],
        edges: [
          {
            source: "a",
            sourceHandle: "__control__",
            target: "b",
            targetHandle: "__control__",
            edge_type: "control"
          }
        ]
      },
      { target: "sandbox" }
    );
    expect(script.unsupported).toEqual([
      expect.objectContaining({ node_id: "b", message: expect.stringContaining("control edge") })
    ]);
  });

  test("a bypassed node is routed around, as the runner does", async () => {
    const graph: Graph = {
      nodes: [
        { id: "s", type: "nodetool.constant.String", data: { value: "keep" } },
        {
          id: "up",
          type: "nodetool.text.Concat",
          data: { b: "!" },
          ui_properties: { bypassed: true }
        },
        { id: "o", type: "nodetool.output.Output", data: { name: "result" } }
      ],
      edges: [
        { source: "s", sourceHandle: "output", target: "up", targetHandle: "a" },
        { source: "up", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    const script = workflowToScript(graph, { target: "node" });
    expect(script.code).not.toContain("nodetool.text.Concat");
    expect(await runNodeScript(script.code, {})).toEqual({ result: "keep" });
  });

  test("several edges into a list input become one list, into any other input are refused", () => {
    const strings = [
      { id: "a", type: "nodetool.constant.String", data: { value: "a" } },
      { id: "b", type: "nodetool.constant.String", data: { value: "b" } }
    ];
    const list = workflowToScript(
      {
        nodes: [...strings, { id: "j", type: "nodetool.audio.ConcatList", data: {} }],
        edges: [
          { source: "a", sourceHandle: "output", target: "j", targetHandle: "audio_files" },
          { source: "b", sourceHandle: "output", target: "j", targetHandle: "audio_files" }
        ]
      },
      { target: "sandbox" }
    );
    expect(list.unsupported).toEqual([]);
    expect(list.code).toContain('audio_files: aggregate([pick(string, "output"), pick(string2, "output")], true)');

    const scalar = workflowToScript(
      {
        nodes: [...strings, { id: "c", type: "nodetool.text.Template", data: {} }],
        edges: [
          { source: "a", sourceHandle: "output", target: "c", targetHandle: "string" },
          { source: "b", sourceHandle: "output", target: "c", targetHandle: "string" }
        ]
      },
      { target: "sandbox" }
    );
    expect(scalar.unsupported).toEqual([
      expect.objectContaining({ node_id: "c", message: expect.stringContaining('2 values on "string"') })
    ]);
  });

  test("external inputs retain bounds", async () => {
    const graph: Graph = {
      nodes: [
        { id: "i", type: "nodetool.input.IntegerInput", data: { name: "count", value: 5, min: 1, max: 10 } },
        { id: "o", type: "nodetool.output.Output", data: { name: "result" } }
      ],
      edges: [{ source: "i", sourceHandle: "output", target: "o", targetHandle: "value" }]
    };
    expect(await runNodeScript(workflowToScript(graph, { target: "node" }).code, { count: 999 })).toEqual({ result: 10 });
  });

  test("partial branches use defaults while wholly untaken branches skip", async () => {
    const graph: Graph = {
      nodes: [
        { id: "if", type: "nodetool.control.If", data: { condition: true, value: "X" } },
        { id: "cat", type: "nodetool.text.Concat", data: { a: "A", b: "B" } },
        { id: "o", type: "nodetool.output.Output", data: { name: "result" } }
      ],
      edges: [
        { source: "if", sourceHandle: "if_true", target: "cat", targetHandle: "a" },
        { source: "if", sourceHandle: "if_false", target: "cat", targetHandle: "b" },
        { source: "cat", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    expect(await runNodeScript(workflowToScript(graph, { target: "node" }).code, {})).toEqual({ result: "XB" });
  });

  test("list fan-in flattens list values", async () => {
    const graph: Graph = {
      nodes: [
        { id: "a", type: "nodetool.constant.List", data: { value: ["a", "b"] } },
        { id: "b", type: "nodetool.constant.List", data: { value: ["c"] } },
        { id: "fe", type: "nodetool.control.ForEach", data: {} },
        { id: "o", type: "nodetool.output.Output", data: { name: "items" } }
      ],
      edges: [
        { source: "a", sourceHandle: "output", target: "fe", targetHandle: "input_list" },
        { source: "b", sourceHandle: "output", target: "fe", targetHandle: "input_list" },
        { source: "fe", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    expect(await runNodeScript(workflowToScript(graph, { target: "node" }).code, {})).toEqual({ items: ["a", "b", "c"] });
  });

  test("intermediate streamed Output forwards items to Collect", async () => {
    const graph: Graph = {
      nodes: [
        { id: "l", type: "nodetool.constant.List", data: { value: ["a", "b"] } },
        { id: "fe", type: "nodetool.control.ForEach", data: {} },
        { id: "mid", type: "nodetool.output.Output", data: { name: "mid" } },
        { id: "col", type: "nodetool.control.Collect", data: {} },
        { id: "o", type: "nodetool.output.Output", data: { name: "final" } }
      ],
      edges: [
        { source: "l", sourceHandle: "output", target: "fe", targetHandle: "input_list" },
        { source: "fe", sourceHandle: "output", target: "mid", targetHandle: "value" },
        { source: "mid", sourceHandle: "output", target: "col", targetHandle: "input_item" },
        { source: "col", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    const script = workflowToScript(graph, { target: "node" });
    expect(script.unsupported).toEqual([]);
    expect(await runNodeScript(script.code, {})).toEqual({ mid: ["a", "b"], final: ["a", "b"] });
  });

  test("list fan-in with no taken branches skips the downstream node", async () => {
    const graph: Graph = {
      nodes: [
        { id: "a", type: "nodetool.control.If", data: { condition: false, value: ["a"] } },
        { id: "b", type: "nodetool.control.If", data: { condition: false, value: ["b"] } },
        { id: "fe", type: "nodetool.control.ForEach", data: { input_list: ["default"] } },
        { id: "o", type: "nodetool.output.Output", data: { name: "items" } }
      ],
      edges: [
        { source: "a", sourceHandle: "if_true", target: "fe", targetHandle: "input_list" },
        { source: "b", sourceHandle: "if_true", target: "fe", targetHandle: "input_list" },
        { source: "fe", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    expect(await runNodeScript(workflowToScript(graph, { target: "node" }).code, {})).toEqual({});
  });

  test("correlation-dependent Zip is rejected during conversion", () => {
    const script = workflowToScript({ nodes: [{ id: "z", type: "nodetool.control.Zip", data: {} }], edges: [] }, { target: "node" });
    expect(script.unsupported).toContainEqual(expect.objectContaining({ node_id: "z" }));
  });

  test("bypass routing retains declared types", async () => {
    const graph: Graph = {
      nodes: [
        { id: "b", type: "nodetool.constant.Bool", data: { value: true } },
        { id: "s", type: "nodetool.constant.String", data: { value: "kept" } },
        { id: "if", type: "nodetool.control.If", data: {}, ui_properties: { bypassed: true } },
        { id: "t", type: "nodetool.text.Template", data: { template: "{string}" } },
        { id: "o", type: "nodetool.output.Output", data: { name: "result" } }
      ],
      edges: [
        { source: "b", sourceHandle: "output", target: "if", targetHandle: "condition" },
        { source: "s", sourceHandle: "output", target: "if", targetHandle: "value" },
        { source: "if", sourceHandle: "if_true", target: "t", targetHandle: "string" },
        { source: "t", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    expect(await runNodeScript(workflowToScript(graph, { target: "node" }).code, {})).toEqual({ result: "kept" });
  });

  test("display labels cannot inject executable source", async () => {
    const graph: Graph = {
      nodes: [{ id: "o", type: "nodetool.output.Output", name: "Result\nglobalThis.labelExecuted = true;\n//", data: { value: "safe" } }],
      edges: []
    };
    await runNodeScript(workflowToScript(graph, { target: "node" }).code, {});
    expect(Reflect.get(globalThis, "labelExecuted")).toBeUndefined();
    Reflect.deleteProperty(globalThis, "labelExecuted");
  });

  test("a cycle is refused at conversion", () => {
    expect(() =>
      workflowToScript(
        {
          nodes: [
            { id: "a", type: "nodetool.text.Concat", data: {} },
            { id: "b", type: "nodetool.text.Concat", data: {} }
          ],
          edges: [
            { source: "a", sourceHandle: "output", target: "b", targetHandle: "a" },
            { source: "b", sourceHandle: "output", target: "a", targetHandle: "a" }
          ]
        },
        { target: "node" }
      )
    ).toThrow(/cycle/);
  });

  test("names that are not identifiers become identifier ports and variables", () => {
    const script = workflowToScript(
      {
        nodes: [
          {
            id: "i",
            type: "nodetool.input.IntegerInput",
            data: { name: "max count", value: 3 }
          },
          { id: "o", type: "nodetool.output.Output", data: { name: "class" } }
        ],
        edges: [
          { source: "i", sourceHandle: "output", target: "o", targetHandle: "value" }
        ]
      },
      { target: "sandbox" }
    );
    expect(script.inputs).toEqual([{ name: "maxCount", type: "int" }]);
    expect(script.outputs).toEqual([{ name: "classNode", type: "int" }]);
    expect(script.code).toContain("value: inputs.maxCount ?? 3");
  });
});
