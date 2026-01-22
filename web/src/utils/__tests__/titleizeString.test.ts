import { titleizeString } from "../titleizeString";

describe("titleizeString", () => {
  describe("Normal Cases", () => {
    it("should titleize a simple string", () => {
      expect(titleizeString("hello")).toBe("Hello");
    });

    it("should titleize a multi-word string with spaces", () => {
      expect(titleizeString("hello world")).toBe("Hello World");
    });

    it("should titleize a string with underscores", () => {
      expect(titleizeString("hello_world")).toBe("Hello World");
    });

    it("should titleize a string with multiple underscores", () => {
      expect(titleizeString("hello_world_test")).toBe("Hello World Test");
    });

    it("should titleize a string with mixed spaces and underscores", () => {
      expect(titleizeString("hello_world test")).toBe("Hello World Test");
    });

    it("should not preserve leading spaces", () => {
      expect(titleizeString("  hello world")).not.toBe("  Hello World");
    });

    it("should not preserve trailing spaces", () => {
      expect(titleizeString("hello world  ")).not.toBe("Hello World  ");
    });

    it("should collapse multiple consecutive spaces to single space", () => {
      expect(titleizeString("hello   world")).toBe("Hello World");
    });

    it("should collapse multiple consecutive underscores to single space", () => {
      expect(titleizeString("hello___world")).toBe("Hello World");
    });

    it("should handle mixed case input", () => {
      expect(titleizeString("HELLO WORLD")).toBe("Hello World");
    });

    it("should handle camelCase input", () => {
      expect(titleizeString("helloWorld")).toBe("Helloworld");
    });

    it("should handle PascalCase input", () => {
      expect(titleizeString("HelloWorld")).toBe("Helloworld");
    });

    it("should not capitalize letters after @ symbol", () => {
      expect(titleizeString("hello@world")).toBe("Hello@world");
    });
  });

  describe("Edge Cases", () => {
    it("should return empty string for undefined", () => {
      expect(titleizeString(undefined)).toBe("");
    });

    it("should return empty string for null", () => {
      expect(titleizeString(null)).toBe("");
    });

    it("should return empty string for empty string", () => {
      expect(titleizeString("")).toBe("");
    });

    it("should handle single character", () => {
      expect(titleizeString("a")).toBe("A");
    });

    it("should handle single word", () => {
      expect(titleizeString("test")).toBe("Test");
    });

    it("should handle numbers in string", () => {
      expect(titleizeString("test123")).toBe("Test123");
    });

    it("should preserve @ symbol", () => {
      expect(titleizeString("hello@world")).toBe("Hello@world");
    });

    it("should collapse string with only spaces to single space", () => {
      expect(titleizeString("   ")).toBe(" ");
    });

    it("should collapse string with only underscores to single space", () => {
      expect(titleizeString("___")).toBe(" ");
    });

    it("should collapse string with mixed spaces and underscores to single space", () => {
      expect(titleizeString("_  _  _")).toBe(" ");
    });
  });

  describe("Complex Cases", () => {
    it("should handle workflow names", () => {
      expect(titleizeString("image_generation_workflow")).toBe("Image Generation Workflow");
    });

    it("should handle node type names", () => {
      expect(titleizeString("text_to_speech")).toBe("Text To Speech");
    });

    it("should handle snake_case variables", () => {
      expect(titleizeString("my_custom_variable")).toBe("My Custom Variable");
    });

    it("should not transform kebab-case", () => {
      expect(titleizeString("my-custom-variable")).toBe("My-custom-variable");
    });

    it("should handle file paths", () => {
      expect(titleizeString("path_to_file")).toBe("Path To File");
    });

    it("should handle IDs with prefix", () => {
      expect(titleizeString("node_id_123")).toBe("Node Id 123");
    });
  });
});
