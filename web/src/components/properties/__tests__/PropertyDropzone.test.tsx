import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockUploadAsset = jest.fn();

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
    uploadAsset: mockUploadAsset,
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
    mockUploadAsset.mockReset();
    mockIsElectron = false;
    // Reset window.api
    delete (window as any).api;
  });

  it("should render dropzone with click instruction", () => {
    renderWithTheme(
      <PropertyDropzone
        asset={undefined}
        uri={undefined}
        onChange={mockOnChange}
        contentType="image"
        props={mockProps as any}
      />
    );
    expect(screen.getByText("Click or drop image")).toBeInTheDocument();
  });

  it("should render dropzone in browser mode", () => {
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
    // Dropzone should still be clickable and show instructions
    expect(screen.getByText("Click or drop image")).toBeInTheDocument();
  });

  it("should render dropzone in Electron mode", () => {
    mockIsElectron = true;
    
    // Mock window.api
    (window as any).api = {
      dialog: {
        openFile: jest.fn(),
      },
      clipboard: {
        readFileAsDataURL: jest.fn(),
        readFileBuffer: jest.fn(),
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

    // Dropzone should be clickable in Electron too
    expect(screen.getByText("Click or drop image")).toBeInTheDocument();
  });

  it("writes asset:// and asset_id when an upload completes", () => {
    mockUploadAsset.mockImplementation(({ onCompleted }) => {
      onCompleted({
        id: "87c6124bc9684facabb8cb3575dcb8ad",
        get_url: "/api/storage/1/87c6124bc9684facabb8cb3575dcb8ad.bin"
      });
    });

    renderWithTheme(
      <PropertyDropzone
        asset={undefined}
        uri={undefined}
        onChange={mockOnChange}
        contentType="image"
        props={mockProps as any}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["bytes"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(mockOnChange).toHaveBeenCalledWith({
      type: "image",
      uri: "asset://87c6124bc9684facabb8cb3575dcb8ad",
      asset_id: "87c6124bc9684facabb8cb3575dcb8ad"
    });
  });
});
