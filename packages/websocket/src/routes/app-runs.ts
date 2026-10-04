import { TRPCError } from "@trpc/server";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  appInstanceResponse,
  appRunResponse,
  createInstanceInput,
  duplicateInstanceInput,
  getInstanceInput,
  listInstancesInput,
  listRunsInput,
  reserveRunInput,
  updateInstanceInput
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  appRunApi,
  createOwnedAppInstance,
  deleteAppInstance,
  deleteAppRun,
  duplicateAppInstance,
  getOwnedAppInstance,
  getOwnedAppRun,
  listAppInstances,
  listAppRuns,
  patchAppRunInput,
  patchOwnedAppRun,
  reserveOwnedAppRun,
  updateOwnedAppInstance
} from "../lib/app-instances-service.js";

function owner(request: FastifyRequest): string {
  if (!request.userId || request.appSession) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Owner authentication required"
    });
  }
  return request.userId;
}

const validators = new WeakMap<object, z.ZodType>();
const jsonSchema = (schema: z.ZodType) => {
  const result = z.toJSONSchema(schema, { target: "draft-7" });
  validators.set(result, schema);
  return result;
};

const idParams = z.object({ id: z.string().min(1) });
const limits = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
const listQuery = limits.extend({
  application_id: z.string().optional(),
  source_id: z.string().optional()
});
const bodyWithoutId = updateInstanceInput.omit({ id: true });
const patchWithoutId = patchAppRunInput.omit({ id: true });

const instanceResponse = { 200: jsonSchema(appInstanceResponse) };
const runResponse = { 200: jsonSchema(appRunResponse) };
const okResponse = { 200: jsonSchema(z.object({ ok: z.boolean() })) };

const appRunsRoutes: FastifyPluginAsync = async (app) => {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    app.getDefaultJsonParser("error", "error")
  );
  app.setValidatorCompiler(({ schema }) => {
    const validator = validators.get(schema as object);
    if (!validator) throw new Error("App run route validator is missing");
    return (value) => {
      const parsed = validator.safeParse(value);
      return parsed.success ? { value: parsed.data } : { error: parsed.error };
    };
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof TRPCError) {
      const status = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        BAD_REQUEST: 400
      };
      const code = error.code;
      return reply
        .code(code in status ? status[code as keyof typeof status] : 500)
        .send({ detail: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply
        .code(400)
        .send({ detail: error.issues[0]?.message ?? "Invalid request" });
    }
    return reply.send(error);
  });

  for (const [path, useDefault] of [
    ["/api/app-instances", false],
    ["/api/app-instances/default", true]
  ] as const) {
    app.post(
      path,
      {
        schema: {
          body: jsonSchema(createInstanceInput),
          response: instanceResponse
        }
      },
      async (req) =>
        appRunApi(() =>
          createOwnedAppInstance(
            owner(req),
            createInstanceInput.parse(req.body),
            useDefault
          )
        )
    );
  }
  app.get(
    "/api/app-instances",
    {
      schema: {
        querystring: jsonSchema(listQuery),
        response: { 200: jsonSchema(z.array(appInstanceResponse)) }
      }
    },
    async (req) => {
      const input = listInstancesInput.parse(listQuery.parse(req.query));
      return appRunApi(() =>
        listAppInstances(
          owner(req),
          input.application_id,
          input.source_id,
          input.limit
        )
      );
    }
  );
  app.get(
    "/api/app-instances/:id",
    { schema: { params: jsonSchema(idParams), response: instanceResponse } },
    async (req) =>
      appRunApi(() =>
        getOwnedAppInstance(owner(req), getInstanceInput.parse(req.params).id)
      )
  );
  app.patch(
    "/api/app-instances/:id",
    {
      schema: {
        params: jsonSchema(idParams),
        body: jsonSchema(bodyWithoutId),
        response: instanceResponse
      }
    },
    async (req) =>
      appRunApi(() =>
        updateOwnedAppInstance(owner(req), {
          ...bodyWithoutId.parse(req.body),
          ...idParams.parse(req.params)
        })
      )
  );
  app.delete(
    "/api/app-instances/:id",
    { schema: { params: jsonSchema(idParams), response: okResponse } },
    async (req) =>
      appRunApi(async () => ({
        ok: await deleteAppInstance(owner(req), idParams.parse(req.params).id)
      }))
  );
  app.post(
    "/api/app-instances/:id/duplicate",
    {
      schema: {
        params: jsonSchema(idParams),
        body: jsonSchema(duplicateInstanceInput.omit({ id: true })),
        response: instanceResponse
      }
    },
    async (req) =>
      appRunApi(() =>
        duplicateAppInstance(
          owner(req),
          idParams.parse(req.params).id,
          duplicateInstanceInput.omit({ id: true }).parse(req.body).name
        )
      )
  );
  app.post(
    "/api/app-instances/:id/runs",
    {
      schema: {
        params: jsonSchema(idParams),
        body: jsonSchema(reserveRunInput.omit({ instance_id: true })),
        response: runResponse
      }
    },
    async (req) =>
      appRunApi(() =>
        reserveOwnedAppRun(owner(req), {
          ...reserveRunInput.omit({ instance_id: true }).parse(req.body),
          instance_id: idParams.parse(req.params).id
        })
      )
  );
  app.get(
    "/api/app-instances/:id/runs",
    {
      schema: {
        params: jsonSchema(idParams),
        querystring: jsonSchema(limits),
        response: { 200: jsonSchema(z.array(appRunResponse)) }
      }
    },
    async (req) => {
      const input = listRunsInput.parse({
        ...limits.parse(req.query),
        instance_id: idParams.parse(req.params).id
      });
      return appRunApi(() =>
        listAppRuns(owner(req), input.instance_id, input.limit)
      );
    }
  );
  app.get(
    "/api/app-runs/:id",
    { schema: { params: jsonSchema(idParams), response: runResponse } },
    async (req) =>
      appRunApi(() => getOwnedAppRun(owner(req), idParams.parse(req.params).id))
  );
  app.patch(
    "/api/app-runs/:id",
    {
      schema: {
        params: jsonSchema(idParams),
        body: jsonSchema(patchWithoutId),
        response: runResponse
      }
    },
    async (req) =>
      appRunApi(() =>
        patchOwnedAppRun(owner(req), {
          ...patchWithoutId.parse(req.body),
          ...idParams.parse(req.params)
        })
      )
  );
  app.delete(
    "/api/app-runs/:id",
    { schema: { params: jsonSchema(idParams), response: okResponse } },
    async (req) =>
      appRunApi(async () => ({
        ok: await deleteAppRun(owner(req), idParams.parse(req.params).id)
      }))
  );
};

export default appRunsRoutes;
