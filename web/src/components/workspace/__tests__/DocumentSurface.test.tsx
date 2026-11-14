import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../../stores/WorkspaceTabsStore";
import { installGlobal, removeGlobal, stub } from "../../../test-utils/doubles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const assetId = "0123456789abcdef0123456789abcdef";
let mockAsset: Asset | undefined;
let mockUri: string | undefined;
let mockPending = false;
const mockUseAsset = jest.fn();

jest.mock("../../../serverState/useAsset", () => ({
  useAsset: (input: unknown) => {
    mockUseAsset(input);
    return { asset: mockAsset, uri: mockUri };
  }
}));
jest.mock("../../../serverState/useAssetById", () => ({
  useAssetById: () => ({ isPending: mockPending, refetch: jest.fn() })
}));
jest.mock("../../../hooks/assets/useAssetDownload", () => ({
  useAssetDownload: () => ({ handleDownload: jest.fn() })
}));
jest.mock("../documentBarParts", () => ({
  WithDocumentBar: ({ children }: { children: ReactNode }) => <>{children}</>
}));
jest.mock("../DocumentLoadStatus", () => ({
  __esModule: true,
  default: ({ state }: { state: string }) => <div>{state}</div>
}));
jest.mock("../../asset_viewer/LazyPDFViewer", () => ({
  __esModule: true,
  default: ({ url }: { url: string }) => (
    <div role="document" aria-label={url} />
  )
}));

import DocumentSurface from "../DocumentSurface";

const renderDocument = (ref = `asset://${assetId}`) => {
  const tab: WorkspaceTab = {
    id: `document:${ref}`,
    type: "document",
    ref,
    title: "Report",
    mode: "view"
  };
  useWorkspaceTabsStore.setState({ tabs: [tab], activeTabId: tab.id });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <DocumentSurface tab={tab} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  const rendered = render(view());
  return { ...rendered, refresh: () => rendered.rerender(view()) };
};

beforeEach(() => {
  installGlobal("fetch", jest.fn());
  mockAsset = undefined;
  mockUri = undefined;
  mockPending = false;
  mockUseAsset.mockClear();
});

afterEach(() => removeGlobal("fetch"));

it("resolves the durable asset locator before previewing a PDF", () => {
  mockAsset = stub<Asset>({
    id: assetId,
    name: "report.pdf",
    content_type: "application/pdf"
  });
  mockUri = "https://storage.example/report.pdf?signed=fresh";
  renderDocument();
  expect(mockUseAsset).toHaveBeenCalledWith({
    document: { type: "document", uri: `asset://${assetId}` }
  });
  expect(screen.getByRole("document", { name: mockUri })).toBeInTheDocument();
  expect(useWorkspaceTabsStore.getState().tabs[0].title).toBe("report.pdf");
});

it("leaves the name of an unpreviewable document to the document bar", () => {
  mockAsset = stub<Asset>({
    id: assetId,
    name: "Budget review.docx",
    content_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  mockUri = "https://storage.example/budget.docx";
  renderDocument();
  expect(screen.getByText("No preview for this format")).toBeInTheDocument();
  expect(screen.queryByText("Budget review.docx")).not.toBeInTheDocument();
});

it("updates the tab filename when asset metadata arrives after opening", () => {
  mockPending = true;
  const { refresh } = renderDocument();
  mockAsset = stub<Asset>({
    id: assetId,
    name: "Quarterly report.pdf",
    content_type: "application/pdf"
  });
  mockUri = "https://storage.example/report.pdf";
  mockPending = false;
  refresh();
  expect(useWorkspaceTabsStore.getState().tabs[0].title).toBe(
    "Quarterly report.pdf"
  );
});

it("uses the decoded URL filename without its query string for external documents", () => {
  mockUri = "https://example.com/Quarterly%20report.pdf?signature=private";
  renderDocument(mockUri);
  expect(useWorkspaceTabsStore.getState().tabs[0].title).toBe(
    "Quarterly report.pdf"
  );
});

it("previews external PDFs with query strings inside the tab", () => {
  mockUri = "https://example.com/report.pdf?download=1";
  renderDocument(mockUri);
  expect(screen.getByRole("document", { name: mockUri })).toBeInTheDocument();
});

it("shows loading while the document asset is being resolved", () => {
  mockPending = true;
  renderDocument();
  expect(screen.getByText("loading")).toBeInTheDocument();
});

it.each(["csv", "tsv"])(
  "previews an uploaded %s in a document tab after metadata loads",
  async (extension) => {
    mockAsset = stub<Asset>({
      id: assetId,
      name: `report.${extension}`,
      content_type: "application/octet-stream"
    });
    mockUri = `https://storage.example/report.${extension}`;
    const delimiter = extension === "tsv" ? "\t" : ",";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      stub<Response>({
        ok: true,
        text: async () => `name${delimiter}amount\nApples${delimiter}12`
      })
    );
    try {
      renderDocument();
      expect(
        await screen.findByRole("columnheader", { name: "amount" })
      ).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "Apples" })).toBeInTheDocument();
      expect(
        screen.queryByText("No preview for this format")
      ).not.toBeInTheDocument();
    } finally {
      fetchSpy.mockRestore();
    }
  }
);

it("previews a direct CSV URL with a query string", async () => {
  mockUri = "https://example.com/report.CSV?download=1";
  const fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      stub<Response>({ ok: true, text: async () => "name,amount\nApples,12" })
    );
  try {
    renderDocument(mockUri);
    expect(
      await screen.findByRole("cell", { name: "Apples" })
    ).toBeInTheDocument();
  } finally {
    fetchSpy.mockRestore();
  }
});

it("shows a load error when the document cannot be resolved", () => {
  renderDocument();
  expect(screen.getByText("error")).toBeInTheDocument();
});

it("recognizes CSV by MIME type when the asset has no extension", async () => {
  mockAsset = stub<Asset>({
    id: assetId,
    name: "Report",
    content_type: "text/csv"
  });
  mockUri = "https://storage.example/download";
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      stub<Response>({ ok: true, text: async () => "name,amount\nApples,12" })
    );
  renderDocument();
  expect(
    await screen.findByRole("cell", { name: "Apples" })
  ).toBeInTheDocument();
});

it("shows a load failure when fetching the CSV fails", async () => {
  mockUri = "https://example.com/report.csv";
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(stub<Response>({ ok: false, status: 500 }));
  renderDocument(mockUri);
  expect(
    await screen.findByText("Could not load the table. Try again.")
  ).toBeInTheDocument();
});

it("offers a download for formats without an embedded preview", () => {
  mockAsset = stub<Asset>({
    id: assetId,
    name: "report.docx",
    content_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  mockUri = "https://storage.example/report.docx";
  renderDocument();
  expect(
    screen.getByRole("button", { name: "Download document" })
  ).toBeInTheDocument();
  expect(screen.queryByRole("document")).not.toBeInTheDocument();
});
