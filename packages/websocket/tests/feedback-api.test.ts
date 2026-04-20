import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleFeedbackRequest,
  type FeedbackHandlerDependencies,
  type FeedbackSubmission
} from "../src/feedback-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function createFeedbackRequest(
  options: {
    username?: string;
    feedbackType?: string;
    message?: string;
    destinations?: string[];
    workflowJson?: string;
    attachments?: File[];
  } = {}
): Request {
  const formData = new FormData();
  formData.set("username", options.username ?? "rkt");
  formData.set("feedbackType", options.feedbackType ?? "bug");
  formData.set("message", options.message ?? "The app crashed while saving.");
  formData.set("destinations", JSON.stringify(options.destinations ?? ["email"]));

  if (options.workflowJson) {
    formData.set("workflowJson", options.workflowJson);
  }

  for (const attachment of options.attachments ?? []) {
    formData.append("attachments", attachment);
  }

  return new Request("http://localhost/api/feedback", {
    method: "POST",
    body: formData,
    headers: {
      "x-user-id": "anonymous"
    }
  });
}

describe("handleFeedbackRequest", () => {
  let submitFeedback: FeedbackHandlerDependencies["submitFeedback"];
  let capturedSubmission: FeedbackSubmission | null;

  beforeEach(() => {
    capturedSubmission = null;
    submitFeedback = vi.fn(async (submission) => {
      capturedSubmission = submission;
      return { deliveredTo: submission.destinations };
    });
  });

  it("normalizes a multipart feedback request and dispatches it", async () => {
    const response = await handleFeedbackRequest(
      createFeedbackRequest({
        destinations: ["discord", "email"],
        workflowJson: '{"name":"Example"}',
        attachments: [
          new File(["log line"], "nodetool.log", { type: "text/plain" }),
          new File(["image-bytes"], "paste.png", { type: "image/png" })
        ]
      }),
      { submitFeedback }
    );

    expect(response.status).toBe(200);
    expect(submitFeedback).toHaveBeenCalledOnce();
    expect(capturedSubmission).toMatchObject({
      username: "rkt",
      feedbackType: "bug",
      message: "The app crashed while saving.",
      workflowJson: '{"name":"Example"}',
      destinations: ["discord", "email"]
    });
    expect(capturedSubmission?.attachments).toHaveLength(2);

    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(body.deliveredTo).toEqual(["discord", "email"]);
  });

  it("rejects attachments with unsupported content types", async () => {
    const response = await handleFeedbackRequest(
      createFeedbackRequest({
        attachments: [
          new File(["pdf-bytes"], "report.pdf", { type: "application/pdf" })
        ]
      }),
      { submitFeedback }
    );

    expect(response.status).toBe(400);
    expect(submitFeedback).not.toHaveBeenCalled();

    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(body.error).toContain("Unsupported attachment type");
  });
});
