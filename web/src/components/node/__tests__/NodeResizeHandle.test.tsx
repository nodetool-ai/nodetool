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
});
