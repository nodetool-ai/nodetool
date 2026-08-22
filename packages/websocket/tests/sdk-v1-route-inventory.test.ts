import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { implementedSdkV1HttpOperations } from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import { handleApiRequest } from "../src/http-api.js";
import assetsRoutes from "../src/routes/assets.js";
import nodesRoutes from "../src/routes/nodes.js";
import sdkV1Routes from "../src/routes/sdk-v1.js";
import workflowsRoutes from "../src/routes/workflows.js";

function fastifyPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ":$1");
}

function declaredRoutes(): string[] {
  return implementedSdkV1HttpOperations
    .map(
      (operation) =>
        `${operation.method} ${fastifyPath(operation.path)}`
    )
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
  return (
    url.startsWith("/api/sdk/v1/") || url === "/api/workflows/:id/interface"
  );
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
          sdkV1MethodFallback?: true;
        }
      | undefined;
    const sdkOperation = config?.sdkV1Operation;
    if (sdkOperation) {
      registrations.push(
        `${sdkOperation.method} ${fastifyPath(sdkOperation.path)}`
      );
      return;
    }
    if (config?.sdkV1MethodFallback) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== "HEAD") registrations.push(`${method} ${route.url}`);
    }
  });
  for (const plugin of plugins) {
    await app.register(plugin, { apiOptions: {} });
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

  it("keeps the old http-api dispatcher out of SDK route ownership", async () => {
    const requests = implementedSdkV1HttpOperations
      .filter((operation) => operation.path.startsWith("/api/sdk/v1/"))
      .map((operation) => {
      const path = operation.path
        .replace("{id}", "missing-workflow")
        .replace("{job_id}", "missing-job");
      return new Request(`http://localhost${path}`, {
        method: operation.method,
        headers:
          operation.method === "POST"
            ? { "content-type": "application/json" }
            : undefined,
        body: operation.method === "POST" ? "{}" : undefined
      });
      });

    for (const request of requests) {
      const response = await handleApiRequest(request, {});
      expect(response.status, `${request.method} ${request.url}`).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found" });
    }

    // The compatibility route overlaps the generic `/api/workflows/:id`
    // dispatcher shape, so source ownership is the unambiguous assertion.
    const dispatcherSource = readFileSync(
      new URL("../src/http-api.ts", import.meta.url),
      "utf8"
    );
    expect(dispatcherSource).not.toContain(
      'subPath === "interface"'
    );
  });
});
