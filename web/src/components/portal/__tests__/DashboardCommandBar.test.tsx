import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardCommandBar from "../DashboardCommandBar";

const renderBar = (
  props: Partial<React.ComponentProps<typeof DashboardCommandBar>> = {}
) => {
  const onSubmit = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <DashboardCommandBar onSubmit={onSubmit} {...props} />
    </ThemeProvider>
  );
  return { onSubmit };
};

describe("DashboardCommandBar", () => {
  it("cannot send an empty prompt", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("sends what the user typed, in the default track", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.type(
      screen.getByLabelText("Describe what you want to make"),
      "a poster for a jazz night"
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith("agent", "a poster for a jazz night");
  });

  it("sends on Enter", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.type(
      screen.getByLabelText("Describe what you want to make"),
      "hello{Enter}"
    );

    expect(onSubmit).toHaveBeenCalledWith("agent", "hello");
  });

  it("routes a typed prompt to the chosen track", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.type(
      screen.getByLabelText("Describe what you want to make"),
      "a fox in snow"
    );
    await user.click(screen.getByRole("button", { name: "Image" }));
    // Choosing a track with a prompt typed selects, it does not send.
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith("image", "a fox in snow");
  });

  it("opens a track's own example when the box is empty", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();

    await user.click(screen.getByRole("button", { name: "Video" }));

    expect(onSubmit).toHaveBeenCalledWith("video", "");
  });

  it("hides the track chips where the host already shows starter cards", () => {
    renderBar({ showModes: false });
    expect(screen.queryByRole("button", { name: "Image" })).toBeNull();
  });
});
