import {
  consumePostLoginReturn,
  rememberPostLoginReturn
} from "../postLoginReturn";

describe("postLoginReturn", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns a remembered share page once", () => {
    rememberPostLoginReturn("/view/tok_abc");
    expect(consumePostLoginReturn()).toBe("/view/tok_abc");
    expect(consumePostLoginReturn()).toBeNull();
  });

  it("ignores paths that are not share pages", () => {
    rememberPostLoginReturn("https://evil.example/");
    rememberPostLoginReturn("/workspace");
    expect(consumePostLoginReturn()).toBeNull();
  });
});
