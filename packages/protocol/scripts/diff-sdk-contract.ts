import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

export type SdkContractChangeCategory = "additive" | "breaking" | "risky";

export type SdkContractChangeKind =
  // additive
  | "error-added"
  | "implemented-route-added"
  | "operation-added"
  | "operation-implemented"
  | "planned-operation-added"
  | "response-property-added"
  | "schema-def-added"
  // risky
  | "auth-changed"
  | "error-changed"
  | "feature-changed"
  | "operation-unimplemented"
  | "response-content-type-changed"
  | "response-schema-changed"
  | "response-status-changed"
  | "schema-def-changed"
  | "schema-def-removed"
  // breaking
  | "error-removed"
  | "http-identity-changed"
  | "implemented-route-removed"
  | "operation-removed"
  | "request-contract-changed"
  | "request-content-type-changed"
  | "request-schema-added"
  | "request-schema-changed"
  | "request-schema-removed"
  | "required-response-property-removed"
  | "transport-changed"
  | "websocket-identity-changed";

export const CHANGE_CATEGORY: Readonly<
  Record<SdkContractChangeKind, SdkContractChangeCategory>
> = {
  "auth-changed": "risky",
  "error-added": "additive",
  "error-changed": "risky",
  "error-removed": "breaking",
  "feature-changed": "risky",
  "http-identity-changed": "breaking",
  "implemented-route-added": "additive",
  "implemented-route-removed": "breaking",
  "operation-added": "additive",
  "operation-implemented": "additive",
  "operation-removed": "breaking",
  "operation-unimplemented": "risky",
  "planned-operation-added": "additive",
  "request-contract-changed": "breaking",
  "request-content-type-changed": "breaking",
  "request-schema-added": "breaking",
  "request-schema-changed": "breaking",
  "request-schema-removed": "breaking",
  "required-response-property-removed": "breaking",
  "response-content-type-changed": "risky",
  "response-property-added": "additive",
  "response-schema-changed": "risky",
  "response-status-changed": "risky",
  "schema-def-added": "additive",
  "schema-def-changed": "risky",
  "schema-def-removed": "risky",
  "transport-changed": "breaking",
  "websocket-identity-changed": "breaking"
};

export type SdkContractChange = {
  readonly category: SdkContractChangeCategory;
  readonly detail: string;
  readonly kind: SdkContractChangeKind;
  readonly subject: string;
};

function change(
  kind: SdkContractChangeKind,
  subject: string,
  detail: string
): SdkContractChange {
  return { category: CHANGE_CATEGORY[kind], detail, kind, subject };
}

const errorDeclaration = z.object({
  code: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional()
});

const messagePart = z.object({
  envelope: z.string(),
  payload: z.string()
});

const operationEntry = z.object({
  auth: z.string(),
  channel: z.string().optional(),
  command: z.string().optional(),
  direction: z.string().optional(),
  errors: z.array(errorDeclaration),
  feature: z.string().nullable(),
  id: z.string(),
  message: z
    .object({
      event: messagePart.optional(),
      request: messagePart.optional(),
      response: messagePart.optional()
    })
    .optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  request: z
    .object({
      body: z
        .object({
          binary: z.boolean().optional(),
          content_type: z.string().optional(),
          description: z.string().optional(),
          field: z.string().optional(),
          kind: z.enum(["json", "binary-multipart"]).optional(),
          required: z.boolean().optional(),
          schema: z.string().optional()
        })
        .optional(),
      parameters: z
        .array(
          z.object({
            description: z.string().optional(),
            in: z.enum(["path", "query"]),
            name: z.string(),
            required: z.boolean(),
            schema: z.union([
              z.object({ kind: z.literal("query-property") }),
              z.object({ kind: z.literal("inline"), json_schema: z.unknown() })
            ])
          })
        )
        .optional(),
      query: z.string().optional()
    })
    .optional(),
  response: z
    .object({
      content_type: z.string().optional(),
      schema: z.string().optional(),
      status: z.string().optional()
    })
    .optional(),
  status: z.enum(["implemented", "planned"]),
  transport: z.enum(["http", "websocket"])
});

export const operationsManifestSchema = z.object({
  operations: z.array(operationEntry),
  protocol_version: z.string()
});

export type SdkContractOperation = z.infer<typeof operationEntry>;
export type SdkContractOperationsManifest = z.infer<
  typeof operationsManifestSchema
>;

const jsonSchemaFileSchema = z.object({
  $defs: z.record(z.string(), z.unknown())
});

const openApiDocumentSchema = z.object({
  paths: z.record(z.string(), z.record(z.string(), z.unknown()))
});

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function errorKey(
  transport: "http" | "websocket",
  error: z.infer<typeof errorDeclaration>
): string {
  return (transport === "http" ? error.status : error.code) ?? "unknown";
}

function requestSchemaRefs(operation: SdkContractOperation): string[] {
  const refs: string[] = [];
  if (operation.request?.query !== undefined) {
    refs.push(`query=${operation.request.query}`);
  }
  if (operation.request?.body?.schema !== undefined) {
    refs.push(`body=${operation.request.body.schema}`);
  }
  if (operation.message?.request !== undefined) {
    refs.push(`message=${operation.message.request.payload}`);
  }
  return refs;
}

function responseSchemaRef(
  operation: SdkContractOperation
): string | undefined {
  return (
    operation.response?.schema ??
    operation.message?.response?.payload ??
    operation.message?.event?.payload
  );
}

function requestContractMetadata(operation: SdkContractOperation): unknown {
  const body = operation.request?.body;
  return {
    ...(body === undefined
      ? {}
      : {
          body: {
            ...(body.binary === undefined ? {} : { binary: body.binary }),
            ...(body.description === undefined
              ? {}
              : { description: body.description }),
            ...(body.field === undefined ? {} : { field: body.field }),
            ...(body.kind === undefined ? {} : { kind: body.kind }),
            ...(body.required === undefined ? {} : { required: body.required })
          }
        }),
    ...(operation.request?.parameters === undefined
      ? {}
      : { parameters: operation.request.parameters })
  };
}

function displayOptional(value: string | undefined): string {
  return value === undefined ? "<absent>" : value;
}

function diffErrors(
  oldOperation: SdkContractOperation,
  newOperation: SdkContractOperation
): SdkContractChange[] {
  const changes: SdkContractChange[] = [];
  const id = oldOperation.id;
  const oldErrors = new Map(
    oldOperation.errors.map((error) => [
      errorKey(oldOperation.transport, error),
      error
    ])
  );
  const newErrors = new Map(
    newOperation.errors.map((error) => [
      errorKey(newOperation.transport, error),
      error
    ])
  );
  for (const [key, oldError] of oldErrors) {
    const newError = newErrors.get(key);
    if (newError === undefined) {
      changes.push(
        change("error-removed", id, `declared error ${key} was removed`)
      );
    } else if (oldError.description !== newError.description) {
      changes.push(
        change(
          "error-changed",
          id,
          `declared error ${key} changed: "${oldError.description}" -> "${newError.description}"`
        )
      );
    }
  }
  for (const key of newErrors.keys()) {
    if (!oldErrors.has(key)) {
      changes.push(
        change("error-added", id, `declared error ${key} was added`)
      );
    }
  }
  return changes;
}

function diffOperationPair(
  oldOperation: SdkContractOperation,
  newOperation: SdkContractOperation
): SdkContractChange[] {
  const changes: SdkContractChange[] = [];
  const id = oldOperation.id;

  if (oldOperation.transport !== newOperation.transport) {
    changes.push(
      change(
        "transport-changed",
        id,
        `transport changed from ${oldOperation.transport} to ${newOperation.transport}`
      )
    );
  } else if (oldOperation.transport === "http") {
    if (
      oldOperation.method !== newOperation.method ||
      oldOperation.path !== newOperation.path
    ) {
      changes.push(
        change(
          "http-identity-changed",
          id,
          `${oldOperation.method} ${oldOperation.path} became ${newOperation.method} ${newOperation.path}`
        )
      );
    }
  } else if (
    oldOperation.channel !== newOperation.channel ||
    oldOperation.command !== newOperation.command ||
    oldOperation.direction !== newOperation.direction
  ) {
    changes.push(
      change(
        "websocket-identity-changed",
        id,
        `channel/command/direction changed from ${oldOperation.channel}/${oldOperation.command}/${oldOperation.direction} to ${newOperation.channel}/${newOperation.command}/${newOperation.direction}`
      )
    );
  }

  if (oldOperation.status !== newOperation.status) {
    changes.push(
      newOperation.status === "implemented"
        ? change("operation-implemented", id, "planned -> implemented")
        : change("operation-unimplemented", id, "implemented -> planned")
    );
  }
  if (oldOperation.auth !== newOperation.auth) {
    changes.push(
      change(
        "auth-changed",
        id,
        `auth policy changed from ${oldOperation.auth} to ${newOperation.auth}`
      )
    );
  }
  if (oldOperation.feature !== newOperation.feature) {
    changes.push(
      change(
        "feature-changed",
        id,
        `feature policy changed from ${oldOperation.feature} to ${newOperation.feature}`
      )
    );
  }

  changes.push(...diffErrors(oldOperation, newOperation));

  const oldRequestRefs = requestSchemaRefs(oldOperation);
  const newRequestRefs = new Set(requestSchemaRefs(newOperation));
  const oldRequestRefSet = new Set(oldRequestRefs);
  for (const ref of oldRequestRefs) {
    if (!newRequestRefs.has(ref)) {
      const [part] = ref.split("=");
      const replacement = [...newRequestRefs].find((candidate) =>
        candidate.startsWith(`${part}=`)
      );
      changes.push(
        replacement === undefined
          ? change(
              "request-schema-removed",
              id,
              `request ${part} schema ${ref.slice(ref.indexOf("=") + 1)} was removed`
            )
          : change(
              "request-schema-changed",
              id,
              `request ${part} schema changed to ${replacement.slice(replacement.indexOf("=") + 1)}`
            )
      );
    }
  }
  for (const ref of newRequestRefs) {
    const [part] = ref.split("=");
    const existed = oldRequestRefs.some((candidate) =>
      candidate.startsWith(`${part}=`)
    );
    if (!oldRequestRefSet.has(ref) && !existed) {
      changes.push(
        change(
          "request-schema-added",
          id,
          `request ${part} schema ${ref.slice(ref.indexOf("=") + 1)} was added to an existing operation`
        )
      );
    }
  }

  const oldBodyContentType = oldOperation.request?.body?.content_type;
  const newBodyContentType = newOperation.request?.body?.content_type;
  if (oldBodyContentType !== newBodyContentType) {
    changes.push(
      change(
        "request-content-type-changed",
        id,
        `request content type changed from ${displayOptional(oldBodyContentType)} to ${displayOptional(newBodyContentType)}`
      )
    );
  }
  const oldRequestMetadata = requestContractMetadata(oldOperation);
  const newRequestMetadata = requestContractMetadata(newOperation);
  if (!deepEqual(oldRequestMetadata, newRequestMetadata)) {
    changes.push(
      change(
        "request-contract-changed",
        id,
        "request parameters or body requirements changed"
      )
    );
  }
  const oldResponseContentType = oldOperation.response?.content_type;
  const newResponseContentType = newOperation.response?.content_type;
  if (oldResponseContentType !== newResponseContentType) {
    changes.push(
      change(
        "response-content-type-changed",
        id,
        `response content type changed from ${displayOptional(oldResponseContentType)} to ${displayOptional(newResponseContentType)}`
      )
    );
  }
  const oldResponseStatus = oldOperation.response?.status;
  const newResponseStatus = newOperation.response?.status;
  if (oldResponseStatus !== newResponseStatus) {
    changes.push(
      change(
        "response-status-changed",
        id,
        `success status changed from ${displayOptional(oldResponseStatus)} to ${displayOptional(newResponseStatus)}`
      )
    );
  }
  const oldResponseRef = responseSchemaRef(oldOperation);
  const newResponseRef = responseSchemaRef(newOperation);
  if (oldResponseRef !== newResponseRef) {
    changes.push(
      change(
        "response-schema-changed",
        id,
        `response schema changed from ${displayOptional(oldResponseRef)} to ${displayOptional(newResponseRef)}`
      )
    );
  }

  return changes;
}

export function diffOperationManifests(
  oldManifest: SdkContractOperationsManifest,
  newManifest: SdkContractOperationsManifest
): SdkContractChange[] {
  const changes: SdkContractChange[] = [];
  const oldById = new Map(
    oldManifest.operations.map((operation) => [operation.id, operation])
  );
  const newById = new Map(
    newManifest.operations.map((operation) => [operation.id, operation])
  );

  for (const [id, oldOperation] of oldById) {
    const newOperation = newById.get(id);
    if (newOperation === undefined) {
      changes.push(change("operation-removed", id, "operation was removed"));
    } else {
      changes.push(...diffOperationPair(oldOperation, newOperation));
    }
  }
  for (const [id, newOperation] of newById) {
    if (!oldById.has(id)) {
      changes.push(
        newOperation.status === "planned"
          ? change("planned-operation-added", id, "new planned operation")
          : change("operation-added", id, "new implemented operation")
      );
    }
  }
  return changes;
}

type SchemaObject = { readonly [key: string]: unknown };

function asSchemaObject(value: unknown): SchemaObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as SchemaObject)
    : undefined;
}

function requiredNames(definition: SchemaObject): readonly string[] {
  const required = definition.required;
  return Array.isArray(required)
    ? required.filter((name): name is string => typeof name === "string")
    : [];
}

function propertyNames(definition: SchemaObject): readonly string[] {
  const properties = asSchemaObject(definition.properties);
  return properties === undefined ? [] : Object.keys(properties);
}

/**
 * Coarse `$defs` diff of one JSON-schema file. Request definitions are always
 * breaking when changed. Response definitions (named in `responseDefNames`)
 * additionally get top-level required/property checks:
 * a required response property that disappears is breaking, a new property is
 * additive; any other change to a definition stays risky.
 */
export function diffSchemaDefs(
  fileName: string,
  oldDefs: Readonly<Record<string, unknown>>,
  newDefs: Readonly<Record<string, unknown>>,
  responseDefNames: ReadonlySet<string>,
  requestDefNames: ReadonlySet<string> = new Set()
): SdkContractChange[] {
  const changes: SdkContractChange[] = [];
  for (const [name, oldDefinition] of Object.entries(oldDefs)) {
    const subject = `${fileName}#/$defs/${name}`;
    const newDefinition = newDefs[name];
    if (!Object.hasOwn(newDefs, name)) {
      changes.push(
        requestDefNames.has(name)
          ? change(
              "request-schema-removed",
              subject,
              "request schema definition was removed"
            )
          : change(
              "schema-def-removed",
              subject,
              "schema definition was removed"
            )
      );
      continue;
    }
    if (deepEqual(oldDefinition, newDefinition)) {
      continue;
    }
    const oldObject = asSchemaObject(oldDefinition);
    const newObject = asSchemaObject(newDefinition);
    let classified = false;
    if (requestDefNames.has(name)) {
      changes.push(
        change(
          "request-schema-changed",
          subject,
          "request schema definition changed"
        )
      );
      classified = true;
    }
    if (
      !classified &&
      responseDefNames.has(name) &&
      oldObject !== undefined &&
      newObject !== undefined
    ) {
      const newRequired = new Set(requiredNames(newObject));
      const newProperties = new Set(propertyNames(newObject));
      for (const property of requiredNames(oldObject)) {
        if (!newRequired.has(property) || !newProperties.has(property)) {
          changes.push(
            change(
              "required-response-property-removed",
              subject,
              `required response property ${property} was removed`
            )
          );
          classified = true;
        }
      }
      const oldProperties = new Set(propertyNames(oldObject));
      for (const property of propertyNames(newObject)) {
        if (!oldProperties.has(property)) {
          changes.push(
            change(
              "response-property-added",
              subject,
              `response property ${property} was added`
            )
          );
          classified = true;
        }
      }
    }
    if (!classified) {
      changes.push(
        change("schema-def-changed", subject, "schema definition changed")
      );
    }
  }
  for (const name of Object.keys(newDefs)) {
    if (!Object.hasOwn(oldDefs, name)) {
      changes.push(
        change(
          "schema-def-added",
          `${fileName}#/$defs/${name}`,
          "new schema definition"
        )
      );
    }
  }
  return changes;
}

export function diffImplementedOpenApiPaths(
  oldDocument: z.infer<typeof openApiDocumentSchema>,
  newDocument: z.infer<typeof openApiDocumentSchema>
): SdkContractChange[] {
  const routes = (
    document: z.infer<typeof openApiDocumentSchema>
  ): Set<string> =>
    new Set(
      Object.entries(document.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`)
      )
    );
  const oldRoutes = routes(oldDocument);
  const newRoutes = routes(newDocument);
  const changes: SdkContractChange[] = [];
  for (const route of [...oldRoutes].sort()) {
    if (!newRoutes.has(route)) {
      changes.push(
        change(
          "implemented-route-removed",
          route,
          "route left the implemented OpenAPI profile"
        )
      );
    }
  }
  for (const route of [...newRoutes].sort()) {
    if (!oldRoutes.has(route)) {
      changes.push(
        change(
          "implemented-route-added",
          route,
          "route joined the implemented OpenAPI profile"
        )
      );
    }
  }
  return changes;
}

export function exitCodeFor(changes: readonly SdkContractChange[]): 0 | 2 | 3 {
  if (changes.some((entry) => entry.category === "breaking")) {
    return 3;
  }
  if (changes.some((entry) => entry.category === "risky")) {
    return 2;
  }
  return 0;
}

type ContractTarget = {
  readonly openApiImplemented?: z.infer<typeof openApiDocumentSchema>;
  readonly operations: SdkContractOperationsManifest;
  readonly schemaFiles: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveInDirectory(
  directory: string,
  name: string
): string | undefined {
  for (const candidate of [
    join(directory, "schema", name),
    join(directory, name)
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

const SCHEMA_FILE_NAMES = [
  "sdk-v1.discovery.schema.json",
  "sdk-v1.lifecycle.schema.json"
];

function loadTarget(argument: string): ContractTarget {
  const path = resolve(argument);
  if (statSync(path).isFile()) {
    return {
      operations: operationsManifestSchema.parse(readJson(path)),
      schemaFiles: new Map()
    };
  }

  const operationsPath = resolveInDirectory(path, "sdk-v1.operations.json");
  if (operationsPath === undefined) {
    throw new Error(`No sdk-v1.operations.json found under ${path}`);
  }
  const schemaFiles = new Map<string, Readonly<Record<string, unknown>>>();
  for (const name of SCHEMA_FILE_NAMES) {
    const schemaPath = resolveInDirectory(path, name);
    if (schemaPath !== undefined) {
      schemaFiles.set(
        name,
        jsonSchemaFileSchema.parse(readJson(schemaPath)).$defs
      );
    }
  }
  const openApiPath = resolveInDirectory(
    path,
    "sdk-v1.openapi.implemented.json"
  );
  return {
    ...(openApiPath === undefined
      ? {}
      : {
          openApiImplemented: openApiDocumentSchema.parse(readJson(openApiPath))
        }),
    operations: operationsManifestSchema.parse(readJson(operationsPath)),
    schemaFiles
  };
}

/** Response `$defs` names per schema file, read from the old manifest. */
function responseDefNamesByFile(
  manifest: SdkContractOperationsManifest
): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const operation of manifest.operations) {
    const ref = responseSchemaRef(operation);
    if (ref === undefined) {
      continue;
    }
    const [file, pointer] = ref.split("#");
    const name = pointer?.split("/").at(-1);
    if (file === undefined || name === undefined) {
      continue;
    }
    const names = byFile.get(file) ?? new Set<string>();
    names.add(name);
    byFile.set(file, names);
  }
  return byFile;
}

/** Request `$defs` names per schema file, read from the old manifest. */
function requestDefNamesByFile(
  manifest: SdkContractOperationsManifest
): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const operation of manifest.operations) {
    for (const taggedRef of requestSchemaRefs(operation)) {
      const ref = taggedRef.slice(taggedRef.indexOf("=") + 1);
      const [file, pointer] = ref.split("#");
      const name = pointer?.split("/").at(-1);
      if (file === undefined || name === undefined) continue;
      const names = byFile.get(file) ?? new Set<string>();
      names.add(name);
      byFile.set(file, names);
    }
  }
  return byFile;
}

export function diffContractTargets(
  oldTarget: ContractTarget,
  newTarget: ContractTarget
): SdkContractChange[] {
  const changes = diffOperationManifests(
    oldTarget.operations,
    newTarget.operations
  );
  const responseDefs = responseDefNamesByFile(oldTarget.operations);
  const requestDefs = requestDefNamesByFile(oldTarget.operations);
  for (const [name, oldDefs] of oldTarget.schemaFiles) {
    const newDefs = newTarget.schemaFiles.get(name);
    if (newDefs !== undefined) {
      changes.push(
        ...diffSchemaDefs(
          name,
          oldDefs,
          newDefs,
          responseDefs.get(name) ?? new Set(),
          requestDefs.get(name) ?? new Set()
        )
      );
    }
  }
  if (
    oldTarget.openApiImplemented !== undefined &&
    newTarget.openApiImplemented !== undefined
  ) {
    changes.push(
      ...diffImplementedOpenApiPaths(
        oldTarget.openApiImplemented,
        newTarget.openApiImplemented
      )
    );
  }
  return changes;
}

const HELP = `Usage: tsx scripts/diff-sdk-contract.ts <old> <new> [--json]

<old> and <new> are each an sdk-v1.operations.json file or a directory
holding one (a bundle staging directory or a schema/ directory). Directory
targets also compare the JSON-schema $defs and the implemented OpenAPI
route inventory when those files are present in both.

Exit codes:
  0  no changes, or additive changes only
  2  at least one risky change, no breaking changes
  3  at least one breaking change
`;

const CATEGORY_ORDER: readonly SdkContractChangeCategory[] = [
  "breaking",
  "risky",
  "additive"
];

function printReport(changes: readonly SdkContractChange[]): void {
  if (changes.length === 0) {
    console.log("No contract changes.");
    return;
  }
  for (const category of CATEGORY_ORDER) {
    const group = changes.filter((entry) => entry.category === category);
    if (group.length === 0) {
      continue;
    }
    console.log(`${category} (${group.length}):`);
    for (const entry of group) {
      console.log(`  - [${entry.kind}] ${entry.subject}: ${entry.detail}`);
    }
  }
}

function run(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const json = argv.includes("--json");
  const positional = argv.filter((argument) => !argument.startsWith("--"));
  if (positional.length !== 2) {
    console.error(HELP);
    process.exitCode = 1;
    return;
  }
  const [oldArgument, newArgument] = positional;
  if (oldArgument === undefined || newArgument === undefined) {
    console.error(HELP);
    process.exitCode = 1;
    return;
  }
  const changes = diffContractTargets(
    loadTarget(oldArgument),
    loadTarget(newArgument)
  );
  const exitCode = exitCodeFor(changes);
  if (json) {
    console.log(
      JSON.stringify(
        {
          changes,
          exit_code: exitCode,
          summary: {
            additive: changes.filter((c) => c.category === "additive").length,
            breaking: changes.filter((c) => c.category === "breaking").length,
            risky: changes.filter((c) => c.category === "risky").length
          }
        },
        null,
        2
      )
    );
  } else {
    printReport(changes);
  }
  process.exitCode = exitCode;
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  run();
}
