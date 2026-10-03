import { isPermanentSaveError } from "../saveErrors";

const trpcError = (data: unknown) => ({ message: "failed", data });

describe("isPermanentSaveError", () => {
  describe("by HTTP status", () => {
    it.each([400, 401, 403, 404, 413, 422])(
      "treats %d as permanent",
      (httpStatus) => {
        expect(isPermanentSaveError(trpcError({ httpStatus }))).toBe(true);
      }
    );

    it.each([408, 425, 429])("treats retryable 4xx %d as transient", (httpStatus) => {
      expect(isPermanentSaveError(trpcError({ httpStatus }))).toBe(false);
    });

    it.each([500, 502, 503, 504])("treats %d as transient", (httpStatus) => {
      expect(isPermanentSaveError(trpcError({ httpStatus }))).toBe(false);
    });

    it("treats non-error statuses as transient", () => {
      expect(isPermanentSaveError(trpcError({ httpStatus: 399 }))).toBe(false);
    });

    it("prefers the status over a permanent code", () => {
      expect(
        isPermanentSaveError(
          trpcError({ httpStatus: 429, code: "BAD_REQUEST" })
        )
      ).toBe(false);
    });
  });

  describe("by tRPC code", () => {
    it.each([
      "BAD_REQUEST",
      "PARSE_ERROR",
      "PAYLOAD_TOO_LARGE",
      "UNPROCESSABLE_CONTENT",
      "UNSUPPORTED_MEDIA_TYPE",
      "METHOD_NOT_SUPPORTED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND"
    ])("treats %s as permanent when no status is present", (code) => {
      expect(isPermanentSaveError(trpcError({ code }))).toBe(true);
    });

    it.each(["INTERNAL_SERVER_ERROR", "TIMEOUT", "TOO_MANY_REQUESTS", "UNKNOWN"])(
      "treats %s as transient",
      (code) => {
        expect(isPermanentSaveError(trpcError({ code }))).toBe(false);
      }
    );
  });

  describe("unclassifiable errors", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "boom"],
      ["a number", 500],
      ["a plain Error", new Error("network down")],
      ["an object without data", { message: "x" }],
      ["null data", { data: null }],
      ["string data", { data: "BAD_REQUEST" }],
      ["empty data", { data: {} }]
    ])("treats %s as transient", (_label, error) => {
      expect(isPermanentSaveError(error)).toBe(false);
    });

    it("ignores a status that is not a number", () => {
      expect(isPermanentSaveError(trpcError({ httpStatus: "404" }))).toBe(false);
    });

    it("ignores a code that is not a string", () => {
      expect(isPermanentSaveError(trpcError({ code: 400 }))).toBe(false);
    });

    it("falls back to the code when the status is not a number", () => {
      expect(
        isPermanentSaveError(
          trpcError({ httpStatus: "500", code: "FORBIDDEN" })
        )
      ).toBe(true);
    });
  });
});
