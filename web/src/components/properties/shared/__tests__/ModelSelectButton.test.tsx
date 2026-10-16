import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import ModelSelectButton from "../ModelSelectButton";

describe("ModelSelectButton", () => {
  // UX study 4 D15: Escape from the picker returns focus to the field, and
  // the button's pulsating focus ripple read as a grey text highlight over
  // the model name.
  it("shows no focus ripple when focus returns to the field", async () => {
    // jsdom has no focus-visible heuristics. Focus restored after a key press
    // matches :focus-visible in a browser, so the test says it does here.
    const matches = Element.prototype.matches;
    jest
      .spyOn(Element.prototype, "matches")
      .mockImplementation(function (this: Element, selector: string) {
        return selector === ":focus-visible" || matches.call(this, selector);
      });
    render(
      <ThemeProvider theme={mockTheme}>
        <ModelSelectButton
          label="Test Chat Model"
          secondaryLabel="OpenAI"
          onClick={jest.fn()}
        />
      </ThemeProvider>
    );
    const button = screen.getByRole("button", { name: /Test Chat Model/ });
    await act(async () => {
      button.focus();
    });
    expect(button).toHaveFocus();
    expect(button).toHaveClass("Mui-focusVisible");
    expect(
      button.querySelector(".MuiTouchRipple-ripplePulsate")
    ).not.toBeInTheDocument();
    jest.restoreAllMocks();
  });
});
