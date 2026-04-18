/**
 * Binary-only REST routes for the file browser.
 * JSON ops (list, info) have moved to the tRPC `files` router.
 */
import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleFileRequest } from "../file-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const filesRoutes: FastifyPluginAsync<RouteOptions> = async (app, _opts) => {
  // Register all methods so unsupported verbs reach the handler and get the
  // explicit 405 response instead of Fastify's default 404.
  app.all("/api/files/download", async (req, reply) => {
    await bridge(req, reply, (request) => handleFileRequest(request));
  });
};

export default filesRoutes;
