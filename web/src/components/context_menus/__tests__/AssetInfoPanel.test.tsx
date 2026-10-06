/**
 * The info panel is where a generated asset says what produced it: the prompt,
 * the model, and the settings, so the same recipe is at hand for a variant.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: <T,>(selector: (s: { currentFolder: null }) => T) =>
    selector({ currentFolder: null })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (s: { getWorkflow: () => null }) => T) =>
    selector({ getWorkflow: () => null })
}));

const openWorkflow = jest.fn();
const openSnapshot = jest.fn();
jest.mock("../../../hooks/useOpenAssetWorkflow", () => ({
  useOpenAssetWorkflow: () => ({ openWorkflow, openSnapshot })
}));

let snapshotData: unknown = undefined;
jest.mock("../../../serverState/useJobSnapshot", () => ({
  useJobSnapshot: () => ({ data: snapshotData })
}));

import AssetInfoPanel from "../AssetInfoPanel";
import type { Asset } from "../../../stores/ApiTypes";

const asset = (metadata: Record<string, unknown> | null): Asset =>
  ({
    id: "asset-1",
    user_id: "1",
    parent_id: null,
    name: "fox.png",
    content_type: "image/png",
    workflow_id: null,
    created_at: "2026-01-02T03:04:05Z",
    get_url: null,
    thumb_url: null,
    metadata
  }) as Asset;

const renderPanel = (metadata: Record<string, unknown> | null) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetInfoPanel asset={asset(metadata)} />
    </ThemeProvider>
  );

describe("AssetInfoPanel generation settings", () => {
  it("shows the prompt, the model and each setting", () => {
    renderPanel({
      generation_id: "gen-1",
      prompt: "a fox in snow",
      generation: {
        provider: "fal",
        model: "fal-ai/flux/dev",
        model_name: "FLUX.1 [dev]",
        params: { seed: 42, negative_prompt: "blurry", loras: ["a", "b"] }
      }
    });

    expect(screen.getByText("a fox in snow")).toBeInTheDocument();
    expect(screen.getByText("FLUX.1 [dev]")).toBeInTheDocument();
    expect(screen.getByText("fal")).toBeInTheDocument();
    expect(screen.getByText("Negative prompt")).toBeInTheDocument();
    expect(screen.getByText("blurry")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("a, b")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy prompt/i })
    ).toBeInTheDocument();
    // The raw dump still carries the keys the sections do not render.
    expect(screen.getByText("gen-1")).toBeInTheDocument();
  });

  it("renders nothing generation-shaped for an uploaded asset", () => {
    renderPanel(null);
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy prompt/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("fox.png")).toBeInTheDocument();
  });

  it("never renders an object as [object Object]", () => {
    const { container } = renderPanel({
      generation: { model: "m", params: { seed: 1 } }
    });
    expect(container.textContent).not.toContain("[object Object]");
  });
});

describe("AssetInfoPanel workflow actions", () => {
  const generated = {
    ...asset(null),
    workflow_id: "wf-1",
    node_id: "gen",
    job_id: "job-1"
  } as Asset;
  const snapshot = {
    id: "job-1",
    workflow_id: "wf-1",
    name: null,
    started_at: null,
    graph: { nodes: [], edges: [] },
    params: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
    snapshotData = undefined;
  });

  const renderGenerated = (onOpenWorkflow?: () => void) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <AssetInfoPanel asset={generated} onOpenWorkflow={onOpenWorkflow} />
      </ThemeProvider>
    );

  it("opens the saved workflow and lets the host close", () => {
    const onOpenWorkflow = jest.fn();
    renderGenerated(onOpenWorkflow);

    fireEvent.click(screen.getByRole("button", { name: /open workflow/i }));

    expect(openWorkflow).toHaveBeenCalledWith(generated);
    expect(onOpenWorkflow).toHaveBeenCalled();
  });

  it("opens the run's graph when the job stored one", () => {
    snapshotData = snapshot;
    renderGenerated();

    fireEvent.click(
      screen.getByRole("button", { name: /open as it was when made/i })
    );

    expect(openSnapshot).toHaveBeenCalledWith(generated, snapshot);
  });

  it("hides the as-made action when the job stored no graph", () => {
    snapshotData = { ...snapshot, graph: null };
    renderGenerated();

    expect(
      screen.queryByRole("button", { name: /open as it was when made/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open workflow/i })
    ).toBeInTheDocument();
  });

  it("offers no workflow action for an uploaded asset", () => {
    renderPanel(null);
    expect(
      screen.queryByRole("button", { name: /open workflow/i })
    ).not.toBeInTheDocument();
  });
});
