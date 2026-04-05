import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import { handleSkillsRequest, handleFontsRequest } from "../skills-api.js";

const skillsRoutes: FastifyPluginAsync = async (app) => {
  app.all("/api/skills", async (req, reply) => {
    await bridge(req, reply, (request) =>
      Promise.resolve(handleSkillsRequest(request))
    );
  });

  app.all("/api/skills/*", async (req, reply) => {
    await bridge(req, reply, (request) =>
      Promise.resolve(handleSkillsRequest(request))
    );
  });

  app.all("/api/fonts", async (req, reply) => {
    await bridge(req, reply, (request) =>
      Promise.resolve(handleFontsRequest(request))
    );
  });

  app.all("/api/fonts/*", async (req, reply) => {
    await bridge(req, reply, (request) =>
      Promise.resolve(handleFontsRequest(request))
    );
  });
};

export default skillsRoutes;
