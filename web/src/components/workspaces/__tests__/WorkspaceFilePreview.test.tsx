import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import WorkspaceFilePreview, { mediaKindOf } from "../WorkspaceFilePreview";

const assetsList = jest.fn();
const documentByFile = jest.fn();
const projectGet = jest.fn();
const fileThumbnail = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: { list: { query: (input: unknown) => assetsList(input) } },
    projects: {
      documentByFile: { query: (input: unknown) => documentByFile(input) },
      get: { query: (input: unknown) => projectGet(input) },
      fileThumbnail: { query: (input: unknown) => fileThumbnail(input) }
    }
  }
}));

// The media primitives resolve locators over the network; record the props.
jest.mock("../../ui_primitives", () => {
  const actual = jest.requireActual("../../ui_primitives");
  return {
    ...actual,
    ResponsiveImage: ({ locator }: { locator: string }) => (
      <div data-testid="image" data-locator={locator} />
    ),
    VideoPlayer: (props: { locator: string; muted?: boolean; bare?: boolean; compact?: boolean }) => (
      <div
        data-testid="video"
        data-locator={props.locator}
        data-muted={String(Boolean(props.muted))}
        data-bare={String(Boolean(props.bare))}
        data-compact={String(Boolean(props.compact))}
      />
    ),
    AudioPlayback: ({ locator }: { locator: string }) => (
      <div data-testid="audio" data-locator={locator} />
    )
  };
});
jest.mock("../../asset_viewer/LazyModel3DViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="model3d" />
}));
jest.mock("../../projects/ProjectDocumentPreview", () => ({
  __esModule: true,
  default: ({ document }: { document: { ref: string } }) => (
    <div data-testid="document-preview">{document.ref}</div>
  )
}));

const renderPreview = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <WorkspaceFilePreview projectId="p1" path={path} />
      </ThemeProvider>
    </QueryClientProvider>
  );

const asset = (path: string, content_type: string) => ({
  id: "a".repeat(32),
  name: path,
  workspace_path: path,
  content_type,
  size: 2048
});

describe("mediaKindOf", () => {
  it("names the kind from the content type or a glTF extension", () => {
    expect(mediaKindOf("image/png", "a.png")).toBe("image");
    expect(mediaKindOf("video/mp4", "a.mp4")).toBe("video");
    expect(mediaKindOf("audio/wav", "a.wav")).toBe("audio");
    expect(mediaKindOf("application/octet-stream", "m.GLB")).toBe("model3d");
    expect(mediaKindOf("text/markdown", "a.md")).toBeNull();
  });
});

describe("WorkspaceFilePreview", () => {
  beforeEach(() => {
    assetsList.mockReset();
    documentByFile.mockReset();
    projectGet.mockReset();
    fileThumbnail.mockReset();
  });

  it("shows a sketch file through the thumbnail inside it", async () => {
    const thumbnail = "data:image/png;base64,iVBORw0KGgo=";
    documentByFile.mockResolvedValue({ type: "sketch", ref: "s1", name: "Fox" });
    projectGet.mockResolvedValue({
      documents: [{ type: "sketch", ref: "s1", name: "Fox", thumbnails: [] }]
    });
    fileThumbnail.mockResolvedValue({ thumbnail });
    renderPreview("Sketches/Fox.sketch.ora");
    expect(await screen.findByTestId("image")).toHaveAttribute("data-locator", thumbnail);
    expect(fileThumbnail).toHaveBeenCalledWith({ id: "p1", path: "Sketches/Fox.sketch.ora" });
  });

  it("shows an image through its asset locator, with name, size and type", async () => {
    assetsList.mockResolvedValue({ assets: [asset("shots/a.png", "image/png")] });
    renderPreview("shots/a.png");
    expect(await screen.findByTestId("image")).toHaveAttribute(
      "data-locator",
      `asset://${"a".repeat(32)}`
    );
    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.getByText(/2(\.0)? KB · image\/png/)).toBeInTheDocument();
  });

  it("plays a video with compact controls and sound", async () => {
    assetsList.mockResolvedValue({ assets: [asset("v.mp4", "video/mp4")] });
    renderPreview("v.mp4");
    const video = await screen.findByTestId("video");
    expect(video).toHaveAttribute("data-muted", "false");
    expect(video).toHaveAttribute("data-bare", "false");
    expect(video).toHaveAttribute("data-compact", "true");
  });

  it("shows audio and 3D models", async () => {
    assetsList.mockResolvedValue({
      assets: [asset("s.wav", "audio/wav"), asset("m.glb", "model/gltf-binary")]
    });
    renderPreview("s.wav");
    expect(await screen.findByTestId("audio")).toBeInTheDocument();
    renderPreview("m.glb");
    expect(await screen.findByTestId("model3d")).toBeInTheDocument();
  });

  it("shows a timeline's card picture and its counts", async () => {
    documentByFile.mockResolvedValue({ type: "timeline", ref: "t1", name: "Cut" });
    projectGet.mockResolvedValue({
      documents: [
        {
          type: "timeline",
          ref: "t1",
          name: "Cut",
          thumbnails: [],
          preview: {
            kind: "timeline",
            durationMs: 65_000,
            tracks: [
              { type: "video", name: "V1", clips: [{ startMs: 0, durationMs: 1 }, { startMs: 1, durationMs: 1 }] },
              { type: "audio", name: "A1", clips: [{ startMs: 0, durationMs: 1 }] }
            ]
          }
        }
      ]
    });
    renderPreview("cut.timeline.json");
    expect(await screen.findByTestId("document-preview")).toHaveTextContent("t1");
    expect(screen.getByText(/2 tracks · 3 clips/)).toBeInTheDocument();
    expect(assetsList).not.toHaveBeenCalled();
  });

  it("renders nothing for a file with no picture", async () => {
    assetsList.mockResolvedValue({ assets: [asset("n.md", "text/markdown")] });
    const { container } = renderPreview("n.md");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(assetsList).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
