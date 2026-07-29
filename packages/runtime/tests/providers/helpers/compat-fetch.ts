import { vi, type Mock } from "vitest";

/** JSON 200 response for a non-streaming chat completion. */
export function chatJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

/** Encode chunk objects as an OpenAI-style SSE stream, ending in `[DONE]`. */
export function sseBody(chunks: unknown[]): string {
  const events = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`);
  return `${events.join("")}data: [DONE]\n\n`;
}

/** SSE 200 response for a streaming chat completion. */
export function chatSSEResponse(chunks: unknown[]): Response {
  return new Response(sseBody(chunks), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

/** OpenAI-style error response (`{"error": {"message": …}}`). */
export function chatErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Mock `fetch` returning the given response for every call. Pass a factory to
 * vary responses per call; each call gets a fresh Response either way.
 */
export function mockChatFetch(
  response: Response | (() => Response)
): Mock<typeof fetch> {
  if (typeof response === "function") {
    return vi.fn(async () => response()) as unknown as Mock<typeof fetch>;
  }
  // Rebuild a fresh Response per call — a shared body can only be read once.
  const status = response.status;
  const headers = new Headers(response.headers);
  const bodyText = response.text();
  return vi.fn(
    async () => new Response(await bodyText, { status, headers })
  ) as unknown as Mock<typeof fetch>;
}

/** The parsed JSON body of the `index`-th call made to a mocked fetch. */
export function requestBodyOf(
  fetchMock: Mock<typeof fetch>,
  index = 0
): Record<string, unknown> {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}
