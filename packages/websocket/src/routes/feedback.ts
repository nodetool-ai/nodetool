import type { FastifyPluginAsync } from "fastify";
import type { HttpApiOptions } from "../http-api.js";
import { bridge } from "../lib/bridge.js";
import { handleFeedbackRequest } from "../feedback-api.js";
import {
  createFeedbackServiceDependenciesFromEnv,
  logFeedbackFailure
} from "../services/feedback-delivery.js";
import { submitFeedback } from "../services/feedback-service.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const feedbackRoutes: FastifyPluginAsync<RouteOptions> = async (app) => {
  const feedbackDependencies = createFeedbackServiceDependenciesFromEnv();

  app.post("/api/feedback", async (req, reply) => {
    await bridge(req, reply, async (request) =>
      handleFeedbackRequest(request, {
        submitFeedback: async (submission) => {
          try {
            return await submitFeedback(submission, feedbackDependencies);
          } catch (error) {
            logFeedbackFailure(error);
            throw error;
          }
        }
      })
    );
  });
};

export default feedbackRoutes;
