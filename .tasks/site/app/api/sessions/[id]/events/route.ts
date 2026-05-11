import { type NextRequest } from "next/server";
import * as agent from "@/lib/agent";

export const dynamic = "force-dynamic";

// SSE stream of session events. Replays past events first, then subscribes to
// the in-process bus. Closes when the session reaches a terminal state.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const session = agent.getSession(sessionId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? parseInt(sinceParam, 10) : 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Replay buffered events.
      for (const e of agent.getSessionEvents(sessionId, since)) send(e);

      const live = agent.isLive(sessionId);
      if (!live) {
        send({ type: "_eos" });
        controller.close();
        closed = true;
        return;
      }

      const unsubscribe = agent.subscribe(sessionId, (event) => {
        send(event);
        if (event.type === "status") {
          const payload = event.payload as { status?: string };
          if (payload?.status && ["completed", "failed", "cancelled"].includes(payload.status)) {
            send({ type: "_eos" });
            unsubscribe();
            try {
              controller.close();
            } catch {}
            closed = true;
          }
        }
      });

      // Keep-alive ping every 15s.
      const ping = setInterval(() => {
        if (closed) {
          clearInterval(ping);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
          closed = true;
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
        closed = true;
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
