import { AppError, createErrorMessage } from "./errorHandling";

describe("errorHandling", () => {
  describe("AppError", () => {
    it("creates error with message", () => {
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
    it("creates AppError from error with detail property", () => {
      const error = { detail: "Specific error detail" };
      const result = createErrorMessage(error, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Specific error detail");
    });

    it("creates AppError from string error", () => {
      const result = createErrorMessage("String error", "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("String error");
    });

    it("creates AppError from Error instance", () => {
      const originalError = new Error("Original error message");
      const result = createErrorMessage(originalError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Original error message");
    });

    it("creates AppError with no detail for unknown error type", () => {
      const result = createErrorMessage(null, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("creates AppError with no detail for number error", () => {
      const result = createErrorMessage(42, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect((result as AppError).detail).toBeUndefined();
    });

    it("prioritizes detail in error object", () => {
      const error = {
        detail: "Object detail",
        message: "Message property"
      } as any;
      const result = createErrorMessage(error, "Default message");
      expect((result as AppError).detail).toBe("Object detail");
    });
  });
});
