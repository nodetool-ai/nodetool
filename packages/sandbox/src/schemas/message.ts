import { z } from "zod";

/**
 * Messaging tools — how the agent talks BACK to the user.
 *
 * `notify` is non-blocking (the agent keeps working); `ask` stores a
 * pending question that a subsequent user reply can satisfy. Both can
 * carry attachments (paths inside the sandbox workspace).
 *
 * The events are streamed to the host over the /events SSE endpoint,
 * where the host relays them to the user-facing UI.
 */

export const Attachment = z.object({
  path: z.string().min(1),
  mime: z.string().optional(),
  caption: z.string().optional()
});
export type Attachment = z.infer<typeof Attachment>;

export const MessageNotifyUserInput = z.object({
  text: z.string(),
  attachments: z.array(Attachment).optional()
});
export type MessageNotifyUserInput = z.infer<typeof MessageNotifyUserInput>;

export const MessageNotifyUserOutput = z.object({
  event_id: z.string()
});
export type MessageNotifyUserOutput = z.infer<typeof MessageNotifyUserOutput>;

export const MessageAskUserInput = z.object({
  text: z.string(),
  attachments: z.array(Attachment).optional(),
  suggest_user_takeover: z.boolean().optional()
});
export type MessageAskUserInput = z.infer<typeof MessageAskUserInput>;

export const MessageAskUserOutput = z.object({
  event_id: z.string()
});
export type MessageAskUserOutput = z.infer<typeof MessageAskUserOutput>;

/**
 * Server-sent event payload pushed over /events. The host's ToolClient
 * exposes this as an async iterator.
 */
export const SandboxEventType = z.enum([
  "notify",
  "ask",
  "log",
  "idle"
]);
export type SandboxEventType = z.infer<typeof SandboxEventType>;

export const SandboxEvent = z.object({
  id: z.string(),
  type: SandboxEventType,
  timestamp: z.number(),
  text: z.string().optional(),
  attachments: z.array(Attachment).optional(),
  suggest_user_takeover: z.boolean().optional()
});
export type SandboxEvent = z.infer<typeof SandboxEvent>;

export const IdleInput = z.object({
  reason: z.string().optional()
});
export type IdleInput = z.infer<typeof IdleInput>;

export const IdleOutput = z.object({
  event_id: z.string()
});
export type IdleOutput = z.infer<typeof IdleOutput>;
