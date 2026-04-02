import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleFileRequest } from "../file-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const filesRoutes: FastifyPluginAsync<RouteOptions> = async (app, _opts) => {
  app.all("/api/files", async (req, reply) => {
    await bridge(req, reply, (request) => handleFileRequest(request));
  });

  app.all("/api/files/*", async (req, reply) => {
    await bridge(req, reply, (request) => handleFileRequest(request));
  });
};

export default filesRoutes;
