import { describe, expect, it } from "vitest";
import {
  BaseUrlLibNode,
  ExtractLinksLibNode,
  ExtractImagesLibNode,
  ExtractAudioLibNode,
  ExtractVideosLibNode,
  ExtractMetadataLibNode,
  HTMLToTextLibNode,
  WebsiteContentExtractorLibNode,
  ConvertToMarkdownLibNode,
  ChartRendererLibNode
} from "../src/index.js";

const SAMPLE_HTML = `<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page for extraction">
  <meta name="keywords" content="test, html, extraction">
</head>
<body>
  <a href="https://example.com">Example Link</a>
  <a href="/about">About</a>
  <a href="https://external.com/page">External</a>
  <img src="img.png" alt="Logo"/>
  <img src="https://cdn.example.com/photo.jpg" alt="Photo"/>
  <audio src="song.mp3"></audio>
  <audio><source src="https://cdn.example.com/track.ogg"/></audio>
  <video src="clip.mp4"></video>
  <video><source src="https://cdn.example.com/movie.webm"/></video>
  <iframe src="https://youtube.com/embed/abc"></iframe>
  <p>Hello <b>World</b></p>
</body>
</html>`;

const BASE_URL = "https://example.com";

// ── lib.html ──────────────────────────────────────────────

describe("lib.html.BaseUrl", () => {
  it("extracts protocol and host from a URL", async () => {
    const result = await new BaseUrlLibNode({
      url: "https://example.com/path/to/page?q=1"
    }).process();
    expect(result).toEqual({ output: "https://example.com" });
  });

  it("handles URLs with ports", async () => {
    const result = await new BaseUrlLibNode({
      url: "http://localhost:3000/api"
    }).process();
    expect(result).toEqual({ output: "http://localhost:3000" });
  });

  it("throws on empty URL", async () => {
    await expect(new BaseUrlLibNode({ url: "" }).process()).rejects.toThrow();
  });
});

describe("lib.html.ExtractLinks", () => {
  it("extracts links with text and type classification", async () => {
    const result = await new ExtractLinksLibNode({
      html: SAMPLE_HTML,
      base_url: BASE_URL
    }).process();
    const links = result.links as Array<{
      href: string;
      text: string;
      type: string;
    }>;
    expect(links).toHaveLength(3);

    // First link is internal (starts with base_url)
    expect(links[0]).toEqual({
      href: "https://example.com",
      text: "Example Link",
      type: "internal"
    });
    // Second link is internal (starts with /)
    expect(links[1]).toEqual({
      href: "/about",
      text: "About",
      type: "internal"
    });
    // Third link is external
    expect(links[2]).toEqual({
      href: "https://external.com/page",
      text: "External",
      type: "external"
    });
  });
});

describe("lib.html.ExtractImages", () => {
  it("extracts image sources resolved against base URL", async () => {
    const result = await new ExtractImagesLibNode({
      html: SAMPLE_HTML,
      base_url: BASE_URL
    }).process();
    const images = result.images as Array<{ uri: string; type: string }>;
    expect(images).toHaveLength(2);
    expect(images[0]).toEqual({
      uri: "https://example.com/img.png",
      type: "image"
    });
    expect(images[1]).toEqual({
      uri: "https://cdn.example.com/photo.jpg",
      type: "image"
    });
  });
});

describe("lib.html.ExtractAudio", () => {
  it("extracts audio sources from audio and source tags", async () => {
    const result = await new ExtractAudioLibNode({
      html: SAMPLE_HTML,
      base_url: BASE_URL
    }).process();
    const audios = result.audios as Array<{ uri: string; type: string }>;
    expect(audios).toHaveLength(2);
    expect(audios[0]).toEqual({
      uri: "https://example.com/song.mp3",
      type: "audio"
    });
    expect(audios[1]).toEqual({
      uri: "https://cdn.example.com/track.ogg",
      type: "audio"
    });
  });
});

describe("lib.html.ExtractVideos", () => {
  it("extracts video sources from video, source, and iframe tags", async () => {
    const result = await new ExtractVideosLibNode({
      html: SAMPLE_HTML,
      base_url: BASE_URL
    }).process();
    const videos = result.videos as Array<{ uri: string; type: string }>;
    expect(videos).toHaveLength(3);
    expect(videos[0]).toEqual({
      uri: "https://example.com/clip.mp4",
      type: "video"
    });
    expect(videos[1]).toEqual({
      uri: "https://cdn.example.com/movie.webm",
      type: "video"
    });
    expect(videos[2]).toEqual({
      uri: "https://youtube.com/embed/abc",
      type: "video"
    });
  });
});

describe("lib.html.ExtractMetadata", () => {
  it("extracts title, description, and keywords", async () => {
    const result = await new ExtractMetadataLibNode({
      html: SAMPLE_HTML
    }).process();
    expect(result.title).toBe("Test Page");
    expect(result.description).toBe("A test page for extraction");
    expect(result.keywords).toBe("test, html, extraction");
  });

  it("returns null for missing metadata", async () => {
    const result = await new ExtractMetadataLibNode({
      html: "<html><body>No meta</body></html>"
    }).process();
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.keywords).toBeNull();
  });
});

describe("lib.html.HTMLToText", () => {
  it("converts HTML to plain text", async () => {
    const result = await new HTMLToTextLibNode({
      text: "<p>Hello <b>World</b></p><p>Second paragraph</p>"
    }).process();
    const output = String(result.output);
    expect(output).toContain("Hello World");
    expect(output).toContain("Second paragraph");
  });

  it("strips tags from complex HTML", async () => {
    const result = await new HTMLToTextLibNode({
      text: "<div><h1>Title</h1><ul><li>Item 1</li><li>Item 2</li></ul></div>"
    }).process();
    const output = String(result.output);
    expect(output.toUpperCase()).toContain("TITLE");
    expect(output).toContain("Item 1");
    expect(output).toContain("Item 2");
  });
});

describe("lib.html.WebsiteContentExtractor", () => {
  it("extracts main content from article HTML", async () => {
    const html = `<html><head><title>Article</title></head><body>
      <nav>Navigation</nav>
      <article><h1>Main Article</h1><p>This is the main content of the page.</p></article>
      <footer>Footer info</footer>
    </body></html>`;
    const result = await new WebsiteContentExtractorLibNode({
      html_content: html
    }).process();
    const output = String(result.output);
    expect(output).toContain("Main Article");
    expect(output).toContain("main content");
  });
});

// ── lib.convert ─────────────────────────────────────────────────

describe("lib.convert.ConvertToMarkdown", () => {
  it("converts HTML data to markdown", async () => {
    const result = await new ConvertToMarkdownLibNode({
      document: {
        uri: "",
        data: "<h1>Hello</h1><p>World with <strong>bold</strong> text</p>"
      }
    }).process();
    const output = result.output as { type: string; uri: string; data: string };
    expect(output.type).toBe("document");
    expect(output.data).toContain("Hello");
    expect(output.data).toContain("**bold**");
  });

  it("returns plain text data as-is", async () => {
    const result = await new ConvertToMarkdownLibNode({
      document: { uri: "", data: "Just plain text, no HTML." }
    }).process();
    const output = result.output as { type: string; data: string };
    expect(output.data).toBe("Just plain text, no HTML.");
  });

  it("throws when no input is provided", async () => {
    await expect(
      new ConvertToMarkdownLibNode({
        document: null
      }).process()
    ).rejects.toThrow("Input is required");
  });
});

// ── lib.seaborn (ChartRenderer) ────────────────────────────────────

let hasCanvas = false;
try {
  require("canvas");
  hasCanvas = true;
} catch {
  /* not installed */
}

describe.skipIf(!hasCanvas)("lib.seaborn.ChartRenderer", () => {
  it("renders a bar chart and returns base64 image data", async () => {
    const result = await new ChartRendererLibNode({
      chart_config: {
        title: "Sales by Month",
        x_label: "Month",
        y_label: "Sales",
        data: {
          series: [{ x: "month", y: "sales", plot_type: "barplot" }]
        }
      },
      width: 400,
      height: 300,
      data: {
        columns: [
          { name: "month", data_type: "string" },
          { name: "sales", data_type: "float" }
        ],
        data: [
          ["Jan", 100],
          ["Feb", 200],
          ["Mar", 150]
        ]
      }
    }).process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("image");
    expect(typeof output.data).toBe("string");
    expect(output.data.length).toBeGreaterThan(100);
    // Verify it's valid base64 by decoding it
    const buf = Buffer.from(output.data, "base64");
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x4e); // 'N'
    expect(buf[3]).toBe(0x47); // 'G'
  }, 15000);

  it("throws when data has no rows", async () => {
    await expect(
      new ChartRendererLibNode({
        chart_config: {
          title: "Empty",
          data: { series: [{ x: "x", y: "y", plot_type: "line" }] }
        },
        data: {
          columns: [{ name: "x" }, { name: "y" }],
          data: []
        }
      }).process()
    ).rejects.toThrow("Data is required");
  });

  it("renders a line chart", async () => {
    const result = await new ChartRendererLibNode({
      chart_config: {
        title: "Temperature",
        data: {
          series: [{ x: "day", y: "temp", plot_type: "line" }]
        }
      },
      width: 300,
      height: 200,
      data: {
        columns: [
          { name: "day", data_type: "string" },
          { name: "temp", data_type: "float" }
        ],
        data: [
          ["Mon", 20],
          ["Tue", 22],
          ["Wed", 19]
        ]
      }
    }).process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("image");
    expect(output.data.length).toBeGreaterThan(100);
  }, 15000);
});
