import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleSecretsRoot, handleSecretByKey } from "../http-api.js";
import { handleSettingsRequest } from "../settings-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const settingsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/settings", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleSettingsRequest(
        request,
        "/api/settings",
        apiOptions
      );
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });
  app.put("/api/settings", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleSettingsRequest(
        request,
        "/api/settings",
        apiOptions
      );
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });

  app.get("/api/settings/secrets", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSecretsRoot(request, apiOptions)
    );
  });

  app.get("/api/settings/secrets/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    await bridge(req, reply, (request) =>
      handleSecretByKey(request, decodeURIComponent(key), apiOptions)
    );
  });
  app.put("/api/settings/secrets/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    await bridge(req, reply, (request) =>
      handleSecretByKey(request, decodeURIComponent(key), apiOptions)
    );
  });
  app.delete("/api/settings/secrets/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    await bridge(req, reply, (request) =>
      handleSecretByKey(request, decodeURIComponent(key), apiOptions)
    );
  });
};

export default settingsRoutes;
