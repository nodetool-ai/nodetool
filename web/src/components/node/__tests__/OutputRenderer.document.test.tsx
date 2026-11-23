/** @jsxImportSource @emotion/react */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";

const mockOpenForegroundTab = jest.fn();
const mockExportDocument = jest.fn();
let mockAsset: Asset | undefined;
let mockAssetUri: string | undefined;

jest.mock("../../../trpc/client", () => {
  const idle = { useQuery: () => ({ data: undefined, isLoading: false }) };
  return {
    trpc: {
      sketch: { get: idle },
      timeline: { get: idle },
      storage: { signUrl: idle }
    }
  };
});

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(
    selector: (state: {
      openForegroundTab: typeof mockOpenForegroundTab;
      activeProjectId: string | null;
    }) => T
  ) =>
    selector({
      openForegroundTab: mockOpenForegroundTab,
      activeProjectId: "project-1"
    }),
  LOOSE_PROJECT_ID: "default"
}));

jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ asset: mockAsset, uri: mockAssetUri })
}));

jest.mock("../../../serverState/useTextDocumentTransfer", () => ({
  useTextDocumentExport: () => ({
    exportDocument: mockExportDocument,
    exporting: null
  })
}));

import OutputRenderer from "../OutputRenderer";

const renderOutput = (
  value: unknown,
  options: { withRouter?: boolean; queryClient?: QueryClient } = {}
) => {
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
  const body = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <OutputRenderer value={value} showTextActions={false} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return render(
    options.withRouter ? (
      <MemoryRouter initialEntries={["/workspace"]}>{body}</MemoryRouter>
    ) : (
      body
    )
  );
};

describe("OutputRenderer documents", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockAsset = undefined;
    mockAssetUri = undefined;
    mockOpenForegroundTab.mockReset();
    mockExportDocument.mockReset();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders a project Markdown document directly inside the node with scroll isolation and doc commands", async () => {
    const assetId = "0123456789abcdef0123456789abcdef";
    mockAsset = stub<Asset>({
      id: assetId,
      name: "launch-plan.md",
      content_type: "text/markdown",
      project_id: "project-1",
      get_url: "/api/storage/1/launch-plan.md"
    });
    mockAssetUri = "/api/storage/1/launch-plan.md";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => "# Launch Plan\n\nShip **this week**.\n"
    });

    const { container } = renderOutput(
      {
        type: "document",
        asset_id: assetId,
        uri: `asset://${assetId}`
      },
      { withRouter: true }
    );

    await waitFor(() => {
      expect(
        container.querySelector(".doc-output-markdown")?.textContent
      ).toContain("# Launch Plan");
    });
    expect(
      container.querySelector(".doc-output-markdown")?.textContent
    ).toContain("Ship **this week**.");
    expect(screen.getByText("launch-plan.md")).toBeInTheDocument();

    // Scroll container stops wheel/drag/pan/scroll-key events from reaching ReactFlow.
    const scrollRegion = screen.getByRole("region", { name: "launch-plan.md" });
    expect(scrollRegion).toHaveClass("nodrag", "nopan", "nowheel");

    const parentWheel = jest.fn();
    const parentKeyDown = jest.fn();
    container.firstElementChild?.addEventListener("wheel", parentWheel);
    container.firstElementChild?.addEventListener("keydown", parentKeyDown);
    fireEvent.wheel(scrollRegion, { deltaY: 120 });
    fireEvent.keyDown(scrollRegion, { key: "PageDown" });
    expect(parentWheel).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();

    // Toggle Markdown source view.
    await userEvent.click(
      screen.getByRole("button", { name: "View Markdown source" })
    );
    expect(
      container.querySelector("pre.doc-output-source")?.textContent
    ).toBe("# Launch Plan\n\nShip **this week**.\n");

    await userEvent.click(
      screen.getByRole("button", { name: "View formatted document" })
    );
    expect(
      container.querySelector(".doc-output-markdown")?.textContent
    ).toContain("# Launch Plan");

    // Open in document editor tab.
    await userEvent.click(
      screen.getByRole("button", { name: "Open in document editor" })
    );
    expect(mockOpenForegroundTab).toHaveBeenCalledWith({
      type: "text",
      ref: assetId,
      mode: "edit",
      title: "launch-plan.md",
      projectId: "project-1"
    });

    // Export menu runs document export commands.
    await userEvent.click(
      screen.getByRole("button", { name: /export/i })
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /pdf/i }));
    expect(mockExportDocument).toHaveBeenCalledWith("pdf");
  });

  it("renders inline converted document text without requiring a router or network fetch", async () => {
    const { container } = renderOutput({
      type: "document",
      asset_id: "pdf-asset-1",
      uri: "asset://pdf-asset-1",
      name: "brief.pdf",
      data: null,
      text: "# Brief\n\nConverted from PDF.\n"
    });

    expect(
      container.querySelector(".doc-output-markdown")?.textContent
    ).toContain("Converted from PDF.");
    expect(global.fetch).not.toHaveBeenCalled();

    // Fullscreen reader opens with document content.
    await userEvent.click(screen.getByRole("button", { name: /fullscreen/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders inline UTF-8 document bytes directly", () => {
    const bytes = new TextEncoder().encode("## Notes\n\n- First item\n");
    const { container } = renderOutput({
      type: "document",
      uri: "",
      data: bytes
    });

    expect(
      container.querySelector(".doc-output-markdown")?.textContent
    ).toContain("## Notes");
    expect(
      container.querySelector(".doc-output-markdown")?.textContent
    ).toContain("First item");
  });

  it("renders a PDF iframe with header commands when the document is an unconverted PDF", () => {
    const pdfDataUrl = "data:application/pdf;base64,JVBERi0xLjc=";
    mockAsset = stub<Asset>({
      id: "pdf-2",
      name: "report.pdf",
      content_type: "application/pdf",
      get_url: pdfDataUrl
    });
    mockAssetUri = pdfDataUrl;

    renderOutput({
      type: "document",
      asset_id: "pdf-2",
      uri: "asset://pdf-2"
    });

    const iframe = screen.getByTitle("report.pdf");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", pdfDataUrl);
  });

  it("renders an error state when loading a remote document fails", async () => {
    mockAssetUri = "https://storage.example/missing.md";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404
    });

    renderOutput({
      type: "document",
      uri: "https://storage.example/missing.md"
    });

    await waitFor(() => {
      expect(screen.getByText("Could not load document")).toBeInTheDocument();
    });
  });
});
