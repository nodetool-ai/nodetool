import { describe, expect, it } from "vitest";
import { unreadOutputIssues } from "../src/validate/index.js";

const registry = {
  getMetadata: (type: string) =>
    type === "sink" ? { outputs: [] } : { outputs: [{ name: "output" }] }
};

describe("unreadOutputIssues", () => {
  it("names a node whose output no edge reads", () => {
    const issues = unreadOutputIssues(
      {
        nodes: [
          { id: "a", type: "gen" },
          { id: "b", type: "gen" },
          { id: "s", type: "sink" }
        ],
        edges: [{ source: "a", target: "s" }]
      },
      registry
    );
    expect(issues.map((i) => [i.nodeId, i.code, i.severity])).toEqual([["b", "unread_output", "info"]]);
  });

  it("stays quiet for a graph with no edges", () => {
    expect(unreadOutputIssues({ nodes: [{ id: "a", type: "gen" }], edges: [] }, registry)).toEqual([]);
  });
});
