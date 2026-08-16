import { describe, it, expect } from "vitest";
import { ApiErrorCode, apiError } from "../src/api-schemas/api-error-code.js";
import { isTRPCErrorWithCode } from "../src/api-schemas/error-helpers.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  MIN_BRIDGE_PROTOCOL_VERSION,
  MIN_NODETOOL_CORE_VERSION
} from "../src/bridge-protocol.js";

describe("api-error-code", () => {
  it("apiError builds a response carrying the given code and detail", () => {
    const res = apiError(ApiErrorCode.NOT_FOUND, "no such thing");
    expect(res).toEqual({ code: ApiErrorCode.NOT_FOUND, detail: "no such thing" });
  });

  it("apiError preserves an empty detail string", () => {
    expect(apiError(ApiErrorCode.INTERNAL_ERROR, "")).toEqual({
      code: ApiErrorCode.INTERNAL_ERROR,
      detail: ""
    });
  });

  it("enum members map to their own string names", () => {
    expect(ApiErrorCode.WORKFLOW_NOT_FOUND).toBe("WORKFLOW_NOT_FOUND");
    expect(ApiErrorCode.ASSET_UPLOAD_FAILED).toBe("ASSET_UPLOAD_FAILED");
    expect(ApiErrorCode.PYTHON_BRIDGE_UNAVAILABLE).toBe(
      "PYTHON_BRIDGE_UNAVAILABLE"
    );
  });

  it("enum values are all unique", () => {
    const values = Object.values(ApiErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("error-helpers.isTRPCErrorWithCode", () => {
  it("matches when data.apiCode equals the requested code", () => {
    const err = { message: "boom", data: { apiCode: ApiErrorCode.NOT_FOUND } };
    expect(isTRPCErrorWithCode(err, ApiErrorCode.NOT_FOUND)).toBe(true);
  });

  it("does not match a different apiCode", () => {
    const err = { message: "boom", data: { apiCode: ApiErrorCode.FORBIDDEN } };
    expect(isTRPCErrorWithCode(err, ApiErrorCode.NOT_FOUND)).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isTRPCErrorWithCode(null, ApiErrorCode.NOT_FOUND)).toBe(false);
    expect(isTRPCErrorWithCode(undefined, ApiErrorCode.NOT_FOUND)).toBe(false);
  });

  it("returns false for non-object primitives", () => {
    expect(isTRPCErrorWithCode("nope", ApiErrorCode.NOT_FOUND)).toBe(false);
    expect(isTRPCErrorWithCode(42, ApiErrorCode.NOT_FOUND)).toBe(false);
  });

  it("returns false when data is missing", () => {
    expect(isTRPCErrorWithCode({ message: "x" }, ApiErrorCode.NOT_FOUND)).toBe(
      false
    );
  });

  it("returns false when data is null", () => {
    expect(
      isTRPCErrorWithCode({ message: "x", data: null }, ApiErrorCode.NOT_FOUND)
    ).toBe(false);
  });

  it("returns false when apiCode is null", () => {
    expect(
      isTRPCErrorWithCode(
        { message: "x", data: { apiCode: null } },
        ApiErrorCode.NOT_FOUND
      )
    ).toBe(false);
  });
});

describe("bridge-protocol constants", () => {
  it("BRIDGE_PROTOCOL_VERSION is the current speaking version", () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe(4);
  });

  it("MIN_BRIDGE_PROTOCOL_VERSION is the hard floor at 1", () => {
    expect(MIN_BRIDGE_PROTOCOL_VERSION).toBe(1);
  });

  it("the floor never exceeds the current version", () => {
    expect(MIN_BRIDGE_PROTOCOL_VERSION).toBeLessThanOrEqual(
      BRIDGE_PROTOCOL_VERSION
    );
  });

  it("MIN_NODETOOL_CORE_VERSION is a PEP 440 style version string", () => {
    expect(MIN_NODETOOL_CORE_VERSION).toBe("0.7.0");
    expect(MIN_NODETOOL_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
