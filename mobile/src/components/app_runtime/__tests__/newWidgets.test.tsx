/**
 * The widgets added to the catalog for 3D models, charts, PDFs, galleries and
 * the six extra input kinds.
 *
 * Three of them are deliberate fallbacks — mobile ships no 3D renderer, no
 * charting library and no PDF viewer — so what is asserted there is that the
 * card names the value and offers to open it, not that it draws it.
 */
import { Dimensions } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

/** The pager pages by window width, so a scripted swipe offsets by it. */
const WINDOW_WIDTH = Dimensions.get("window").width;

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

// Captured so a widget that writes into an input slot can be checked through
// the run params — the name-keyed bag the server receives.
const mockRun = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({
      job_id: null,
      run: mockRun,
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

const makeWorkflow = (id: string, nodes: unknown[] = []): Workflow =>
  ({
    id,
    name: "Catalog",
    description: "",
    graph: { nodes, edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    // The fixtures carry only the fields the widgets read.
  }) as unknown as Workflow;

const renderApp = (id: string, doc: unknown) =>
  render(
    <ApplicationAppView
      document={parseApplicationDocument(doc) as ApplicationDocument}
      workflow={makeWorkflow(id)}
    />
  );

/** A document of several widgets over one variable, plus a Run button. */
const runnableDoc = (content: unknown[], value?: unknown) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Catalog" } },
    content: [
      ...content,
      {
        type: "Button",
        props: {
          id: "btn-run",
          label: "Run",
          events: [{ trigger: "click", kind: "run" }],
        },
      },
    ],
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

const renderRunnable = (
  id: string,
  content: unknown[],
  value: unknown,
  nodes: unknown[]
) =>
  render(
    <ApplicationAppView
      document={
        parseApplicationDocument(runnableDoc(content, value)) as ApplicationDocument
      }
      workflow={makeWorkflow(id, nodes)}
    />
  );

beforeEach(() => {
  mockRun.mockClear();
});

describe("catalog coverage", () => {
  it("has a native renderer for every catalog type", () => {
    const missing = Object.keys(WIDGET_CATALOG).filter(
      (type) => !(type in RENDERERS)
    );
    expect(missing).toEqual([]);
  });
});

describe("sketch pad fallback", () => {
  it("offers an image picker and says the pad needs the desktop app", () => {
    // The app bundles no drawing surface, so the honest affordance for an
    // image binding is the one the phone already has.
    renderApp("wf-sketchpad", appDoc("SketchPad", { label: "Your drawing" }));

    expect(screen.getByText("Your drawing")).toBeTruthy();
    expect(screen.getByText("Choose image")).toBeTruthy();
    expect(
      screen.getByText("Drawing needs the desktop app — pick an image here instead.")
    ).toBeTruthy();
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

  it("opens a swipeable pager on the tapped image and follows the swipe", async () => {
    renderApp(
      "wf-gallery-swipe",
      appDoc("Gallery", { label: "Results" }, [
        { type: "image", uri: "https://x.test/a.png" },
        { type: "image", uri: "https://x.test/b.png" },
        { type: "image", uri: "https://x.test/c.png" },
      ])
    );

    fireEvent.press((await screen.findAllByTestId("gallery-tile"))[1]);

    const pager = screen.getByTestId("gallery-pager");
    expect(pager.props.pagingEnabled).toBe(true);
    expect(pager.props.horizontal).toBe(true);
    expect(pager.props.initialScrollIndex).toBe(1);
    expect(screen.getByText("2 / 3")).toBeTruthy();

    fireEvent(pager, "momentumScrollEnd", {
      nativeEvent: {
        contentOffset: { x: 2 * WINDOW_WIDTH, y: 0 },
        contentSize: { width: 3 * WINDOW_WIDTH, height: 100 },
        layoutMeasurement: { width: WINDOW_WIDTH, height: 100 },
      },
    });

    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("closes the pager", async () => {
    renderApp(
      "wf-gallery-close",
      appDoc("Gallery", {}, [
        { type: "image", uri: "https://x.test/a.png" },
        { type: "image", uri: "https://x.test/b.png" },
      ])
    );

    fireEvent.press((await screen.findAllByTestId("gallery-tile"))[0]);
    expect(screen.getByTestId("gallery-pager")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Close gallery"));

    expect(screen.queryByTestId("gallery-pager")).toBeNull();
  });

  it("shows the gallery placeholder for an empty array", () => {
    renderApp("wf-gallery-empty", appDoc("Gallery", { placeholder: "Nothing" }, []));

    expect(screen.getByText("Nothing")).toBeTruthy();
  });
});

describe("gallery selection", () => {
  const IMAGES = [
    { type: "image", uri: "https://x.test/a.png" },
    { type: "image", uri: "https://x.test/b.png" },
  ];

  const gallery = (props: Record<string, unknown> = {}) => [
    {
      type: "Gallery",
      props: { id: "gal-1", binding: "var:data", ...props },
    },
  ];

  const PICKED_NODE = [
    { id: "n1", type: "nodetool.input.ImageInput", data: { name: "picked" } },
  ];

  it("writes the tapped tile's original item, not its resolved URL", async () => {
    renderRunnable(
      "wf-gallery-pick",
      gallery({ selectionBinding: "op:main/in:n1" }),
      IMAGES,
      PICKED_NODE
    );

    fireEvent.press((await screen.findAllByTestId("gallery-tile"))[1]);
    await act(async () => {
      fireEvent.press(screen.getByText("Run"));
    });

    // The array element verbatim: a workflow that expects an ImageRef gets one,
    // not the string the tile happened to render from.
    expect(mockRun.mock.calls[0][0]).toEqual({ picked: IMAGES[1] });
  });

  it("marks the tile the selection binding currently holds", async () => {
    renderRunnable(
      "wf-gallery-marked",
      gallery({ selectionBinding: "op:main/in:n1" }),
      IMAGES,
      PICKED_NODE
    );

    const tiles = await screen.findAllByTestId("gallery-tile");
    expect(tiles[0].props.accessibilityState.selected).toBe(false);

    fireEvent.press(tiles[0]);

    const marked = screen.getAllByTestId("gallery-tile");
    expect(marked[0].props.accessibilityState.selected).toBe(true);
    expect(marked[1].props.accessibilityState.selected).toBe(false);
  });

  it("picks instead of previewing, and keeps the preview on a long press", async () => {
    renderRunnable(
      "wf-gallery-longpress",
      gallery({ selectionBinding: "op:main/in:n1" }),
      IMAGES,
      PICKED_NODE
    );

    const tiles = await screen.findAllByTestId("gallery-tile");
    fireEvent.press(tiles[1]);
    expect(screen.queryByTestId("gallery-pager")).toBeNull();

    fireEvent(tiles[1], "longPress");
    expect(screen.getByTestId("gallery-pager")).toBeTruthy();
  });

  it("leaves an unselectable gallery opening the viewer on tap", async () => {
    renderRunnable("wf-gallery-plain", gallery(), IMAGES, PICKED_NODE);

    const tiles = await screen.findAllByTestId("gallery-tile");
    expect(tiles[0].props.accessibilityState.selected).toBe(false);

    fireEvent.press(tiles[0]);

    expect(screen.getByTestId("gallery-pager")).toBeTruthy();
    // Nothing is written, so nothing is ever marked.
    expect(
      screen.getAllByTestId("gallery-tile")[0].props.accessibilityState.selected
    ).toBe(false);
  });
});

describe("image compare", () => {
  /**
   * Two bindings, so the widget needs a document of its own: `before` on
   * `binding`, `after` on `compareBinding`. Each case gets its own workflow id —
   * the runtime store is cached per instance, so a shared one would carry the
   * previous case's values.
   */
  const compareDoc = (before?: unknown, after?: unknown, props = {}) => ({
    schemaVersion: 3,
    ui: {
      root: { props: { title: "Catalog" } },
      content: [
        {
          type: "ImageCompare",
          props: {
            id: "cmp-1",
            binding: "var:before",
            compareBinding: "var:after",
            ...props,
          },
        },
      ],
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
      { id: "before", name: "before", scope: "instance", persist: false, default: before },
      { id: "after", name: "after", scope: "instance", persist: false, default: after },
    ],
  });

  const BEFORE = { type: "image", uri: "https://x.test/before.png" };
  const AFTER = { type: "image", uri: "https://x.test/after.png" };

  it("labels both bound images before and after", async () => {
    renderApp("wf-compare-both", compareDoc(BEFORE, AFTER, { label: "Edit" }));

    expect(await screen.findByText("Edit")).toBeTruthy();
    expect(screen.getByLabelText("Before").props.source.uri).toBe(BEFORE.uri);
    expect(screen.getByLabelText("After").props.source.uri).toBe(AFTER.uri);
  });

  it("renders only the half that is bound", async () => {
    renderApp("wf-compare-one", compareDoc(BEFORE));

    expect(await screen.findByLabelText("Before")).toBeTruthy();
    expect(screen.queryByLabelText("After")).toBeNull();
  });

  it("renders the after half on its own", async () => {
    renderApp("wf-compare-after", compareDoc(undefined, AFTER));

    expect(await screen.findByLabelText("After")).toBeTruthy();
    expect(screen.queryByLabelText("Before")).toBeNull();
  });

  it("caps each pane at the widget's height", async () => {
    renderApp("wf-compare-height", compareDoc(BEFORE, AFTER, { height: 120 }));

    const pane = await screen.findByLabelText("Before");
    expect(pane.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 120 })])
    );
  });

  it("shows the placeholder when neither half is bound", () => {
    renderApp("wf-compare-empty", compareDoc(undefined, undefined, {
      placeholder: "Run it first",
    }));

    expect(screen.getByText("Run it first")).toBeTruthy();
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
