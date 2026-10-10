import {
  applyAbsolutePositions,
  hasSelectedAncestor,
  layoutSelection
} from "../selectionLayout";

// outer group at (100, 100) > inner group at (10, 10) > leaf at (1, 1).
const nodes = [
  { id: "outer", position: { x: 100, y: 100 } },
  { id: "inner", parentId: "outer", position: { x: 10, y: 10 } },
  { id: "leaf", parentId: "inner", position: { x: 1, y: 1 } },
  { id: "loose", position: { x: 0, y: 0 } }
];

describe("selectionLayout", () => {
  it("reads nested group children in canvas coordinates", () => {
    const leaf = nodes[2];
    const [placed] = layoutSelection([leaf], nodes);
    expect(placed.position).toEqual({ x: 111, y: 111 });
  });

  it("drops nodes whose ancestor is in the selection", () => {
    const selected = [nodes[0], nodes[2], nodes[3]];
    expect(layoutSelection(selected, nodes).map((n) => n.id)).toEqual([
      "outer",
      "loose"
    ]);
  });

  it("writes canvas positions back relative to each parent", () => {
    const written = applyAbsolutePositions(
      nodes,
      new Map([
        ["leaf", { x: 200, y: 300 }],
        ["loose", { x: 5, y: 6 }]
      ])
    );
    expect(written.map((n) => n.position)).toEqual([
      { x: 100, y: 100 },
      { x: 10, y: 10 },
      { x: 90, y: 190 },
      { x: 5, y: 6 }
    ]);
    // Untouched nodes keep their identity.
    expect(written[0]).toBe(nodes[0]);
  });

  it("finds a selected ancestor at any depth", () => {
    const byId = new Map(
      nodes.map((n) => [n.id, { ...n, selected: n.id === "outer" }])
    );
    expect(hasSelectedAncestor(nodes[2], byId)).toBe(true);
    expect(hasSelectedAncestor(nodes[3], byId)).toBe(false);
  });
});
