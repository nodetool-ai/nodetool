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

// `asset://` locators resolve through the asset record, not signUrl.
jest.mock("../../../../hooks/useResolvedMediaUri");
import { mockAssetUrl } from "../../../../hooks/__mocks__/useResolvedMediaUri";

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
  // Match either image `![alt](src)` or link `[label](href)`
  const TOKEN = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)/g;
  const MockMarkdown = ({
    children,
    components,
    urlTransform
  }: {
    children?: string;
    components?: {
      img?: React.ComponentType<React.ComponentProps<"img">>;
      a?: React.ComponentType<React.ComponentProps<"a">>;
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
        // Image
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
  canOpenResource: (kind: string) => kind !== "asset" && kind !== "collection" && kind !== "thread"
}));

// Import after mocks
import ChatMarkdown from "../ChatMarkdown";

const ASSET_ID = "775ac6fedf9e4c9db271148c6e853b4d";
const ASSET_URI = `asset://${ASSET_ID}.png`;
const ASSET_URI_NO_EXT = `asset://${ASSET_ID}`;
const RESOLVED_URL = mockAssetUrl(`${ASSET_ID}.png`);
const RESOLVED_URL_NO_EXT = mockAssetUrl(ASSET_ID);

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown asset image", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves asset:// image through the asset record, not signUrl", () => {
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(`![](${ASSET_URI})`);

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", RESOLVED_URL);
    expect(img.getAttribute("src")).not.toBe(
      "/api/storage/775ac6fedf9e4c9db271148c6e853b4d.png"
    );
    // signUrl is the storage-key path; an asset:// locator is an id, not a key.
    expect(mockUseQuery).not.toHaveBeenCalledWith(
      { key: "775ac6fedf9e4c9db271148c6e853b4d.png" },
      expect.anything()
    );
  });

  it("resolves an extensionless asset:// locator the save API emits", () => {
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(
      `![Magalu Virtual Avatar 1](${ASSET_URI_NO_EXT})`
    );

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", RESOLVED_URL_NO_EXT);
    expect(img).toHaveAttribute("alt", "Magalu Virtual Avatar 1");
    // The save API returns asset://<id> with no extension. Signing that string
    // as a storage key 404s — the bytes live at <user>/<id>.<ext>.
    expect(mockUseQuery).not.toHaveBeenCalledWith(
      { key: ASSET_ID },
      expect.anything()
    );
  });

  it("does not use signed URL for ordinary https images", async () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    const httpsUrl = "https://example.com/photo.jpg";
    const { container } = renderMarkdown(`![](${httpsUrl})`);

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", httpsUrl);
    // signUrl should be disabled for https (no key)
    const { calls } = mockUseQuery.mock;
    // At least one call should have enabled: false
    expect(calls.some(([, opts]) => opts && opts.enabled === false)).toBe(true);
  });

  it("renders https image link without signed URL indirection", async () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    const httpsUrl = "https://example.com/photo.png";
    const { container } = renderMarkdown(`[photo](${httpsUrl})`);

    // This is not an asset://, so it should not be a resource chip and should use direct href
    // The component renders an anchor wrapping an img for image hrefs
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", httpsUrl);
  });
});
