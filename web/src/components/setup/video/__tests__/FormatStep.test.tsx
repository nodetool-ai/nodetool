/**
 * @jest-environment jsdom
 *
 * Step 2, first half — the template cards (PRD § 8.2).
 *
 * One template is chosen, so the cards are one radio group with one tab stop
 * and the picked card is the checked radio — not seven independent on/off
 * controls a screen reader reads as unrelated (F26).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { VIDEO_FORMATS } from "../formats";
import { FormatStep } from "../FormatStep";

jest.mock("../../../../hooks/useResolvedMediaUri");

const save = jest.fn(async () => undefined);
jest.mock("../../../../hooks/timeline/useTimelineProjectSettings", () => ({
  useTimelineProjectSettings: () => ({ save, isSaving: false })
}));

const renderStep = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <FormatStep />
    </ThemeProvider>
  );

beforeEach(() => {
  save.mockClear();
  useTimelineStore.getState().reset();
  useTimelineStore.getState().setSetup({ stage: "format", brief: "a boat" });
});

describe("video FormatStep", () => {
  it("offers the templates as one radio group", () => {
    renderStep();
    const group = screen.getByRole("radiogroup", { name: "Format" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(VIDEO_FORMATS.length);
  });

  it("checks the template the document carries, and only that one", () => {
    useTimelineStore.getState().setSetup({ format: "spot-30" });
    renderStep();
    const checked = screen
      .getAllByRole("radio")
      .filter((card) => card.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName(/30s spot/);
  });

  it("checks nothing before a template is picked", () => {
    renderStep();
    expect(
      screen
        .getAllByRole("radio")
        .every((card) => card.getAttribute("aria-checked") === "false")
    ).toBe(true);
  });

  it("moves the checked card when another is picked", async () => {
    renderStep();
    await userEvent.click(
      screen.getByRole("radio", { name: /15s ad/ })
    );
    expect(useTimelineStore.getState().setup?.format).toBe("ad-15");
  });
});
