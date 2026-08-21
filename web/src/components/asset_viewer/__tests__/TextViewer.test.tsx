import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import TextViewer from "../TextViewer";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";

jest.mock("../../../utils/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  )
}));

const renderViewer = (asset: Asset) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <TextViewer asset={asset} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const textAsset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: "a1",
    name: "notes.md",
    content_type: "text/markdown",
    get_url: "https://example.test/notes.md",
    ...overrides
  }) as Asset;

describe("TextViewer", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders markdown assets through MarkdownRenderer", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "# Title\n\nHello **world**."
    }) as unknown as typeof fetch;

    renderViewer(textAsset());

    await waitFor(() => {
      expect(screen.getByTestId("markdown-renderer")).toHaveTextContent(
        "# Title"
      );
    });
    expect(screen.queryByText("# Title", { selector: "pre" })).not.toBeInTheDocument();
  });

  it("renders plain text assets as preformatted text", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "just text"
    }) as unknown as typeof fetch;

    renderViewer(
      textAsset({
        name: "notes.txt",
        content_type: "text/plain",
        get_url: "https://example.test/notes.txt"
      })
    );

    await waitFor(() => {
      expect(screen.getByText("just text")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("markdown-renderer")).not.toBeInTheDocument();
  });
});
