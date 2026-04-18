/**
 * Binary-only REST routes for storage.
 * JSON ops (list, metadata, delete) have moved to the tRPC `storage` router.
 */
import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { createStorageHandler } from "../storage-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const storageRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;
  const storageHandler = createStorageHandler(apiOptions.storage);

  // Register all methods so unsupported verbs (DELETE, POST, …) reach the
  // handler and get a proper 405 instead of Fastify's default 404.
  app.all("/api/storage/*", async (req, reply) => {
    await bridge(req, reply, (request) => storageHandler(request));
  });
};

export default storageRoutes;
