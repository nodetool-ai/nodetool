import { describe, expect, it } from "vitest";
import { generatePackageOverviewMarkdown } from "../src/docs/overview.js";
import type { PackageMetadata } from "../src/metadata.js";

function samplePackage(): PackageMetadata {
  return {
    name: "nodetool-sample",
    description: "A sample package",
    version: "1.2.3",
    authors: ["Ada Lovelace", "Grace Hopper"],
    nodes: [
      {
        title: "Adder",
        description: "Adds two numbers.\nSecond line.",
        namespace: "sample.math",
        node_type: "sample.math.Adder",
        properties: [],
        outputs: [{ name: "sum", type: { type: "int", type_args: [] } }]
      },
      {
        title: "Echo",
        description: "Repeats text.",
        namespace: "sample.text",
        node_type: "sample.text.Echo",
        properties: [],
        outputs: []
      }
    ],
    examples: [
      { id: "ex1", name: "Example One" },
      { id: "ex2", name: "Example Two" }
    ]
  };
}

describe("generatePackageOverviewMarkdown", () => {
  it("renders full markdown with headings and counts", () => {
    const md = generatePackageOverviewMarkdown(samplePackage());
    expect(md).toContain("# nodetool-sample");
    expect(md).toContain("A sample package");
    expect(md).toContain("**Version:** 1.2.3");
    expect(md).toContain("**Authors:** Ada Lovelace, Grace Hopper");
    expect(md).toContain("## Nodes (2)");
    expect(md).toContain("## Examples (2)");
    expect(md).toContain("[Adder]");
    expect(md).toContain("— Adds two numbers.");
    expect(md).toContain("Example One");
  });

  it("renders compact markdown without headings", () => {
    const md = generatePackageOverviewMarkdown(samplePackage(), {
      compact: true
    });
    expect(md).toContain("# nodetool-sample (1.2.3)");
    expect(md).toContain("Nodes: 2");
    expect(md).toContain("Examples: 2");
    expect(md).toContain("`sample.math.Adder`");
    expect(md).not.toContain("## Nodes");
  });

  it("handles empty nodes/examples", () => {
    const md = generatePackageOverviewMarkdown({
      name: "empty",
      nodes: [],
      examples: []
    });
    expect(md).toContain("## Nodes (0)");
    expect(md).toContain("_(no nodes)_");
    expect(md).toContain("_(no examples)_");
  });
});
