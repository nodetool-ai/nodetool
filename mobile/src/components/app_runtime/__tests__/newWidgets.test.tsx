/**
 * The widgets added to the catalog for 3D models, charts, PDFs, galleries and
 * the six extra input kinds.
 *
 * Three of them are deliberate fallbacks — mobile ships no 3D renderer, no
 * charting library and no PDF viewer — so what is asserted there is that the
 * card names the value and offers to open it, not that it draws it.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  parseApplicationDocument,
  WIDGET_CATALOG,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("../../../trpc/client", () => ({
  // Media widgets resolve an `asset://` locator through `assets.get`; these
  // cases render non-asset sources, so the lookup never settles.
  trpc: {
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
  },
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({
      job_id: null,
      run: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    }),
    subscribe: () => () => {},
  }),
}));

import { webSocketService } from "../../../services/WebSocketService";

// The real socket singleton; only `subscribe` is stubbed so nothing dials out.
jest.spyOn(webSocketService, "subscribe").mockReturnValue(() => {});

import { apiService } from "../../../services/api";

// The real `apiService` singleton, with only the two host-dependent lookups
// pinned so URLs are stable regardless of the configured API host.
jest.spyOn(apiService, "resolveUrl").mockImplementation((uri) => uri ?? null);
jest.spyOn(apiService, "getApiHost").mockReturnValue("http://localhost:7777");

import ApplicationAppView from "../ApplicationAppView";
import { RENDERERS } from "../widgets";

/** A document with one widget bound to a variable holding `value`. */
const appDoc = (
  type: string,
  props: Record<string, unknown>,
  value?: unknown
) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Catalog" } },
    content: [{ type, props: { id: `${type}-1`, binding: "var:data", ...props } }],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-new",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [
    {
      id: "data",
      name: "data",
      scope: "instance",
      persist: false,
      default: value,
    },
  ],
});

const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Catalog",
    description: "",
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

const renderApp = (id: string, doc: unknown) =>
  render(
    <ApplicationAppView
      document={parseApplicationDocument(doc) as ApplicationDocument}
      workflow={makeWorkflow(id)}
    />
  );

describe("catalog coverage", () => {
  it("has a native renderer for every catalog type", () => {
    const missing = Object.keys(WIDGET_CATALOG).filter(
      (type) => !(type in RENDERERS)
    );
    expect(missing).toEqual([]);
  });
});

describe("display fallbacks", () => {
  it("names a 3D model and offers to open it", async () => {
    renderApp(
      "wf-model3d",
      appDoc("Model3D", {}, { type: "model_3d", uri: "https://x.test/head.glb" })
    );

    expect(await screen.findByText("3D model")).toBeTruthy();
    expect(screen.getByText("head.glb")).toBeTruthy();
    expect(screen.getByText("Not previewable on mobile")).toBeTruthy();
    expect(screen.getByText("Open model")).toBeTruthy();
  });

  it("shows the placeholder when nothing is bound to Model3D", () => {
    renderApp("wf-model3d-empty", appDoc("Model3D", { placeholder: "No mesh" }));

    expect(screen.getByText("No mesh")).toBeTruthy();
  });

  it("summarizes a chart's data rather than plotting it", async () => {
    renderApp(
      "wf-chart",
      appDoc("Chart", { label: "Scores", chartKind: "bar" }, [1, 2, 3])
    );

    expect(await screen.findByText("Scores")).toBeTruthy();
    expect(screen.getByText("3 points")).toBeTruthy();
    expect(screen.getByText("Not previewable on mobile")).toBeTruthy();
  });

  it("reports a bound dataframe's shape in the chart card", async () => {
    renderApp(
      "wf-chart-frame",
      appDoc("Chart", {}, {
        type: "dataframe",
        columns: [{ name: "x" }, { name: "y" }],
        data: [
          [1, 2],
          [3, 4],
        ],
      })
    );

    expect(await screen.findByText("2 rows · 2 columns")).toBeTruthy();
  });

  it("names a PDF and offers to open it", async () => {
    renderApp(
      "wf-pdf",
      appDoc("PDF", {}, { type: "document", uri: "https://x.test/report.pdf" })
    );

    expect(await screen.findByText("PDF")).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("Open PDF")).toBeTruthy();
  });

  it("tiles a bound array of images in the gallery", async () => {
    renderApp(
      "wf-gallery",
      appDoc("Gallery", { label: "Results", tileSize: 96 }, [
        { type: "image", uri: "https://x.test/a.png" },
        { type: "image", uri: "https://x.test/b.png" },
      ])
    );

    expect(await screen.findByText("Results")).toBeTruthy();
    expect(screen.getAllByTestId("gallery-tile")).toHaveLength(2);
  });

  it("shows the gallery placeholder for an empty array", () => {
    renderApp("wf-gallery-empty", appDoc("Gallery", { placeholder: "Nothing" }, []));

    expect(screen.getByText("Nothing")).toBeTruthy();
  });
});

describe("added input widgets", () => {
  it("writes width and height as one pair", async () => {
    renderApp(
      "wf-size",
      appDoc("ImageSizeInput", { label: "Size" }, { width: 512, height: 512 })
    );

    const width = await screen.findByLabelText("width");
    fireEvent.changeText(width, "640");

    expect(screen.getByLabelText("width").props.value).toBe("640");
    // The other half of the pair survives the edit.
    expect(screen.getByLabelText("height").props.value).toBe("512");
  });

  it("edits a file path as text and says whose filesystem it is", async () => {
    renderApp("wf-path", appDoc("FilePathInput", { label: "Input file" }, ""));

    expect(await screen.findByText("Input file")).toBeTruthy();
    expect(
      screen.getByText("Path on the machine running the workflow")
    ).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("/path/to/file.txt"), "/tmp/a.txt");
    expect(screen.getByDisplayValue("/tmp/a.txt")).toBeTruthy();
  });

  it("offers a folder placeholder for the folder path input", async () => {
    renderApp("wf-folder", appDoc("FolderPathInput", {}, ""));

    expect(await screen.findByPlaceholderText("/path/to/folder")).toBeTruthy();
  });

  it("edits a text list as one entry per line", async () => {
    renderApp(
      "wf-textlist",
      appDoc("MediaListInput", { listKind: "text", label: "Topics" }, [
        "alpha",
        "beta",
      ])
    );

    const field = await screen.findByDisplayValue("alpha\nbeta");
    fireEvent.changeText(field, "alpha\nbeta\ngamma");
    expect(screen.getByDisplayValue("alpha\nbeta\ngamma")).toBeTruthy();
  });

  it("lists picked media with a remove control", async () => {
    renderApp(
      "wf-imagelist",
      appDoc("MediaListInput", { listKind: "image" }, [
        { type: "image", uri: "https://x.test/a.png" },
      ])
    );

    expect(await screen.findByText("Add image")).toBeTruthy();
    const remove = screen.getByLabelText("Remove image 1");
    fireEvent.press(remove);
    expect(screen.queryByLabelText("Remove image 1")).toBeNull();
  });

  it("edits a dataframe cell in place, keeping the ref's shape", async () => {
    renderApp(
      "wf-frame",
      appDoc("DataFrameInput", { label: "Rows" }, {
        type: "dataframe",
        uri: "",
        columns: [{ name: "city" }, { name: "score" }],
        data: [["Berlin", 7]],
      })
    );

    expect(await screen.findByText("city")).toBeTruthy();
    expect(screen.getByText("score")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("city row 1"), "Lisbon");
    expect(screen.getByLabelText("city row 1").props.value).toBe("Lisbon");
    // A numeric column stays numeric.
    fireEvent.changeText(screen.getByLabelText("score row 1"), "9");
    expect(screen.getByLabelText("score row 1").props.value).toBe("9");
  });

  it("appends an empty row", async () => {
    renderApp(
      "wf-frame-add",
      appDoc("DataFrameInput", {}, [{ city: "Berlin" }])
    );

    fireEvent.press(await screen.findByText("Add row"));
    expect(screen.getByLabelText("city row 2")).toBeTruthy();
  });

  it("says so when there is nothing to edit", async () => {
    renderApp("wf-frame-empty", appDoc("DataFrameInput", {}, null));

    expect(await screen.findByText("No columns to edit")).toBeTruthy();
  });
});
