import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../__mocks__/themeMock";
import { useProviders } from "../../hooks/useProviders";
import { useProviderOnboardingStore } from "../../stores/ProviderOnboardingStore";
import ImageModelSelect from "../../components/properties/ImageModelSelect";
import VideoModelSelect from "../../components/properties/VideoModelSelect";
import { StudioProvider } from "../StudioContext";
import {
  STUDIO_STILL_MODELS,
  STUDIO_CLIP_MODELS,
  forAllTasks
} from "../curatedModels";

jest.mock("../../hooks/useProviders");

jest.mock("../../components/model_menu/ImageModelMenuDialog", () => ({
  __esModule: true,
  default: () => <div data-testid="image-model-dialog" />
}));

jest.mock("../../components/model_menu/VideoModelMenuDialog", () => ({
  __esModule: true,
  default: () => <div data-testid="video-model-dialog" />
}));

jest.mock("../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useImageModelsByProvider: () => ({ models: [], isLoading: false })
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: () => ({ data: [] })
}));

// What the server says it sells. `null` is "balance unknown" — the pickers
// then show the whole catalog and let the run refuse.
let spendableModels: string[] | null = null;
jest.mock("../useStudioCredits", () => ({
  __esModule: true,
  useStudioCredits: () => ({
    status: spendableModels ? { spendableModels } : null,
    remaining: 0,
    loading: false,
    unavailable: false,
    refetch: jest.fn()
  })
}));

const inStudio = (ui: React.ReactElement) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioProvider>{ui}</StudioProvider>
    </ThemeProvider>
  );

const inWorkspace = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Studio curated model pickers", () => {
  beforeEach(() => {
    spendableModels = null;
    useProviderOnboardingStore.setState({ open: false });
    jest.mocked(useProviders).mockReturnValue({ providers: [{ provider: "nodetool", capabilities: ["text_to_image", "text_to_video", "text_to_speech"], access: "remote_api", display_name: "NodeTool" }], isLoading: false, isFetching: false, error: null });
  });

  it("filters curated models by every requested task", () => {
    const base = STUDIO_CLIP_MODELS[0];
    const models = [
      { ...base, id: "all", tasks: ["image_to_video", "text_to_video", "reference_to_video"] },
      { ...base, id: "direct", tasks: ["text_to_video"] },
      { ...base, id: "reference", tasks: ["reference_to_video"] }
    ];
    expect(forAllTasks(models, ["image_to_video", "text_to_video", "reference_to_video"]))
      .toEqual([models[0]]);
    expect(forAllTasks(models, [])).toEqual(models);
  });

  it("offers only the curated stills, and the full browser outside Studio", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    inStudio(
      <ImageModelSelect value={STUDIO_STILL_MODELS[0].id} onChange={onChange} />
    );

    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(STUDIO_STILL_MODELS.length + 1);

    await user.click(options[options.length - 2]);
    expect(onChange).toHaveBeenCalledWith(
      STUDIO_STILL_MODELS[STUDIO_STILL_MODELS.length - 1].value
    );
  });

  it("filters the curated stills by the requested task", async () => {
    const user = userEvent.setup();
    inStudio(
      <ImageModelSelect value="" onChange={jest.fn()} task="image_to_image" />
    );

    await user.click(screen.getByRole("combobox"));
    const editable = STUDIO_STILL_MODELS.filter((option) =>
      option.tasks.includes("image_to_image")
    );
    expect(editable.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option")).toHaveLength(editable.length + 1);
  });

  it("offers only the curated clips", async () => {
    const user = userEvent.setup();
    inStudio(
      <VideoModelSelect value={STUDIO_CLIP_MODELS[0].id} onChange={jest.fn()} />
    );

    await user.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")).toHaveLength(
      STUDIO_CLIP_MODELS.length + 1
    );
  });

  it("opens task-specific setup from the add-providers option", async () => {
    inStudio(<ImageModelSelect value={STUDIO_STILL_MODELS[0].id} onChange={jest.fn()} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Add providers…" }));
    expect(useProviderOnboardingStore.getState()).toMatchObject({ open: true, capability: "text_to_image" });
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens setup automatically when no image provider is configured", async () => {
    jest.mocked(useProviders).mockReturnValue({ providers: [], isLoading: false, isFetching: false, error: null });
    inStudio(<ImageModelSelect value="" onChange={jest.fn()} />);
    expect(useProviderOnboardingStore.getState().open).toBe(false);
    await userEvent.click(screen.getByRole("combobox"));
    expect(useProviderOnboardingStore.getState()).toMatchObject({ open: true, capability: "text_to_image" });
  });

  it("keeps the full model browser outside the Studio shell", () => {
    inWorkspace(<ImageModelSelect value="" onChange={jest.fn()} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("image-model-dialog")).toBeInTheDocument();
  });

  it("offers only the stills this server sells", async () => {
    const user = userEvent.setup();
    spendableModels = [STUDIO_STILL_MODELS[0].modelId];
    inStudio(
      <ImageModelSelect
        value={STUDIO_STILL_MODELS[0].id}
        onChange={jest.fn()}
      />
    );

    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent(STUDIO_STILL_MODELS[0].label);
  });

  it("moves a selection this server stopped selling onto one it sells", async () => {
    const onChange = jest.fn();
    spendableModels = [STUDIO_STILL_MODELS[1].modelId];
    inStudio(
      <ImageModelSelect value={STUDIO_STILL_MODELS[0].id} onChange={onChange} />
    );

    expect(onChange).toHaveBeenCalledWith(STUDIO_STILL_MODELS[1].value);
  });
});
