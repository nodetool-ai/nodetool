import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { PropertyProps } from "../../node/PropertyInput.types";
import { MemoryRouter } from "react-router-dom";
import type { Asset } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";

const mockUploadAsset = jest.fn();
let mockDocumentUri: string | undefined;
let mockAsset: Asset | undefined;
const mockOpenTab = jest.fn();

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(
    selector: (state: {
      openForegroundTab: typeof mockOpenTab;
      activeProjectId: null;
    }) => T
  ) => selector({ openForegroundTab: mockOpenTab, activeProjectId: null }),
  LOOSE_PROJECT_ID: "default"
}));

jest.mock("../../../serverState/useAssetUpload", () => {
  const state = { uploadAsset: mockUploadAsset, isUploading: false };
  return {
    useAssetUpload: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state
  };
});

jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ asset: mockAsset, uri: mockDocumentUri })
}));

let mockIsElectron = false;
jest.mock("../../../utils/browser", () => ({
  get isElectron() {
    return mockIsElectron;
  }
}));

import DocumentProperty from "../DocumentProperty";

const renderWithTheme = (component: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={["/workspace"]}>
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    </MemoryRouter>
  );

describe("DocumentProperty", () => {
  const onChange = jest.fn();
  const props: PropertyProps = {
    property: {
      name: "value",
      type: { type: "document", optional: false, type_args: [] },
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
    mockDocumentUri = undefined;
    mockAsset = undefined;
    mockOpenTab.mockReset();
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

  it("opens an uploaded document in a NodeTool tab using its durable locator", async () => {
    mockDocumentUri = "https://storage.example/doc.pdf?signature=123";
    const assetId = "0123456789abcdef0123456789abcdef";
    mockAsset = stub<Asset>({
      id: assetId,
      name: "doc.pdf",
      content_type: "application/pdf"
    });
    renderWithTheme(
      <DocumentProperty
        {...props}
        value={{
          type: "document",
          asset_id: assetId,
          uri: `asset://${assetId}`
        }}
      />
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Open document in new tab"
      })
    );
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "document",
      ref: `asset://${assetId}`,
      mode: "view",
      title: "doc.pdf",
      projectId: "default"
    });
  });

  it("does not offer to open an empty document input", () => {
    renderWithTheme(<DocumentProperty {...props} />);

    expect(
      screen.queryByRole("button", {
        name: "Open document in new tab"
      })
    ).not.toBeInTheDocument();
  });

  it("opens text assets in the existing text tab", async () => {
    mockAsset = stub<Asset>({
      id: "0123456789abcdef0123456789abcdef",
      name: "notes.txt",
      content_type: "text/plain"
    });
    renderWithTheme(
      <DocumentProperty
        {...props}
        value={{ type: "document", asset_id: mockAsset.id }}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Open document in new tab" })
    );
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "text",
      ref: mockAsset.id,
      mode: "view",
      title: "notes.txt",
      projectId: "default"
    });
  });

  it("opens external document URLs in a NodeTool tab", async () => {
    const uri = "https://example.com/report.pdf";
    renderWithTheme(
      <DocumentProperty {...props} value={{ type: "document", uri }} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Open document in new tab" })
    );
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "document",
      ref: uri,
      mode: "view",
      title: "Document",
      projectId: "default"
    });
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
