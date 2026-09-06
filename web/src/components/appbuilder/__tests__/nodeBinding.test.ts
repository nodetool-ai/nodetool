import { Node as RFNode } from "@xyflow/react";

import {
  collectNodePropertyOverlays,
  withNodeProperties
} from "../nodeBinding";
import { NodeData } from "../../../stores/NodeData";
import { stub } from "../../../test-utils/doubles";

const slots = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value }])
  );

describe("collectNodePropertyOverlays", () => {
  it("keeps each operation's override on the node id both operations share", () => {
    // The `upscale-image` app: two operations whose bound workflows each carry
    // a node called `up`, driven by their own slider.
    const inputs = slots({
      "faithful:up#scale": 2,
      "clarity:up#scale": 4
    });

    expect(collectNodePropertyOverlays(inputs, "faithful")).toEqual(
      new Map([["up", { scale: 2 }]])
    );
    expect(collectNodePropertyOverlays(inputs, "clarity")).toEqual(
      new Map([["up", { scale: 4 }]])
    );
  });

  it("drops another operation's override entirely", () => {
    expect(
      collectNodePropertyOverlays(slots({ "faithful:up#scale": 2 }), "clarity")
    ).toEqual(new Map());
  });

  it("merges several properties of one node and ignores plain input slots", () => {
    const overlays = collectNodePropertyOverlays(
      slots({
        "main:up#scale": 2,
        "main:up#denoise": 0.4,
        "main:in1": "a prompt"
      }),
      "main"
    );

    expect(overlays).toEqual(new Map([["up", { scale: 2, denoise: 0.4 }]]));
  });

  it("skips slots with no value", () => {
    expect(
      collectNodePropertyOverlays(
        { "main:up#scale": { value: undefined } },
        "main"
      )
    ).toEqual(new Map());
  });
});

describe("withNodeProperties", () => {
  it("merges the overlay over the node's stored properties", () => {
    const node = stub<RFNode<NodeData>>({
      id: "up",
      position: { x: 0, y: 0 },
      data: { properties: { scale: 1, denoise: 0.2 } }
    });

    expect(withNodeProperties(node, { scale: 4 }).data).toEqual({
      properties: { scale: 4, denoise: 0.2 }
    });
    // The source node is untouched.
    expect(node.data.properties?.scale).toBe(1);
  });
});
