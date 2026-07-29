import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSdkV1SafeErrorMessage,
  isSdkV1RetryableError,
  sdkV1HttpError,
  sdkV1RpcRequest,
  sdkV1RpcResponse
} from "../src/api-schemas/sdk-v1.js";
import {
  sdkWorkflowSummariesOutput,
  workflowInterfaceV1
} from "../src/api-schemas/workflows.js";

interface BaselineFixture {
  rest: {
    summaries: { response: unknown };
    interface: { response: unknown };
  };
  websocket: {
    request: unknown;
    response: unknown;
  };
}

function loadFixture(): BaselineFixture {
  const path = new URL("../fixtures/sdk-v1-baseline.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as BaselineFixture;
}

describe("public SDK v1 baseline schemas", () => {
  const fixture = loadFixture();

  it("validates the captured REST discovery responses", () => {
    expect(() =>
      sdkWorkflowSummariesOutput.parse(fixture.rest.summaries.response)
    ).not.toThrow();
    expect(() =>
      workflowInterfaceV1.parse(fixture.rest.interface.response)
    ).not.toThrow();
  });

  it("validates the correlated WebSocket request and response", () => {
    expect(() => sdkV1RpcRequest.parse(fixture.websocket.request)).not.toThrow();
    expect(() =>
      sdkV1RpcResponse.parse(fixture.websocket.response)
    ).not.toThrow();
  });

  it("rejects an uncorrelated SDK request", () => {
    const request = {
      ...(fixture.websocket.request as Record<string, unknown>)
    };
    delete request.request_id;
    expect(() => sdkV1RpcRequest.parse(request)).toThrow();
  });

  it("validates the additive HTTP error envelope", () => {
    expect(
      sdkV1HttpError.parse({
        code: "WORKFLOW_NOT_FOUND",
        message: "Workflow not found",
        retryable: false,
        detail: "Workflow not found"
      })
    ).toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
      retryable: false
    });
  });

  it("classifies transient errors without retrying disabled features", () => {
    expect(isSdkV1RetryableError("SERVICE_UNAVAILABLE")).toBe(true);
    expect(
      isSdkV1RetryableError(
        "SERVICE_UNAVAILABLE",
        "SDK workflow interface v1 is disabled"
      )
    ).toBe(false);
    expect(isSdkV1RetryableError("WORKFLOW_NOT_FOUND")).toBe(false);
  });

  it("maps internal SDK errors to safe public messages", () => {
    expect(
      getSdkV1SafeErrorMessage(
        "INTERNAL_ERROR",
        "database password was hunter2"
      )
    ).toBe("Internal server error");
    expect(
      getSdkV1SafeErrorMessage(
        "SERVICE_UNAVAILABLE",
        "SDK workflow interface v1 is disabled"
      )
    ).toBe("SDK discovery is disabled");
  });
});
