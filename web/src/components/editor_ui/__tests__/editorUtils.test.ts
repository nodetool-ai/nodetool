/**
 * @jest-environment node
 */
import {
  cn,
  reactFlowClasses,
  textFieldNodragSlotProps,
} from "../editorUtils";

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out falsy values", () => {
    expect(cn("foo", false, "bar", null, undefined, "baz")).toBe(
      "foo bar baz"
    );
  });

  it("returns empty string when all values are falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("handles single class", () => {
    expect(cn("only")).toBe("only");
  });

  it("handles no arguments", () => {
    expect(cn()).toBe("");
  });

  it("works with conditional expressions", () => {
    const isFocused = true;
    const isDisabled = false;
    expect(
      cn(
        reactFlowClasses.nodrag,
        isFocused && reactFlowClasses.nowheel,
        isDisabled && "disabled"
      )
    ).toBe("nodrag nowheel");
  });
});

describe("reactFlowClasses", () => {
  it("has the expected class names", () => {
    expect(reactFlowClasses.nodrag).toBe("nodrag");
    expect(reactFlowClasses.nowheel).toBe("nowheel");
    expect(reactFlowClasses.nopan).toBe("nopan");
  });
});

describe("textFieldNodragSlotProps", () => {
  it("provides nodrag class for input and htmlInput slots", () => {
    expect(textFieldNodragSlotProps.input.className).toBe("nodrag");
    expect(textFieldNodragSlotProps.htmlInput.className).toBe("nodrag");
  });
});
