import { describe, expect, it } from "vitest";
import {
  generateAllNodeDocs,
  generateNodeMarkdown,
  slugifyNodeFilename
} from "../src/docs/nodes.js";
import type { NodeMetadata } from "../src/metadata.js";

const adder: NodeMetadata = {
  title: "Adder",
  description: "Adds two integers together.",
  namespace: "sample.math",
  node_type: "sample.math.Adder",
  properties: [
    {
      name: "a",
      type: { type: "int", type_args: [] },
      default: 0,
      description: "Left operand"
    },
    {
      name: "b",
      type: { type: "int", type_args: [] },
      default: 0,
      description: "Right operand"
    }
  ],
  outputs: [{ name: "sum", type: { type: "int", type_args: [] } }]
};

const echo: NodeMetadata = {
  title: "Echo",
  description: "Repeats a string.",
  namespace: "sample.text",
  node_type: "sample.text.Echo",
  properties: [],
  outputs: [{ name: "output", type: { type: "str", type_args: [] } }]
};

describe("generateNodeMarkdown", () => {
  it("renders node with properties and outputs", () => {
    const md = generateNodeMarkdown(adder);
    expect(md).toContain("# Adder");
    expect(md).toContain("`sample.math.Adder`");
    expect(md).toContain("Adds two integers together.");
    expect(md).toContain("| a | int | 0 | Left operand |");
    expect(md).toContain("| b | int | 0 | Right operand |");
    expect(md).toContain("## Outputs");
    expect(md).toContain("| sum | int |");
  });

  it("emits '(none)' for empty properties/outputs", () => {
    const md = generateNodeMarkdown({
      title: "Empty",
      description: "nothing here",
      namespace: "x",
      node_type: "x.Empty",
      properties: [],
      outputs: []
    });
    expect(md).toContain("## Properties");
    expect(md).toContain("_(none)_");
  });
});

describe("generateAllNodeDocs", () => {
  it("produces one file per node with slugified names", () => {
    const docs = generateAllNodeDocs([adder, echo]);
    expect(docs.size).toBe(2);
    const keys = [...docs.keys()];
    expect(keys).toContain(slugifyNodeFilename(adder));
    expect(keys).toContain(slugifyNodeFilename(echo));
    expect(keys[0]).toMatch(/\.md$/);
  });

  it("filters by packageName (namespace prefix)", () => {
    const docs = generateAllNodeDocs([adder, echo], {
      packageName: "sample.math"
    });
    expect(docs.size).toBe(1);
    expect([...docs.keys()][0]).toContain("adder");
  });
});
