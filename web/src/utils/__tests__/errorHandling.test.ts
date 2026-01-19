import { AppError, createErrorMessage } from "../errorHandling";

describe("errorHandling", () => {
  describe("AppError", () => {
    it("creates error with message only", () => {
      const error = new AppError("Test error message");
      expect(error.message).toBe("Test error message");
      expect(error.name).toBe("AppError");
      expect(error.detail).toBeUndefined();
    });

    it("creates error with message and detail", () => {
      const error = new AppError("Test error", "Detailed information");
      expect(error.message).toBe("Test error");
      expect(error.detail).toBe("Detailed information");
      expect(error.name).toBe("AppError");
    });

    it("is instance of Error", () => {
      const error = new AppError("Test");
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("createErrorMessage", () => {
    it("returns AppError with detail from error object with detail property", () => {
      const inputError = { detail: "Detailed error info" };
      const result = createErrorMessage(inputError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Detailed error info");
    });

    it("returns AppError with string as detail", () => {
      const result = createErrorMessage("Simple string error", "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Simple string error");
    });

    it("returns AppError with error.message as detail", () => {
      const originalError = new Error("Original error message");
      const result = createErrorMessage(originalError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Original error message");
    });

    it("returns AppError with empty detail when error has no detail", () => {
      const inputError = { otherProp: "value" };
      const result = createErrorMessage(inputError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("returns AppError with empty detail for null", () => {
      const result = createErrorMessage(null as any, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
    });

    it("returns AppError with empty detail for undefined", () => {
      const result = createErrorMessage(undefined as any, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
    });

    it("handles error object with falsy detail", () => {
      const inputError = { detail: 0 };
      const result = createErrorMessage(inputError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("handles error object with empty string detail", () => {
      const inputError = { detail: "" };
      const result = createErrorMessage(inputError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });
  });
});
