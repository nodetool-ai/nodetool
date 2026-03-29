import React from "react";
import { render, screen } from "@testing-library/react";
import { Checkbox } from "../Checkbox";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("Checkbox", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders a checkbox", () => {
    renderWithTheme(<Checkbox />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("renders with a label", () => {
    renderWithTheme(<Checkbox label="Accept terms" />);
    expect(screen.getByText("Accept terms")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("handles checked state", () => {
    renderWithTheme(<Checkbox checked />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("handles onChange callback", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(<Checkbox onChange={handleChange} />);

    await user.click(screen.getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("supports disabled state", () => {
    renderWithTheme(<Checkbox disabled label="Disabled" />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("renders in compact mode", () => {
    renderWithTheme(<Checkbox compact label="Compact" />);
    expect(screen.getByText("Compact")).toBeInTheDocument();
  });

  it("renders small size", () => {
    const { container } = renderWithTheme(<Checkbox size="small" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
