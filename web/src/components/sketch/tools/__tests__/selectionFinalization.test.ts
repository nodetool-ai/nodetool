import {
  applySelectionFinalization
} from "../selectionFinalization";
import type { Selection } from "../../types/selection";

jest.mock("../../selection", () => ({
  combineMasks: jest.fn(
    (
      _base: Selection | null,
      overlay: Selection,
      _op: string
    ): Selection | null => overlay
  ),
  trimSelectionMask: jest.fn(
    (sel: Selection | null): Selection | null => sel
  )
}));

jest.mock("../modifierIntent", () => ({
  selectionCombineModeFromSnapshot: jest.fn(() => "replace")
}));

import { combineMasks, trimSelectionMask } from "../../selection";
import { selectionCombineModeFromSnapshot } from "../modifierIntent";

const mockedTrimSelectionMask = trimSelectionMask as jest.MockedFunction<
  typeof trimSelectionMask
>;
const mockedCombineMasks = combineMasks as jest.MockedFunction<
  typeof combineMasks
>;
const mockedSelectionCombineModeFromSnapshot =
  selectionCombineModeFromSnapshot as jest.MockedFunction<
    typeof selectionCombineModeFromSnapshot
  >;

function makeSelection(width = 2, height = 2): Selection {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height).fill(255)
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedTrimSelectionMask.mockImplementation((sel) => sel);
  mockedCombineMasks.mockImplementation((_base, overlay) => overlay);
  mockedSelectionCombineModeFromSnapshot.mockReturnValue("replace");
});

describe("applySelectionFinalization", () => {
  it("commits a selection and returns true for a non-empty overlay", () => {
    const overlay = makeSelection();
    const onSelectionChange = jest.fn();
    const drawSelectionOverlay = jest.fn();

    const result = applySelectionFinalization({
      overlay,
      modifiers: null,
      currentSelection: null,
      onSelectionChange,
      drawSelectionOverlay
    });

    expect(result).toBe(true);
    expect(onSelectionChange).toHaveBeenCalledWith(overlay);
    expect(drawSelectionOverlay).toHaveBeenCalled();
  });

  it("returns false and redraws when the overlay trims to null", () => {
    mockedTrimSelectionMask.mockReturnValue(null);

    const onSelectionChange = jest.fn();
    const drawSelectionOverlay = jest.fn();

    const result = applySelectionFinalization({
      overlay: makeSelection(),
      modifiers: null,
      currentSelection: null,
      onSelectionChange,
      drawSelectionOverlay
    });

    expect(result).toBe(false);
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(drawSelectionOverlay).toHaveBeenCalled();
  });

  it("passes current selection to combineMasks in add mode", () => {
    mockedSelectionCombineModeFromSnapshot.mockReturnValue("add");

    const existing = makeSelection(4, 4);
    const overlay = makeSelection();
    const onSelectionChange = jest.fn();

    applySelectionFinalization({
      overlay,
      modifiers: { shift: true, alt: false },
      currentSelection: existing,
      onSelectionChange,
      drawSelectionOverlay: jest.fn()
    });

    expect(mockedCombineMasks).toHaveBeenCalledWith(existing, overlay, "add");
  });

  it("passes null base in replace mode regardless of currentSelection", () => {
    mockedSelectionCombineModeFromSnapshot.mockReturnValue("replace");

    const existing = makeSelection(4, 4);
    const overlay = makeSelection();
    const onSelectionChange = jest.fn();

    applySelectionFinalization({
      overlay,
      modifiers: null,
      currentSelection: existing,
      onSelectionChange,
      drawSelectionOverlay: jest.fn()
    });

    expect(mockedCombineMasks).toHaveBeenCalledWith(null, overlay, "replace");
  });

  it("delegates to runtime.applySelectionOverlay when provided", () => {
    const runtimeResult = makeSelection(8, 8);
    const runtime = {
      applySelectionOverlay: jest.fn(() => runtimeResult)
    };
    const overlay = makeSelection();
    const onSelectionChange = jest.fn();

    applySelectionFinalization({
      overlay,
      modifiers: null,
      runtime,
      currentSelection: null,
      onSelectionChange,
      drawSelectionOverlay: jest.fn()
    });

    expect(runtime.applySelectionOverlay).toHaveBeenCalledWith(
      overlay,
      "replace"
    );
    expect(onSelectionChange).toHaveBeenCalledWith(runtimeResult);
  });
});
