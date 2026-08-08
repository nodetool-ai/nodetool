import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../__mocks__/themeMock";
import ImageModelSelect from "../../components/properties/ImageModelSelect";
import VideoModelSelect from "../../components/properties/VideoModelSelect";
import { StudioProvider } from "../StudioContext";
import { STUDIO_STILL_MODELS, STUDIO_CLIP_MODELS } from "../curatedModels";

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

const inStudio = (ui: React.ReactElement) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioProvider>{ui}</StudioProvider>
    </ThemeProvider>
  );

const inWorkspace = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Studio curated model pickers", () => {
  it("offers only the curated stills, and the full browser outside Studio", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    inStudio(
      <ImageModelSelect value={STUDIO_STILL_MODELS[0].id} onChange={onChange} />
    );

    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(STUDIO_STILL_MODELS.length);

    await user.click(options[options.length - 1]);
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
    expect(screen.getAllByRole("option")).toHaveLength(editable.length);
  });

  it("offers only the curated clips", async () => {
    const user = userEvent.setup();
    inStudio(
      <VideoModelSelect value={STUDIO_CLIP_MODELS[0].id} onChange={jest.fn()} />
    );

    await user.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")).toHaveLength(
      STUDIO_CLIP_MODELS.length
    );
  });

  it("keeps the full model browser outside the Studio shell", () => {
    inWorkspace(<ImageModelSelect value="" onChange={jest.fn()} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("image-model-dialog")).toBeInTheDocument();
  });
});
