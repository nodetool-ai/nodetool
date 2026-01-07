import { useNodeSuggestions } from "../useNodeSuggestions";

describe("useNodeSuggestions", () => {
  describe("export", () => {
    it("is defined", () => {
      expect(useNodeSuggestions).toBeDefined();
    });

    it("is a function", () => {
      expect(typeof useNodeSuggestions).toBe("function");
    });
  });
});
