import { AppError, createErrorMessage } from "../errorHandling";

describe("errorHandling utilities", () => {
  describe("AppError", () => {
    it("creates error with message only", () => {
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

    it("is instanceof Error", () => {
      const error = new AppError("Test");
      expect(error instanceof Error).toBe(true);
    });

    it("is instanceof AppError", () => {
      const error = new AppError("Test");
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe("createErrorMessage", () => {
    it("wraps string error", () => {
      const result = createErrorMessage("string error", "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect(result.detail).toBe("string error");
    });

    it("wraps Error object", () => {
      const originalError = new Error("Original error");
      const result = createErrorMessage(originalError, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
      expect(result.detail).toBe("Original error");
    });

    it("extracts detail from object with detail property", () => {
      const errorWithDetail = { detail: "Some detail", extra: "data" };
      const result = createErrorMessage(errorWithDetail, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.detail).toBe("Some detail");
    });

    it("ignores object without detail property", () => {
      const plainObject = { foo: "bar" };
      const result = createErrorMessage(plainObject, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.detail).toBeUndefined();
    });

    it("ignores null", () => {
      const result = createErrorMessage(null as unknown as Error, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
    });

    it("ignores undefined", () => {
      const result = createErrorMessage(undefined as unknown as Error, "Default message");
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe("Default message");
    });

    it("handles truthy detail string", () => {
      const errorWithDetail = { detail: "0" }; // "0" is truthy
      const result = createErrorMessage(errorWithDetail, "Default");
      expect(result.detail).toBe("0");
    });
  });
});
