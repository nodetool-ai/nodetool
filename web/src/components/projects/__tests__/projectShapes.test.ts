/**
 * What a project is named, what its agent is first told, and when an estimate
 * may be shown at all.
 */

import {
  composeFirstTurn,
  estimateFromHistory,
  formatEstimate,
  projectNameFromPrompt,
  shapeById
} from "../projectShapes";
import type { ProjectDetail } from "../projectStatus";

const spot = shapeById("spot");
const empty = shapeById("empty");

const summary = (
  kind: string,
  totalUsd: number,
  unpricedCount = 0
): ProjectDetail =>
  ({
    project: {
      id: `p-${kind}-${totalUsd}`,
      name: kind,
      kind,
      threadId: null,
      createdAt: "",
      updatedAt: ""
    },
    documents: [],
    spend: { totalUsd, unpricedCount, byCategory: [] }
  }) as ProjectDetail;

describe("projectNameFromPrompt", () => {
  it("names the project after the prompt's first line", () => {
    expect(
      projectNameFromPrompt("Aurora launch spot\nwarm and minimal", spot)
    ).toBe("Aurora launch spot");
  });

  it("cuts a long first line at a word boundary", () => {
    const name = projectNameFromPrompt("word ".repeat(30), spot);
    expect(name.length).toBeLessThanOrEqual(61);
    expect(name.endsWith("…")).toBe(true);
  });

  it("falls back to the shape when the prompt says nothing", () => {
    expect(projectNameFromPrompt("   ", spot)).toBe("30s spot");
    expect(projectNameFromPrompt("", empty)).toBe("New project");
  });
});

describe("composeFirstTurn", () => {
  it("carries the prompt, the shape's brief, and the named entities", () => {
    const turn = composeFirstTurn({
      prompt: "A spot for our desk lamp",
      shape: spot,
      entityNames: ["Aurora lamp", "Night street"]
    });
    expect(turn).toContain("A spot for our desk lamp");
    expect(turn).toContain("30-second spot");
    expect(turn).toContain("Use these entities: Aurora lamp, Night street.");
  });

  it("is the prompt alone for a shape that briefs nothing", () => {
    expect(
      composeFirstTurn({ prompt: "Whatever I want", shape: empty, entityNames: [] })
    ).toBe("Whatever I want");
  });
});

describe("estimateFromHistory", () => {
  it("reads a range off past projects of the same kind", () => {
    const estimate = estimateFromHistory(
      [summary("spot", 3.1), summary("spot", 5.8), summary("trailer", 40)],
      "spot"
    );
    expect(estimate).toEqual({ minUsd: 3.1, maxUsd: 5.8, samples: 2 });
    expect(formatEstimate(estimate!)).toBe(
      "est. $3.10–$5.80 · from 2 past projects · provider rates, no markup"
    );
  });

  it("gives no estimate from fewer than two priced projects", () => {
    expect(estimateFromHistory([summary("spot", 3.1)], "spot")).toBeNull();
    expect(estimateFromHistory([], "spot")).toBeNull();
  });

  it("leaves out a project whose total is only a lower bound", () => {
    expect(
      estimateFromHistory([summary("spot", 3.1), summary("spot", 5.8, 2)], "spot")
    ).toBeNull();
  });

  it("has nothing to read for a shape with no kind", () => {
    expect(estimateFromHistory([summary("", 3.1), summary("", 5.8)], "")).toBeNull();
  });
});
