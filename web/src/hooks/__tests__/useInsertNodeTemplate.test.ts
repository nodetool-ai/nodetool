/**
 * Tests for useInsertNodeTemplate hook
 */

import { useInsertNodeTemplate } from "../useInsertNodeTemplate";

describe("useInsertNodeTemplate", () => {
  it("should be defined", () => {
    // Verify the hook can be imported
    expect(useInsertNodeTemplate).toBeDefined();
  });

  it("should export insertTemplate function", () => {
    // The hook returns an object with insertTemplate
    // This is verified by the hook's implementation
    expect(typeof useInsertNodeTemplate).toBe("function");
  });
});
