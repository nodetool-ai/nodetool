/**
 * Protocol-correctness invariants (docs/RELIABILITY_ARCHITECTURE.md §6
 * "Protocol correctness"): every frame crossing every boundary validates
 * against the generated Zod schema, in both directions.
 *
 * `server_to_client` frames validate against `processingMessageSchemas`
 * (`@nodetool-ai/protocol`'s `messages.ts`, B1) for a `ProcessingMessage`
 * `type`, or `outboundControlMessageSchemas` for the handful of recognized
 * non-`ProcessingMessage` outbound shapes (`pong`, `rpc_response`,
 * `system_stats`, `resource_change`). A frame whose `type` matches neither —
 * or that has no `type` at all — is the ad hoc, type-less reply class
 * `ws-commands.ts` documents as intentionally outside any schema (e.g.
 * `{ error: "invalid_command" }`) and is left unvalidated, exactly as the WS
 * runner's own outbound validation gate does.
 *
 * `client_to_server` frames validate against `webSocketCommandEnvelopeSchema`
 * (and, when the command is a known `UnifiedCommandType`, that command's
 * `commandDataSchemas` entry too) when the frame carries a `command`
 * envelope, or `controlMessageInSchemas` for the un-enveloped control frames
 * (`ping`, `client_tools_manifest`, `tool_result`, …).
 */
import {
  processingMessageSchemas,
  outboundControlMessageSchemas,
  webSocketCommandEnvelopeSchema,
  controlMessageInSchemas,
  commandDataSchemas,
  type UnifiedCommandType
} from "@nodetool-ai/protocol";
import type { RunRecord } from "../record.js";
import type { Violation } from "./types.js";

function messageType(message: Record<string, unknown>): string | undefined {
  const type = message["type"];
  return typeof type === "string" ? type : undefined;
}

function issuesToString(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function checkServerToClient(
  message: Record<string, unknown>,
  frameIndex: number
): Violation[] {
  const type = messageType(message);

  if (type !== undefined && type in processingMessageSchemas) {
    const schema =
      processingMessageSchemas[type as keyof typeof processingMessageSchemas];
    const result = schema.safeParse(message);
    if (result.success) return [];
    return [
      {
        invariant: "protocol-validity.server-to-client-schema",
        message: `server_to_client frame of type "${type}" failed processingMessageSchema validation: ${issuesToString(result.error.issues)}`,
        frameIndex,
        details: { type, issues: result.error.issues }
      }
    ];
  }

  if (type !== undefined && type in outboundControlMessageSchemas) {
    const schema =
      outboundControlMessageSchemas[
        type as keyof typeof outboundControlMessageSchemas
      ];
    const result = schema.safeParse(message);
    if (result.success) return [];
    return [
      {
        invariant: "protocol-validity.server-to-client-schema",
        message: `server_to_client frame of type "${type}" failed its outbound control schema: ${issuesToString(result.error.issues)}`,
        frameIndex,
        details: { type, issues: result.error.issues }
      }
    ];
  }

  // Untyped, or a `type` neither schema map recognizes: the documented
  // ad hoc reply class — not validated.
  return [];
}

function checkClientToServer(
  message: Record<string, unknown>,
  frameIndex: number
): Violation[] {
  if (typeof message["command"] === "string") {
    const envelopeResult = webSocketCommandEnvelopeSchema.safeParse(message);
    if (!envelopeResult.success) {
      return [
        {
          invariant: "protocol-validity.client-to-server-envelope",
          message: `client_to_server command frame failed webSocketCommandEnvelopeSchema: ${issuesToString(envelopeResult.error.issues)}`,
          frameIndex,
          details: { issues: envelopeResult.error.issues }
        }
      ];
    }

    const command = message["command"] as string;
    const dataSchema = Object.prototype.hasOwnProperty.call(
      commandDataSchemas,
      command
    )
      ? commandDataSchemas[command as UnifiedCommandType]
      : undefined;
    if (dataSchema) {
      const data = (message["data"] as Record<string, unknown> | undefined) ?? {};
      const dataResult = dataSchema.safeParse(data);
      if (!dataResult.success) {
        return [
          {
            invariant: "protocol-validity.client-to-server-data",
            message: `command "${command}" data failed its schema: ${issuesToString(dataResult.error.issues)}`,
            frameIndex,
            details: { command, issues: dataResult.error.issues }
          }
        ];
      }
    }
    return [];
  }

  const type = messageType(message);
  if (type !== undefined && type in controlMessageInSchemas) {
    const schema =
      controlMessageInSchemas[type as keyof typeof controlMessageInSchemas];
    const result = schema.safeParse(message);
    if (result.success) return [];
    return [
      {
        invariant: "protocol-validity.client-to-server-control",
        message: `client_to_server control frame of type "${type}" failed its schema: ${issuesToString(result.error.issues)}`,
        frameIndex,
        details: { type, issues: result.error.issues }
      }
    ];
  }

  // No `command` envelope and no recognized control `type` — nothing to
  // validate against.
  return [];
}

export function checkProtocolValidity(record: RunRecord): Violation[] {
  const violations: Violation[] = [];
  record.frames.forEach((frame, index) => {
    const message = frame.message as Record<string, unknown>;
    if (frame.direction === "server_to_client") {
      violations.push(...checkServerToClient(message, index));
    } else {
      violations.push(...checkClientToServer(message, index));
    }
  });
  return violations;
}
