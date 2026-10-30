import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { Message, ProviderSession } from "@nodetool-ai/runtime";
import type { ChatMessage } from "./terminal-screen.js";

const media = z.object({
  uri: z.string().optional(),
  data: z.string().optional(),
  mimeType: z.string().optional()
});
const historyMessage = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z
    .union([
      z.string(),
      z.array(
        z.union([
          z.object({ type: z.literal("text"), text: z.string() }).passthrough(),
          z.object({ type: z.literal("image_url"), image: media }),
          z.object({ type: z.literal("audio"), audio: media }),
          z.object({ type: z.literal("video"), video: media }),
          z.object({
            type: z.literal("document"),
            document: media.extend({ title: z.string().optional() }),
            citations: z.boolean().optional(),
            context: z.string().optional()
          })
        ])
      )
    ])
    .nullable()
    .optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        args: z.record(z.string(), z.unknown())
      })
    )
    .nullable()
    .optional(),
  toolCallId: z.string().nullable().optional(),
  isError: z.boolean().optional(),
  threadId: z.string().nullable().optional(),
  _rawGeminiParts: z.array(z.unknown()).optional(),
  _anthropicThinkingBlocks: z
    .array(
      z.union([
        z.object({
          type: z.literal("thinking"),
          thinking: z.string(),
          signature: z.string()
        }),
        z.object({ type: z.literal("redacted_thinking"), data: z.string() })
      ])
    )
    .optional()
});
const sessionSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{32}$/),
  threadId: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  workspace: z.string(),
  server: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  history: z.array(historyMessage),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant", "tool", "system"]),
      content: z.string(),
      toolName: z.string().optional(),
      toolArgs: z.record(z.string(), z.unknown()).optional()
    })
  ),
  providerSession: z
    .object({
      providerId: z.string(),
      model: z.string(),
      token: z.string(),
      checkpoint: z.number(),
      systemHash: z.string().optional()
    })
    .nullable()
    .optional()
});

export interface ChatSession {
  readonly version: 1;
  readonly id: string;
  readonly threadId: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly workspace: string;
  readonly server?: string;
  readonly provider: string;
  readonly model: string;
  readonly history: Message[];
  readonly messages: ChatMessage[];
  readonly providerSession?: ProviderSession | null;
}

export function newSessionId(): string {
  return randomUUID().replaceAll("-", "");
}

export class ChatSessionStore {
  constructor(
    private readonly directory = join(homedir(), ".nodetool", "chat-sessions")
  ) {}

  async save(session: ChatSession): Promise<void> {
    // Convert inline media bytes to the base64 form providers already accept.
    const text = JSON.stringify(
      session,
      (key: string, value: unknown) => {
        if (key === "rendered") {
          return undefined;
        }
        return value instanceof Uint8Array
          ? Buffer.from(value).toString("base64")
          : value;
      },
      2
    );
    sessionSchema.parse(JSON.parse(text));
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, `${session.id}.json`);
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, text, { mode: 0o600 });
    await rename(temp, path);
  }

  async list(workspace: string, server?: string): Promise<ChatSession[]> {
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
    const sessions: ChatSession[] = [];
    for (const file of files) {
      if (!/^[a-f0-9]{32}\.json$/.test(file)) {
        continue;
      }
      const text = await readFile(join(this.directory, file), "utf8");
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (error) {
        if (error instanceof SyntaxError) {
          // One damaged file must not hide the other saved conversations.
          continue;
        }
        throw error;
      }
      const parsed = sessionSchema.safeParse(value);
      if (
        parsed.success &&
        resolve(parsed.data.workspace) === resolve(workspace) &&
        parsed.data.server === server
      ) {
        sessions.push(parsed.data);
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export function exportTranscript(messages: readonly ChatMessage[]): string {
  return (
    messages
      .map(
        (message) =>
          `## ${message.role === "tool" ? (message.toolName ?? "Tool") : message.role}\n\n${message.content}`
      )
      .join("\n\n") + "\n"
  );
}
