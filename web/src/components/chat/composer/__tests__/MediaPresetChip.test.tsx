import "@testing-library/jest-dom";
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { MediaPresetChip } from "../MediaSettingChips";
import { presetCatalog } from "../../../../lib/presets/catalog";

const KLING = { id: "fal-ai/kling-video/v2.6/pro/text-to-video", provider: "fal_ai" };
const MINIMAX = { id: "minimax/h3/text-to-video", provider: "fal_ai" };

const Harness: React.FC<{
  initial?: string[];
  model?: { id: string; provider: string } | null;
  mode?: "video" | "image_to_video" | "reference_to_video";
  spy?: jest.Mock;
}> = ({ initial = [], model = KLING, mode = "video", spy }) => {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <ThemeProvider theme={mockTheme}>
      <MediaPresetChip
        mode={mode}
        model={model}
        value={value}
        onChange={(ids) => {
          spy?.(ids);
          setValue(ids);
        }}
      />
    </ThemeProvider>
  );
};

describe("MediaPresetChip", () => {
  it("shows a neutral label until a preset is selected", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Presets" })).toBeVisible();
  });

  it("lists the selected preset names in the chip", () => {
    render(<Harness initial={["camera.dolly-in", "camera.handheld"]} />);
    expect(
      screen.getByRole("button", { name: "dolly in, handheld" })
    ).toBeVisible();
  });

  it("opens the picker, selects a preset and reports the stack", () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "Presets" }));
    expect(screen.getByRole("dialog")).toBeVisible();

    fireEvent.click(screen.getByRole("option", { name: /dolly in/ }));
    expect(spy).toHaveBeenLastCalledWith(["camera.dolly-in"]);
    expect(
      screen.getByRole("button", { name: /dolly in/ })
    ).toBeInTheDocument();
  });

  it("offers only presets that list the current mode", () => {
    render(<Harness mode="reference_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "Presets" }));
    expect(
      screen.getByRole("option", { name: /ARRI Alexa/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(
      presetCatalog.filter({ mode: "reference_to_video" }).length
    );
  });

  it("does not warn when the model family has a fragment for every preset", () => {
    render(<Harness initial={["camera.dolly-in"]} model={KLING} />);
    expect(
      screen.queryByText(/No tuned wording for this model/)
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dolly in/ }));
    expect(
      screen.queryByText(/No tuned wording for this model/)
    ).not.toBeInTheDocument();
  });

  it("warns when the model family has no fragment and the preset falls back to default", () => {
    render(<Harness initial={["camera.dolly-in"]} model={MINIMAX} />);
    expect(screen.getByRole("button", { name: /dolly in/ })).toHaveAttribute(
      "title",
      expect.stringContaining("No tuned wording for this model")
    );
    fireEvent.click(screen.getByRole("button", { name: /dolly in/ }));
    expect(
      screen.getByText(
        "No tuned wording for this model: dolly in. The default wording is used instead."
      )
    ).toBeVisible();
  });

  it("does not warn while no model is chosen", () => {
    render(<Harness initial={["camera.dolly-in"]} model={null} />);
    fireEvent.click(screen.getByRole("button", { name: /dolly in/ }));
    expect(
      screen.queryByText(/No tuned wording for this model/)
    ).not.toBeInTheDocument();
  });
});
