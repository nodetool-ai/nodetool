/**
 * SDK v1 operation registry: metadata types, fail-fast validation, and a
 * combined lookup over the HTTP and WebSocket declarations. The registry is
 * the single machine-readable source for generated OpenAPI/AsyncAPI
 * inventories and, later, server route/policy binding. It must stay free of
 * server imports and tRPC procedure names.
 */
import type { z } from "zod";
import type { SdkV1ExecutionCommand } from "./sdk-execution-v1.js";
import {
  getSdkV1HttpOperation,
  implementedSdkV1HttpOperations,
  matchSdkV1HttpOperation,
  sdkV1HttpOperations
} from "./sdk-v1-http-operations.js";
import {
  getSdkV1WebSocketOperation,
  implementedSdkV1WebSocketOperations,
  sdkV1WebSocketChannel,
  sdkV1WebSocketMessages,
  sdkV1WebSocketOperations
} from "./sdk-v1-websocket-operations.js";

export type SdkV1OperationStatus = "implemented" | "planned";
export type SdkV1OperationAuth = "discovery" | "authenticated";
export type SdkV1OperationFeature =
  | "workflow-interface"
  | "lifecycle"
  | "execution"
  | null;

export type SdkV1HttpOperationId =
  | "getNodeTypeInventory"
  | "getCapabilities"
  | "listModels"
  | "listModelDownloads"
  | "startModelDownload"
  | "cancelModelDownload"
  | "preflightWorkflow"
  | "listWorkflowSummaries"
  | "getWorkflowInterfaces"
  | "getWorkflowInterface"
  | "uploadTemporaryAsset";

export type SdkV1WebSocketOperationId =
  | "execution.run_job"
  | "execution.cancel_job"
  | "execution.reconnect_job"
  | "execution.stream_input"
  | "execution.end_input_stream"
  | "execution.update_node_properties"
  | "execution.execution_target"
  | "execution.job_resumed"
  | "execution.job_update"
  | "execution.node_update"
  | "execution.node_progress"
  | "execution.output_update"
  | "execution.chunk"
  | "execution.protocol_rejection";

export type SdkV1OperationId = SdkV1HttpOperationId | SdkV1WebSocketOperationId;

export type SdkV1JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SdkV1JsonValue[]
  | { readonly [key: string]: SdkV1JsonValue };

/** Which generated JSON Schema file carries a referenced component. */
export type SdkV1SchemaProfile = "discovery" | "lifecycle" | "execution";

/**
 * A reference to one generated `$defs` component. `schema` is the Zod source
 * of truth; `profile` + `name` name the generated `$defs` entry so artifact
 * generation can emit the exact `$ref` strings shipped today.
 */
export type SdkV1SchemaRef = {
  readonly profile: SdkV1SchemaProfile;
  readonly name: string;
  readonly schema: z.ZodType;
};

export type SdkV1HttpErrorDeclaration = {
  readonly status: string;
  readonly description: string;
};

export type SdkV1WebSocketErrorDeclaration = {
  readonly code: string;
  readonly description: string;
};

export type SdkV1ErrorDeclaration =
  | SdkV1HttpErrorDeclaration
  | SdkV1WebSocketErrorDeclaration;

type SdkV1OperationCommonBase<
  Id extends SdkV1OperationId,
  ErrorDeclaration extends SdkV1ErrorDeclaration
> = {
  readonly id: Id;
  readonly status: SdkV1OperationStatus;
  readonly auth: SdkV1OperationAuth;
  readonly feature: SdkV1OperationFeature;
  readonly errors: readonly ErrorDeclaration[];
};

export type SdkV1OperationCommon = SdkV1OperationCommonBase<
  SdkV1OperationId,
  SdkV1ErrorDeclaration
>;

export type SdkV1HttpParameterDeclaration = {
  readonly name: string;
  readonly in: "path" | "query";
  readonly required: boolean;
  readonly schema:
    | { readonly kind: "query-property" }
    | { readonly kind: "inline"; readonly jsonSchema: SdkV1JsonValue };
  readonly description?: string;
};

export type SdkV1HttpRequestBodyDeclaration =
  | {
      readonly kind: "json";
      readonly required: boolean;
      readonly schema: SdkV1SchemaRef;
      readonly description?: string;
    }
  | {
      /** Binary multipart upload; JSON schema generation does not apply. */
      readonly kind: "binary-multipart";
      readonly required: boolean;
      readonly field: string;
      readonly description?: string;
    };

export type SdkV1HttpRequestDeclaration = {
  /** Whole-query Zod object; `query-property` parameters resolve against it. */
  readonly query?: SdkV1SchemaRef;
  readonly parameters?: readonly SdkV1HttpParameterDeclaration[];
  readonly body?: SdkV1HttpRequestBodyDeclaration;
};

export type SdkV1HttpResponseDeclaration = {
  readonly status: string;
  readonly description: string;
  readonly contentType: "application/json";
  readonly schema: SdkV1SchemaRef;
};

export type SdkV1HttpOperationDeclaration = SdkV1OperationCommonBase<
  SdkV1HttpOperationId,
  SdkV1HttpErrorDeclaration
> & {
  readonly transport: "http";
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly summary: string;
  readonly request: SdkV1HttpRequestDeclaration;
  readonly response: SdkV1HttpResponseDeclaration;
};

export type SdkV1WebSocketRequestMessageKey = "executionCommand";
export type SdkV1WebSocketEventMessageKey = "executionEvent";
export type SdkV1WebSocketMessageKey =
  | SdkV1WebSocketRequestMessageKey
  | SdkV1WebSocketEventMessageKey;

export type SdkV1WebSocketCommand = SdkV1ExecutionCommand["command"];

export type SdkV1ClientCommandMessageDeclaration = {
  readonly request: {
    readonly envelope: SdkV1WebSocketRequestMessageKey;
    readonly payload: SdkV1SchemaRef;
  };
};

export type SdkV1ServerEventMessageDeclaration = {
  readonly event: {
    readonly envelope: SdkV1WebSocketEventMessageKey;
    readonly payload: SdkV1SchemaRef;
  };
};

export type SdkV1MessageDeclaration =
  | SdkV1ClientCommandMessageDeclaration
  | SdkV1ServerEventMessageDeclaration;

export type SdkV1WebSocketOperationDeclaration = SdkV1OperationCommonBase<
  SdkV1WebSocketOperationId,
  SdkV1WebSocketErrorDeclaration
> & {
  readonly transport: "websocket";
  readonly channel: string;
} & (
    | {
        readonly direction: "client-command";
        readonly command: SdkV1WebSocketCommand;
        readonly message: SdkV1ClientCommandMessageDeclaration;
      }
    | {
        readonly direction: "server-event";
        readonly command?: undefined;
        readonly message: SdkV1ServerEventMessageDeclaration;
      }
  );

export type SdkV1OperationDeclaration =
  | SdkV1HttpOperationDeclaration
  | SdkV1WebSocketOperationDeclaration;

/** AsyncAPI envelope message metadata for one `channels.<key>.messages` entry. */
export type SdkV1WebSocketMessageEnvelope = {
  readonly key: SdkV1WebSocketMessageKey;
  readonly action: "send" | "receive";
  readonly name: string;
  readonly description: string;
  readonly contentType: "application/msgpack";
  readonly payload: SdkV1SchemaRef;
  /** Key of the AsyncAPI operation carrying this message. */
  readonly operationKey: string;
};

export type SdkV1OperationRegistry = {
  readonly http: readonly SdkV1HttpOperationDeclaration[];
  readonly websocket: readonly SdkV1WebSocketOperationDeclaration[];
};

export const sdkV1OperationRegistry: SdkV1OperationRegistry = {
  http: sdkV1HttpOperations,
  websocket: sdkV1WebSocketOperations
};

function isValidSchemaRef(
  ref: SdkV1SchemaRef | undefined
): ref is SdkV1SchemaRef {
  return (
    ref !== undefined &&
    typeof ref.name === "string" &&
    ref.name.length > 0 &&
    (ref.profile === "discovery" ||
      ref.profile === "lifecycle" ||
      ref.profile === "execution") &&
    ref.schema !== undefined &&
    ref.schema !== null
  );
}

function validatePolicy(
  operation: SdkV1OperationDeclaration,
  issues: string[]
): void {
  if (operation.auth !== "discovery" && operation.auth !== "authenticated") {
    issues.push(`operation ${operation.id} has no auth policy`);
  }
  if (
    !Object.hasOwn(operation, "feature") ||
    (operation.feature !== null &&
      operation.feature !== "workflow-interface" &&
      operation.feature !== "lifecycle" &&
      operation.feature !== "execution")
  ) {
    issues.push(`operation ${operation.id} has no feature policy`);
  }
}

/**
 * Fail-fast structural checks over the declarations. Run by the artifact
 * generator and by tests; a doctored registry can be passed to prove each
 * failure mode.
 */
export function validateSdkV1OperationRegistry(
  registry: SdkV1OperationRegistry = sdkV1OperationRegistry
): void {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  for (const operation of [...registry.http, ...registry.websocket]) {
    if (seenIds.has(operation.id)) {
      issues.push(`duplicate operation id ${operation.id}`);
    }
    seenIds.add(operation.id);
  }

  const seenRoutes = new Set<string>();
  for (const operation of registry.http) {
    const route = `${operation.method} ${operation.path}`;
    if (seenRoutes.has(route)) {
      issues.push(`duplicate HTTP route ${route}`);
    }
    seenRoutes.add(route);

    if (operation.status === "implemented") {
      if (!isValidSchemaRef(operation.response?.schema)) {
        issues.push(
          `implemented operation ${operation.id} has no response schema`
        );
      }
      if (
        operation.request.body?.kind === "json" &&
        !isValidSchemaRef(operation.request.body.schema)
      ) {
        issues.push(
          `implemented operation ${operation.id} has no request body schema`
        );
      }
      if (operation.errors.length === 0) {
        issues.push(`implemented operation ${operation.id} declares no errors`);
      }
      validatePolicy(operation, issues);
    }
  }

  const seenChannelIdentities = new Set<string>();
  for (const operation of registry.websocket) {
    const identity =
      operation.direction === "server-event"
        ? `${operation.channel}:event:${operation.id}`
        : `${operation.channel}:${operation.command}`;
    if (seenChannelIdentities.has(identity)) {
      issues.push(`duplicate WebSocket channel identity ${identity}`);
    }
    seenChannelIdentities.add(identity);

    if (operation.status === "implemented") {
      if (operation.direction === "client-command") {
        if (!isValidSchemaRef(operation.message.request?.payload)) {
          issues.push(
            `implemented operation ${operation.id} has no request schema`
          );
        }
        if (operation.errors.length === 0) {
          issues.push(
            `implemented operation ${operation.id} declares no errors`
          );
        }
      } else if (!isValidSchemaRef(operation.message.event?.payload)) {
        issues.push(
          `implemented operation ${operation.id} has no event schema`
        );
      }
      validatePolicy(operation, issues);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid SDK v1 operation registry:\n- ${issues.join("\n- ")}`
    );
  }
}

export function getSdkV1Operation(
  id: string
): SdkV1OperationDeclaration | undefined {
  return (
    sdkV1HttpOperations.find((operation) => operation.id === id) ??
    sdkV1WebSocketOperations.find((operation) => operation.id === id)
  );
}

export {
  getSdkV1HttpOperation,
  getSdkV1WebSocketOperation,
  implementedSdkV1HttpOperations,
  implementedSdkV1WebSocketOperations,
  matchSdkV1HttpOperation,
  sdkV1HttpOperations,
  sdkV1WebSocketChannel,
  sdkV1WebSocketMessages,
  sdkV1WebSocketOperations
};
export type { SdkV1HttpOperationMatch } from "./sdk-v1-http-operations.js";
export type {
  ImplementedSdkV1HttpOperation,
  ImplementedSdkV1HttpOperationId
} from "./sdk-v1-http-operations.js";
export type {
  ImplementedSdkV1WebSocketOperation,
  ImplementedSdkV1WebSocketOperationId
} from "./sdk-v1-websocket-operations.js";
