/**
 * @jest-environment node
 */
import {
  assertJsScriptTestsPresent,
  JS_SCRIPT_NO_TESTS_ERROR,
  missingDeclaredOutputs
} from "../jsScriptRunGates";

describe("missingDeclaredOutputs", () => {
  const ports = [{ name: "total" }, { name: "count" }];

  it("returns every declared name when the bag is empty or missing", () => {
    expect(missingDeclaredOutputs(ports, {})).toEqual(["total", "count"]);
    expect(missingDeclaredOutputs(ports, undefined)).toEqual(["total", "count"]);
  });

  it("returns only the names that do not appear in the bag", () => {
    expect(missingDeclaredOutputs(ports, { total: 3 })).toEqual(["count"]);
    expect(missingDeclaredOutputs(ports, { total: 3, count: 1 })).toEqual([]);
  });

  it("treats a key with an undefined value as produced", () => {
    expect(missingDeclaredOutputs(ports, { total: undefined })).toEqual([
      "count"
    ]);
  });
});

describe("assertJsScriptTestsPresent", () => {
  it("throws when there are no saved cases", () => {
    expect(() => assertJsScriptTestsPresent([])).toThrow(JS_SCRIPT_NO_TESTS_ERROR);
  });

  it("does not throw when at least one case is present", () => {
    expect(() =>
      assertJsScriptTestsPresent([{ name: "adds" }])
    ).not.toThrow();
  });
});
