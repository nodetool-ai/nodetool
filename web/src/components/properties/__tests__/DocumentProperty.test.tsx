import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockUploadAsset = jest.fn();

jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: mockUploadAsset,
    isUploading: false
  })
}));

jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ asset: undefined, uri: undefined })
}));

let mockIsElectron = false;
jest.mock("../../../utils/browser", () => ({
  get isElectron() {
    return mockIsElectron;
  }
}));

import DocumentProperty from "../DocumentProperty";

const renderWithTheme = (component: React.ReactNode) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("DocumentProperty", () => {
  const onChange = jest.fn();
  const props = {
    property: {
      name: "value",
      type: { type: "document" },
      default: null,
      title: "Value",
      description: "The document to use as input.",
      required: false
    },
    nodeType: "nodetool.input.DocumentInput",
    nodeId: "document_input",
    propertyIndex: "0",
    value: null,
    onChange
  };

  beforeEach(() => {
    onChange.mockClear();
    mockIsElectron = false;
    delete (window as any).api;
    mockUploadAsset.mockReset();
    mockUploadAsset.mockImplementation(({ onCompleted }) =>
      onCompleted?.({
        id: "asset-1",
        name: "doc.pdf",
        content_type: "application/pdf",
        get_url: "/api/storage/1/asset-1.pdf"
      })
    );
  });

  it("writes the picked PDF onto the property", async () => {
    const { container } = renderWithTheme(
      <DocumentProperty {...(props as any)} />
    );

    await userEvent.click(screen.getByText(/click or drop document/i));

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "doc.pdf", {
      type: "application/pdf"
    });
    await userEvent.upload(input, file);

    expect(mockUploadAsset).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "asset://asset-1",
        asset_id: "asset-1",
        type: "document"
      })
    );
  });

  it("writes the picked PDF onto the property in the desktop app", async () => {
    mockIsElectron = true;
    (window as any).api = {
      dialog: {
        openFile: jest.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/Users/me/doc.pdf"]
        })
      },
      clipboard: {
        readFileBuffer: jest.fn().mockResolvedValue({
          buffer: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          mimeType: "application/pdf"
        })
      }
    };

    renderWithTheme(<DocumentProperty {...(props as any)} />);
    await userEvent.click(screen.getByText(/click or drop document/i));

    expect(mockUploadAsset).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "asset://asset-1",
        asset_id: "asset-1",
        type: "document"
      })
    );
  });
});
