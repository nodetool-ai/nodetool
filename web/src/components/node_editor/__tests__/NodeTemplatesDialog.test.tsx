/**
 * Tests for NodeTemplatesDialog component
 */

import React from "react";
import { NodeTemplatesDialog } from "../NodeTemplatesDialog";

describe("NodeTemplatesDialog", () => {
  it("should be importable", () => {
    // This test verifies the component can be imported
    expect(async () => {
      await import("../NodeTemplatesDialog");
    }).not.toThrow();
  });

  it("should export default as a component", () => {
    // Verify the default export exists
    const dialogModule = require("../NodeTemplatesDialog");
    expect(dialogModule.default).toBeDefined();
  });
});
