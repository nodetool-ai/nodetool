import React from "react";
import { render, screen } from "@testing-library/react";
import { ToggleGroup, ToggleOption } from "../ToggleGroup";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("ToggleGroup", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders toggle options", () => {
    renderWithTheme(
      <ToggleGroup value="grid">
        <ToggleOption value="grid">Grid</ToggleOption>
        <ToggleOption value="list">List</ToggleOption>
      </ToggleGroup>
    );
    expect(screen.getByText("Grid")).toBeInTheDocument();
    expect(screen.getByText("List")).toBeInTheDocument();
  });

  it("handles value changes", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(
      <ToggleGroup value="grid" exclusive onChange={handleChange}>
        <ToggleOption value="grid">Grid</ToggleOption>
        <ToggleOption value="list">List</ToggleOption>
      </ToggleGroup>
    );

    await user.click(screen.getByText("List"));
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders with icon", () => {
    renderWithTheme(
      <ToggleGroup value="a">
        <ToggleOption value="a" icon={<span data-testid="icon">★</span>}>
          Option A
        </ToggleOption>
      </ToggleGroup>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Option A")).toBeInTheDocument();
  });

  it("renders in compact mode", () => {
    renderWithTheme(
      <ToggleGroup value="a" compact>
        <ToggleOption value="a">Compact</ToggleOption>
      </ToggleGroup>
    );
    expect(screen.getByText("Compact")).toBeInTheDocument();
  });
});
