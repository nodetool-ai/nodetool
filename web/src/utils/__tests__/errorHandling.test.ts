import { AppError, createErrorMessage } from "../errorHandling";

describe("errorHandling", () => {
  describe("AppError", () => {
    it("creates error with message", () => {
      const error = new AppError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("AppError");
      expect(error.detail).toBeUndefined();
    });

    it("creates error with message and detail", () => {
      const error = new AppError("Test error", "Additional detail");
      expect(error.message).toBe("Test error");
      expect(error.detail).toBe("Additional detail");
    });

    it("is instance of Error", () => {
      const error = new AppError("Test error");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it("has stack trace", () => {
      const error = new AppError("Test error");
      expect(error.stack).toBeDefined();
    });
  });

  describe("createErrorMessage", () => {
    it("wraps error with detail property", () => {
      const error = { detail: "Specific error" };
      const result = createErrorMessage(error, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Specific error");
    });

    it("wraps string error", () => {
      const result = createErrorMessage("String error", "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("String error");
    });

    it("wraps Error instance", () => {
      const originalError = new Error("Original error");
      const result = createErrorMessage(originalError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Original error");
    });

    it("returns AppError with default detail for unknown error type", () => {
      const result = createErrorMessage(123, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("returns AppError with default detail for null", () => {
      const result = createErrorMessage(null, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("returns AppError with default detail for undefined", () => {
      const result = createErrorMessage(undefined, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("handles object with falsy detail", () => {
      const error = { detail: "" };
      const result = createErrorMessage(error, "Default message");
      expect(result.message).toBe("Default message");
      // Empty string is truthy in "detail in error" but falsy as value for error.detail check
      expect((result as AppError).detail).toBeUndefined();
    });

    it("prioritizes error.detail over other error properties", () => {
      const error = {
        detail: "From detail",
        message: "From message",
        other: "Other"
      };
      const result = createErrorMessage(error, "Default message");
      expect((result as AppError).detail).toBe("From detail");
    });

    it("handles error with numeric detail", () => {
      const error = { detail: 42 };
      const result = createErrorMessage(error, "Default message");
      expect((result as AppError).detail).toBe("42");
    });

    it("handles deeply nested detail", () => {
      const error = { detail: { nested: "value" } };
      const result = createErrorMessage(error, "Default message");
      expect((result as AppError).detail).toBe("[object Object]");
    });
  });
});
