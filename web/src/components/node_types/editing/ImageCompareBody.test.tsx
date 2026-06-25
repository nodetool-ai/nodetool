import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageCompareBody } from "./ImageCompareBody";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

// The body resolves each image input via `useUpstreamValue` (keyed by input
// name) and persists the wipe position with `useBespokePropertyWriter`. Mock
// those boundaries, plus the image-URL ladder, directly.
let mockValues: Record<string, unknown> = {};
jest.mock("../../../hooks/nodes/useNodeIO", () => ({
  __esModule: true,
  useUpstreamValue: (_w: string, _id: string, name: string) => mockValues[name]
}));

const setProperties = jest.fn();
const setPropertyComplete = jest.fn();
jest.mock("../../../hooks/nodes/useBespokePropertyWriter", () => ({
  __esModule: true,
  useBespokePropertyWriter: () => ({ setProperties, setPropertyComplete })
}));

jest.mock("../../../utils/imageUtils", () => ({
  __esModule: true,
  createImageUrl: (source: { uri?: string } | null) => ({
    url: source?.uri ?? "",
    blobUrl: null
  })
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    spacing: (n: number) => `${n * 8}px`,
    vars: {
      palette: { grey: { 900: "#111" }, common: { white: "#fff" } }
    }
  })
}));

jest.mock("../../node/HandleColumn", () => ({
  __esModule: true,
  default: () => <div data-testid="handle-column" />
}));
jest.mock("../../node/NodeOutputs", () => ({
  NodeOutputs: () => <div data-testid="node-outputs" />
}));
jest.mock("../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));
jest.mock("../../ui_primitives", () => ({
  __esModule: true,
  BORDER_RADIUS: { sm: "4px" },
  TYPOGRAPHY: { sans: { caption: { fontSize: "11px" } } },
  CheckerDropzone: ({ message }: { message: string }) => (
    <div data-testid="checker-dropzone">{message}</div>
  )
}));

const meta: NodeMetadata = {
  node_type: "nodetool.image.Compare",
  outputs: [{ name: "output", type: { type: "image" } }],
  properties: [
    { name: "image_a", type: { type: "image" } },
    { name: "image_b", type: { type: "image" } }
  ]
} as unknown as NodeMetadata;

const renderBody = (props?: Partial<NodeData>) =>
  render(
    <ImageCompareBody
      id="n1"
      nodeType="nodetool.image.Compare"
      nodeMetadata={meta}
      data={{ properties: {}, ...props } as NodeData}
      workflowId="wf1"
      isOutputNode={false}
    />
  );

beforeEach(() => {
  mockValues = {};
  setProperties.mockClear();
  setPropertyComplete.mockClear();
});

describe("ImageCompareBody", () => {
  it("prompts to connect inputs when nothing is wired", () => {
    renderBody();
    expect(screen.getByTestId("checker-dropzone")).toBeInTheDocument();
    expect(screen.queryByAltText("A")).not.toBeInTheDocument();
  });

  it("renders both layers and clips A to the split position", () => {
    mockValues = { image_a: { uri: "a.png" }, image_b: { uri: "b.png" } };
    renderBody({ properties: { split: 0.25 } });

    const a = screen.getByAltText("A") as HTMLImageElement;
    const b = screen.getByAltText("B") as HTMLImageElement;
    expect(a).toHaveAttribute("src", "a.png");
    expect(b).toHaveAttribute("src", "b.png");
    // split 0.25 → A revealed on the left quarter → right inset 75%.
    expect(a.style.clipPath).toBe("inset(0 75% 0 0)");
  });

  it("writes split on pointer drag and commits on release", () => {
    mockValues = { image_a: { uri: "a.png" }, image_b: { uri: "b.png" } };
    const { container } = renderBody({ properties: { split: 0.5 } });
    const area = container.querySelector(".preview-area") as HTMLElement;
    jest
      .spyOn(area, "getBoundingClientRect")
      .mockReturnValue({ left: 0, width: 200 } as DOMRect);

    // jsdom's PointerEvent drops clientX; a MouseEvent named "pointerdown"
    // carries it and React's pointer plugin still dispatches it.
    const down = new MouseEvent("pointerdown", { clientX: 50, bubbles: true });
    fireEvent(area, down);
    expect(setProperties).toHaveBeenCalledWith({ split: 0.25 });

    fireEvent(area, new MouseEvent("pointerup", { bubbles: true }));
    expect(setPropertyComplete).toHaveBeenCalledTimes(1);
  });
});
