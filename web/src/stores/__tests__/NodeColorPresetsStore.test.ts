import { renderHook, act } from "@testing-library/react";
import { useNodeColorPresetsStore } from "../NodeColorPresetsStore";

describe("NodeColorPresetsStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeColorPresetsStore.setState({
        presets: [],
        selectedPresetId: null,
        isDialogOpen: false
      });
    });
  });

  it("should add a new preset", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.addPreset("Test Preset", "#FF0000");
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe("Test Preset");
    expect(result.current.presets[0].color).toBe("#FF0000");
    expect(result.current.presets[0].id).toMatch(/^preset-\d+-[a-z0-9]+$/);
  });

  it("should remove a preset", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.addPreset("Test Preset", "#FF0000");
    });

    const presetId = result.current.presets[0].id;

    act(() => {
      result.current.removePreset(presetId);
    });

    expect(result.current.presets).toHaveLength(0);
  });

  it("should update a preset", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.addPreset("Test Preset", "#FF0000");
    });

    const presetId = result.current.presets[0].id;

    act(() => {
      result.current.updatePreset(presetId, "Updated Preset", "#00FF00");
    });

    expect(result.current.presets[0].name).toBe("Updated Preset");
    expect(result.current.presets[0].color).toBe("#00FF00");
  });

  it("should set selected preset", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.setSelectedPreset("test-id");
    });

    expect(result.current.selectedPresetId).toBe("test-id");
  });

  it("should toggle dialog open state", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    expect(result.current.isDialogOpen).toBe(false);

    act(() => {
      result.current.setDialogOpen(true);
    });

    expect(result.current.isDialogOpen).toBe(true);

    act(() => {
      result.current.setDialogOpen(false);
    });

    expect(result.current.isDialogOpen).toBe(false);
  });

  it("should duplicate a preset", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.addPreset("Original", "#FF0000");
    });

    const originalId = result.current.presets[0].id;

    act(() => {
      result.current.duplicatePreset(originalId);
    });

    expect(result.current.presets).toHaveLength(2);
    expect(result.current.presets[0].name).toBe("Original (Copy)");
    expect(result.current.presets[0].id).not.toBe(originalId);
    expect(result.current.presets[1].name).toBe("Original");
  });

  it("should clear all presets", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.addPreset("Preset 1", "#FF0000");
      result.current.addPreset("Preset 2", "#00FF00");
    });

    expect(result.current.presets).toHaveLength(2);

    act(() => {
      result.current.clearPresets();
    });

    expect(result.current.presets).toHaveLength(0);
    expect(result.current.selectedPresetId).toBeNull();
  });

  it("should limit presets to maximum", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    for (let i = 0; i < 25; i++) {
      act(() => {
        result.current.addPreset(`Preset ${i}`, "#FF0000");
      });
    }

    expect(result.current.presets.length).toBeLessThanOrEqual(20);
  });

  it("should trim preset names", () => {
    const { result } = renderHook(() => useNodeColorPresetsStore());

    act(() => {
      result.current.addPreset("  Test Preset  ", "#FF0000");
    });

    expect(result.current.presets[0].name).toBe("Test Preset");
  });
});
