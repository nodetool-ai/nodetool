/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  normalizeKey,
  buildComboString,
  isPrimaryModifier,
  displayBinding
} from "../normalize";

jest.mock("../../../../utils/platform", () => ({
  isMac: jest.fn(() => false)
}));

function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: "a",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...overrides
  } as KeyboardEvent;
}

describe("normalizeKey", () => {
  it("lowercases single alpha characters", () => {
    expect(normalizeKey("A")).toBe("a");
    expect(normalizeKey("Z")).toBe("z");
    expect(normalizeKey("m")).toBe("m");
  });

  it("passes through multi-character key names", () => {
    expect(normalizeKey("ArrowUp")).toBe("ArrowUp");
    expect(normalizeKey("Backspace")).toBe("Backspace");
    expect(normalizeKey("Enter")).toBe("Enter");
  });

  it("passes through single-character symbols", () => {
    expect(normalizeKey("[")).toBe("[");
    expect(normalizeKey("]")).toBe("]");
    expect(normalizeKey("{")).toBe("{");
    expect(normalizeKey("+")).toBe("+");
  });
});

describe("isPrimaryModifier", () => {
  beforeEach(() => {
    const platform = require("../../../../utils/platform");
    platform.isMac.mockReturnValue(false);
  });

  it("returns true for Ctrl on non-Mac", () => {
    expect(isPrimaryModifier(makeKeyEvent({ ctrlKey: true }))).toBe(true);
  });

  it("returns false for Meta on non-Mac", () => {
    expect(isPrimaryModifier(makeKeyEvent({ metaKey: true }))).toBe(false);
  });

  it("returns true for Meta on Mac", () => {
    require("../../../../utils/platform").isMac.mockReturnValue(true);
    expect(isPrimaryModifier(makeKeyEvent({ metaKey: true }))).toBe(true);
  });

  it("returns false for Ctrl on Mac", () => {
    require("../../../../utils/platform").isMac.mockReturnValue(true);
    expect(isPrimaryModifier(makeKeyEvent({ ctrlKey: true }))).toBe(false);
  });
});

describe("buildComboString", () => {
  beforeEach(() => {
    require("../../../../utils/platform").isMac.mockReturnValue(false);
  });

  it("builds a simple key combo", () => {
    expect(buildComboString(makeKeyEvent({ key: "z" }))).toBe("z");
  });

  it("includes ctrl prefix for Ctrl modifier", () => {
    expect(buildComboString(makeKeyEvent({ key: "z", ctrlKey: true }))).toBe("ctrl+z");
  });

  it("includes shift prefix for alpha keys", () => {
    expect(buildComboString(makeKeyEvent({ key: "A", shiftKey: true }))).toBe("shift+a");
  });

  it("includes shift prefix for multi-character keys", () => {
    expect(buildComboString(makeKeyEvent({ key: "ArrowUp", shiftKey: true }))).toBe("shift+ArrowUp");
  });

  it("omits shift prefix for symbol keys", () => {
    expect(buildComboString(makeKeyEvent({ key: "{", shiftKey: true }))).toBe("{");
  });

  it("includes alt prefix", () => {
    expect(buildComboString(makeKeyEvent({ key: "z", altKey: true }))).toBe("alt+z");
  });

  it("combines all modifiers", () => {
    expect(buildComboString(makeKeyEvent({
      key: "z", ctrlKey: true, shiftKey: true, altKey: true
    }))).toBe("ctrl+shift+alt+z");
  });

  it("uses metaKey on Mac as ctrl prefix", () => {
    require("../../../../utils/platform").isMac.mockReturnValue(true);
    expect(buildComboString(makeKeyEvent({ key: "z", metaKey: true }))).toBe("ctrl+z");
  });
});

describe("displayBinding", () => {
  beforeEach(() => {
    require("../../../../utils/platform").isMac.mockReturnValue(false);
  });

  it("displays a simple key", () => {
    expect(displayBinding({ key: "z", modifiers: {} })).toBe("Z");
  });

  it("displays Ctrl modifier on non-Mac", () => {
    expect(displayBinding({ key: "z", modifiers: { ctrl: true } })).toBe("Ctrl+Z");
  });

  it("displays all modifiers", () => {
    expect(displayBinding({ key: "z", modifiers: { ctrl: true, shift: true, alt: true } })).toBe("Ctrl+Shift+Alt+Z");
  });

  it("uses Mac symbols on Mac", () => {
    require("../../../../utils/platform").isMac.mockReturnValue(true);
    expect(displayBinding({ key: "z", modifiers: { ctrl: true, shift: true, alt: true } })).toBe("⌘⇧⌥Z");
  });

  it("passes through special key names", () => {
    expect(displayBinding({ key: "Backspace", modifiers: {} })).toBe("Backspace");
  });
});
