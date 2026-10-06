import { fireEvent, render } from "@testing-library/react";

import MediaAspectResizeControl from "../MediaAspectResizeControl";
import { measureNodeMedia } from "../measureNodeMedia";

const mockUpdateNode = jest.fn();
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: <T,>(selector: (state: { updateNode: jest.Mock }) => T) =>
    selector({ updateNode: mockUpdateNode })
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    getViewport: () => ({ zoom: 1 }),
    getNode: () => ({ position: { x: 100, y: 50 } })
  })
}));

jest.mock("../measureNodeMedia", () => ({
  measureNodeMedia: jest.fn()
}));

jest.mock("@mui/material/styles", () => {
  const original = jest.requireActual("@mui/material/styles");
  return {
    ...original,
    useTheme: () => ({ vars: { palette: { grey: { 100: "#eee" } } } })
  };
});

const measureMock = jest.mocked(measureNodeMedia);

/** Render the control inside a fake React Flow node of the given size. */
const renderInNode = (
  corner: "bottom-right" | "top-left",
  width: number,
  height: number
) => {
  const result = render(
    <div className="react-flow__node">
      <MediaAspectResizeControl
        nodeId="node-1"
        minWidth={100}
        minHeight={80}
        maxWidth={800}
        corner={corner}
      />
    </div>
  );
  const nodeEl = result.container.querySelector(".react-flow__node");
  if (!nodeEl) {
    throw new Error("node element missing");
  }
  jest.spyOn(nodeEl, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  return result.getByRole("button");
};

describe("MediaAspectResizeControl double-click", () => {
  beforeEach(() => {
    mockUpdateNode.mockReset();
    measureMock.mockReset();
  });

  it("fits the node height to the media aspect ratio at the current width", () => {
    // 2:1 media, 20px side padding, 60px header and controls.
    measureMock.mockReturnValue({ ratio: 2, sidePad: 20, chrome: 60 });
    const grip = renderInNode("bottom-right", 420, 400);

    fireEvent.doubleClick(grip);

    // Media width 400 at 2:1 is 200 tall, plus 60 of chrome.
    expect(mockUpdateNode).toHaveBeenCalledWith("node-1", {
      width: 420,
      height: 260
    });
  });

  it("keeps the opposite corner anchored when fitting from a top corner", () => {
    measureMock.mockReturnValue({ ratio: 2, sidePad: 20, chrome: 60 });
    const grip = renderInNode("top-left", 420, 400);

    fireEvent.doubleClick(grip);

    expect(mockUpdateNode).toHaveBeenCalledWith("node-1", {
      width: 420,
      height: 260,
      position: { x: 100, y: 50 + (400 - 260) }
    });
  });

  it("does nothing when the node holds no media", () => {
    measureMock.mockReturnValue(null);
    const grip = renderInNode("bottom-right", 420, 400);

    fireEvent.doubleClick(grip);

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });
});
