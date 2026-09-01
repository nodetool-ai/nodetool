/**
 * The media display widgets: each resolves a ref (or an array of them) to a
 * source and shows its placeholder while the binding is empty.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  const runtime = makeTestRuntime(initial);
  const { wrapper: Wrapper } = runtime;
  return {
    ...render(
      <ThemeProvider theme={mockTheme}>
        <Wrapper>{element}</Wrapper>
      </ThemeProvider>
    ),
    runtime
  };
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

describe("GalleryWidget selection", () => {
  // `prompt` is the test scope's input node, so it resolves as a write slot.
  const SELECTION = "prompt";
  const INPUT_KEY = "main:in1";
  const A = { type: "image", uri: "https://cdn/a.png" };
  const B = { type: "image", uri: "https://cdn/b.png" };
  const CHANGE_RUN = [{ trigger: "change" as const, kind: "run" }];

  const withSelection = (
    items: unknown[],
    selected?: unknown
  ): Partial<AppInstanceState> => {
    const state: Partial<AppInstanceState> = withOutput(items);
    if (selected === undefined) return state;
    return {
      ...state,
      inputs: { [INPUT_KEY]: { value: selected, dirty: true, revision: 1 } }
    };
  };

  it("leaves tiles inert when no selectionBinding is set", () => {
    const { container, runtime } = renderWidget(
      <GalleryWidget id="g1" binding="result" events={CHANGE_RUN} />,
      withSelection([A, B])
    );

    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(runtime.value.write).not.toHaveBeenCalled();
  });

  it("writes the picked array element — not its URL — and emits change", async () => {
    const user = userEvent.setup();
    const { runtime } = renderWidget(
      <GalleryWidget
        id="g1"
        binding="result"
        selectionBinding={SELECTION}
        events={CHANGE_RUN}
      />,
      withSelection([A, B])
    );

    await user.click(screen.getByRole("button", { name: "Select item 2" }));

    expect(runtime.value.write).toHaveBeenCalledWith(
      { kind: "input", operationId: "main", nodeId: "in1" },
      B
    );
    expect(runtime.value.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run", operationId: "main" })
    );
  });

  it("marks the tile the bound slot already holds", () => {
    renderWidget(
      <GalleryWidget id="g1" binding="result" selectionBinding={SELECTION} />,
      withSelection([A, B], { ...B })
    );

    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Select item 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("re-renders the mark from the binding after a pick", async () => {
    const user = userEvent.setup();
    renderWidget(
      <GalleryWidget id="g1" binding="result" selectionBinding={SELECTION} />,
      withSelection([A, B])
    );

    await user.click(screen.getByRole("button", { name: "Select item 1" }));

    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("selects with the keyboard", async () => {
    const user = userEvent.setup();
    const { runtime } = renderWidget(
      <GalleryWidget id="g1" binding="result" selectionBinding={SELECTION} />,
      withSelection([A, B])
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Select item 1" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(runtime.value.write).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "input", nodeId: "in1" }),
      A
    );
  });

  it("keeps tile and item paired when an item resolves to no image", async () => {
    const user = userEvent.setup();
    const { runtime } = renderWidget(
      <GalleryWidget id="g1" binding="result" selectionBinding={SELECTION} />,
      withSelection([{ type: "image", uri: "" }, A, B])
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Select item 1" }));

    expect(runtime.value.write).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "in1" }),
      A
    );
  });

  it("does not write in design mode", async () => {
    const user = userEvent.setup();
    const runtime = makeTestRuntime(withSelection([A, B]), {
      designMode: true
    });
    const { wrapper: Wrapper } = runtime;
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <Wrapper>
          <GalleryWidget
            id="g1"
            binding="result"
            selectionBinding={SELECTION}
            events={CHANGE_RUN}
          />
        </Wrapper>
      </ThemeProvider>
    );

    const tiles = container.querySelectorAll("img");
    expect(tiles).toHaveLength(2);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    await user.click(tiles[0]);
    expect(runtime.value.write).not.toHaveBeenCalled();
    expect(runtime.value.dispatch).not.toHaveBeenCalled();
  });
});
