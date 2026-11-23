import { isImeComposing } from "../ime";

describe("isImeComposing", () => {
  it("is true while an input method composes, for DOM and React events", () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: true, keyCode: 13 } })).toBe(true);
  });

  it("is true for Safari's confirming Enter, which reports keyCode 229", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("is false for a plain Enter", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({ nativeEvent: { isComposing: false, keyCode: 13 } })).toBe(false);
  });
});
