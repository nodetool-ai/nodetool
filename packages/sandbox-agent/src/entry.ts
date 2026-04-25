/**
 * Container entrypoint: start the Fastify tool server.
 *
 * Port is read from NODETOOL_TOOL_PORT (injected by the host provider).
 * Bound to 0.0.0.0 since the container is the isolation boundary; the
 * published port is already bound to 127.0.0.1 on the host.
 */

import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const port = parseInt(process.env.NODETOOL_TOOL_PORT ?? "7788", 10);
  const workspace = process.env.NODETOOL_WORKSPACE ?? "/workspace";
  const app = buildServer({ workspace });

  try {
    await app.listen({ host: "0.0.0.0", port });
    // eslint-disable-next-line no-console
    console.log(`[sandbox-agent] listening on :${port}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[sandbox-agent] failed to start:", err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[sandbox-agent] received ${signal}, shutting down`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
