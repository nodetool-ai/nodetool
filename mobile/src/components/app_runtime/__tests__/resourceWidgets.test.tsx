/**
 * Resource widgets on mobile: a bound document renders as a card that opens the
 * screen its kind already has, a binding that resolves to nothing says so, and
 * an `openResource` action navigates rather than no-opping.
 */
import { fireEvent, render, screen, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";
import { documentKindInfo } from "../../../documents/kinds";

const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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

const mockRead = jest.fn();
const mockList = jest.fn();

jest.mock("../../../documents/backends", () => ({
  documentBackend: () => ({
    read: (id: string) => mockRead(id),
    list: (limit: number) => mockList(limit),
  }),
}));

import ApplicationAppView from "../ApplicationAppView";

interface WidgetNode {
  type: string;
  props: Record<string, unknown>;
}

const appDoc = (
  content: WidgetNode[],
  resources: unknown[]
) => ({
  schemaVersion: 3,
  ui: { root: { props: { title: "Board" } }, content, zones: {} },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-res",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources,
  variables: [],
});

const pinnedBinding = (kind: string, fixedId: string) => ({
  id: "board",
  name: "Board",
  kind,
  scope: { fixedId },
  operations: ["read"],
});

const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Board app",
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

describe("resource widgets", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRead.mockReset();
    mockList.mockReset();
  });

  it("renders a pinned storyboard as a card and opens its editor", async () => {
    mockRead.mockResolvedValue({
      name: "Chase scene",
      doc: { shots: [{ id: "s1" }, { id: "s2" }] },
      token: 1,
      updatedAt: "2026-07-01T00:00:00Z",
    });

    renderApp(
      appDoc(
        [
          {
            type: "ResourcePicker",
            props: { id: "picker", resourceBindingId: "board" },
          },
        ],
        [pinnedBinding("storyboard", "sb-1")]
      )
    );

    const card = await screen.findByLabelText("Open Chase scene, Storyboard");
    expect(screen.getByText("Storyboard · 2 shots")).toBeTruthy();

    fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith("StoryboardEditor", {
      id: "sb-1",
      name: "Chase scene",
    });
  });

  it("opens a sketch through whichever route the registry names", async () => {
    mockRead.mockResolvedValue({
      name: "Doodle",
      doc: {},
      token: 1,
      updatedAt: "2026-07-01T00:00:00Z",
    });

    renderApp(
      appDoc(
        [
          {
            type: "ResourceGallery",
            props: { id: "gallery", resourceBindingId: "board" },
          },
        ],
        [pinnedBinding("sketch", "sk-1")]
      )
    );

    fireEvent.press(await screen.findByLabelText("Open Doodle, Sketch"));

    // The route is the registry's to choose, so the assertion asks it rather
    // than naming a screen that a later kind change could move.
    const [route, params] = mockNavigate.mock.calls[0];
    expect(route).toBe(documentKindInfo("sketch").route);
    expect(params).toMatchObject({ id: "sk-1", name: "Doodle" });
  });

  it("renders an empty state when the bound document is gone", async () => {
    mockRead.mockRejectedValue(new Error("not found"));

    renderApp(
      appDoc(
        [
          {
            type: "ResourcePicker",
            props: { id: "picker", resourceBindingId: "board" },
          },
        ],
        [pinnedBinding("storyboard", "sb-missing")]
      )
    );

    expect(
      await screen.findByText("This storyboard is no longer available.")
    ).toBeTruthy();
    expect(screen.queryByLabelText(/^Open /)).toBeNull();
  });

  it("says so when a collection has no members", async () => {
    mockList.mockResolvedValue([]);

    renderApp(
      appDoc(
        [
          {
            type: "ResourcePicker",
            props: { id: "picker", resourceBindingId: "board" },
          },
        ],
        [
          {
            id: "board",
            name: "Boards",
            kind: "storyboard",
            scope: { projectId: "default" },
            operations: ["read"],
          },
        ]
      )
    );

    expect(
      await screen.findByText("No storyboards in this collection yet.")
    ).toBeTruthy();
  });

  it("lists a collection and opens the row that was tapped", async () => {
    mockList.mockResolvedValue([
      { id: "tl-1", name: "Trailer", updatedAt: "2026-07-01T00:00:00Z" },
      { id: "tl-2", name: "Teaser", updatedAt: "2026-07-02T00:00:00Z" },
    ]);

    renderApp(
      appDoc(
        [
          {
            type: "ResourcePicker",
            props: { id: "picker", resourceBindingId: "board" },
          },
        ],
        [
          {
            id: "board",
            name: "Timelines",
            kind: "timeline",
            scope: { projectId: "default" },
            operations: ["read"],
          },
        ]
      )
    );

    fireEvent.press(await screen.findByLabelText("Open Teaser, Timeline"));
    expect(mockNavigate).toHaveBeenCalledWith("TimelineViewer", {
      id: "tl-2",
      name: "Teaser",
    });
  });

  it("navigates on an openResource action", async () => {
    mockRead.mockResolvedValue({
      name: "Chase scene",
      doc: { shots: [] },
      token: 1,
      updatedAt: "2026-07-01T00:00:00Z",
    });

    renderApp(
      appDoc(
        [
          {
            type: "ResourcePicker",
            props: { id: "picker", resourceBindingId: "board" },
          },
          {
            type: "Button",
            props: {
              id: "open",
              label: "Open board",
              events: [
                {
                  trigger: "click",
                  kind: "openResource",
                  resourceBindingId: "board",
                },
              ],
            },
          },
        ],
        [pinnedBinding("storyboard", "sb-1")]
      )
    );

    // The picker reports its pinned pick; the action resolves the binding to it.
    await screen.findByLabelText("Open Chase scene, Storyboard");
    await act(async () => {
      fireEvent.press(screen.getByText("Open board"));
    });

    expect(mockNavigate).toHaveBeenCalledWith("StoryboardEditor", {
      id: "sb-1",
      name: undefined,
    });
  });

  it("summarises a storyboard scene list by its shot count", async () => {
    mockRead.mockResolvedValue({
      name: "Chase scene",
      doc: { shots: [{ id: "s1" }] },
      token: 1,
      updatedAt: "2026-07-01T00:00:00Z",
    });

    renderApp(
      appDoc(
        [
          {
            type: "StoryboardSceneList",
            props: { id: "scenes", resourceBindingId: "board" },
          },
        ],
        [pinnedBinding("storyboard", "sb-1")]
      )
    );

    expect(await screen.findByText("Storyboard · 1 shot")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open Chase scene, Storyboard"));
    expect(mockNavigate).toHaveBeenCalledWith("StoryboardEditor", {
      id: "sb-1",
      name: "Chase scene",
    });
  });

  it("says an unbound widget has no resource", () => {
    renderApp(
      appDoc(
        [{ type: "ResourcePicker", props: { id: "picker" } }],
        []
      )
    );

    expect(
      screen.getByText("This widget is not bound to a resource.")
    ).toBeTruthy();
  });
});
