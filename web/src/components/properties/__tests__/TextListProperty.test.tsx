import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import TextListProperty from "../TextListProperty";

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
    name: "text_files",
    type: { type: "text_list", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: [],
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.node"
};

describe("TextListProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders property label and empty dropzone", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <TextListProperty {...defaultProps} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Text Files")).toBeInTheDocument();
    expect(screen.getByText("Drop text files here")).toBeInTheDocument();
  });

  it("renders text files when value is provided", () => {
    const textsValue = [
      { uri: "http://example.com/file1.txt", type: "text" },
      { uri: "http://example.com/file2.md", type: "text" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <TextListProperty {...defaultProps} value={textsValue} />
      </ThemeProvider>
    );
    
    // Text items are rendered, check for remove buttons
    const removeButtons = screen.getAllByRole("button", { name: /remove text file/i });
    expect(removeButtons).toHaveLength(2);
  });

  it("calls onChange when removing a text file", () => {
    const onChange = jest.fn();
    const textsValue = [
      { uri: "http://example.com/file1.txt", type: "text" },
      { uri: "http://example.com/file2.md", type: "text" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <TextListProperty 
          {...defaultProps} 
          value={textsValue} 
          onChange={onChange} 
        />
      </ThemeProvider>
    );
    
    // Find the first remove button by tooltip
    const removeButtons = screen.getAllByRole("button", { name: /remove text file/i });
    fireEvent.click(removeButtons[0]);
    
    expect(onChange).toHaveBeenCalledWith([
      { uri: "http://example.com/file2.md", type: "text" }
    ]);
  });

  it("handles empty value gracefully", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <TextListProperty {...defaultProps} value={null} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("Drop text files here")).toBeInTheDocument();
  });

  it("handles drag over and drag leave events", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <TextListProperty {...defaultProps} />
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

  it("displays filenames from URIs", () => {
    const textsValue = [
      { uri: "http://example.com/path/to/document.txt", type: "text" }
    ];
    
    render(
      <ThemeProvider theme={mockTheme}>
        <TextListProperty {...defaultProps} value={textsValue} />
      </ThemeProvider>
    );
    
    expect(screen.getByText("document.txt")).toBeInTheDocument();
  });
});
