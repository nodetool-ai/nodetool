import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { implementedSdkV1HttpOperations } from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import assetsRoutes from "../src/routes/assets.js";
import nodesRoutes from "../src/routes/nodes.js";
import sdkV1Routes from "../src/routes/sdk-v1.js";
import workflowsRoutes from "../src/routes/workflows.js";
import {
  makeGoldenApiOptions,
  makeGoldenRegistry
} from "./sdk-v1-golden-harness.js";

function fastifyPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ":$1");
}

function declaredRoutes(): string[] {
  return implementedSdkV1HttpOperations
    .map((operation) => `${operation.method} ${fastifyPath(operation.path)}`)
    .sort();
}

function implementedOpenApiRoutes(): string[] {
  const document = JSON.parse(
    readFileSync(
      new URL(
        "../../protocol/schema/sdk-v1.openapi.implemented.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as { paths: Record<string, Record<string, unknown>> };
  return Object.entries(document.paths)
    .flatMap(([path, methods]) =>
      Object.keys(methods).map(
        (method) => `${method.toUpperCase()} ${fastifyPath(path)}`
      )
    )
    .sort();
}

function isSdkV1Url(url: string): boolean {
  return url.startsWith("/api/sdk/v1/");
}

async function registrationsFor(
  plugins: Array<typeof sdkV1Routes>
): Promise<string[]> {
  const registrations: string[] = [];
  const app = Fastify({ logger: false });
  app.addHook("onRoute", (route) => {
    const config = route.config as
      | {
          sdkV1Operation?: { method: string; path: string };
          sdkV1NotFound?: true;
        }
      | undefined;
    const sdkOperation = config?.sdkV1Operation;
    if (sdkOperation) {
      registrations.push(
        `${sdkOperation.method} ${fastifyPath(sdkOperation.path)}`
      );
      return;
    }
    if (config?.sdkV1NotFound) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== "HEAD") registrations.push(`${method} ${route.url}`);
    }
  });
  const apiOptions = makeGoldenApiOptions(makeGoldenRegistry());
  for (const plugin of plugins) {
    await app.register(plugin, { apiOptions });
  }
  await app.ready();
  await app.close();
  return registrations;
}

describe("SDK v1 route inventory", () => {
  it("matches the operation registry and implemented OpenAPI exactly", async () => {
    const registered = (await registrationsFor([sdkV1Routes])).sort();

    expect(registered).toEqual(declaredRoutes());
    expect(registered).toEqual(implementedOpenApiRoutes());
  });

  it("keeps all SDK routes out of the feature route plugins", async () => {
    const registered = await registrationsFor([
      assetsRoutes,
      workflowsRoutes,
      nodesRoutes
    ]);

    expect(
      registered.filter((registration) =>
        isSdkV1Url(registration.split(" ")[1])
      )
    ).toEqual([]);
  });

  it("keeps normalized SDK not-found handling scoped to the SDK prefix", async () => {
    const app = Fastify({ logger: false });
    await app.register(sdkV1Routes, {
      apiOptions: makeGoldenApiOptions(makeGoldenRegistry())
    });

    const sdkMissing = await app.inject({
      method: "GET",
      url: "/api/sdk/v1/not-an-operation"
    });
    expect(sdkMissing.statusCode).toBe(404);
    expect(sdkMissing.json()).toEqual({
      code: "NOT_FOUND",
      message: "SDK endpoint not found",
      retryable: false
    });

    const productMissing = await app.inject({
      method: "GET",
      url: "/api/not-an-sdk-operation"
    });
    expect(productMissing.statusCode).toBe(404);
    expect(productMissing.json()).toMatchObject({
      error: "Not Found",
      statusCode: 404
    });

    await app.close();
  });
});
