import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { NodeContext } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import mockTheme from "../../../__mocks__/themeMock";
import { installGlobal } from "../../../test-utils/doubles";
import KeyframeTimingStrip from "../KeyframeTimingStrip";

// jsdom has no PointerEvent, so fireEvent.pointer* would carry no clientX.
if (!window.PointerEvent) {
  installGlobal(
    "PointerEvent",
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
  );
}

jest.mock("../../../hooks/nodes/useNodeExecState", () => ({
  useNodeResultValue: () => undefined
}));
jest.mock("../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: () => null
}));

const metadata = {
  node_type: "fal.image_to_video.Flux3KeyframesToVideo",
  properties: [
    {
      name: "keyframes",
      type: { type: "list", optional: false, type_args: [{ type: "keyframe", optional: false, type_args: [] }] },
      required: true
    },
    {
      name: "duration",
      type: { type: "enum", optional: false, type_args: [] },
      default: 5,
      required: false
    }
  ]
} as unknown as NodeMetadata;

const keyframeNode = (id: string, time: number) => ({
  id,
  type: "nodetool.video.Keyframe",
  position: { x: 0, y: 0 },
  data: {
    properties: { time, image: { type: "image", uri: `https://img/${id}.png` } },
    workflow_id: "wf",
    dynamic_properties: {},
    selectable: true
  }
});

function setup(duration: number | undefined) {
  const store = createNodeStore(undefined, {
    nodes: [
      keyframeNode("k1", 1),
      keyframeNode("k2", 4),
      {
        id: "model",
        type: metadata.node_type,
        position: { x: 0, y: 0 },
        data: {
          properties: duration === undefined ? {} : { duration },
          workflow_id: "wf",
          dynamic_properties: {},
          selectable: true
        }
      }
    ],
    edges: [
      { id: "e1", source: "k1", sourceHandle: "output", target: "model", targetHandle: "keyframes" },
      { id: "e2", source: "k2", sourceHandle: "output", target: "model", targetHandle: "keyframes" }
    ]
  } as never);
  const data = store.getState().findNode("model")!.data;
  render(
    <ThemeProvider theme={mockTheme}>
      <NodeContext.Provider value={store}>
        <KeyframeTimingStrip
          id="model"
          workflowId="wf"
          nodeMetadata={metadata}
          data={data}
        />
      </NodeContext.Provider>
    </ThemeProvider>
  );
  return store;
}

describe("KeyframeTimingStrip", () => {
  it("places each connected keyframe at its time across the clip", () => {
    setup(8);
    const markers = screen.getAllByRole("slider", { name: "Keyframe time" });
    expect(markers.map((m) => m.style.left)).toEqual(["12.5%", "50%"]);
    expect(screen.getByText("8 s")).toBeInTheDocument();
  });

  it("falls back to the duration default", () => {
    setup(undefined);
    expect(screen.getByText("5 s")).toBeInTheDocument();
  });

  it("writes a dragged time back to the Keyframe node", () => {
    const store = setup(10);
    const track = screen.getByTestId("keyframe-timing-strip")
      .querySelector(".keyframe-rail") as HTMLElement;
    track.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 40 }) as DOMRect;
    const [first] = screen.getAllByRole("slider", { name: "Keyframe time" });

    fireEvent.pointerDown(first, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(first, { clientX: 62, pointerId: 1 });
    expect(store.getState().findNode("k1")!.data.properties.time).toBe(1);
    fireEvent.pointerUp(first, { clientX: 62, pointerId: 1 });

    expect(store.getState().findNode("k1")!.data.properties.time).toBe(3.1);
  });
});
