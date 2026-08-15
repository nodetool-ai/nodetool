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
    kind !== "asset" && kind !== "collection" && kind !== "thread"
}));

import ChatMarkdown from "../ChatMarkdown";

const ASSET_URI = "asset://51f0fcd92a05488caf261eb22bbf98df.mp4";
const SIGNED_URL =
  "http://localhost:7777/api/storage/user-1/51f0fcd92a05488caf261eb22bbf98df.mp4?sig=test";

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown asset video", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders an asset:// mp4 markdown image as a video player", () => {
    mockUseQuery.mockReturnValue({ data: { url: SIGNED_URL } });

    const { container } = renderMarkdown(
      `![Beach Scene at Sunset](${ASSET_URI})`
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      { key: "51f0fcd92a05488caf261eb22bbf98df.mp4" },
      expect.objectContaining({ enabled: true })
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", SIGNED_URL);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("aria-label", "Beach Scene at Sunset");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an https mp4 markdown image as a video player", () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    const httpsUrl = "https://cdn.example.com/clip.mp4";
    const { container } = renderMarkdown(`![](${httpsUrl})`);

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", httpsUrl);
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an asset:// audio markdown image as an audio player", () => {
    const audioUri = "asset://abc123.mp3";
    const signedAudio =
      "http://localhost:7777/api/storage/user-1/abc123.mp3?sig=test";
    mockUseQuery.mockReturnValue({ data: { url: signedAudio } });

    const { container } = renderMarkdown(`![Narration](${audioUri})`);

    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio).not.toBeNull();
    expect(audio).toHaveAttribute("src", signedAudio);
    expect(audio).toHaveAttribute("aria-label", "Narration");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });
});
