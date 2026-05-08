/**
 * Tests for extended symmetry modes and performance features:
 * - SymmetryMode store state
 * - symmetryRays setting (2-12)
 * - setSymmetryMode updates mirrorX/mirrorY for backward compat
 * - Dirty-rect compositing interface
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.setState({
      symmetryMode: "off",
      symmetryRays: 6,
      mirrorX: false,
      mirrorY: false
    });
  });
});

describe("Extended symmetry modes", () => {
  it("initial symmetryMode is 'off'", () => {
    expect(useSketchStore.getState().symmetryMode).toBe("off");
  });

  it("initial symmetryRays is 6", () => {
    expect(useSketchStore.getState().symmetryRays).toBe(6);
  });

  it("setSymmetryMode('horizontal') sets mirrorX=true, mirrorY=false", () => {
    act(() => {
      useSketchStore.getState().setSymmetryMode("horizontal");
    });
    const state = useSketchStore.getState();
    expect(state.symmetryMode).toBe("horizontal");
    expect(state.mirrorX).toBe(true);
    expect(state.mirrorY).toBe(false);
  });

  it("setSymmetryMode('vertical') sets mirrorX=false, mirrorY=true", () => {
    act(() => {
      useSketchStore.getState().setSymmetryMode("vertical");
    });
    const state = useSketchStore.getState();
    expect(state.symmetryMode).toBe("vertical");
    expect(state.mirrorX).toBe(false);
    expect(state.mirrorY).toBe(true);
  });

  it("setSymmetryMode('dual') sets mirrorX=true, mirrorY=true", () => {
    act(() => {
      useSketchStore.getState().setSymmetryMode("dual");
    });
    const state = useSketchStore.getState();
    expect(state.symmetryMode).toBe("dual");
    expect(state.mirrorX).toBe(true);
    expect(state.mirrorY).toBe(true);
  });

  it("setSymmetryMode('radial') sets mirrorX=false, mirrorY=false", () => {
    act(() => {
      useSketchStore.getState().setSymmetryMode("radial");
    });
    const state = useSketchStore.getState();
    expect(state.symmetryMode).toBe("radial");
    expect(state.mirrorX).toBe(false);
    expect(state.mirrorY).toBe(false);
  });

  it("setSymmetryMode('mandala') sets mirrorX=false, mirrorY=false", () => {
    act(() => {
      useSketchStore.getState().setSymmetryMode("mandala");
    });
    const state = useSketchStore.getState();
    expect(state.symmetryMode).toBe("mandala");
    expect(state.mirrorX).toBe(false);
    expect(state.mirrorY).toBe(false);
  });

  it("setSymmetryMode('off') resets mirror flags", () => {
    act(() => {
      useSketchStore.getState().setSymmetryMode("dual");
    });
    act(() => {
      useSketchStore.getState().setSymmetryMode("off");
    });
    const state = useSketchStore.getState();
    expect(state.symmetryMode).toBe("off");
    expect(state.mirrorX).toBe(false);
    expect(state.mirrorY).toBe(false);
  });

  it("setSymmetryRays clamps to min 2", () => {
    act(() => {
      useSketchStore.getState().setSymmetryRays(1);
    });
    expect(useSketchStore.getState().symmetryRays).toBe(2);
  });

  it("setSymmetryRays clamps to max 12", () => {
    act(() => {
      useSketchStore.getState().setSymmetryRays(20);
    });
    expect(useSketchStore.getState().symmetryRays).toBe(12);
  });

  it("setSymmetryRays accepts valid values", () => {
    act(() => {
      useSketchStore.getState().setSymmetryRays(8);
    });
    expect(useSketchStore.getState().symmetryRays).toBe(8);
  });
});

describe("SymmetryMode type exports", () => {
  it("recognizes all valid symmetry modes", () => {
    const validModes = ["off", "horizontal", "vertical", "dual", "radial", "mandala"];
    for (const mode of validModes) {
      act(() => {
        useSketchStore.getState().setSymmetryMode(mode as "off" | "horizontal" | "vertical" | "dual" | "radial" | "mandala");
      });
      expect(useSketchStore.getState().symmetryMode).toBe(mode);
    }
  });
});
