import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WelcomeFlow from "../WelcomeFlow";
import { WELCOME_TRACKS } from "../welcomeTracks";

const renderWelcome = (
  props: Partial<React.ComponentProps<typeof WelcomeFlow>> = {}
) => {
  const onPick = props.onPick ?? jest.fn();
  const onSkip = props.onSkip ?? jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <WelcomeFlow onPick={onPick} onSkip={onSkip} />
    </ThemeProvider>
  );
  return { onPick, onSkip };
};

describe("WelcomeFlow", () => {
  it("renders a card for every track", () => {
    renderWelcome();
    expect(
      screen.getByRole("heading", { name: /what do you want to make today/i })
    ).toBeInTheDocument();
    for (const track of WELCOME_TRACKS) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`Start with ${track.label}`, "i")
        })
      ).toBeInTheDocument();
    }
  });

  it("calls onPick with the track id when a card is clicked", async () => {
    const user = userEvent.setup();
    const { onPick } = renderWelcome();
    await user.click(
      screen.getByRole("button", { name: /Start with Image/i })
    );
    expect(onPick).toHaveBeenCalledWith("image");
  });

  it("calls onSkip when the skip button is clicked", async () => {
    const user = userEvent.setup();
    const { onSkip } = renderWelcome();
    await user.click(
      screen.getByRole("button", { name: /explore on my own/i })
    );
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
