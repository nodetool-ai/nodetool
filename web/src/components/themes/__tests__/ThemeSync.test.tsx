import { render } from "@testing-library/react";
import { ThemeSync } from "../ThemeSync";
import { ThemeProvider } from "@mui/material/styles";
import ThemeNodetool from "../ThemeNodetool";
import { useColorScheme } from "@mui/material/styles";
import { useSettingsStore } from "../../../stores/SettingsStore";

// Mock useColorScheme
const mockSetMode = jest.fn();
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useColorScheme: jest.fn()
}));

describe("ThemeSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useColorScheme as jest.Mock).mockReturnValue({
      mode: "dark",
      setMode: mockSetMode
    });
  });

  it("should render without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={ThemeNodetool}>
        <ThemeSync />
      </ThemeProvider>
    );
    expect(container).toBeTruthy();
  });

  it("should not render any visible content", () => {
    const { container } = render(
      <ThemeProvider theme={ThemeNodetool}>
        <ThemeSync />
      </ThemeProvider>
    );
    expect(container.firstChild).toBeNull();
  });

  it("should call setMode when themePreset changes", () => {
    // Set initial theme preset
    useSettingsStore.getState().setThemePreset("ocean");

    render(
      <ThemeProvider theme={ThemeNodetool}>
        <ThemeSync />
      </ThemeProvider>
    );

    // setMode should be called with 'ocean'
    expect(mockSetMode).toHaveBeenCalledWith("ocean");
  });

  it("should update mode when theme preset changes to forest", () => {
    useSettingsStore.getState().setThemePreset("forest");

    render(
      <ThemeProvider theme={ThemeNodetool}>
        <ThemeSync />
      </ThemeProvider>
    );

    expect(mockSetMode).toHaveBeenCalledWith("forest");
  });

  it("should update mode when theme preset changes to sunset", () => {
    useSettingsStore.getState().setThemePreset("sunset");

    render(
      <ThemeProvider theme={ThemeNodetool}>
        <ThemeSync />
      </ThemeProvider>
    );

    expect(mockSetMode).toHaveBeenCalledWith("sunset");
  });

  it("should update mode when theme preset changes to midnight", () => {
    useSettingsStore.getState().setThemePreset("midnight");

    render(
      <ThemeProvider theme={ThemeNodetool}>
        <ThemeSync />
      </ThemeProvider>
    );

    expect(mockSetMode).toHaveBeenCalledWith("midnight");
  });
});
