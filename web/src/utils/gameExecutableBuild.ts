/**
 * Client helper for the desktop executable build:
 *   POST /api/games/:id/build-executable → newline-delimited JSON events while cargo compiles the published revision
 */
import { restFetch } from "../lib/rest-fetch";

export type GameExecutableBuildEvent =
  | { readonly type: "status"; readonly message: string; readonly project_path: string }
  | { readonly type: "log"; readonly line: string }
  | { readonly type: "done"; readonly binary_path: string; readonly project_path: string }
  | { readonly type: "error"; readonly detail: string; readonly runtime_package?: string };

/** A failed build. `runtimePackage` names the package to install when a tool such as cargo is missing. */
export class GameExecutableBuildError extends Error {
  constructor(message: string, readonly runtimePackage: string | null = null) {
    super(message);
    this.name = "GameExecutableBuildError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function refusal(res: Response): Promise<GameExecutableBuildError> {
  const text = await res.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed.detail === "string") {
      return new GameExecutableBuildError(parsed.detail, typeof parsed.runtime_package === "string" ? parsed.runtime_package : null);
    }
  } catch {
    // Not JSON: the text itself is the detail.
  }
  return new GameExecutableBuildError(text || `Build failed (${res.status})`);
}

function parseEvent(line: string): GameExecutableBuildEvent | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) && typeof parsed.type === "string" ? parsed as GameExecutableBuildEvent : null;
  } catch {
    return null;
  }
}

/**
 * Compiles the game's published revision into a desktop executable on the server's machine. Every event is passed
 * to `onEvent` as it arrives; the promise resolves with the final `done` event and rejects on an `error` event.
 */
export async function buildGameExecutable(gameId: string, onEvent: (event: GameExecutableBuildEvent) => void,
  signal?: AbortSignal): Promise<Extract<GameExecutableBuildEvent, { type: "done" }>> {
  const res = await restFetch(`/api/games/${encodeURIComponent(gameId)}/build-executable`, { method: "POST", signal });
  if (!res.ok) { throw await refusal(res); }
  if (!res.body) { throw new GameExecutableBuildError("The build returned no output"); }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let last: GameExecutableBuildEvent | null = null;
  for (let finished = false; !finished;) {
    const { done, value } = await reader.read();
    finished = done;
    pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = done ? "" : lines.pop() ?? "";
    for (const line of lines) {
      const event = line.trim() ? parseEvent(line) : null;
      if (event) { last = event; onEvent(event); }
    }
  }
  const final = last;
  if (final?.type === "done") { return final; }
  if (final?.type === "error") { throw new GameExecutableBuildError(final.detail, final.runtime_package ?? null); }
  throw new GameExecutableBuildError("The build stopped before it finished");
}
