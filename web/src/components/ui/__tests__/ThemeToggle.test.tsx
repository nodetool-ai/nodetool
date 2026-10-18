import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ThemeToggle } from "../ThemeToggle";
import { openSettingsTab } from "../../workspace/openPageTab";

jest.mock("../../workspace/openPageTab", () => ({
  openSettingsTab: jest.fn()
}));

const mockSetMode = jest.fn();
jest.mock("@mui/material/styles", () => {
  const actual = jest.requireActual("@mui/material/styles");
  return {
    ...actual,
    useColorScheme: () => ({
      mode: "dark",
      setMode: mockSetMode
    })
  };
});

describe("ThemeToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders as a toolbar icon button in the rail", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", {
      name: "Switch to light mode"
    });
    expect(button).toHaveClass("toolbar-icon-button");
    expect(button).toHaveClass("theme-toggle");
  });

  it("toggles the color scheme when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ThemeToggle />
      </ThemeProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" })
    );
    expect(mockSetMode).toHaveBeenCalledWith("light");
  });

  // Issue #6757: people could not find where to change contrast.
  it("opens the appearance settings on right-click", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ThemeToggle />
      </ThemeProvider>
    );

    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Switch to light mode" })
    );
    expect(openSettingsTab).toHaveBeenCalledWith("general");
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
