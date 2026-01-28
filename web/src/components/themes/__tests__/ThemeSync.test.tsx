import { render } from "@testing-library/react";
import { ThemeSync } from "../ThemeSync";
import { useSettingsStore } from "../../../stores/SettingsStore";

// Mock useColorScheme
const mockSetMode = jest.fn();
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useColorScheme: jest.fn(() => ({
    mode: "dark",
    setMode: mockSetMode
  }))
}));

describe("ThemeSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render without crashing", () => {
    const { container } = render(<ThemeSync />);
    expect(container).toBeTruthy();
  });

  it("should not render any visible content", () => {
    const { container } = render(<ThemeSync />);
    expect(container.firstChild).toBeNull();
  });

  it("should call setMode when themePreset changes", () => {
    // Set initial theme preset
    useSettingsStore.getState().setThemePreset("ocean");

    render(<ThemeSync />);

    // setMode should be called with 'ocean'
    expect(mockSetMode).toHaveBeenCalledWith("ocean");
  });

  it("should update mode when theme preset changes to forest", () => {
    useSettingsStore.getState().setThemePreset("forest");

    render(<ThemeSync />);

    expect(mockSetMode).toHaveBeenCalledWith("forest");
  });

  it("should update mode when theme preset changes to sunset", () => {
    useSettingsStore.getState().setThemePreset("sunset");

    render(<ThemeSync />);

    expect(mockSetMode).toHaveBeenCalledWith("sunset");
  });

  it("should update mode when theme preset changes to midnight", () => {
    useSettingsStore.getState().setThemePreset("midnight");

    render(<ThemeSync />);

    expect(mockSetMode).toHaveBeenCalledWith("midnight");
  });
});
