import { renderHook, act } from "@testing-library/react";
import { useSettingsStore } from "../SettingsStore";

describe("SettingsStore - Theme Preset", () => {
  beforeEach(() => {
    // Reset store before each test
    useSettingsStore.setState(
      useSettingsStore.getState(),
      true
    );
  });

  it("should have default theme preset as 'dark'", () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.themePreset).toBe("dark");
  });

  it("should update theme preset to 'ocean'", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("ocean");
    });

    expect(result.current.settings.themePreset).toBe("ocean");
  });

  it("should update theme preset to 'forest'", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("forest");
    });

    expect(result.current.settings.themePreset).toBe("forest");
  });

  it("should update theme preset to 'sunset'", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("sunset");
    });

    expect(result.current.settings.themePreset).toBe("sunset");
  });

  it("should update theme preset to 'midnight'", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("midnight");
    });

    expect(result.current.settings.themePreset).toBe("midnight");
  });

  it("should update theme preset to 'light'", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("light");
    });

    expect(result.current.settings.themePreset).toBe("light");
  });

  it("should persist theme preset in settings", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("ocean");
    });

    const settings = useSettingsStore.getState().settings;
    expect(settings.themePreset).toBe("ocean");
  });

  it("should allow switching between multiple theme presets", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setThemePreset("ocean");
    });
    expect(result.current.settings.themePreset).toBe("ocean");

    act(() => {
      result.current.setThemePreset("forest");
    });
    expect(result.current.settings.themePreset).toBe("forest");

    act(() => {
      result.current.setThemePreset("sunset");
    });
    expect(result.current.settings.themePreset).toBe("sunset");

    act(() => {
      result.current.setThemePreset("midnight");
    });
    expect(result.current.settings.themePreset).toBe("midnight");
  });
});
