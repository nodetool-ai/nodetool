import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BROWSER_TRACE_BODY_BYTE_LIMIT, browserRunSpansInputSchema, browserRunSpansResultSchema, browserRunStartInputSchema, browserRunStartResultSchema } from "@nodetool-ai/protocol";
import { ingestBrowserRunSpans, startBrowserAppRun, RunsError } from "@nodetool-ai/execution";

const paramsSchema = z.object({ id: z.string().min(1).max(200) });
const validators = new WeakMap<object, z.ZodType>();
function jsonSchema(schema: z.ZodType) {
  const result = z.toJSONSchema(schema, { target: "draft-7" });
  validators.set(result, schema); return result;
}

const runSpansRoutes: FastifyPluginAsync = async (app) => {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, app.getDefaultJsonParser("error", "error"));
  app.setValidatorCompiler(({ schema }) => {
    if (typeof schema !== "object" || schema === null) { throw new Error("Run span validator missing"); }
    const validator = validators.get(schema);
    if (!validator) { throw new Error("Run span validator missing"); }
    return (value) => {
      const parsed = validator.safeParse(value);
      return parsed.success ? { value: parsed.data } : { error: parsed.error };
    };
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RunsError) {
      return reply.code(error.code === "not_found" ? 404 : error.code === "ambiguous" ? 409 : 400).send({ detail: error.message });
    }
    return reply.send(error);
  });
  app.post("/api/runs/:id/spans", {
    bodyLimit: BROWSER_TRACE_BODY_BYTE_LIMIT,
    schema: { params: jsonSchema(paramsSchema), body: jsonSchema(browserRunSpansInputSchema), response: { 200: jsonSchema(browserRunSpansResultSchema), 401: jsonSchema(z.object({ detail: z.string() })) } }
  }, async (request, reply) => {
    if (!request.userId || request.appSession) {
      return reply.code(401).send({ detail: "Owner authentication required" });
    }
    return ingestBrowserRunSpans(request.userId, paramsSchema.parse(request.params).id, request.body);
  });
  app.post("/api/runs/:id/browser-start", {
    bodyLimit: 1_024,
    schema: { params: jsonSchema(paramsSchema), body: jsonSchema(browserRunStartInputSchema), response: { 200: jsonSchema(browserRunStartResultSchema), 401: jsonSchema(z.object({ detail: z.string() })) } }
  }, async (request, reply) => {
    if (!request.userId || request.appSession) { return reply.code(401).send({ detail: "Owner authentication required" }); }
    return startBrowserAppRun(request.userId, paramsSchema.parse(request.params).id, request.body);
  });
};

export default runSpansRoutes;
