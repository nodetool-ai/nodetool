/**
 * Unit tests for the tRPC error formatter's apiCode resolution.
 *
 * Every error response must carry a consistent `apiCode`: explicit when a
 * router uses throwApiError(), and derived from the TRPC code as a fallback
 * for raw TRPCError throws, so clients can branch on it uniformly.
 */
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape } from "@trpc/server";
import {
  errorFormatter,
  throwApiError
} from "../src/trpc/error-formatter.js";
import { ApiErrorCode } from "../src/error-codes.js";

function shapeFor(error: TRPCError): TRPCDefaultErrorShape {
  return {
    message: error.message,
    code: -32600,
    data: {
      code: error.code,
      httpStatus: 400
    }
  } as TRPCDefaultErrorShape;
}

function format(error: TRPCError) {
  return errorFormatter({ shape: shapeFor(error), error });
}

describe("errorFormatter apiCode resolution", () => {
  it("uses the explicit apiCode from throwApiError", () => {
    let thrown: TRPCError | undefined;
    try {
      throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "missing");
    } catch (e) {
      thrown = e as TRPCError;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect(format(thrown!).data.apiCode).toBe(ApiErrorCode.WORKFLOW_NOT_FOUND);
  });

  it("derives apiCode from the TRPC code for a raw TRPCError", () => {
    const error = new TRPCError({ code: "NOT_FOUND", message: "nope" });
    expect(format(error).data.apiCode).toBe(ApiErrorCode.NOT_FOUND);
  });

  it("maps BAD_REQUEST to INVALID_INPUT", () => {
    const error = new TRPCError({ code: "BAD_REQUEST", message: "bad" });
    expect(format(error).data.apiCode).toBe(ApiErrorCode.INVALID_INPUT);
  });

  it("returns null apiCode for codes without a mapping", () => {
    const error = new TRPCError({ code: "TIMEOUT", message: "slow" });
    expect(format(error).data.apiCode).toBeNull();
  });
});
