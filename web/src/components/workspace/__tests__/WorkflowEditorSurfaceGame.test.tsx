/**
 * Reopening a workflow that is still mid-Game-flow (game-prd criterion 2).
 *
 * The New Project tab that starts the flow keeps its target in component
 * state, so a refresh or a close loses it and the workflow reopens on this
 * surface. The stage on the document is the only thing read here: anything but
 * `done` mounts the setup host, `done` mounts the canvas, and a workflow with
 * no `settings.game` at all reads `done`.
 *
 * The flow is mounted for real, not stubbed, so the assertion is which step
 * comes back — that is what "resumes" means. The tab is unmounted and mounted
 * again between the two reads, the way closing and reopening it does.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

// The canvas and its overlays: this suite asks which of the two surfaces
// mounts, not what either draws.
jest.mock("../../node_editor/NodeEditor", () => ({
  __esModule: true,
  default: () => <div data-testid="node-editor" />
}));
jest.mock("../../panels/FloatingToolBar", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../panels/QueueOverlay", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../panels/StatusMessage", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../editor/NodeCreateBridge", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../SubgraphTabStrip", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../SubgraphTabContent", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../WorkflowChainSurface", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../KeyboardProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
jest.mock("../../../providers/ContextMenuProvider", () => ({
  ContextMenuProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}));
jest.mock("../../../providers/ConnectableNodesProvider", () => ({
  ConnectableNodesProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({
  useDocumentConflicts: () => ({
    items: [],
    accept: jest.fn(),
    discard: jest.fn()
  })
}));

// What the flow reads out of the install: models on offer, the shipped
// manifests, the seeded style presets. Each has its own suite; here they only
// need to answer so the Look step can mount.
jest.mock("../../../hooks/useResolvedMediaUri");
jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }),
  useImageModelsByProvider: () => ({
    models: [{ id: "m1", provider: "fal_ai", name: "Model one" }],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }),
  useMusicModelsByProvider: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  })
}));
jest.mock("../../../hooks/useRecommendedModelKeys", () => ({
  __esModule: true,
  useRecommendedModelKeys: () => [],
  recommendedModelKey: (provider: string, id: string) => `${provider}:${id}`
}));
jest.mock("../../../hooks/useProviders", () => ({
  useProviders: () => ({ providers: [], isLoading: false })
}));
jest.mock("../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../setup/game/useGameCustomStyle", () => ({
  __esModule: true,
  useGameCustomStyle: () => ({
    saving: false,
    error: null,
    clearError: jest.fn(),
    addStyle: jest.fn()
  })
}));
jest.mock("../../../hooks/game/useDesignGame", () => {
  const actual = jest.requireActual("../../../hooks/game/useDesignGame");
  return {
    ...actual,
    useDesignGame: () => ({
      designGame: jest.fn(),
      designing: false,
      error: null,
      filled: []
    })
  };
});
jest.mock("../../../hooks/game/useBuildGame", () => ({
  useBuildGame: () => ({ buildGame: jest.fn(), building: false, result: null })
}));
jest.mock("../../../hooks/game/useGameTemplates", () => {
  const actual = jest.requireActual("../../../hooks/game/useGameTemplates");
  return {
    ...actual,
    useGameTemplates: () => ({
      data: [
        {
          id: "platformer",
          godot: "4.3",
          slots: [
            {
              id: "player",
              kind: "spritesheet",
              cell: [32, 32],
              animations: { idle: 2 },
              fps: 8
            }
          ],
          hooks: ["scripts/player.gd"]
        }
      ],
      isLoading: false
    })
  };
});
jest.mock("../../../hooks/game/useGameStylePresets", () => ({
  useGameStylePresets: () => ({ data: [] })
}));
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

let settings: Record<string, unknown> = {};
const nodeStore = { getState: () => ({ nodes: [], edges: [] }) };
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => nodeStore,
  fetchWorkflow: jest.fn(async () => ({ id: "w1" })),
  updateWorkflow: jest.fn(),
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  tabId: (kind: string, ref: string) => `${kind}:${ref}`,
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ closeTab: jest.fn(), setTitle: jest.fn() })
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  writeGameSetup,
  type GameSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import useCanvasChatDockStore from "../../../stores/CanvasChatDockStore";
import WorkflowEditorSurface from "../WorkflowEditorSurface";

const seed = (stage: GameSetupStage) => {
  settings = writeGameSetup(
    {},
    {
      stage,
      brief: "a fox that runs",
      template: "platformer",
      project_name: "Ember Run"
    }
  );
};

const renderSurface = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <WorkflowEditorSurface workflowId="w1" active />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  settings = {};
  useCanvasChatDockStore.setState({ conversationCollapsed: true });
});

describe("a workflow reopened mid-Game-flow", () => {
  it("mounts the setup host instead of the canvas", () => {
    seed("look");
    renderSurface();

    expect(
      screen.getByRole("heading", { name: "Choose the look and the models" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("node-editor")).not.toBeInTheDocument();
  });

  it("resumes at the same step after the tab is closed and reopened", () => {
    seed("look");
    const { unmount } = renderSurface();
    expect(
      screen.getByRole("heading", { name: "Choose the look and the models" })
    ).toBeInTheDocument();
    unmount();

    renderSurface();
    expect(
      screen.getByRole("heading", { name: "Choose the look and the models" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("node-editor")).not.toBeInTheDocument();
  });

  it("mounts the canvas once the flow is done", () => {
    seed("done");
    renderSurface();

    expect(screen.getByTestId("node-editor")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Choose the look and the models" })
    ).toBeNull();
  });

  it("mounts the canvas for a workflow that never went through the flow", () => {
    settings = {};
    renderSurface();

    expect(screen.getByTestId("node-editor")).toBeInTheDocument();
  });
});
