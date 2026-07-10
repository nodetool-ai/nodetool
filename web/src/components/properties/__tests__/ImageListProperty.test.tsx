import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ImageListProperty from "../ImageListProperty";

// Mock NodeContext — useUpstreamValue (added to ImageListProperty) calls useNodes
// which requires a NodeProvider. Provide a minimal stub so tests that render
// the component without a full store context still work.
jest.mock("../../../contexts/NodeContext", () => {
  const actual = jest.requireActual("../../../contexts/NodeContext");
  return {
    ...actual,
    useNodes: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ nodes: [], edges: [], findNode: () => undefined })
  };
});

// Simulate production, where the web app and the API live on different origins.
// The connected preview must resolve relative `/api/storage/...` URIs against
// BASE_URL, otherwise the <img> loads from the web origin and 404s.
jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "https://api.example.com"
}));

// The connected branch reads the wired upstream value from this hook.
let mockUpstreamValue: unknown = undefined;
jest.mock("../../../hooks/nodes/useNodeIO", () => ({
  __esModule: true,
  useUpstreamValue: () => mockUpstreamValue
}));

// Mock dependencies
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: jest.fn(),
    isUploading: false
  })
}));
jest.mock("../../node/ImageDimensions", () => ({
  __esModule: true,
  default: () => <div>Image Dimensions</div>
}));

const defaultProps = {
  property: {
    name: "images",
    type: { type: "image_list", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: [],
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.node"
};

describe("ImageListProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpstreamValue = undefined;
  });

  it("resolves connected upstream image URIs against BASE_URL", () => {
    mockUpstreamValue = { type: "image", uri: "/api/storage/abc.png" };

    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} isConnected workflowId="wf1" />
      </ThemeProvider>
    );

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    // A raw `/api/storage/...` src would resolve against the web origin and 404
    // when the API is on a different origin; it must be prefixed with BASE_URL.
    expect(images[0]).toHaveAttribute(
      "src",
      "https://api.example.com/api/storage/abc.png"
    );
  });

  it("leaves absolute connected upstream URIs untouched", () => {
    mockUpstreamValue = {
      type: "image",
      uri: "https://cdn.example.com/x.png"
    };

    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} isConnected workflowId="wf1" />
      </ThemeProvider>
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/x.png"
    );
  });

  it("renders property label and empty dropzone", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Images")).toBeInTheDocument();
    expect(screen.getByText("Click or drop images here")).toBeInTheDocument();
  });

  it("renders images when value is provided", () => {
    const imagesValue = [
      { uri: "http://example.com/image1.jpg", type: "image" },
      { uri: "http://example.com/image2.jpg", type: "image" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} value={imagesValue} />
      </ThemeProvider>
    );
    
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "http://example.com/image1.jpg");
    expect(images[1]).toHaveAttribute("src", "http://example.com/image2.jpg");
  });

  it("calls onChange when removing an image", () => {
    const onChange = jest.fn();
    const imagesValue = [
      { uri: "http://example.com/image1.jpg", type: "image" },
      { uri: "http://example.com/image2.jpg", type: "image" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty 
          {...defaultProps} 
          value={imagesValue} 
          onChange={onChange} 
        />
      </ThemeProvider>
    );
    
    // Find the first remove button by tooltip
    const removeButtons = screen.getAllByRole("button", { name: /remove image/i });
    fireEvent.click(removeButtons[0]);
    
    expect(onChange).toHaveBeenCalledWith([
      { uri: "http://example.com/image2.jpg", type: "image" }
    ]);
  });

  it("handles empty value gracefully", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} value={null} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Click or drop images here")).toBeInTheDocument();
  });

  it("handles drag over and drag leave events", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} />
      </ThemeProvider>
    );
    
    const dropzone = container.querySelector(".dropzone");
    expect(dropzone).toBeInTheDocument();
    
    if (dropzone) {
      // Simulate drag over
      fireEvent.dragOver(dropzone);
      expect(dropzone).toHaveClass("drag-over");
      
      // Simulate drag leave
      fireEvent.dragLeave(dropzone);
      expect(dropzone).not.toHaveClass("drag-over");
    }
  });
});
