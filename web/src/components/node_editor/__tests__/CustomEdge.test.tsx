import type { CSSProperties, ReactNode } from "react";
import { render } from "@testing-library/react";
import { Position, type EdgeProps } from "@xyflow/react";
import { CustomEdge, edgeGradientId } from "../CustomEdge";

jest.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  getBezierPath: jest.fn(() => ["M0,40 C100,40 100,40 200,40", 100, 40]),
  BaseEdge: ({ path, style }: { path: string; style?: CSSProperties }) => (
    <path className="react-flow__edge-path" d={path} style={style} />
  ),
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => children
}));

const renderEdge = (props: Partial<EdgeProps>) =>
  render(
    <svg>
      <CustomEdge
        {...({
          id: "edge-1",
          source: "a",
          target: "b",
          sourceX: 0,
          sourceY: 40,
          targetX: 200,
          targetY: 40,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: { stroke: "#e91e63" },
          ...props
        } as EdgeProps)}
      />
    </svg>
  );

describe("CustomEdge", () => {
  it("strokes an edge between two types with its own user-space gradient", () => {
    // Source and target handles at the same height: the path's bounding box
    // has no height, where an objectBoundingBox gradient paints nothing.
    const { container } = renderEdge({
      data: { sourceTypeColor: "#e91e63", targetTypeColor: "#9c27b0" }
    });

    const gradient = container.querySelector("linearGradient");
    expect(gradient?.id).toBe(edgeGradientId("edge-1"));
    expect(gradient?.getAttribute("gradientUnits")).toBe("userSpaceOnUse");
    expect(gradient?.getAttribute("x1")).toBe("0");
    expect(gradient?.getAttribute("y1")).toBe("40");
    expect(gradient?.getAttribute("x2")).toBe("200");
    expect(gradient?.getAttribute("y2")).toBe("40");
    const stops = [...(gradient?.querySelectorAll("stop") ?? [])].map((stop) =>
      stop.getAttribute("stop-color")
    );
    expect(stops).toEqual(["#e91e63", "#9c27b0"]);

    const path = container.querySelector(".react-flow__edge-path");
    expect(path?.getAttribute("style")).toContain(
      `url(#${edgeGradientId("edge-1")})`
    );
  });

  it("uses the solid stroke when both ends have the same type", () => {
    const { container } = renderEdge({
      data: { sourceTypeColor: "#3f51b5", targetTypeColor: "#3f51b5" },
      style: { stroke: "#3f51b5" }
    });

    expect(container.querySelector("linearGradient")).toBeNull();
    const path = container.querySelector(".react-flow__edge-path");
    expect(path?.getAttribute("style")).toContain("stroke: #3f51b5");
  });

  it("makes free-form edge ids safe for url references", () => {
    expect(edgeGradientId("a b:c/d")).toBe("edge-gradient-a_b_c_d");
  });
});
