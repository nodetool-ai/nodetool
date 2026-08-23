import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isSdkV1RetryableError,
  sdkV1HttpError
} from "../src/api-schemas/sdk-v1.js";
import {
  sdkWorkflowSummariesOutput,
  workflowInterfaceV1
} from "../src/api-schemas/workflows.js";

interface HttpFixture {
  captures: {
    success: { response: { body: unknown } };
  };
}

function loadSuccess(name: string): unknown {
  const path = new URL(`../fixtures/sdk-v1/${name}`, import.meta.url);
  const fixture = JSON.parse(readFileSync(path, "utf8")) as HttpFixture;
  return fixture.captures.success.response.body;
}

describe("public SDK v1 schemas", () => {
  it("validates the captured REST discovery responses", () => {
    expect(() =>
      sdkWorkflowSummariesOutput.parse(loadSuccess("http-get-workflows.json"))
    ).not.toThrow();
    expect(() =>
      workflowInterfaceV1.parse(
        loadSuccess("http-get-workflow-interface.json")
      )
    ).not.toThrow();
  });

  it("validates the additive HTTP error envelope", () => {
    expect(
      sdkV1HttpError.parse({
        code: "WORKFLOW_NOT_FOUND",
        message: "Workflow not found",
        retryable: false
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
});
