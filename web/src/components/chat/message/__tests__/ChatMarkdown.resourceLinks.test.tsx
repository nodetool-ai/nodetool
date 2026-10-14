import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ChatMarkdown from "../ChatMarkdown";
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

/**
 * react-markdown is ESM-only and globally mocked as a passthrough, which would
 * never reach the `a` override. This stand-in does the one thing the branch
 * under test needs: split `[label](href)` links out of the text, sanitize the
 * href through `urlTransform` the way react-markdown does, and hand what
 * survives to `components.a`.
 */
// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../../hooks/useResolvedMediaUri");

jest.mock("react-markdown", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../__mocks__/linkedMarkdownMock")
}));

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: (kind: string) => kind !== "collection" && kind !== "thread"
}));

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown resource links", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  it("renders a resource link as a chip", () => {
    renderMarkdown("Added [Beach intro](storyboard://sb_1) to the board.");

    const chip = screen.getByRole("button", { name: /Beach intro/ });
    expect(chip).toBeInTheDocument();
    expect(chip.closest("a")).toBeNull();
  });

  it("renders an asset:// link as a chip that opens the asset", () => {
    renderMarkdown("Rendered [the frame](asset://as_1).");

    const chip = screen.getByRole("button", { name: /the frame/ });
    expect(chip.closest("a")).toBeNull();
  });

  it("renders game and JS script links as chips", () => {
    renderMarkdown("Built [Cave run](game://g_1) with [the spawner](jsscript://js_1).");

    expect(screen.getByRole("button", { name: /Cave run/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /the spawner/ })).toBeInTheDocument();
  });

  it("leaves an https link as an anchor", () => {
    renderMarkdown("See [the docs](https://nodetool.ai/docs).");

    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("href", "https://nodetool.ai/docs");
  });
});
