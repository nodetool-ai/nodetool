import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import CloseButton from "../CloseButton";
import mockTheme from "../../../__mocks__/themeMock";

describe("CloseButton", () => {
  it("renders correctly", () => {
    const mockOnClick = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("close-button");
  });

  it("applies custom className when provided", () => {
    const mockOnClick = jest.fn();
    const customClass = "custom-class";

    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton className={customClass} onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
    expect(button).toHaveClass("close-button");
  });

  it("calls onClick when clicked", () => {
    const mockOnClick = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
