import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import VideoListProperty from "../VideoListProperty";

// Mock dependencies
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../stores/ApiClient", () => ({ client: { GET: jest.fn() } }));
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: jest.fn(),
    isUploading: false
  })
}));

const defaultProps = {
  property: {
    name: "videos",
    type: { type: "video_list", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: [],
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.node"
};

describe("VideoListProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders property label and empty dropzone", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <VideoListProperty {...defaultProps} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Videos")).toBeInTheDocument();
    expect(screen.getByText("Click or drop videos here")).toBeInTheDocument();
  });

  it("renders videos when value is provided", () => {
    const videosValue = [
      { uri: "http://example.com/video1.mp4", type: "video" },
      { uri: "http://example.com/video2.mp4", type: "video" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <VideoListProperty {...defaultProps} value={videosValue} />
      </ThemeProvider>
    );
    
    // Videos are rendered, check for remove buttons
    const removeButtons = screen.getAllByRole("button", { name: /remove video/i });
    expect(removeButtons).toHaveLength(2);
  });

  it("calls onChange when removing a video", () => {
    const onChange = jest.fn();
    const videosValue = [
      { uri: "http://example.com/video1.mp4", type: "video" },
      { uri: "http://example.com/video2.mp4", type: "video" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <VideoListProperty 
          {...defaultProps} 
          value={videosValue} 
          onChange={onChange} 
        />
      </ThemeProvider>
    );
    
    // Find the first remove button by tooltip
    const removeButtons = screen.getAllByRole("button", { name: /remove video/i });
    fireEvent.click(removeButtons[0]);
    
    expect(onChange).toHaveBeenCalledWith([
      { uri: "http://example.com/video2.mp4", type: "video" }
    ]);
  });

  it("handles empty value gracefully", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <VideoListProperty {...defaultProps} value={null} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Click or drop videos here")).toBeInTheDocument();
  });

  it("handles drag over and drag leave events", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <VideoListProperty {...defaultProps} />
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
