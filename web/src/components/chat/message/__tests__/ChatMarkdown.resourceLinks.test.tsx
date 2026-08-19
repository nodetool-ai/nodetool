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

jest.mock("react-markdown", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const SAFE_SCHEME = /^(https?|mailto|irc|ircs|xmpp):/i;
  const defaultUrlTransform = (url: string): string => {
    const colon = url.indexOf(":");
    if (colon === -1 || SAFE_SCHEME.test(url)) return url;
    const questionMark = url.indexOf("?");
    const hash = url.indexOf("#");
    const slash = url.indexOf("/");
    const beforePath =
      (slash === -1 || colon < slash) &&
      (questionMark === -1 || colon < questionMark) &&
      (hash === -1 || colon < hash);
    return beforePath ? "" : url;
  };
  const LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
  const MockMarkdown = ({
    children,
    components,
    urlTransform
  }: {
    children?: string;
    components?: {
      a?: React.ComponentType<React.ComponentPropsWithoutRef<"a">>;
    };
    urlTransform?: (url: string) => string | null | undefined;
  }) => {
    const content = children ?? "";
    const Anchor = components?.a;
    const transform = urlTransform ?? defaultUrlTransform;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    LINK.lastIndex = 0;
    while ((match = LINK.exec(content)) !== null) {
      parts.push(content.slice(cursor, match.index));
      const href = transform(match[2]);
      parts.push(
        Anchor && href
          ? react.createElement(Anchor, { href, key: match.index }, match[1])
          : match[1]
      );
      cursor = match.index + match[0].length;
    }
    parts.push(content.slice(cursor));
    return react.createElement(react.Fragment, null, ...parts);
  };
  return { __esModule: true, default: MockMarkdown, defaultUrlTransform };
});

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: (kind: string) => kind !== "asset" && kind !== "collection" && kind !== "thread"
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

  it("renders an asset:// link as a non-navigable resource chip", () => {
    renderMarkdown("Rendered [the frame](asset://as_1).");

    expect(screen.getByText("the frame")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /the frame/ })).toBeNull();
    expect(screen.getByText("the frame").closest("a")).toBeNull();
  });

  it("leaves an https link as an anchor", () => {
    renderMarkdown("See [the docs](https://nodetool.ai/docs).");

    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("href", "https://nodetool.ai/docs");
  });
});
