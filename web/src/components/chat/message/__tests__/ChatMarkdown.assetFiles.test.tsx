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

/**
 * react-markdown is ESM-only; this mock handles markdown images `![](src)`
 * and links `[label](href)` and forwards them to `components.img` / `components.a`.
 */
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
  const TOKEN = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)/g;
  const MockMarkdown = ({
    children,
    components,
    urlTransform
  }: {
    children?: string;
    components?: {
      img?: React.ComponentType<{ src?: string; alt?: string }>;
      a?: React.ComponentType<React.ComponentPropsWithoutRef<"a">>;
    };
    urlTransform?: (url: string) => string | null | undefined;
  }) => {
    const content = children ?? "";
    const transform = urlTransform ?? defaultUrlTransform;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    TOKEN.lastIndex = 0;
    while ((match = TOKEN.exec(content)) !== null) {
      parts.push(content.slice(cursor, match.index));
      if (match[1] !== undefined && match[2] !== undefined) {
        const alt = match[1];
        const rawSrc = match[2];
        const src = transform(rawSrc) ?? "";
        if (src && components?.img) {
          parts.push(
            react.createElement(components.img, {
              key: match.index,
              src,
              alt
            })
          );
        } else if (src) {
          parts.push(react.createElement("img", { key: match.index, src, alt }));
        }
      } else if (match[3] !== undefined && match[4] !== undefined) {
        const label = match[3];
        const rawHref = match[4];
        const href = transform(rawHref) ?? "";
        if (href && components?.a) {
          parts.push(
            react.createElement(components.a, { key: match.index, href }, label)
          );
        } else {
          parts.push(label);
        }
      }
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
