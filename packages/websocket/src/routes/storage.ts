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

  app.head("/api/storage/*", async (req, reply) => {
    await bridge(req, reply, (request) => storageHandler(request));
  });

  app.get("/api/storage/*", async (req, reply) => {
    await bridge(req, reply, (request) => storageHandler(request));
  });

  app.put("/api/storage/*", async (req, reply) => {
    await bridge(req, reply, (request) => storageHandler(request));
  });
};

export default storageRoutes;
