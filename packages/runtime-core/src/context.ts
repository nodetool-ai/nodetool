import type { Workspace } from "./workspace.js";
import type { TextProvider, TextUsage } from "./text-provider.js";

/** Services available to execution without media, agents or local inference. */
export interface ExecutionContext {
  readonly userId: string;
  readonly signal: AbortSignal;
  readonly workspace: Workspace;
  readonly textProvider: TextProvider;
  readonly resolveSecret: (name: string) => Promise<string | undefined>;
  readonly trackUsage: (usage: TextUsage) => void;
}

/** Owns cancellable runs without retaining finished controllers. */
export class RunCancellation {
  private readonly runs = new Map<string, { owner: string; controller: AbortController }>();

  start(id: string, owner: string): AbortSignal {
    if (this.runs.has(id)) {
      throw new Error(`Run ${id} already exists`);
    }
    const controller = new AbortController();
    this.runs.set(id, { owner, controller });
    return controller.signal;
  }

  cancel(id: string, owner: string): boolean {
    const run = this.runs.get(id);
    if (!run || run.owner !== owner) {
      return false;
    }
    run.controller.abort();
    return true;
  }

  finish(id: string, owner: string): void {
    if (this.runs.get(id)?.owner === owner) {
      this.runs.delete(id);
    }
  }

  close(): void {
    for (const run of this.runs.values()) {
      run.controller.abort();
    }
    this.runs.clear();
  }
}
