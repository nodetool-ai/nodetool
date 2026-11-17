/**
 * The Add conversation operation of a transfer
 * (docs/plans/native-cloud-sync/technical-design.md, "Operations of a
 * transfer"). Conversations travel only when the person turned them on.
 * A conversation is never merged: its thread id is kept when it is free,
 * a taken id gets the conversation copied whole under a new one, and a
 * conversation an earlier transfer already added changes nothing.
 */
import {
  createTimeOrderedUuid,
  findTransferredConversation,
  Message,
  recordTransferredConversation,
  Thread
} from "@nodetool-ai/models";
import type {
  TransferConversationPayload,
  TransferFailure,
  TransferManifest
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { identityHash } from "./transfer-documents.js";

/** The captured hash of a conversation. */
export function conversationHash(payload: Omit<TransferConversationPayload, "thread_id">): string {
  return identityHash({ title: payload.title, kind: payload.kind, messages: payload.messages });
}

/**
 * Checks that each conversation the manifest names has a payload with its
 * captured hash. Returns the payloads by thread id.
 */
export function verifyConversations(
  manifest: TransferManifest,
  payloads: readonly TransferConversationPayload[] | undefined,
  failures: TransferFailure[]
): Map<string, TransferConversationPayload> {
  const byId = new Map((payloads ?? []).map((payload) => [payload.thread_id, payload]));
  for (const entry of manifest.conversations ?? []) {
    const payload = byId.get(entry.thread_id);
    if (!payload) {
      failures.push({ code: "PAYLOAD_MISSING", message: "The conversation has no payload", thread_id: entry.thread_id });
    } else if (conversationHash(payload) !== entry.captured_hash) {
      failures.push({
        code: "PAYLOAD_HASH_MISMATCH",
        message: "The conversation does not have the captured hash",
        thread_id: entry.thread_id
      });
    }
  }
  return byId;
}

/** Adds the conversations inside the commit and returns the cloud thread of each. */
export async function applyConversations(
  manifest: TransferManifest,
  payloads: Map<string, TransferConversationPayload>,
  context: { projectId: string; userId: string; transferId: string; now: Date }
): Promise<{ source_thread_id: string; thread_id: string }[]> {
  const pairs: { source_thread_id: string; thread_id: string }[] = [];
  for (const entry of manifest.conversations ?? []) {
    const payload = payloads.get(entry.thread_id);
    if (!payload) continue;
    const earlier = await findTransferredConversation(context.projectId, context.userId, entry.thread_id);
    if (earlier) {
      pairs.push({ source_thread_id: entry.thread_id, thread_id: earlier });
      continue;
    }
    // Model create is an upsert, so a taken id must be found first.
    const threadId = (await Thread.get<Thread>(entry.thread_id)) ? createTimeOrderedUuid() : entry.thread_id;
    const stamp = context.now.toISOString();
    await Thread.create<Thread>({
      id: threadId,
      user_id: context.userId,
      project_id: context.projectId,
      title: payload.title,
      kind: payload.kind,
      created_at: payload.messages[0]?.created_at ?? stamp,
      updated_at: stamp
    });
    for (const message of payload.messages) {
      const id = threadId === entry.thread_id && !(await Message.get<Message>(message.id)) ? message.id : createTimeOrderedUuid();
      await Message.create<Message>({
        id,
        user_id: context.userId,
        thread_id: threadId,
        role: message.role,
        name: message.name ?? null,
        content: message.content ?? null,
        tool_calls: message.tool_calls ?? null,
        tool_call_id: message.tool_call_id ?? null,
        input_files: message.input_files ?? null,
        output_files: message.output_files ?? null,
        provider: message.provider ?? null,
        model: message.model ?? null,
        created_at: message.created_at
      });
    }
    await recordTransferredConversation(
      {
        projectId: context.projectId,
        userId: context.userId,
        sourceThreadId: entry.thread_id,
        threadId,
        transferId: context.transferId
      },
      context.now
    );
    pairs.push({ source_thread_id: entry.thread_id, thread_id: threadId });
  }
  return pairs;
}
