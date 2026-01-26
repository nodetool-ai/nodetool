import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ImageListProperty from "../ImageListProperty";

// Mock dependencies
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../stores/ApiClient", () => ({ client: { GET: jest.fn() } }));
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
  });

  it("renders property label and empty dropzone", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ImageListProperty {...defaultProps} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Images")).toBeInTheDocument();
    expect(screen.getByText("Drop images here")).toBeInTheDocument();
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
    
    expect(screen.getByText("Drop images here")).toBeInTheDocument();
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
