import type { z } from "zod";
import type {
  pingMessageInSchema,
  pongMessageOutSchema,
  clientToolManifestMessageInSchema,
  rendererRegisteredMessageOutSchema,
  rendererToolCallMessageOutSchema,
  rendererToolResultMessageInSchema,
  toolResultMessageInSchema,
  systemStatsMessageOutSchema,
  resourceChangeMessageOutSchema,
  rpcErrorPayloadOutSchema,
  rpcResponseMessageOutSchema
} from "./ws-commands.js";
import type {
  PingMessage,
  PongMessage,
  ClientToolManifestMessage,
  RendererRegisteredMessage,
  RendererToolCallMessage,
  RendererToolResultMessage,
  ToolResultMessage,
  SystemStatsMessage,
  ResourceChangeMessage,
  RpcErrorPayload,
  RpcResponseMessage
} from "./messages.js";

declare const a1: z.infer<typeof pingMessageInSchema>; const _a1: PingMessage = a1; void _a1;
declare const b1: PingMessage; const _b1: z.infer<typeof pingMessageInSchema> = b1; void _b1;

declare const a2: z.infer<typeof pongMessageOutSchema>; const _a2: PongMessage = a2; void _a2;
declare const b2: PongMessage; const _b2: z.infer<typeof pongMessageOutSchema> = b2; void _b2;

declare const a3: z.infer<typeof clientToolManifestMessageInSchema>; const _a3: ClientToolManifestMessage = a3; void _a3;
declare const b3: ClientToolManifestMessage; const _b3: z.infer<typeof clientToolManifestMessageInSchema> = b3; void _b3;

declare const a4: z.infer<typeof rendererRegisteredMessageOutSchema>; const _a4: RendererRegisteredMessage = a4; void _a4;
declare const b4: RendererRegisteredMessage; const _b4: z.infer<typeof rendererRegisteredMessageOutSchema> = b4; void _b4;

declare const a5: z.infer<typeof rendererToolCallMessageOutSchema>; const _a5: RendererToolCallMessage = a5; void _a5;
declare const b5: RendererToolCallMessage; const _b5: z.infer<typeof rendererToolCallMessageOutSchema> = b5; void _b5;

declare const a6: z.infer<typeof rendererToolResultMessageInSchema>; const _a6: RendererToolResultMessage = a6; void _a6;
declare const b6: RendererToolResultMessage; const _b6: z.infer<typeof rendererToolResultMessageInSchema> = b6; void _b6;

declare const a7: z.infer<typeof toolResultMessageInSchema>; const _a7: ToolResultMessage = a7; void _a7;
declare const b7: ToolResultMessage; const _b7: z.infer<typeof toolResultMessageInSchema> = b7; void _b7;

declare const a8: z.infer<typeof systemStatsMessageOutSchema>; const _a8: SystemStatsMessage = a8; void _a8;
declare const b8: SystemStatsMessage; const _b8: z.infer<typeof systemStatsMessageOutSchema> = b8; void _b8;

declare const a9: z.infer<typeof resourceChangeMessageOutSchema>; const _a9: ResourceChangeMessage = a9; void _a9;
declare const b9: ResourceChangeMessage; const _b9: z.infer<typeof resourceChangeMessageOutSchema> = b9; void _b9;

declare const a10: z.infer<typeof rpcErrorPayloadOutSchema>; const _a10: RpcErrorPayload = a10; void _a10;
declare const b10: RpcErrorPayload; const _b10: z.infer<typeof rpcErrorPayloadOutSchema> = b10; void _b10;

declare const a11: z.infer<typeof rpcResponseMessageOutSchema>; const _a11: RpcResponseMessage = a11; void _a11;
declare const b11: RpcResponseMessage; const _b11: z.infer<typeof rpcResponseMessageOutSchema> = b11; void _b11;
