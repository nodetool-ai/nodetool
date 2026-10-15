import React from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const mockUseQuery = jest.fn();

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storage: {
      signUrl: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args)
      }
    }
  }
}));

jest.mock("../../../../hooks/useResolvedMediaUri", () =>
  jest.requireActual("../../../../hooks/__mocks__/useResolvedMediaUri")
);
import {
  mockAssetUrl,
  resetMockAssetContentTypes
} from "../../../../hooks/__mocks__/useResolvedMediaUri";
import { fireEvent, screen } from "@testing-library/react";

// The map the component sees: `jest.mock` above swapped the module the
// component imports, and reaching the manual mock by its own path hands this
// suite a second copy of it.
const { mockAssetContentTypes } = jest.requireMock(
  "../../../../hooks/useResolvedMediaUri"
) as typeof import("../../../../hooks/__mocks__/useResolvedMediaUri");

jest.mock("react-markdown", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../__mocks__/linkedMarkdownMock")
}));

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: (kind: string) =>
    kind !== "collection" && kind !== "thread"
}));

import ChatMarkdown from "../ChatMarkdown";
import { openResource } from "../../../../lib/chat/openResource";
import { mockAssetThumbUrl } from "../../../../hooks/__mocks__/useResolvedMediaUri";

const { mockAssetWithoutThumbnail } = jest.requireMock(
  "../../../../hooks/useResolvedMediaUri"
) as typeof import("../../../../hooks/__mocks__/useResolvedMediaUri");

const ASSET_ID = "3b9f0c2e7d4a41c6a8e5f1d2c3b4a596";

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown document and file assets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockAssetContentTypes();
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  const expectPdfPreview = (locator: string): void => {
    const id = locator.slice("asset://".length);
    const page = screen.getByAltText("First page of Report");
    expect(page).toHaveAttribute("src", mockAssetThumbUrl(ASSET_ID));
    expect(page.closest("a")).toHaveAttribute("href", mockAssetUrl(id));

    fireEvent.click(screen.getByRole("button", { name: /Report/ }));
    expect(openResource).toHaveBeenCalledWith({ kind: "asset", id });
  };

  it("previews a PDF link by its first page", () => {
    renderMarkdown(`[Report](asset://${ASSET_ID}.pdf)`);
    expectPdfPreview(`asset://${ASSET_ID}.pdf`);
  });

  it("previews a PDF embedded with image syntax instead of a broken image", () => {
    renderMarkdown(`![Report](asset://${ASSET_ID}.pdf)`);
    expectPdfPreview(`asset://${ASSET_ID}.pdf`);
  });

  it("types an extension-less asset by its PDF content type", () => {
    mockAssetContentTypes.set(ASSET_ID, "application/pdf");
    renderMarkdown(`[Report](asset://${ASSET_ID})`);
    expectPdfPreview(`asset://${ASSET_ID}`);
  });

  it("shows only the chip for a PDF without a thumbnail", () => {
    mockAssetWithoutThumbnail(ASSET_ID);
    const { container } = renderMarkdown(`[Report](asset://${ASSET_ID}.pdf)`);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: /Report/ })).toBeInTheDocument();
  });

  it("links a non-media file embedded with image syntax", () => {
    const { container } = renderMarkdown(`![Scenes](asset://${ASSET_ID}.zip)`);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: /Scenes/ })).toBeInTheDocument();
  });

  it("links an extension-less asset whose content type is not media", () => {
    mockAssetContentTypes.set(ASSET_ID, "text/csv");
    const { container } = renderMarkdown(`![Shots](asset://${ASSET_ID})`);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: /Shots/ })).toBeInTheDocument();
  });
});
