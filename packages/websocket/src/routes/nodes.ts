import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleNodesDummy, handleNodeMetadata } from "../http-api.js";
import { getSecret } from "@nodetool/security";

interface RouteOptions { apiOptions: HttpApiOptions }

const nodesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/nodes/replicate_status", async (_req, reply) => {
    const replicateKey = await getSecret("REPLICATE_API_TOKEN", "1");
    reply.send({ configured: Boolean(replicateKey) });
  });

  app.get("/api/users/validate_username", async (req, reply) => {
    const username = (req.query as Record<string, string>)["username"];
    if (username === undefined) {
      reply.status(400).send({ detail: "username parameter is required" });
      return;
    }
    if (!username) {
      reply.status(400).send({ detail: "username cannot be empty" });
      return;
    }
    const valid = /^[a-zA-Z0-9_-]{3,32}$/.test(username);
    reply.send({ valid, available: true });
  });

  app.get("/api/nodes/dummy", async (req, reply) => {
    await bridge(req, reply, (request) => handleNodesDummy(request));
  });

  app.get("/api/nodes/metadata", async (req, reply) => {
    await bridge(req, reply, (request) => handleNodeMetadata(request, apiOptions));
  });

  app.get("/api/node/metadata", async (req, reply) => {
    await bridge(req, reply, (request) => handleNodeMetadata(request, apiOptions));
  });

  /**
   * Proxy ComfyUI /object_info through the backend to avoid CORS issues
   * with remote hosts (e.g. RunPod Pods).
   */
  app.get("/api/comfy/object_info", async (req, reply) => {
    const host = (req.query as Record<string, string>)["host"];
    if (!host) {
      reply.status(400).send({ error: "host query parameter is required" });
      return;
    }
    const base = host.startsWith("http") ? host.replace(/\/+$/, "") : `http://${host}`;
    try {
      const resp = await fetch(`${base}/object_info`);
      if (!resp.ok) {
        reply.status(resp.status).send({ error: `ComfyUI returned ${resp.status}` });
        return;
      }
      const data = await resp.json();
      reply.send(data);
    } catch (err) {
      reply.status(502).send({ error: `Cannot reach ComfyUI at ${base}: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
};

export default nodesRoutes;
