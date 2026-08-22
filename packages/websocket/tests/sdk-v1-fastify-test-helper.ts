import Fastify from "fastify";
import type { HttpApiOptions } from "../src/http-api.js";
import sdkV1Routes from "../src/routes/sdk-v1.js";

/** Sends one Web Request through the production SDK v1 Fastify plugin. */
export async function requestSdkV1Route(
  request: Request,
  apiOptions: HttpApiOptions
): Promise<Response> {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (fastifyRequest) => {
    const userId = fastifyRequest.headers["x-user-id"];
    fastifyRequest.userId = typeof userId === "string" ? userId : null;
  });
  await app.register(sdkV1Routes, { apiOptions });
  await app.ready();
  try {
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const injected = await app.inject({
      method: request.method as "GET" | "POST",
      url: `${new URL(request.url).pathname}${new URL(request.url).search}`,
      headers: Object.fromEntries(request.headers.entries()),
      payload: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined
    });
    return new Response(injected.rawPayload, {
      status: injected.statusCode,
      headers: injected.headers as Record<string, string>
    });
  } finally {
    await app.close();
  }
}
