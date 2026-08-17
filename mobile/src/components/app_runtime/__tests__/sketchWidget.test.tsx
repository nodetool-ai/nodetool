/**
 * The app-runtime `Sketch` widget on mobile.
 *
 * A bound value arrives in one of two shapes — the document inline, or a
 * `SketchRef` carrying only an id — and both must end up composited. The
 * document backend is mocked so the ref path is exercised without a server.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

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

jest.mock("../../../trpc/client", () => ({
  trpc: {
    assets: {
      get: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
  },
}));

const mockRead = jest.fn();

jest.mock("../../../documents/backends", () => ({
  documentBackend: () => ({ read: (id: string) => mockRead(id) }),
}));

import ApplicationAppView from "../ApplicationAppView";

const CANVAS = { width: 200, height: 100, backgroundColor: "#ffffff" };

/** A bare editor document, the shape a node emits inline. */
const inlineDocument = {
  version: 1,
  activeLayerId: "l-1",
  canvas: CANVAS,
  layers: [
    {
      id: "l-1",
      name: "Base",
      type: "raster",
      visible: true,
      opacity: 1,
      data: "data:image/png;base64,AAAA",
    },
  ],
};

const appDoc = (props: Record<string, unknown>, value?: unknown) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Sketch app" } },
    content: [{ type: "Sketch", props: { id: "sketch-1", ...props } }],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-sketch",
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
    name: "Sketch app",
    description: "",
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

const renderApp = (doc: unknown) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApplicationAppView
        document={parseApplicationDocument(doc) as ApplicationDocument}
        workflow={makeWorkflow(`wf-${Math.random()}`)}
      />
    </QueryClientProvider>
  );
};

/** Nothing composites until the frame reports a width. */
const layoutCanvas = async () => {
  const frame = await screen.findByLabelText(/Sketch preview/);
  fireEvent(frame, "layout", {
    nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
  });
};

describe("Sketch widget", () => {
  beforeEach(() => {
    mockRead.mockReset();
  });

  it("composites a document bound inline, without reading anything", async () => {
    renderApp(appDoc({ binding: "var:data" }, inlineDocument));
    await layoutCanvas();

    expect(screen.getByLabelText("Layer Base")).toBeTruthy();
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("reads a ref by id and composites what comes back", async () => {
    mockRead.mockResolvedValue({
      name: "Doodle",
      doc: { sketch: inlineDocument, layerBindings: [] },
      token: 1,
      updatedAt: "2026-07-01T00:00:00Z",
    });

    renderApp(
      appDoc({ binding: "var:data" }, { type: "sketch", id: "sk-1" })
    );
    await layoutCanvas();

    expect(mockRead).toHaveBeenCalledWith("sk-1");
    expect(screen.getByLabelText("Layer Base")).toBeTruthy();
  });

  it("draws the dimensions badge when the widget asks for it", async () => {
    renderApp(
      appDoc({ binding: "var:data", showDimensions: true }, inlineDocument)
    );
    await layoutCanvas();

    expect(screen.getByText("200 × 100")).toBeTruthy();
  });

  it("says so when a ref cannot be read", async () => {
    mockRead.mockRejectedValue(new Error("not found"));

    renderApp(
      appDoc({ binding: "var:data" }, { type: "sketch", id: "sk-gone" })
    );

    expect(
      await screen.findByText("Could not load this sketch")
    ).toBeTruthy();
  });

  it("shows the placeholder while nothing is bound", async () => {
    renderApp(appDoc({ binding: "var:data", placeholder: "Run to draw" }));

    expect(await screen.findByText("Run to draw")).toBeTruthy();
  });
});
