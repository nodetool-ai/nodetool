import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import GenerationsPanel, { orderGenerations } from "../GenerationsPanel";
import {
  useGenerationActivityStore,
  type GenerationActivity
} from "../../../../stores/GenerationActivityStore";
import { useWorkspaceTabsStore } from "../../../../stores/WorkspaceTabsStore";
import { cancelGeneration } from "../../../../hooks/useGenerationActivityTracking";
import { useLastModelStore } from "../../../../stores/lastModelStore";

jest.mock("../../../../hooks/useGenerationActivityTracking", () => ({
  cancelGeneration: jest.fn().mockResolvedValue(undefined)
}));

const mockOpenAsWorkflow = jest.fn();
jest.mock("../../../../hooks/presets/useOpenPresetAsWorkflow", () => ({
  useOpenPresetAsWorkflow: () => mockOpenAsWorkflow
}));

jest.mock("../../../../hooks/useResolvedMediaUri", () => ({
  ...jest.requireActual("../../../../hooks/useResolvedMediaUri"),
  useResolvedMedia: () => ({ url: null, thumbUrl: null, contentType: null })
}));

const generation = (
  id: string,
  overrides: Partial<GenerationActivity> = {}
): GenerationActivity => ({
  id,
  channel: "rpc",
  status: "generating",
  kind: "image",
  prompt: `prompt ${id}`,
  model: "flux",
  source: { type: "sketch", ref: "s1", title: "Cover art" },
  threadId: null,
  startedAt: 1,
  endedAt: null,
  assetIds: [],
  error: null,
  ...overrides
});

const seed = (...items: GenerationActivity[]) =>
  useGenerationActivityStore.setState({
    generations: Object.fromEntries(items.map((item) => [item.id, item]))
  });

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <GenerationsPanel />
    </ThemeProvider>
  );

const tileTitles = () =>
  within(screen.getByRole("list", { name: "Generations" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");

describe("orderGenerations", () => {
  it("puts running generations first, oldest first, then the newest finished", () => {
    const ordered = orderGenerations([
      generation("done-old", { status: "generated", endedAt: 10 }),
      generation("run-late", { startedAt: 5 }),
      generation("done-new", { status: "failed", endedAt: 20 }),
      generation("run-early", { startedAt: 2 })
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      "run-early",
      "run-late",
      "done-new",
      "done-old"
    ]);
  });
});

describe("GenerationsPanel", () => {
  beforeEach(() => {
    useGenerationActivityStore.setState({ generations: {} });
    jest.mocked(cancelGeneration).mockClear();
  });

  it("explains what shows here before anything was generated", () => {
    renderPanel();
    expect(screen.getByText("No generations yet")).toBeInTheDocument();
  });

  it("lists generations from every surface with where they were made", () => {
    seed(
      generation("a"),
      generation("b", {
        channel: "chat",
        status: "generated",
        endedAt: 3,
        source: { type: "chat", ref: "t1", title: "" }
      })
    );
    renderPanel();
    const titles = tileTitles();
    expect(titles[0]).toContain("prompt a");
    expect(titles[0]).toContain("Cover art");
    expect(titles[1]).toContain("prompt b");
    expect(titles[1]).toContain("Chat");
  });

  it("filters to failed generations and shows the reason", async () => {
    seed(
      generation("a"),
      generation("b", {
        status: "failed",
        endedAt: 3,
        error: "Out of credits"
      })
    );
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Failed 1" }));
    const titles = tileTitles();
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain("Out of credits");
  });

  it("stops a running generation", async () => {
    seed(generation("a"));
    renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Stop generating" })
    );
    expect(cancelGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" })
    );
  });

  it("offers no stop for a workflow run's generation", () => {
    seed(generation("a", { channel: "prediction" }));
    renderPanel();
    expect(
      screen.queryByRole("button", { name: "Stop generating" })
    ).not.toBeInTheDocument();
  });

  it("opens the document a generation was made in", async () => {
    const openTab = jest.fn();
    const original = useWorkspaceTabsStore.getState().openTab;
    useWorkspaceTabsStore.setState({ openTab });
    seed(generation("a", { status: "generated", endedAt: 2 }));
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Open Cover art" }));
    expect(openTab).toHaveBeenCalledWith({
      type: "sketch",
      ref: "s1",
      title: "Cover art"
    });
    useWorkspaceTabsStore.setState({ openTab: original });
  });

  it("opens a generation that used presets as a workflow, without opening its source", async () => {
    const openTab = jest.fn();
    const original = useWorkspaceTabsStore.getState().openTab;
    useWorkspaceTabsStore.setState({ openTab });
    useLastModelStore.setState({
      byKind: { video: { provider: "fake", model: "fake-video" } },
      byTask: {}
    });
    mockOpenAsWorkflow.mockClear();
    seed(
      generation("fx", {
        kind: "video",
        status: "generated",
        endedAt: 2,
        model: "fake-video",
        preset_ids: ["effect.levitate"]
      })
    );
    renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Open as workflow" })
    );
    expect(mockOpenAsWorkflow).toHaveBeenCalledWith(["effect.levitate"], {
      kind: "video",
      model: { provider: "fake", id: "fake-video" }
    });
    expect(openTab).not.toHaveBeenCalled();
    useWorkspaceTabsStore.setState({ openTab: original });
  });

  it("names a preset run after its presets when it sent no prompt", () => {
    seed(
      generation("fx3", {
        kind: "video",
        status: "generated",
        endedAt: 2,
        prompt: null,
        preset_ids: ["effect.levitate"]
      })
    );
    renderPanel();
    expect(tileTitles()[0]).toContain("Levitate");
  });

  it("starts the workflow unselected when the model's provider is not known", async () => {
    useLastModelStore.setState({ byKind: {}, byTask: {} });
    mockOpenAsWorkflow.mockClear();
    seed(
      generation("fx2", {
        kind: "image",
        status: "generated",
        endedAt: 2,
        model: "mystery",
        preset_ids: ["effect.claymation", "effect.frost-crystals"]
      })
    );
    renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Open as workflow" })
    );
    expect(mockOpenAsWorkflow).toHaveBeenCalledWith(
      ["effect.claymation", "effect.frost-crystals"],
      { kind: "image", model: null }
    );
  });

  it("offers no workflow for a generation without presets or for audio", () => {
    seed(
      generation("plain", { status: "generated", endedAt: 2 }),
      generation("sound", {
        kind: "audio",
        status: "generated",
        endedAt: 3,
        preset_ids: ["camera.orbit"]
      })
    );
    renderPanel();
    expect(
      screen.queryByRole("button", { name: "Open as workflow" })
    ).not.toBeInTheDocument();
  });

  it("clears finished generations and keeps running ones", async () => {
    seed(generation("a"), generation("b", { status: "generated", endedAt: 2 }));
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Clear finished" }));
    expect(tileTitles()).toHaveLength(1);
    expect(tileTitles()[0]).toContain("prompt a");
  });
});
