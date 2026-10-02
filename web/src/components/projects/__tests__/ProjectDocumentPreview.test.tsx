/**
 * The picture on a document card. Each kind draws from what the summary
 * already carries, and a kind with nothing to draw falls back to its glyph
 * rather than an empty box.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { TYPE_GLYPH } from "../../workspace/tabTypeIdentity";
import type { ProjectDocument } from "../projectStatus";

jest.mock("../../ui_primitives", () => {
  const actual = jest.requireActual("../../ui_primitives");
  return {
    ...actual,
    ResponsiveImage: ({ locator }: { locator: { asset_id?: string | null } }) => (
      <div data-testid="still">{locator.asset_id}</div>
    )
  };
});

import ProjectDocumentPreview from "../ProjectDocumentPreview";

const document = (over: Partial<ProjectDocument>): ProjectDocument => ({
  type: "storyboard",
  ref: "d1",
  name: "Board",
  updatedAt: "",
  status: null,
  spendUsd: 0,
  unpricedCount: 0,
  thumbnails: [],
  preview: null,
  ...over
});

const renderPreview = (doc: ProjectDocument) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectDocumentPreview document={doc} />
    </ThemeProvider>
  );

describe("ProjectDocumentPreview", () => {
  it("montages the stills a board has rendered", () => {
    renderPreview(
      document({ thumbnails: [{ asset_id: "a1" }, { asset_id: "a2" }] })
    );
    expect(screen.getAllByTestId("still")).toHaveLength(2);
  });

  it("draws a cut's tracks against the span it covers", () => {
    renderPreview(
      document({
        type: "timeline",
        preview: {
          kind: "timeline",
          durationMs: 30_000,
          tracks: [
            {
              type: "video",
              name: "V1",
              clips: [{ startMs: 0, durationMs: 15_000 }]
            },
            { type: "audio", name: "A1", clips: [] },
            { type: "midi", name: "M1", clips: [{ startMs: 0, durationMs: 10_000 }] }
          ]
        }
      })
    );
    expect(screen.getByText("V1")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("M1")).toBeInTheDocument();
  });

  it("lays out one bar per clip and names an unnamed track by its type", () => {
    renderPreview(
      document({
        type: "timeline",
        preview: {
          kind: "timeline",
          durationMs: 0,
          tracks: [
            {
              type: "video",
              name: "",
              clips: [
                { startMs: 0, durationMs: 4_000 },
                { startMs: 4_000, durationMs: 6_000 }
              ]
            }
          ]
        }
      })
    );
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getAllByTestId("preview-clip")).toHaveLength(2);
  });

  it("shows the glyph for a cut with no tracks", () => {
    const { container } = renderPreview(
      document({
        type: "timeline",
        preview: { kind: "timeline", durationMs: 0, tracks: [] }
      })
    );
    expect(container.textContent).toBe(TYPE_GLYPH.timeline);
  });

  it("falls back to the type's glyph when there is nothing to draw", () => {
    const { container } = renderPreview(document({ type: "application" }));
    expect(container.textContent).toBe("◧");
  });
});
