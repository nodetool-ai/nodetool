import { render } from "@testing-library/react";
import NodeResizeHandle from "../NodeResizeHandle";

// Capture the props ReactFlow's NodeResizeControl receives so we can assert the
// aspect-ratio lock is forwarded.
const resizeControlProps: Array<Record<string, unknown>> = [];
jest.mock("@xyflow/react", () => ({
  NodeResizeControl: (props: { children?: React.ReactNode }) => {
    resizeControlProps.push(props as Record<string, unknown>);
    return <div data-testid="resize-control">{props.children}</div>;
  }
}));

// Isolate from the content-aware control's dependencies (node store, viewport).
const mediaControlProps: Array<Record<string, unknown>> = [];
jest.mock("../MediaAspectResizeControl", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mediaControlProps.push(props);
    return <div data-testid="media-aspect-control" />;
  }
}));

jest.mock("@mui/material/styles", () => {
  const original = jest.requireActual("@mui/material/styles");
  return {
    ...original,
    useTheme: () => ({ vars: { palette: { grey: { 100: "#eee" } } } })
  };
});

describe("NodeResizeHandle", () => {
  beforeEach(() => {
    resizeControlProps.length = 0;
    mediaControlProps.length = 0;
  });

  it("does not lock aspect ratio by default", () => {
    render(<NodeResizeHandle minWidth={150} minHeight={100} />);
    expect(resizeControlProps[0]?.keepAspectRatio).toBeUndefined();
  });

  it("forwards keepAspectRatio to the resize control when set", () => {
    render(
      <NodeResizeHandle minWidth={150} minHeight={100} keepAspectRatio />
    );
    expect(resizeControlProps[0]?.keepAspectRatio).toBe(true);
  });

  it("renders the media-aspect control when contentAware with a nodeId", () => {
    const { queryByTestId } = render(
      <NodeResizeHandle
        minWidth={150}
        minHeight={100}
        contentAware
        nodeId="node-1"
      />
    );
    expect(queryByTestId("media-aspect-control")).not.toBeNull();
    expect(queryByTestId("resize-control")).toBeNull();
    expect(mediaControlProps[0]).toMatchObject({
      nodeId: "node-1",
      minWidth: 150,
      minHeight: 100,
      maxWidth: 800
    });
  });

  it("falls back to the default control when contentAware lacks a nodeId", () => {
    const { queryByTestId } = render(
      <NodeResizeHandle minWidth={150} minHeight={100} contentAware />
    );
    expect(queryByTestId("media-aspect-control")).toBeNull();
    expect(queryByTestId("resize-control")).not.toBeNull();
  });
});
