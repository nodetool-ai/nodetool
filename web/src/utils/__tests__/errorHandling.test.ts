import { AppError, createErrorMessage } from "../errorHandling";

describe("errorHandling", () => {
  describe("AppError", () => {
    it("creates error with message", () => {
      const error = new AppError("Test error message");
      expect(error.message).toBe("Test error message");
      expect(error.name).toBe("AppError");
      expect(error.detail).toBeUndefined();
    });

    it("creates error with message and detail", () => {
      const error = new AppError("Test error", "Additional detail");
      expect(error.message).toBe("Test error");
      expect(error.detail).toBe("Additional detail");
    });

    it("is instance of Error", () => {
      const error = new AppError("Test");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    it("has stack trace", () => {
      const error = new AppError("Test");
      expect(error.stack).toBeDefined();
    });
  });

  describe("createErrorMessage", () => {
    it("creates AppError from object with detail property", () => {
      const error = { detail: "Specific error detail" };
      const result = createErrorMessage(error, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Specific error detail");
    });

    it("creates AppError from string", () => {
      const result = createErrorMessage("Error string", "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Error string");
    });

    it("creates AppError from Error instance", () => {
      const originalError = new Error("Original error message");
      const result = createErrorMessage(originalError, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBe("Original error message");
    });

    it("creates AppError with default detail when no detail available", () => {
      const result = createErrorMessage({}, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("handles null", () => {
      const result = createErrorMessage(null, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
    });

    it("handles undefined", () => {
      const result = createErrorMessage(undefined, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
    });

    it("handles number", () => {
      const result = createErrorMessage(123, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      // Numbers are converted to strings when used as error.detail
      expect((result as AppError).detail).toBeUndefined();
    });

    it("handles object without detail", () => {
      const error = { code: "ERROR_CODE", message: "Something went wrong" };
      const result = createErrorMessage(error, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("does not set detail for object with empty detail (falsy)", () => {
      const error = { detail: "" };
      const result = createErrorMessage(error, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });

    it("does not set detail for object with falsy detail (0)", () => {
      const error = { detail: 0 };
      const result = createErrorMessage(error, "Default message");
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect((result as AppError).detail).toBeUndefined();
    });
  });
});
