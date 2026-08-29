/**
 * The picture on a document card. Each kind draws from what the summary
 * already carries, and a kind with nothing to draw falls back to its glyph
 * rather than an empty box.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
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
            { type: "audio", name: "A1", clips: [] }
          ]
        }
      })
    );
    expect(screen.getByText("V1")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("falls back to the type's glyph when there is nothing to draw", () => {
    const { container } = renderPreview(document({ type: "application" }));
    expect(container.textContent).toBe("◧");
  });
});
