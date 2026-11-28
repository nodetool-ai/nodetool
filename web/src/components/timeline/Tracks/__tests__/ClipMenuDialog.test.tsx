import React from "react";
import { describe, it, expect, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { ClipMenuDialog } from "../ClipMenuDialog";
import { CLIP_LABEL_COLORS } from "../clipLabelColors";

const renderDialog = (
  props: Partial<React.ComponentProps<typeof ClipMenuDialog>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipMenuDialog
        mode="repeat"
        clipName="Verse"
        onApply={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  );

describe("ClipMenuDialog", () => {
  it("repeat mode applies the typed copy count", async () => {
    const onApply = jest.fn();
    renderDialog({ mode: "repeat", onApply });
    const field = screen.getByRole("spinbutton", { name: /copies/i });
    await userEvent.clear(field);
    await userEvent.type(field, "4");
    await userEvent.click(screen.getByRole("button", { name: /repeat/i }));
    expect(onApply).toHaveBeenCalledWith({ count: 4 });
  });

  it("repeat mode clamps the count to 1..64", async () => {
    const onApply = jest.fn();
    renderDialog({ mode: "repeat", onApply });
    const field = screen.getByRole("spinbutton", { name: /copies/i });
    await userEvent.clear(field);
    await userEvent.type(field, "500");
    await userEvent.click(screen.getByRole("button", { name: /repeat/i }));
    expect(onApply).toHaveBeenCalledWith({ count: 64 });
  });

  it("rename mode applies the trimmed name and refuses an empty one", async () => {
    const onApply = jest.fn();
    renderDialog({ mode: "rename", onApply });
    const field = screen.getByRole("textbox", { name: /name/i });
    await userEvent.clear(field);
    expect(
      (screen.getByRole("button", { name: /rename/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    await userEvent.type(field, "  Chorus ");
    await userEvent.click(screen.getByRole("button", { name: /rename/i }));
    expect(onApply).toHaveBeenCalledWith({ name: "Chorus" });
  });

  it("color mode applies a swatch and can clear the color", async () => {
    const onApply = jest.fn();
    renderDialog({ mode: "color", onApply });
    await userEvent.click(
      screen.getAllByRole("button", {
        name: new RegExp(CLIP_LABEL_COLORS[1]!, "i")
      })[0]!
    );
    expect(onApply).toHaveBeenCalledWith({ labelColor: CLIP_LABEL_COLORS[1] });
    await userEvent.click(screen.getByRole("button", { name: /no color/i }));
    expect(onApply).toHaveBeenLastCalledWith({ labelColor: null });
  });
});
