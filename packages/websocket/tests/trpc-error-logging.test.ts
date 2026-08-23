import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@nodetool-ai/config";
import { TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";
import {
  logTrpcRequestError,
  trpcErrorLogLevel
} from "../src/trpc/error-logging.js";

function createLoggerSpy(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("tRPC error logging", () => {
  it.each(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"] as const)(
    "logs expected %s failures as warnings",
    (code) => {
      expect(trpcErrorLogLevel(new TRPCError({ code }))).toBe("warn");
    }
  );

  it("logs unexpected server failures as errors with request context", () => {
    const logger = createLoggerSpy();
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "database unavailable"
    });

    logTrpcRequestError(logger, {
      error,
      path: "jobs.list",
      requestId: "req-42"
    });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "tRPC request failed",
      expect.objectContaining({
        requestId: "req-42",
        path: "jobs.list",
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        error
      })
    );
  });

  it("keeps output-validation details at error level", () => {
    const logger = createLoggerSpy();
    let cause: ZodError;
    try {
      z.object({ id: z.string() }).parse({ id: 7 });
      throw new Error("Expected parsing to fail");
    } catch (error) {
      cause = error as ZodError;
    }
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Output validation failed",
      cause
    });

    logTrpcRequestError(logger, {
      error,
      path: "worker.instances.list",
      requestId: "req-output"
    });

    expect(logger.error).toHaveBeenCalledWith(
      "tRPC request failed",
      expect.objectContaining({
        requestId: "req-output",
        validationIssues: cause.issues
      })
    );
  });
});
