import {
  consumePostLoginReturn,
  rememberPostLoginReturn
} from "../postLoginReturn";

describe("postLoginReturn", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns a remembered share page once", () => {
    rememberPostLoginReturn("/view/abc123");
    expect(consumePostLoginReturn()).toBe("/view/abc123");
    expect(consumePostLoginReturn()).toBeNull();
  });

  it("does not remember other paths", () => {
    rememberPostLoginReturn("/editor/abc");
    rememberPostLoginReturn("/view/a/b");
    expect(consumePostLoginReturn()).toBeNull();
  });

  it("rejects a stored value that is not a share page", () => {
    sessionStorage.setItem("nodetool.postLoginReturn", "https://evil.example");
    expect(consumePostLoginReturn()).toBeNull();
    expect(sessionStorage.getItem("nodetool.postLoginReturn")).toBeNull();
  });

  it("returns null when storage throws", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(consumePostLoginReturn()).toBeNull();
    spy.mockRestore();
  });
});
