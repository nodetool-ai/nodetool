import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { generateSdkProtocolArtifacts } from "../scripts/generate-sdk-protocol.js";

type JsonSchema = Record<string, unknown>;

interface HttpGoldenCapture {
  request: {
    body: unknown;
    method: string;
    path: string;
  };
  response: {
    body: unknown;
    status: number;
  };
}

interface HttpGoldenFixture {
  captures: Record<string, HttpGoldenCapture>;
  route: {
    method: string;
    path: string;
  };
}

interface ExecutionWireFixture {
  frames: Array<{
    direction: "client" | "server";
    message: unknown;
    name: string;
  }>;
}

interface OpenApiOperation {
  requestBody?: {
    content: Record<string, { schema: JsonSchema }>;
  };
  responses: Record<
    string,
    { content?: Record<string, { schema: JsonSchema }> }
  >;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const artifacts = generateSdkProtocolArtifacts();
const fixtureDirectory = new URL("../fixtures/sdk-v1/", import.meta.url);
const httpFixtureNames = readdirSync(fixtureDirectory)
  .filter((name) => name.startsWith("http-") && name.endsWith(".json"))
  .sort();

const openApi = JSON.parse(
  artifacts["sdk-v1.openapi.implemented.json"]
) as OpenApiDocument;
const schemaBundles = new Map(
  [
    "sdk-v1.discovery.schema.json",
    "sdk-v1.lifecycle.schema.json",
    "sdk-v1.execution.schema.json"
  ].map(
    (name) => [name, JSON.parse(artifacts[name]) as JsonSchema]
  )
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const [name, schema] of schemaBundles) {
  ajv.addSchema(schema, name);
}
const validatorCache = new Map<string, ValidateFunction>();

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(name, fixtureDirectory), "utf8")
  ) as T;
}

function normalizeOpenApiPath(path: string): string {
  return path.replaceAll(/:([^/]+)/g, "{$1}");
}

function validatorFor(schema: JsonSchema): ValidateFunction {
  const reference = schema.$ref;
  if (typeof reference !== "string") {
    return ajv.compile(schema);
  }
  const normalizedReference = reference.replace(/^\.\//, "");
  if (!normalizedReference.includes("#")) {
    throw new Error(`Unknown SDK schema reference: ${reference}`);
  }
  const existing = validatorCache.get(normalizedReference);
  if (existing) {
    return existing;
  }
  const validator = ajv.compile({ $ref: normalizedReference });
  validatorCache.set(normalizedReference, validator);
  return validator;
}

function jsonResponseSchema(
  response: OpenApiOperation["responses"][string] | undefined
): JsonSchema | undefined {
  return response?.content?.["application/json"]?.schema;
}

function expectSchemaMatch(
  schema: JsonSchema,
  value: unknown,
  label: string
): void {
  const validator = validatorFor(schema);
  expect(
    validator(value),
    `${label}: ${ajv.errorsText(validator.errors, { separator: "; " })}`
  ).toBe(true);
}

describe("SDK v1 golden/schema conformance", () => {
  it("validates every in-contract HTTP capture against generated OpenAPI schemas", () => {
    const httpErrorSchema = {
      $ref: "./sdk-v1.discovery.schema.json#/$defs/HttpError"
    } satisfies JsonSchema;
    let captureCount = 0;
    let transportOnlyCount = 0;

    for (const fixtureName of httpFixtureNames) {
      const fixture = readFixture<HttpGoldenFixture>(fixtureName);
      const path = normalizeOpenApiPath(fixture.route.path);
      const operation = openApi.paths[path]?.[fixture.route.method.toLowerCase()];
      expect(operation, `${fixtureName}: declared operation`).toBeDefined();

      for (const [captureName, capture] of Object.entries(fixture.captures)) {
        captureCount += 1;
        const label = `${fixtureName}/${captureName}`;
        const declaredResponse =
          capture.request.method === fixture.route.method
            ? jsonResponseSchema(
                operation!.responses[String(capture.response.status)]
              )
            : undefined;
        if (declaredResponse) {
          expectSchemaMatch(declaredResponse, capture.response.body, label);
          continue;
        }

        if (validatorFor(httpErrorSchema)(capture.response.body)) {
          expectSchemaMatch(httpErrorSchema, capture.response.body, label);
          continue;
        }

        // An unsupported method is outside the OpenAPI operation. Phase 0
        // intentionally froze Fastify's 404 and older handlers' {detail} 405.
        expect(
          ["method_not_allowed", "wrong_method_unrouted"],
          `${label}: only routing-level captures may lack an OpenAPI response`
        ).toContain(captureName);
        expect(capture.response.body, label).toEqual(
          expect.objectContaining(
            capture.response.status === 405
              ? { detail: "Method not allowed" }
              : { statusCode: 404 }
          )
        );
        transportOnlyCount += 1;
      }

      const success = fixture.captures.success;
      expect(success, `${fixtureName}: success capture`).toBeDefined();
      const requestSchema =
        operation!.requestBody?.content["application/json"]?.schema;
      if (requestSchema && success!.request.body !== null) {
        expectSchemaMatch(
          requestSchema,
          success!.request.body,
          `${fixtureName}/success request`
        );
      }
    }

    expect(httpFixtureNames).toHaveLength(11);
    expect(captureCount).toBe(45);
    expect(transportOnlyCount).toBe(0);
  });

  it("validates every execution golden against the execution schema", () => {
    const fixture = readFixture<ExecutionWireFixture>("execution-wire.json");

    for (const frame of fixture.frames) {
      const definition =
        frame.direction === "client" ? "ExecutionCommand" : "ExecutionEvent";
      expectSchemaMatch(
        {
          $ref: `./sdk-v1.execution.schema.json#/$defs/${definition}`
        },
        frame.message,
        frame.name
      );
    }

    expect(fixture.frames).toHaveLength(15);
  });
});
