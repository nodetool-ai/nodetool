import { describe, it, expect } from "vitest";
import { ApiErrorCode, apiError } from "../src/api-schemas/api-error-code.js";
import { isTRPCErrorWithCode } from "../src/api-schemas/error-helpers.js";
import { validateAgentClientMessage } from "../src/agent-protocol.js";
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
    expect(BRIDGE_PROTOCOL_VERSION).toBe(3);
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

describe("validateAgentClientMessage", () => {
  it("rejects non-objects", () => {
    expect(validateAgentClientMessage(null)).toEqual({
      ok: false,
      error: "message is not an object"
    });
    expect(validateAgentClientMessage("str").ok).toBe(false);
    expect(validateAgentClientMessage(123).ok).toBe(false);
  });

  it("rejects a missing/non-string command", () => {
    const r = validateAgentClientMessage({ request_id: "r1" });
    expect(r).toEqual({ ok: false, error: "missing or non-string `command`" });
  });

  it("rejects a missing/non-string request_id", () => {
    const r = validateAgentClientMessage({ command: "create_session" });
    expect(r).toEqual({
      ok: false,
      error: "missing or non-string `request_id`"
    });
  });

  it("rejects an unknown command", () => {
    const r = validateAgentClientMessage({
      command: "frobnicate",
      request_id: "r1"
    });
    expect(r).toEqual({ ok: false, error: "unknown command: frobnicate" });
  });

  it("create_session requires an options object", () => {
    expect(
      validateAgentClientMessage({ command: "create_session", request_id: "r" })
        .ok
    ).toBe(false);
    const ok = validateAgentClientMessage({
      command: "create_session",
      request_id: "r",
      options: { model: "m" }
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.command).toBe("create_session");
  });

  it("send_message requires string session_id and message", () => {
    expect(
      validateAgentClientMessage({
        command: "send_message",
        request_id: "r",
        session_id: "s",
        message: 5
      }).ok
    ).toBe(false);
    expect(
      validateAgentClientMessage({
        command: "send_message",
        request_id: "r",
        session_id: "s",
        message: "hello"
      }).ok
    ).toBe(true);
  });

  it("stop_execution and close_session require string session_id", () => {
    for (const command of ["stop_execution", "close_session"]) {
      const bad = validateAgentClientMessage({ command, request_id: "r" });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error).toContain("`session_id` must be a string");
      expect(
        validateAgentClientMessage({ command, request_id: "r", session_id: "s" })
          .ok
      ).toBe(true);
    }
  });

  it("set_memory_enabled requires string session_id and boolean enabled", () => {
    expect(
      validateAgentClientMessage({
        command: "set_memory_enabled",
        request_id: "r",
        session_id: "s",
        enabled: "yes"
      }).ok
    ).toBe(false);
    expect(
      validateAgentClientMessage({
        command: "set_memory_enabled",
        request_id: "r",
        session_id: "s",
        enabled: true
      }).ok
    ).toBe(true);
  });

  it("list_models/list_sessions/get_session_messages require options object", () => {
    for (const command of [
      "list_models",
      "list_sessions",
      "get_session_messages"
    ]) {
      const bad = validateAgentClientMessage({ command, request_id: "r" });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error).toContain("`options` is required");
      expect(
        validateAgentClientMessage({ command, request_id: "r", options: {} }).ok
      ).toBe(true);
    }
  });

  it("tools_manifest_response requires an array manifest", () => {
    expect(
      validateAgentClientMessage({
        command: "tools_manifest_response",
        request_id: "r",
        manifest: {}
      }).ok
    ).toBe(false);
    expect(
      validateAgentClientMessage({
        command: "tools_manifest_response",
        request_id: "r",
        manifest: []
      }).ok
    ).toBe(true);
  });

  it("tool_call_response requires a result object", () => {
    expect(
      validateAgentClientMessage({
        command: "tool_call_response",
        request_id: "r",
        result: "nope"
      }).ok
    ).toBe(false);
    const ok = validateAgentClientMessage({
      command: "tool_call_response",
      request_id: "r",
      result: { isError: false }
    });
    expect(ok.ok).toBe(true);
  });

  it("null options is rejected even though typeof null is object", () => {
    // options === null: `!obj.options` short-circuits to true → rejected
    expect(
      validateAgentClientMessage({
        command: "create_session",
        request_id: "r",
        options: null
      }).ok
    ).toBe(false);
  });
});
