import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioListProperty from "../AudioListProperty";

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
    name: "audio_files",
    type: { type: "audio_list", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: [],
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.node"
};

describe("AudioListProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders property label and empty dropzone", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AudioListProperty {...defaultProps} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Audio Files")).toBeInTheDocument();
    expect(screen.getByText("Drop audio files here")).toBeInTheDocument();
  });

  it("renders audio files when value is provided", () => {
    const audiosValue = [
      { uri: "http://example.com/audio1.mp3", type: "audio" },
      { uri: "http://example.com/audio2.wav", type: "audio" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <AudioListProperty {...defaultProps} value={audiosValue} />
      </ThemeProvider>
    );
    
    // Audio items are rendered, check for remove buttons
    const removeButtons = screen.getAllByRole("button", { name: /remove audio/i });
    expect(removeButtons).toHaveLength(2);
  });

  it("calls onChange when removing an audio file", () => {
    const onChange = jest.fn();
    const audiosValue = [
      { uri: "http://example.com/audio1.mp3", type: "audio" },
      { uri: "http://example.com/audio2.wav", type: "audio" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <AudioListProperty 
          {...defaultProps} 
          value={audiosValue} 
          onChange={onChange} 
        />
      </ThemeProvider>
    );
    
    // Find the first remove button by tooltip
    const removeButtons = screen.getAllByRole("button", { name: /remove audio/i });
    fireEvent.click(removeButtons[0]);
    
    expect(onChange).toHaveBeenCalledWith([
      { uri: "http://example.com/audio2.wav", type: "audio" }
    ]);
  });

  it("handles empty value gracefully", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AudioListProperty {...defaultProps} value={null} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Drop audio files here")).toBeInTheDocument();
  });

  it("handles drag over and drag leave events", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <AudioListProperty {...defaultProps} />
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
