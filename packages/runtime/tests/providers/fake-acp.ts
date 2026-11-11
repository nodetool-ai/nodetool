import type { ProviderTool } from "../../src/providers/types.js";
import type { AcpProcess, AcpSpawner } from "../../src/providers/acp-session.js";

export type Env = Array<{ name: string; value: string }>;

/** Calls the loopback bridge the way the CLI's stdio bridge does. */
export async function bridgeCall(env: Env, path: string, body: unknown, token?: string) {
  const get = (n: string) => env.find((e) => e.name === n)?.value ?? "";
  const res = await fetch(`http://127.0.0.1:${get("NODETOOL_BRIDGE_PORT")}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token ?? get("NODETOOL_BRIDGE_TOKEN")}` },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

/** A scripted `agy acp`. `onPrompt` plays the CLI's side of one prompt. */
export function fakeAcp(
  onPrompt: (ctx: {
    env: Env;
    mcp: Array<Record<string, any>>;
    update: (u: Record<string, unknown>) => void;
    ask: (params: Record<string, unknown>) => void;
  }) => Promise<void>,
  options: { newResult?: Record<string, unknown> } = {}
): { spawn: AcpSpawner; requests: Array<{ method: string; params: Record<string, any> }>; permissionReplies: unknown[]; killed: () => number } {
  const requests: Array<{ method: string; params: Record<string, any> }> = [];
  const permissionReplies: unknown[] = [];
  let kills = 0;
  const spawnFn: AcpSpawner = async () => {
    const queue: string[] = [];
    let wake: (() => void) | null = null;
    let closed = false;
    const emit = (m: unknown) => {
      queue.push(JSON.stringify(m));
      wake?.();
    };
    let env: Env = [];
    let mcp: Array<Record<string, any>> = [];
    const proc: AcpProcess = {
      lines: (async function* () {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) yield next;
          else if (closed) return;
          else await new Promise<void>((r) => (wake = r));
        }
      })(),
      exit: new Promise(() => undefined),
      kill: () => {
        kills += 1;
        closed = true;
        wake?.();
      },
      write: (line) => {
        const m = JSON.parse(line);
        if (m.method) requests.push({ method: m.method, params: m.params });
        if (m.id === 900) permissionReplies.push(m.result);
        if (m.method === "initialize") emit({ id: m.id, result: { protocolVersion: 1 } });
        else if (m.method === "session/new") {
          mcp = m.params.mcpServers;
          env = mcp[0]?.env ?? [];
          emit({ id: m.id, result: { sessionId: "s1", ...options.newResult } });
        } else if (m.method === "session/set_model") emit({ id: m.id, result: {} });
        else if (m.method === "session/prompt") {
          void onPrompt({
            env,
            mcp,
            update: (u) =>
              emit({ method: "session/update", params: { sessionId: "s1", update: u } }),
            ask: (params) => emit({ id: 900, method: "session/request_permission", params })
          }).then(() =>
            emit({
              id: m.id,
              result: { stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 2, thoughtTokens: 1, cachedReadTokens: 4 } }
            })
          );
        }
      }
    };
    return proc;
  };
  return { spawn: spawnFn, requests, permissionReplies, killed: () => kills };
}

export const text = (t: string) => ({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: t } });
export const tool = (name: string): ProviderTool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: "object", properties: { n: { type: "number" } } }
});

export async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

