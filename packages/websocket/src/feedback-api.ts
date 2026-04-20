const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/json"
]);

export type FeedbackDestination = "discord" | "email";
export type FeedbackType = "bug" | "feature";

export interface FeedbackAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: Uint8Array;
}

export interface FeedbackSubmission {
  username: string;
  feedbackType: FeedbackType;
  message: string;
  destinations: FeedbackDestination[];
  workflowJson?: string;
  attachments: FeedbackAttachment[];
  userId?: string | null;
}

export interface FeedbackHandlerDependencies {
  submitFeedback: (
    submission: FeedbackSubmission
  ) => Promise<{ deliveredTo: FeedbackDestination[] }>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function normalizeDestinations(rawValue: string | File | null): FeedbackDestination[] {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return ["email"];
  }

  let parsed: unknown = rawValue;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    parsed = rawValue.split(",").map((value) => value.trim());
  }

  if (!Array.isArray(parsed)) {
    return ["email"];
  }

  const filtered = parsed.filter(
    (value): value is FeedbackDestination =>
      value === "discord" || value === "email"
  );

  return filtered.length > 0 ? filtered : ["email"];
}

async function normalizeAttachments(formData: FormData): Promise<FeedbackAttachment[]> {
  const attachments = formData.getAll("attachments");
  const normalized: FeedbackAttachment[] = [];

  for (const entry of attachments) {
    if (!(entry instanceof File)) {
      continue;
    }

    if (!ALLOWED_ATTACHMENT_TYPES.has(entry.type)) {
      throw new Error(`Unsupported attachment type: ${entry.type || "unknown"}`);
    }

    if (entry.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`);
    }

    normalized.push({
      filename: entry.name,
      contentType: entry.type,
      size: entry.size,
      data: new Uint8Array(await entry.arrayBuffer())
    });
  }

  return normalized;
}

export async function handleFeedbackRequest(
  request: Request,
  dependencies: FeedbackHandlerDependencies
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse({ error: "Expected multipart form data" }, 400);
  }

  try {
    const formData = await request.formData();
    const username = String(formData.get("username") ?? "").trim();
    const feedbackType = String(formData.get("feedbackType") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const workflowJson = String(formData.get("workflowJson") ?? "").trim();

    if (!username) {
      return jsonResponse({ error: "Username is required" }, 400);
    }
    if (feedbackType !== "bug" && feedbackType !== "feature") {
      return jsonResponse({ error: "Feedback type must be bug or feature" }, 400);
    }
    if (!message) {
      return jsonResponse({ error: "Message is required" }, 400);
    }

    const submission: FeedbackSubmission = {
      username,
      feedbackType,
      message,
      destinations: normalizeDestinations(formData.get("destinations")),
      workflowJson: workflowJson || undefined,
      attachments: await normalizeAttachments(formData),
      userId: request.headers.get("x-user-id")
    };

    const result = await dependencies.submitFeedback(submission);
    return jsonResponse({
      ok: true,
      deliveredTo: result.deliveredTo
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process feedback";
    return jsonResponse({ error: message }, 400);
  }
}
