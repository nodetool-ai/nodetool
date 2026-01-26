import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Mock the hooks
jest.mock("../../../hooks/handlers/useFileDrop", () => ({
  useFileDrop: () => ({
    onDrop: jest.fn(),
    onDragOver: jest.fn(),
    filename: "test.jpg",
    uploading: false,
  }),
}));

jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: jest.fn(),
    isUploading: false,
  }),
}));

// Mock browser utils - this needs to be done before importing the component
let mockIsElectron = false;
jest.mock("../../../utils/browser", () => ({
  get isElectron() {
    return mockIsElectron;
  },
}));

// Import after mocks are set up
import PropertyDropzone from "../PropertyDropzone";

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("PropertyDropzone", () => {
  const mockOnChange = jest.fn();
  const mockProps = {
    property: {
      name: "test_image",
      type: { type: "image" },
      default: null,
      title: "Test Image",
      description: "A test image property",
      required: false,
    },
    nodeType: "nodetool.input.ImageInput",
    nodeId: "test-node",
    propertyIndex: "0",
    onChange: mockOnChange,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
    mockIsElectron = false;
    // Reset window.api
    delete (window as any).api;
  });

  it("should render URL button", () => {
    renderWithTheme(
      <PropertyDropzone
        asset={undefined}
        uri={undefined}
        onChange={mockOnChange}
        contentType="image"
        props={mockProps as any}
      />
    );
    expect(screen.getByText("URL")).toBeInTheDocument();
  });

  it("should not render FILE button when not in Electron", () => {
    mockIsElectron = false;
    renderWithTheme(
      <PropertyDropzone
        asset={undefined}
        uri={undefined}
        onChange={mockOnChange}
        contentType="image"
        props={mockProps as any}
      />
    );
    expect(screen.queryByText("FILE")).not.toBeInTheDocument();
  });

  it("should render FILE button when in Electron", () => {
    mockIsElectron = true;
    
    // Mock window.api
    (window as any).api = {
      dialog: {
        openFile: jest.fn(),
      },
      clipboard: {
        readFileAsDataURL: jest.fn(),
      },
    };

    renderWithTheme(
      <PropertyDropzone
        asset={undefined}
        uri={undefined}
        onChange={mockOnChange}
        contentType="image"
        props={mockProps as any}
      />
    );

    // FILE button should be visible in Electron
    const fileButton = screen.getByText("FILE");
    expect(fileButton).toBeInTheDocument();
  });

  it("should render dropzone", () => {
    renderWithTheme(
      <PropertyDropzone
        asset={undefined}
        uri={undefined}
        onChange={mockOnChange}
        contentType="image"
        props={mockProps as any}
      />
    );
    expect(screen.getByText("Drop image")).toBeInTheDocument();
  });
});
