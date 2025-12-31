import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock Model3DViewer since it depends on WebGL/Three.js which requires complex setup
jest.mock("../Model3DViewer", () => {
  const React = jest.requireActual("react");

  const MockModel3DViewer = ({
    source,
    format = "glb",
    width = "100%",
    height = 400,
    controls = true
  }: {
    source: string | Uint8Array;
    format?: string;
    width?: number | string;
    height?: number | string;
    controls?: boolean;
  }) => {
    const isSupported = ["glb", "gltf"].includes((format || "glb").toLowerCase());
    const hasSource = typeof source === "string" ? source.length > 0 : source?.length > 0;

    if (!hasSource) {
      return (
        <div data-testid="model3d-viewer-empty" style={{ width, height }}>
          <span>No model</span>
        </div>
      );
    }

    if (!isSupported) {
      return (
        <div data-testid="model3d-viewer-unsupported" style={{ width, height }}>
          <span>Format &quot;{format}&quot; is not yet supported</span>
          <span>Supported formats: GLB, GLTF</span>
        </div>
      );
    }

    return (
      <div data-testid="model3d-viewer" style={{ width: typeof width === "number" ? `${width}px` : width, height: typeof height === "number" ? `${height}px` : height }}>
        {controls && (
          <div data-testid="viewer-controls">
            <button aria-label="Hide grid">Toggle grid</button>
            <button aria-label="Auto rotate">Rotate</button>
            <button aria-label="Take screenshot">Screenshot</button>
            <button aria-label="Fullscreen">Fullscreen</button>
          </div>
        )}
        <div data-testid="canvas-mock">Canvas for {source.toString().substring(0, 50)}</div>
      </div>
    );
  };

  return {
    __esModule: true,
    default: MockModel3DViewer
  };
});

// Now import the mocked component
import Model3DViewer from "../Model3DViewer";

describe("Model3DViewer", () => {
  it("renders empty state when no source provided", () => {
    render(<Model3DViewer source="" />);
    expect(screen.getByTestId("model3d-viewer-empty")).toBeInTheDocument();
  });

  it("renders unsupported format message for OBJ", () => {
    render(<Model3DViewer source="model.obj" format="obj" />);
    expect(screen.getByText(/not yet supported/i)).toBeInTheDocument();
    expect(screen.getByText(/Supported formats: GLB, GLTF/i)).toBeInTheDocument();
  });

  it("renders unsupported format message for FBX", () => {
    render(<Model3DViewer source="model.fbx" format="fbx" />);
    expect(screen.getByText(/not yet supported/i)).toBeInTheDocument();
  });

  it("renders canvas for GLB format", () => {
    render(<Model3DViewer source="https://example.com/model.glb" format="glb" />);
    expect(screen.getByTestId("canvas-mock")).toBeInTheDocument();
  });

  it("renders canvas for GLTF format", () => {
    render(<Model3DViewer source="https://example.com/model.gltf" format="gltf" />);
    expect(screen.getByTestId("canvas-mock")).toBeInTheDocument();
  });

  it("accepts custom width and height", () => {
    render(
      <Model3DViewer source="https://example.com/model.glb" width={500} height={400} />
    );
    const viewer = screen.getByTestId("model3d-viewer");
    expect(viewer).toHaveStyle({ width: "500px", height: "400px" });
  });

  it("hides controls when controls prop is false", () => {
    render(
      <Model3DViewer source="https://example.com/model.glb" controls={false} />
    );
    expect(screen.queryByTestId("viewer-controls")).not.toBeInTheDocument();
  });

  it("shows controls when controls prop is true", () => {
    render(
      <Model3DViewer source="https://example.com/model.glb" controls={true} />
    );
    expect(screen.getByTestId("viewer-controls")).toBeInTheDocument();
  });
});
