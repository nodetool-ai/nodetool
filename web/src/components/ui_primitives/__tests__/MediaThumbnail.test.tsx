import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  MediaThumbnail,
  mediaKindFromContentType
} from "../MediaThumbnail";

jest.mock("../../../hooks/useResolvedMediaUri", () => ({
  useResolvedMedia: (locator: unknown) => ({
    url: typeof locator === "string" ? locator : undefined,
    thumbUrl: undefined,
    contentType: undefined,
    pending: false
  }),
  useResolvedMediaUri: (locator: unknown) =>
    typeof locator === "string" ? locator : undefined,
  useResolvedThumbnailUri: (locator: unknown) =>
    typeof locator === "string" ? locator : undefined
}));

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("mediaKindFromContentType", () => {
  it("maps MIME prefixes to a renderer family", () => {
    expect(mediaKindFromContentType("image/png")).toBe("image");
    expect(mediaKindFromContentType("video/mp4")).toBe("video");
    expect(mediaKindFromContentType("audio/wav")).toBe("audio");
    expect(mediaKindFromContentType("application/pdf")).toBe("other");
    expect(mediaKindFromContentType(undefined)).toBe("other");
  });
});

describe("MediaThumbnail", () => {
  it("renders an image asset from its thumbnail URL", () => {
    wrap(
      <MediaThumbnail
        alt="Cat"
        asset={{
          content_type: "image/png",
          thumb_url: "https://x/thumb.jpg",
          get_url: "https://x/full.png"
        }}
      />
    );
    expect(screen.getByAltText("Cat")).toHaveAttribute(
      "src",
      "https://x/thumb.jpg"
    );
  });

  it("falls back to the full URL when an image has no thumbnail", () => {
    wrap(
      <MediaThumbnail
        alt="Cat"
        asset={{ content_type: "image/png", get_url: "https://x/full.png" }}
      />
    );
    expect(screen.getByAltText("Cat")).toHaveAttribute(
      "src",
      "https://x/full.png"
    );
  });

  it("shows a video poster, never the video file as an image", () => {
    wrap(
      <MediaThumbnail
        alt="Clip"
        asset={{
          content_type: "video/mp4",
          thumb_url: "https://x/poster.jpg",
          get_url: "https://x/clip.mp4"
        }}
      />
    );
    expect(screen.getByAltText("Clip")).toHaveAttribute(
      "src",
      "https://x/poster.jpg"
    );
  });

  it("falls back to an icon tile for a video without a poster", () => {
    wrap(
      <MediaThumbnail
        alt="Clip"
        asset={{ content_type: "video/mp4", get_url: "https://x/clip.mp4" }}
      />
    );
    expect(screen.getByRole("img", { name: "Clip" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("uses an icon for audio unless interactive", () => {
    const { container, rerender } = wrap(
      <MediaThumbnail
        alt="Take"
        asset={{ content_type: "audio/wav", get_url: "https://x/a.wav" }}
      />
    );
    expect(container.querySelector("audio")).toBeNull();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <MediaThumbnail
          interactive
          alt="Take"
          asset={{ content_type: "audio/wav", get_url: "https://x/a.wav" }}
        />
      </ThemeProvider>
    );
    expect(container.querySelector("audio")).toHaveAttribute(
      "src",
      "https://x/a.wav"
    );
  });

  it("falls back to the file icon for other types", () => {
    wrap(
      <MediaThumbnail
        alt="Report"
        asset={{ content_type: "application/pdf" }}
        icon={<span>PDF</span>}
      />
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders a locator through the resolving image", () => {
    wrap(
      <MediaThumbnail alt="Ref" locator="https://x/y.png" kind="image" />
    );
    expect(screen.getByAltText("Ref")).toHaveAttribute("src", "https://x/y.png");
  });

  it("keeps the aspect ratio and renders label and actions slots", () => {
    const { container } = wrap(
      <MediaThumbnail
        alt="Cat"
        aspectRatio="16/9"
        asset={{ content_type: "image/png", get_url: "https://x/a.png" }}
        label={<span>Caption</span>}
        actions={<button type="button">Remove</button>}
      />
    );
    expect(screen.getByText("Caption")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ aspectRatio: "16/9" });
  });
});
