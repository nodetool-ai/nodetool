import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const mockSketchGet = jest.fn();
const mockTimelineGet = jest.fn();
const mockSignUrl = jest.fn();

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../../hooks/useResolvedMediaUri");

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    sketch: {
      get: { useQuery: (...args: unknown[]) => mockSketchGet(...args) }
    },
    timeline: {
      get: { useQuery: (...args: unknown[]) => mockTimelineGet(...args) }
    },
    storage: {
      signUrl: { useQuery: (...args: unknown[]) => mockSignUrl(...args) }
    }
  }
}));

jest.mock("../../../sketch/SketchRenderer", () => ({
  __esModule: true,
  default: () => <div data-testid="sketch-renderer" />
}));

jest.mock("../../../timeline/TimelineRenderer", () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-renderer" />
}));

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: () => true
}));

/**
 * react-markdown is ESM-only; this mock handles markdown images `![](src)`
 * and links `[label](href)` and forwards them to `components.img` /
 * `components.a`, sanitizing through `urlTransform` the way the real one does.
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
        const src = transform(match[2]) ?? "";
        if (src && components?.img) {
          parts.push(
            react.createElement(components.img, {
              key: match.index,
              src,
              alt: match[1]
            })
          );
        }
      } else if (match[3] !== undefined && match[4] !== undefined) {
        const href = transform(match[4]) ?? "";
        if (href && components?.a) {
          parts.push(
            react.createElement(
              components.a,
              { href, key: match.index },
              match[3]
            )
          );
        }
      }
      cursor = match.index + match[0].length;
    }
    parts.push(content.slice(cursor));
    return react.createElement(react.Fragment, null, ...parts);
  };
  return { __esModule: true, default: MockMarkdown, defaultUrlTransform };
});

// Import after mocks
import ChatMarkdown from "../ChatMarkdown";

const idleQuery = { data: undefined, isLoading: false, isError: false };

const SKETCH_DOCUMENT = {
  canvas: { width: 512, height: 512 },
  layers: [],
  activeLayerId: "layer-1"
};

const TIMELINE_SEQUENCE = {
  id: "tl_1",
  name: "Cut",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 4000,
  tracks: [],
  clips: [],
  markers: []
};

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown inline document previews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSketchGet.mockReturnValue(idleQuery);
    mockTimelineGet.mockReturnValue(idleQuery);
    mockSignUrl.mockReturnValue({ data: undefined });
  });

  it("renders an embedded sketch as an inline preview", async () => {
    mockSketchGet.mockReturnValue({
      data: { id: "sk_1", document: { sketch: SKETCH_DOCUMENT } },
      isLoading: false,
      isError: false
    });

    renderMarkdown("![Poster draft](sketch://sk_1)");

    expect(mockSketchGet).toHaveBeenCalledWith(
      { id: "sk_1" },
      expect.objectContaining({ staleTime: 30_000 })
    );
    expect(await screen.findByTestId("sketch-renderer")).toBeInTheDocument();
    // The open-in-editor chip carries the label.
    expect(screen.getByText("Poster draft")).toBeInTheDocument();
  });

  it("renders an embedded timeline as an inline preview", async () => {
    mockTimelineGet.mockReturnValue({
      data: TIMELINE_SEQUENCE,
      isLoading: false,
      isError: false
    });

    renderMarkdown("![First cut](timeline://tl_1)");

    expect(mockTimelineGet).toHaveBeenCalledWith(
      { id: "tl_1" },
      expect.objectContaining({ staleTime: 30_000 })
    );
    expect(await screen.findByTestId("timeline-renderer")).toBeInTheDocument();
    expect(screen.getByText("First cut")).toBeInTheDocument();
  });

  it("keeps a plain sketch link as a chip, not a preview", () => {
    renderMarkdown("Edited [the poster](sketch://sk_1).");

    expect(screen.getByText("the poster")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-resource-preview")).toBeNull();
    expect(mockSketchGet).not.toHaveBeenCalled();
  });

  it("still renders asset:// images as plain images", () => {
    mockSignUrl.mockReturnValue({ data: { url: "http://x/signed.png" } });
    const { container } = renderMarkdown("![](asset://abc.png)");

    expect(screen.queryByTestId("inline-resource-preview")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "http://x/signed.png"
    );
  });

  it("degrades to the chip when the document fails to load", () => {
    mockSketchGet.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "not found" }
    });

    renderMarkdown("![Poster draft](sketch://sk_1)");

    expect(screen.queryByTestId("sketch-renderer")).toBeNull();
    expect(screen.getByText("Could not load this sketch.")).toBeInTheDocument();
    expect(screen.getByText("Poster draft")).toBeInTheDocument();
  });
});
