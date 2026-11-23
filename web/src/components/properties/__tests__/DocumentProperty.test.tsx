import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { PropertyProps } from "../../node/PropertyInput.types";
import { MemoryRouter } from "react-router-dom";
import type { Asset } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";

const mockUploadAsset = jest.fn();
const mockImportDocument = jest.fn();
const mockAddNotification = jest.fn();
let mockDocumentUri: string | undefined;
let mockAsset: Asset | undefined;
const mockOpenTab = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    textDocuments: {
      import: {
        mutate: (...args: unknown[]) => mockImportDocument(...args)
      }
    }
  }
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: typeof mockAddNotification }) => T
  ) => selector({ addNotification: mockAddNotification })
}));

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

// The project document list is tested on its own; here it needs no server.
jest.mock("../ProjectDocumentSelect", () => ({
  __esModule: true,
  default: () => null,
  projectDocumentValue: (assetId: string) => ({ type: "document", uri: `asset://${assetId}`, asset_id: assetId })
}));

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
    mockImportDocument.mockReset();
    mockAddNotification.mockReset();
    mockIsElectron = false;
    delete (window as any).api;
    mockUploadAsset.mockReset();
    mockUploadAsset.mockImplementation(({ onCompleted }) =>
      onCompleted?.({
        id: "asset-1",
        name: "notes.md",
        content_type: "text/markdown",
        get_url: "/api/storage/1/asset-1.md"
      })
    );
  });

  it("opens an editable markdown document in the document editor tab", async () => {
    mockDocumentUri = "https://storage.example/notes.md?signature=123";
    const assetId = "0123456789abcdef0123456789abcdef";
    mockAsset = stub<Asset>({
      id: assetId,
      name: "notes.md",
      content_type: "text/markdown"
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
      type: "text",
      ref: assetId,
      mode: "view",
      title: "notes.md",
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

  it("writes the picked Markdown file onto the property", async () => {
    const { container } = renderWithTheme(
      <DocumentProperty {...(props as any)} />
    );

    await userEvent.click(screen.getByText(/click or drop document/i));

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["# Notes\n"], "notes.md", {
      type: "text/markdown"
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

  it("writes the picked Markdown file onto the property in the desktop app", async () => {
    mockIsElectron = true;
    (window as any).api = {
      dialog: {
        openFile: jest.fn().mockResolvedValue({
          canceled: false,
          filePaths: ["/Users/me/notes.md"]
        })
      },
      clipboard: {
        readFileBuffer: jest.fn().mockResolvedValue({
          buffer: new TextEncoder().encode("# Notes\n"),
          mimeType: "text/markdown"
        })
      }
    };

    renderWithTheme(<DocumentProperty {...(props as any)} />);
    await userEvent.click(screen.getByText(/click or drop document/i));

    expect(mockUploadAsset).toHaveBeenCalled();
    expect(mockImportDocument).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "asset://asset-1",
        asset_id: "asset-1",
        type: "document"
      })
    );
  });

  it("converts a picked PDF into an editable Markdown document on DocumentInput", async () => {
    mockUploadAsset.mockImplementation(({ onCompleted }) =>
      onCompleted?.({
        id: "pdf-asset-1",
        name: "report.pdf",
        content_type: "application/pdf",
        get_url: "/api/storage/1/pdf-asset-1.pdf"
      })
    );
    mockImportDocument.mockResolvedValue({
      asset_id: "md-asset-2",
      name: "report.md",
      path: "Imported/report.md"
    });

    const { container } = renderWithTheme(
      <DocumentProperty {...(props as any)} />
    );

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.accept).toContain(".pdf");
    expect(input.accept).toContain(".docx");
    expect(input.accept).toContain(".html");
    expect(input.accept).toContain(".txt");

    const file = new File(["%PDF-1.7"], "report.pdf", {
      type: "application/pdf"
    });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(mockImportDocument).toHaveBeenCalledWith({
        asset_id: "pdf-asset-1"
      });
    });
    expect(onChange).toHaveBeenCalledWith({
      type: "document",
      uri: "asset://md-asset-2",
      asset_id: "md-asset-2"
    });
  });

  it("reports conversion errors without binding the raw PDF on DocumentInput", async () => {
    mockUploadAsset.mockImplementation(({ onCompleted }) =>
      onCompleted?.({
        id: "bad-pdf",
        name: "broken.pdf",
        content_type: "application/pdf",
        get_url: "/api/storage/1/bad-pdf.pdf"
      })
    );
    mockImportDocument.mockRejectedValue(new Error("PDF is encrypted"));

    const { container } = renderWithTheme(
      <DocumentProperty {...(props as any)} />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(["%PDF-1.7"], "broken.pdf", { type: "application/pdf" })
    );

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          content: expect.stringContaining("PDF is encrypted")
        })
      );
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps ConstantDocument restricted to Markdown files", () => {
    const { container } = renderWithTheme(
      <DocumentProperty
        {...(props as any)}
        nodeType="nodetool.constant.Document"
      />
    );
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.accept).toBe(".md,.markdown,text/markdown");
  });
});
