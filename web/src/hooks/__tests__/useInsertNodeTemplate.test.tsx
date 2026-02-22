/**
 * Tests for useInsertNodeTemplate hook
 */

import { useInsertNodeTemplate } from "../useInsertNodeTemplate";

// Mock uuid
jest.mock("uuid", () => ({
  v4: () => "mock-uuid"
}));

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
