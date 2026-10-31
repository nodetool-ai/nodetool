import React, { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ShotMovementField } from "../ShotMovementField";
import { draftFromShot, type ShotDraft } from "../shotDraft";

const onDraft = jest.fn<void, [ShotDraft]>();

const emptyDraft = (overrides: Partial<ShotDraft> = {}): ShotDraft => ({
  ...draftFromShot(
    {
      type: "shot",
      id: "s1",
      index: 0,
      action: "A lighthouse",
      status: "planned"
    },
    null
  ),
  ...overrides
});

const Harness: React.FC<{
  initial: ShotDraft;
  videoModelId?: string | null;
}> = ({ initial, videoModelId }) => {
  const [draft, setDraft] = useState(initial);
  return (
    <ThemeProvider theme={mockTheme}>
      <ShotMovementField
        label="Camera movement"
        draft={draft}
        onChange={(next) => {
          onDraft(next);
          setDraft(next);
        }}
        videoModelId={videoModelId}
        renderMode="keyframe"
      />
    </ThemeProvider>
  );
};

const openPicker = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Browse presets" }));
  return screen.findByRole("dialog");
};

beforeEach(() => onDraft.mockClear());

describe("ShotMovementField", () => {
  it("preselects the card matching a movement saved before presets, without writing", async () => {
    render(<Harness initial={emptyDraft({ movement: "slow push in" })} />);

    expect(onDraft).not.toHaveBeenCalled();
    const dialog = await openPicker();
    expect(
      within(dialog).getByRole("option", { name: "dolly in" })
    ).toHaveAttribute("aria-selected", "true");
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("writes preset ids and the joined English names for a stack", async () => {
    render(<Harness initial={emptyDraft()} />);

    const dialog = await openPicker();
    await userEvent.click(
      within(dialog).getByRole("option", { name: "dolly in" })
    );
    await userEvent.click(
      within(dialog).getByRole("option", { name: "handheld" })
    );

    expect(onDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        presetIds: ["camera.dolly-in", "camera.handheld"],
        movement: "dolly in, handheld"
      })
    );
    expect(screen.getByLabelText("Camera movement")).toHaveValue(
      "dolly in, handheld"
    );
  });

  it("accepts free text and detaches the presets", async () => {
    render(
      <Harness
        initial={emptyDraft({
          movement: "dolly in",
          presetIds: ["camera.dolly-in"]
        })}
      />
    );

    const input = screen.getByLabelText("Camera movement");
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste("drift like a leaf");

    expect(onDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        presetIds: [],
        movement: "drift like a leaf"
      })
    );
  });

  it("clears the movement when the last preset is removed", async () => {
    render(
      <Harness
        initial={emptyDraft({
          movement: "slow push in"
        })}
      />
    );

    await userEvent.click(screen.getByTitle("Remove dolly in"));

    expect(onDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ presetIds: [], movement: "" })
    );
    expect(screen.getByLabelText("Camera movement")).toHaveValue("");
  });
});
