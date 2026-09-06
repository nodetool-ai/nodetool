import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";

const makeSections = (onChange: jest.Mock): PlanReviewSection[] => [
  {
    id: "scene-1",
    header: "SCENE 1: INT. LIGHTHOUSE - DUSK",
    subheader: "Low key, single practical",
    rows: [
      {
        id: "shot-1-action",
        label: "Shot 1 action",
        value: "The keeper climbs the stair",
        onChange,
        multiline: true
      }
    ]
  },
  {
    id: "scene-2",
    header: "SCENE 2: EXT. CLIFF - NIGHT",
    rows: [
      {
        id: "shot-2-action",
        label: "Shot 2 action",
        value: "Waves break on rock",
        onChange
      }
    ]
  }
];

describe("PlanReview", () => {
  it("writes an inline edit back through the row", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={makeSections(onChange)}
          replanLabel="Re-direct"
          onReplan={jest.fn()}
        />
      </ThemeProvider>
    );

    await user.type(screen.getByLabelText("Shot 2 action"), "!");

    expect(onChange).toHaveBeenCalledWith("Waves break on rock!");
  });

  it("renders every section header", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={makeSections(jest.fn())}
          replanLabel="Re-direct"
          onReplan={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("heading", { name: "SCENE 1: INT. LIGHTHOUSE - DUSK" })
    ).toBeInTheDocument();
    expect(screen.getByText("Low key, single practical")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "SCENE 2: EXT. CLIFF - NIGHT" })
    ).toBeInTheDocument();
  });

  it("runs re-plan under the label the flow chose", async () => {
    const user = userEvent.setup();
    const onReplan = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={makeSections(jest.fn())}
          replanLabel="Re-direct"
          onReplan={onReplan}
        />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Re-direct" }));

    expect(onReplan).toHaveBeenCalledTimes(1);
  });

  it("blocks re-plan while the plan generator is running", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={makeSections(jest.fn())}
          replanLabel="Re-direct"
          onReplan={jest.fn()}
          replanPending
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Re-direct" })).toBeDisabled();
  });
});
