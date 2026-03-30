import type { FastifyPluginAsync } from "fastify";

const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async (_req, reply) => {
    reply.send({ status: "ok" });
  });
};

export default healthRoute;
