/**
 * Image generation through `agy acp`, which has no image tool for the parent
 * agent. See {@link generateImageViaAcp}.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { isString } from "@nodetool-ai/protocol";
import {
  AcpError,
  openAcp,
  permissionOutcome,
  type AcpConnection,
  type AcpSpawner
} from "./acp-session.js";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

/** The subagent `agy` uses for images. Its only entry point. */
const IMAGE_SUBAGENT = "image-generator";

export interface AcpImageOptions {
  spawn: AcpSpawner;
  cwd: string | null;
  prompt: string;
  /** Appended to the request, for example `16:9`. */
  aspectRatio?: string | null;
  signal?: AbortSignal;
  /** Where `agy` keeps per-conversation files. Defaults to the CLI's own. */
  brainDir?: string;
  /** How long to wait for the image. Image generation takes tens of seconds. */
  timeoutMs?: number;
  pollMs?: number;
  /** How long the file's size must stay unchanged before it counts as written. */
  settleMs?: number;
}

export interface AcpImage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Generate one image through `agy acp`.
 *
 * `agy` has no image tool for the parent agent. It generates images by
 * starting its `image-generator` subagent, which runs after the parent's turn
 * has ended and saves the file into the parent conversation's directory
 * (`<brain>/<session id>/`). So this starts the subagent, keeps the process
 * alive, and waits for a new image file to appear there and stop growing.
 */
export async function generateImageViaAcp(options: AcpImageOptions): Promise<AcpImage> {
  if (options.signal?.aborted) throw new AcpError("Image generation was cancelled");
  const [fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!fs || !os || !path) throw new AcpError("Image generation requires Node.js");
  const brainDir =
    options.brainDir ?? path.join(os.homedir(), ".gemini", "antigravity-cli", "brain");
  const timeoutMs = options.timeoutMs ?? 300_000;
  const pollMs = options.pollMs ?? 500;
  const settleMs = options.settleMs ?? 1500;

  let agentText = "";
  let closed: unknown = null;
  let connection: AcpConnection | null = null;
  let sessionId: string | null = null;
  const onAbort = () => connection?.abort(sessionId);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    connection = await openAcp({
      spawn: options.spawn,
      cwd: options.cwd,
      signal: options.signal,
      permit: (params) => permissionOutcome(params, ["invoke_subagent"]),
      onText: (text) => {
        agentText += text;
      },
      onClose: (err) => {
        closed = err;
      }
    });
    const acp = connection;
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: options.cwd ?? globalThis.process.cwd(), mcpServers: [] });
    if (!isString(created["sessionId"])) throw new AcpError("agy returned no session id");
    const id = created["sessionId"];
    sessionId = id;
    const dir = path.join(brainDir, id);
    const instruction = [
      `Start the ${IMAGE_SUBAGENT} subagent (invoke_subagent with TypeName "${IMAGE_SUBAGENT}") to generate exactly one image.`,
      `Image description: ${options.prompt}`,
      options.aspectRatio ? `Aspect ratio: ${options.aspectRatio}.` : "",
      "Pass the description to the subagent unchanged. Use no other tool."
    ]
      .filter(Boolean)
      .join("\n");

    // The prompt request ends when the parent's turn ends, which is before the
    // subagent finishes. Keep it running and watch the directory meanwhile.
    const prompted = acp
      .request("session/prompt", { sessionId: id, prompt: [{ type: "text", text: instruction }] })
      .catch((err: unknown) => {
        closed ??= err;
      });
    void prompted;

    const deadline = Date.now() + timeoutMs;
    let last = null as { file: string; size: number; since: number } | null;
    for (;;) {
      if (options.signal?.aborted) throw new AcpError("Image generation was cancelled");
      if (closed) throw closed instanceof Error ? closed : new AcpError(String(closed));
      const names = await fs.readdir(dir).catch(() => [] as string[]);
      const file = names.filter((n) => IMAGE_EXTENSIONS.test(n)).sort().at(-1);
      if (file) {
        const size = (await fs.stat(path.join(dir, file))).size;
        // A size that stays put for the settle window means the write finished.
        if (last?.file !== file || last.size !== size) {
          last = { file, size, since: Date.now() };
        } else if (size > 0 && Date.now() - last.since >= settleMs) {
          const full = path.join(dir, file);
          const bytes = new Uint8Array(await fs.readFile(full));
          await fs.rm(full, { force: true }).catch(() => undefined);
          const ext = (file.split(".").pop() ?? "").toLowerCase();
          return { bytes, mimeType: IMAGE_MIME[ext] ?? "image/jpeg" };
        }
      }
      if (Date.now() >= deadline) {
        throw new AcpError(
          `agy produced no image within ${Math.round(timeoutMs / 1000)}s${agentText.trim() ? `. Its reply: ${agentText.trim().slice(0, 500)}` : ""}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    connection?.close();
  }
}
