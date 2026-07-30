import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import LanguageModelSelect from "../LanguageModelSelect";

const dialogProps: Record<string, unknown>[] = [];

jest.mock("../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    dialogProps.push(props);
    return <div data-testid="model-dialog" />;
  }
}));

jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({ models: [], isLoading: false })
}));

const renderSelect = (props: Partial<React.ComponentProps<typeof LanguageModelSelect>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <LanguageModelSelect onChange={jest.fn()} value="" {...props} />
    </ThemeProvider>
  );

describe("LanguageModelSelect", () => {
  beforeEach(() => {
    dialogProps.length = 0;
  });

  it("shows the default placeholder when nothing is selected", () => {
    renderSelect();

    expect(
      screen.getByRole("button", { name: /select model/i })
    ).toBeInTheDocument();
  });

  it("shows a custom placeholder", () => {
    renderSelect({ placeholder: "Use chat model" });

    expect(
      screen.getByRole("button", { name: /use chat model/i })
    ).toBeInTheDocument();
  });

  it("forwards requireToolSupport to the dialog", async () => {
    const user = userEvent.setup();
    renderSelect({ requireToolSupport: true });

    await user.click(screen.getByRole("button"));

    expect(dialogProps.at(-1)).toMatchObject({ requireToolSupport: true });
  });

  it("leaves requireToolSupport unset by default", () => {
    renderSelect();

    expect(dialogProps.at(-1)?.requireToolSupport).toBeUndefined();
  });
});
