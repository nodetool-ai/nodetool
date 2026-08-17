/**
 * @jest-environment jsdom
 */
/**
 * The sketch tutorial surface mounts the editor's own chrome and drives it from
 * the cast: the toolbar's active tool, the layers panel's rows, the status
 * bar's canvas size and layer count. A cast frame is the only input, so these
 * assert the frame reaches each piece of chrome.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ThemeNodetool from "../../../components/themes/ThemeNodetool";
import { createSketchInstance } from "../../../stores/sketch/SketchInstance";
import { sketchCastDoc, sketchDocument, sketchLayer } from "../docCastHelpers";
import { SketchEditorSurface, seedSketchInstance } from "../SketchEditorSurface";

const DOC_ID = "demo-sketch-test";

const frame = (opacity: number) =>
  sketchCastDoc(
    sketchDocument(
      800,
      600,
      [
        sketchLayer("layer-base", "Base art"),
        sketchLayer("layer-vignette", "Vignette", { opacity })
      ],
      "layer-vignette"
    ),
    { activeTool: "brush", zoom: 0.5, selectedLayerIds: ["layer-vignette"] }
  );

// Layer thumbnails resolve their asset through react-query; the player supplies
// the client in production.
const renderSurface = (opacity = 1) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={ThemeNodetool}>
        <SketchEditorSurface documentId={DOC_ID} doc={frame(opacity)} />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("seedSketchInstance", () => {
  it("puts the cast frame into the editor stores the chrome reads", () => {
    const instance = createSketchInstance();
    seedSketchInstance(instance, DOC_ID, frame(0.7));

    const editor = instance.editor.getState();
    expect(editor.document.layers).toHaveLength(2);
    expect(editor.document.activeLayerId).toBe("layer-vignette");
    expect(editor.activeTool).toBe("brush");
    expect(editor.zoom).toBeCloseTo(0.5);
    expect(editor.selectedLayerIds).toEqual(["layer-vignette"]);
    // The status bar stays hidden until a document is bound.
    expect(instance.session.getState().documentId).toBe(DOC_ID);
  });

  it("falls back to the editor defaults for an unset chrome field", () => {
    const instance = createSketchInstance();
    seedSketchInstance(instance, DOC_ID, sketchCastDoc(sketchDocument(64, 64, [])));

    const editor = instance.editor.getState();
    expect(editor.activeTool).toBe("select");
    expect(editor.zoom).toBe(1);
    expect(editor.selectedLayerIds).toEqual([]);
    expect(editor.cursorDocPos).toBeNull();
  });

  it("re-seeding replaces the previous frame rather than merging it", () => {
    const instance = createSketchInstance();
    seedSketchInstance(instance, DOC_ID, frame(1));
    seedSketchInstance(
      instance,
      DOC_ID,
      sketchCastDoc(sketchDocument(64, 64, [sketchLayer("only", "Only")]))
    );

    expect(instance.editor.getState().document.layers).toHaveLength(1);
    expect(instance.editor.getState().selectedLayerIds).toEqual([]);
  });
});

describe("<SketchEditorSurface />", () => {
  it("renders the toolbar with the cast's tool selected", () => {
    renderSurface();
    const brush = screen.getByRole("button", { name: /brush/i });
    expect(brush).toHaveAttribute("aria-pressed", "true");
  });

  it("renders a layers-panel row per layer in the cast", () => {
    renderSurface();
    expect(screen.getByText("Base art")).toBeInTheDocument();
    expect(screen.getByText("Vignette")).toBeInTheDocument();
  });

  it("renders the status bar for the bound document", () => {
    renderSurface();
    expect(screen.getByTestId("sketch-status-bar")).toHaveTextContent(
      "800 × 600"
    );
    expect(screen.getByTestId("sketch-status-bar")).toHaveTextContent(
      "2 layers"
    );
  });
});
