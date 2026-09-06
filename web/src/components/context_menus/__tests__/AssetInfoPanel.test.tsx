/**
 * The info panel is where a generated asset says what produced it: the prompt,
 * the model, and the settings, so the same recipe is at hand for a variant.
 */

import { render, screen } from "@testing-library/react";
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
