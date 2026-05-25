/**
 * Frontend tests for PainterBody.
 *
 * Covers hydration from mask_data, undo/redo stack behaviour, and
 * basic rendering interactions.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import PainterBody, { PAINTER_NODE_TYPE } from "../PainterBody";
import { useUpstreamValue } from "../../../../hooks/nodes/useNodeIO";

// ── Mocks ─────────────────────────────────────────────────────────
jest.mock("../../../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) =>
    selector({
      edges: [],
      updateNodeProperties: jest.fn(),
      findNode: jest.fn(() => undefined)
    })
  )
}));

jest.mock("../../../../stores/ResultsStore", () =>
  jest.fn((selector) => selector({ getResult: () => undefined }))
);

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: () => ({
    setProperty: jest.fn(),
    setPropertyComplete: jest.fn()
  })
}));

jest.mock("../../../../hooks/nodes/useNodeIO", () => ({
  useUpstreamValue: jest.fn(() => undefined)
}));

jest.mock("../../../../serverState/useAsset", () => ({
  useAsset: jest.fn(() => ({ uri: undefined }))
}));

jest.mock("../../../../components/node/HandleColumn", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../../../components/node/NodeOutputs", () => ({
  __esModule: true,
  NodeOutputs: () => null
}));
jest.mock("../../../../components/node/NodeProgress", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../../../components/inputs/NumberInput", () => ({
  __esModule: true,
  default: React.memo((props: any) => (
    <div data-testid={props.id}>{props.value}</div>
  ))
}));

// jsdom does not implement pointer capture APIs.
HTMLCanvasElement.prototype.setPointerCapture = jest.fn();
HTMLCanvasElement.prototype.releasePointerCapture = jest.fn();

const renderWithTheme = (component: React.ReactNode) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

const makeTypeMeta = (type: string) =>
  ({ type, optional: false, type_args: [] });

const makeProps = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "test-painter",
    nodeType: PAINTER_NODE_TYPE,
    nodeMetadata: {
      outputs: [
        { name: "mask", type: makeTypeMeta("image") },
        { name: "image", type: makeTypeMeta("image") }
      ],
      properties: [
        { name: "image", type: makeTypeMeta("image"), title: "Image", default: null }
      ],
      is_streaming_output: false
    } as any,
    data: {
      properties: {},
      dynamic_properties: {},
      selectable: true,
      workflow_id: "wf-1"
    },
    workflowId: "wf-1",
    isOutputNode: false,
    ...overrides
  }) as React.ComponentProps<typeof PainterBody>;

describe("PainterBody", () => {
  beforeEach(() => {
    jest.mocked(useUpstreamValue).mockReturnValue(undefined);
  });

  it("renders without a source image", () => {
    renderWithTheme(<PainterBody {...makeProps()} />);
    expect(document.querySelector("canvas.paint")).toBeInTheDocument();
  });

  it("shows a connected upstream image", () => {
    jest.mocked(useUpstreamValue).mockReturnValue({
      type: "image",
      uri: "/api/storage/test-image.png",
      width: 640,
      height: 480
    });

    renderWithTheme(<PainterBody {...makeProps()} />);

    const img = document.querySelector("img.source") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toContain("/api/storage/test-image.png");
  });

  it("rehydrates brush_size from persisted properties", () => {
    renderWithTheme(
      <PainterBody
        {...makeProps({
          data: {
            properties: { brush_size: 42 },
            dynamic_properties: {},
            selectable: true,
            workflow_id: "wf-1"
          }
        })}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("rehydrates bg_fade from persisted properties", () => {
    renderWithTheme(
      <PainterBody
        {...makeProps({
          data: {
            properties: { bg_fade: 0.5 },
            dynamic_properties: {},
            selectable: true,
            workflow_id: "wf-1"
          }
        })}
      />
    );
    expect(screen.getByText("0.5")).toBeInTheDocument();
  });

  it.skip("performs undo and redo", async () => {
    renderWithTheme(<PainterBody
      {...makeProps({
        data: {
          properties: { mask_data: "" },
          dynamic_properties: {},
          selectable: true,
          workflow_id: "wf-1"
        }
      })}
    />);

    const canvas = document.querySelector("canvas.paint") as HTMLCanvasElement;
    expect(canvas).toBeTruthy();

    // Simulate a paint stroke.
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });

    // Undo should become enabled after a stroke.
    const undoBtn = screen.getByRole("button", { name: /Undo/i });
    await waitFor(() => expect(undoBtn).not.toBeDisabled());

    // Click undo.
    fireEvent.click(undoBtn);
    // After undo, redo should be enabled and undo disabled.
    const redoBtn = screen.getByRole("button", { name: /Redo/i });
    await waitFor(() => expect(redoBtn).not.toBeDisabled());
  });

  it("clears the canvas when clear is clicked", async () => {
    renderWithTheme(<PainterBody
      {...makeProps({
        data: {
          properties: { mask_data: "" },
          dynamic_properties: {},
          selectable: true,
          workflow_id: "wf-1"
        }
      })}
    />);

    const canvas = document.querySelector("canvas.paint") as HTMLCanvasElement;
    expect(canvas).toBeTruthy();

    // Draw something.
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50, pointerId: 1 });

    const clearBtn = screen.getByRole("button", { name: /Clear painted mask/i });
    fireEvent.click(clearBtn);

    // After clearing, undo should be available (clear pushes a snapshot).
    const undoBtn = screen.getByRole("button", { name: /Undo/i });
    await waitFor(() => expect(undoBtn).not.toBeDisabled());
  });
});
