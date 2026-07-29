/**
 * The media display widgets: each resolves a ref (or an array of them) to a
 * source and shows its placeholder while the binding is empty.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { GalleryWidget, Model3DWidget, PDFWidget } from "../MediaWidgets";

// The real viewers pull in three.js and pdf.js; the widget's job is only to
// hand them a resolved URL.
jest.mock("../../../asset_viewer/LazyModel3DViewer", () => ({
  __esModule: true,
  default: ({ url }: { url?: string }) =>
    require("react").createElement("div", { "data-testid": "model3d" }, url)
}));

jest.mock("../../../asset_viewer/LazyPDFViewer", () => ({
  __esModule: true,
  default: ({ url }: { url?: string }) =>
    require("react").createElement("div", { "data-testid": "pdf" }, url)
}));

const OUTPUT_KEY = "main:out1";

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {}
) => {
  const { wrapper: Wrapper } = makeTestRuntime(initial);
  return render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>{element}</Wrapper>
    </ThemeProvider>
  );
};

const withOutput = (value: unknown): Partial<AppInstanceState> => ({
  outputs: {
    [OUTPUT_KEY]: { value, invocationId: "j1", status: "done", revision: 1 }
  }
});

describe("Model3DWidget", () => {
  it("renders the bound model ref's uri in the viewer", () => {
    renderWidget(
      <Model3DWidget id="m1" binding="result" />,
      withOutput({ type: "model_3d", uri: "https://cdn/model.glb" })
    );
    expect(screen.getByTestId("model3d")).toHaveTextContent(
      "https://cdn/model.glb"
    );
  });

  it("shows the placeholder when the binding holds nothing", () => {
    renderWidget(
      <Model3DWidget id="m1" binding="result" placeholder="No model" />
    );
    expect(screen.getByText("No model")).toBeInTheDocument();
    expect(screen.queryByTestId("model3d")).not.toBeInTheDocument();
  });
});

describe("PDFWidget", () => {
  it("renders the bound document ref's uri in the viewer", () => {
    renderWidget(
      <PDFWidget id="p1" binding="result" />,
      withOutput({ type: "document", uri: "https://cdn/report.pdf" })
    );
    expect(screen.getByTestId("pdf")).toHaveTextContent(
      "https://cdn/report.pdf"
    );
  });

  it("shows the placeholder when the binding holds nothing", () => {
    renderWidget(<PDFWidget id="p1" binding="result" placeholder="No doc" />);
    expect(screen.getByText("No doc")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf")).not.toBeInTheDocument();
  });
});

describe("GalleryWidget", () => {
  it("tiles every ref in a bound array", () => {
    const { container } = renderWidget(
      <GalleryWidget id="g1" binding="result" label="Results" />,
      withOutput([
        { type: "image", uri: "https://cdn/a.png" },
        { type: "image", uri: "https://cdn/b.png" }
      ])
    );
    const tiles = container.querySelectorAll("img");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAttribute("src", "https://cdn/a.png");
    expect(screen.getByText("Results")).toBeInTheDocument();
  });

  it("shows the placeholder when the binding holds nothing", () => {
    const { container } = renderWidget(
      <GalleryWidget id="g1" binding="result" placeholder="No images" />
    );
    expect(screen.getByText("No images")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
