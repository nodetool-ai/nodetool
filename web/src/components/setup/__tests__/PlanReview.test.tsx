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

  // A scene is read shot by shot. Each block gets a heading of its own, so the
  // rows do not run together into one column of labelled fields.
  it("draws a section's groups as blocks with their own headings", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={[
            {
              id: "scene-1",
              header: "Scene 1",
              subheader: "2 shots",
              rows: [
                {
                  id: "slugline",
                  label: "Slugline",
                  value: "EXT. DUNES — DAWN",
                  onChange: jest.fn()
                }
              ],
              groups: [
                {
                  id: "shot-1",
                  header: "Shot 1",
                  meta: "DUNES · 4s",
                  rows: [
                    {
                      id: "shot-1-action",
                      label: "Shot 1 · Action",
                      hideLabel: true,
                      value: "The ridge catches first light",
                      onChange: jest.fn()
                    }
                  ]
                },
                {
                  id: "shot-2",
                  header: "Shot 2",
                  rows: [
                    {
                      id: "shot-2-action",
                      label: "Shot 2 · Action",
                      hideLabel: true,
                      value: "A hand brushes off the map",
                      onChange: jest.fn()
                    }
                  ]
                }
              ]
            }
          ]}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("heading", { level: 4, name: "Shot 1" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "Shot 2" })
    ).toBeInTheDocument();
    expect(screen.getByText("DUNES · 4s")).toBeInTheDocument();
    // The section's own rows stay above its blocks, and every row still edits.
    expect(screen.getByLabelText("Slugline")).toHaveValue("EXT. DUNES — DAWN");
    expect(screen.getByLabelText("Shot 1 · Action")).toHaveValue(
      "The ridge catches first light"
    );
  });

  // The add control is replaced by the field it opens. Without the handoff the
  // keyboard is left on the document, one screen above where it was.
  it("focuses the field the add control just opened", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={[
            {
              id: "shot-1",
              header: "Shot 1",
              rows: [
                {
                  id: "dialogue",
                  label: "Dialogue",
                  value: "",
                  addLabel: "Add dialogue",
                  onChange: jest.fn()
                }
              ]
            }
          ]}
        />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Add dialogue" }));

    expect(screen.getByLabelText("Dialogue")).toHaveFocus();
  });

  // A duration parsed on every keystroke reads `900` as `9` on the way through
  // and writes 9 seconds nobody typed. `onChange` is the draft; `onCommit` is
  // the settled value.
  describe("onCommit", () => {
    const renderField = (props: { multiline?: boolean } = {}) => {
      const onChange = jest.fn();
      const onCommit = jest.fn();
      const Host = () => {
        const [value, setValue] = React.useState("3");
        return (
          <PlanReview
            sections={[
              {
                id: "beat-1",
                header: "Beat 1",
                rows: [
                  {
                    id: "seconds",
                    label: "Seconds",
                    value,
                    multiline: props.multiline,
                    onChange: (next: string) => {
                      onChange(next);
                      setValue(next);
                    },
                    onCommit
                  }
                ]
              }
            ]}
          />
        );
      };
      render(
        <ThemeProvider theme={mockTheme}>
          <Host />
        </ThemeProvider>
      );
      return { onChange, onCommit };
    };

    it("still reports every keystroke through onChange", async () => {
      const user = userEvent.setup();
      const { onChange, onCommit } = renderField();

      await user.clear(screen.getByLabelText("Seconds"));
      await user.type(screen.getByLabelText("Seconds"), "900");

      expect(onChange).toHaveBeenLastCalledWith("900");
      // Nothing settled yet: the field still has focus and no Enter was typed.
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("commits once the field loses focus", async () => {
      const user = userEvent.setup();
      const { onCommit } = renderField();

      await user.clear(screen.getByLabelText("Seconds"));
      await user.type(screen.getByLabelText("Seconds"), "900");
      await user.tab();

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith("900");
    });

    it("commits on Enter in a single-line field", async () => {
      const user = userEvent.setup();
      const { onCommit } = renderField();

      await user.clear(screen.getByLabelText("Seconds"));
      await user.type(screen.getByLabelText("Seconds"), "900{Enter}");

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith("900");
    });

    // Enter is a line break in a body field, so it cannot also be the commit.
    it("leaves Enter alone in a multiline field", async () => {
      const user = userEvent.setup();
      const { onCommit } = renderField({ multiline: true });

      await user.type(screen.getByLabelText("Seconds"), "{Enter}more");

      expect(onCommit).not.toHaveBeenCalled();
    });

    it("does not commit a value nobody edited", async () => {
      const user = userEvent.setup();
      const { onCommit } = renderField();

      await user.click(screen.getByLabelText("Seconds"));
      await user.tab();

      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  it("draws no remove control for a flow that does not support removal", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview sections={makeSections(jest.fn())} />
      </ThemeProvider>
    );

    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  // A bare row of "Remove" buttons tells a screen reader nothing about which
  // item each one is on.
  it("names each remove control with what it removes", async () => {
    const user = userEvent.setup();
    const onRemoveSection = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={makeSections(jest.fn())}
          onRemoveSection={onRemoveSection}
          sectionNoun="beat"
        />
      </ThemeProvider>
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove SCENE 2: EXT. CLIFF - NIGHT"
      })
    );

    expect(onRemoveSection).toHaveBeenCalledWith("scene-2");
  });

  it("uses a section's own remove label when it has one", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={[
            {
              id: "beat-3",
              header: "SCENE 3: INT. CAR - NIGHT",
              removeLabel: "Remove beat 3",
              rows: []
            },
            { id: "beat-4", header: "Beat 4", rows: [] }
          ]}
          onRemoveSection={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("button", { name: "Remove beat 3" })
    ).toBeInTheDocument();
  });

  // An empty plan is a dead end: the flows check for content before they let
  // it advance, and the review offers no way to put an item back.
  it("refuses to remove the last item, and stays focusable while it says so", async () => {
    const user = userEvent.setup();
    const onRemoveSection = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <PlanReview
          sections={[{ id: "beat-1", header: "Beat 1", rows: [] }]}
          onRemoveSection={onRemoveSection}
          sectionNoun="beat"
        />
      </ThemeProvider>
    );

    const control = screen.getByRole("button", { name: "Remove Beat 1" });
    expect(control).toHaveAttribute("aria-disabled", "true");

    await user.click(control);
    expect(onRemoveSection).not.toHaveBeenCalled();

    // `disabled` would take it out of the tab order, and it is exactly where
    // focus lands after the removal before this one.
    control.focus();
    expect(control).toHaveFocus();
  });

  // Removing an item destroys the control the keyboard was on.
  it("moves focus to the next item after a removal", async () => {
    const user = userEvent.setup();
    const Host = () => {
      const [ids, setIds] = React.useState(["beat-1", "beat-2", "beat-3"]);
      return (
        <PlanReview
          sections={ids.map((id) => ({
            id,
            header: `Beat ${id.slice(-1)}`,
            rows: []
          }))}
          onRemoveSection={(id) =>
            setIds((current) => current.filter((each) => each !== id))
          }
          sectionNoun="beat"
        />
      );
    };
    render(
      <ThemeProvider theme={mockTheme}>
        <Host />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Remove Beat 2" }));
    expect(screen.getByRole("button", { name: "Remove Beat 3" })).toHaveFocus();

    // The last item leaves no next item, so focus goes to the one before it.
    await user.click(screen.getByRole("button", { name: "Remove Beat 3" }));
    expect(screen.getByRole("button", { name: "Remove Beat 1" })).toHaveFocus();
  });
});
