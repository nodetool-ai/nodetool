import { randomUUID } from "node:crypto";

export interface FrontendRendererToolCall {
  tool_call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export type FrontendRendererToolResult =
  | {
      renderer_id: string;
      tool_call_id: string;
      ok: true;
      result?: unknown;
    }
  | {
      renderer_id: string;
      tool_call_id: string;
      ok: false;
      error: string;
    };

interface ExecuteFrontendRendererToolOptions {
  userId: string;
  rendererId?: string;
  toolName: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

interface ExecuteFrontendRendererToolResult {
  handled: boolean;
  result?: unknown;
}

/** The small surface the registry needs from a live /ws runner. */
export interface FrontendRendererRunner {
  isRendererConnected(): boolean;
  isRendererReady(): boolean;
  getRendererToolManifest(): Record<string, Record<string, unknown>>;
  executeRendererTool(
    rendererId: string,
    call: FrontendRendererToolCall,
    timeoutMs?: number
  ): Promise<FrontendRendererToolResult>;
}

export interface FrontendRendererInfo {
  renderer_id: string;
  user_id: string;
  ready: boolean;
  connected: boolean;
  active: boolean;
  last_active_at: number;
  tools: Record<string, Record<string, unknown>>;
}

interface RendererRecord {
  info: FrontendRendererInfo;
  runner: FrontendRendererRunner;
  activitySequence: number;
}

export interface FrontendRendererService {
  list(userId: string): FrontendRendererInfo[];
  execute(
    options: ExecuteFrontendRendererToolOptions
  ): Promise<ExecuteFrontendRendererToolResult>;
}

/**
 * User-scoped registry of browser renderers attached to the normal /ws socket.
 *
 * A renderer is not listed until its browser has sent a client tool manifest.
 * Entries are removed as soon as their runner disconnects. The registry owns
 * selection and authorization so MCP callers cannot accidentally address a
 * renderer belonging to another user.
 */
export class FrontendRendererRegistry implements FrontendRendererService {
  private readonly renderers = new Map<string, RendererRecord>();
  private activitySequence = 0;

  register(userId: string, runner: FrontendRendererRunner): string {
    const rendererId = randomUUID();
    this.renderers.set(rendererId, {
      runner,
      activitySequence: ++this.activitySequence,
      info: {
        renderer_id: rendererId,
        user_id: userId,
        ready: false,
        connected: true,
        active: false,
        last_active_at: Date.now(),
        tools: {}
      }
    });
    return rendererId;
  }

  markReady(rendererId: string): void {
    const record = this.renderers.get(rendererId);
    if (!record || !record.runner.isRendererConnected()) return;
    record.info.ready = record.runner.isRendererReady();
    record.info.tools = record.runner.getRendererToolManifest();
    this.touch(rendererId);
  }

  touch(rendererId: string): void {
    const record = this.renderers.get(rendererId);
    if (!record || !record.runner.isRendererConnected()) return;
    record.activitySequence = ++this.activitySequence;
    record.info.last_active_at = Date.now();
  }

  unregister(rendererId: string): void {
    this.renderers.delete(rendererId);
  }

  list(userId: string): FrontendRendererInfo[] {
    const listed = [...this.renderers.values()]
      .filter((record) => {
        if (record.info.user_id !== userId) return false;
        if (!record.runner.isRendererConnected()) {
          this.renderers.delete(record.info.renderer_id);
          return false;
        }
        return record.runner.isRendererReady();
      })
      .sort((a, b) => b.activitySequence - a.activitySequence)
      .map(({ info }, index) => ({
        ...info,
        ready: true as const,
        connected: true as const,
        active: index === 0,
        tools: { ...info.tools }
      }));
    return listed;
  }

  /** Resolve an explicit renderer or the most recently active renderer. */
  resolve(userId: string, rendererId?: string): RendererRecord | null {
    if (rendererId) {
      const record = this.renderers.get(rendererId);
      if (
        !record ||
        record.info.user_id !== userId ||
        !record.runner.isRendererConnected() ||
        !record.runner.isRendererReady()
      ) {
        if (record && !record.runner.isRendererConnected()) {
          this.renderers.delete(rendererId);
        }
        return null;
      }
      return record;
    }

    return (
      this.list(userId)
        .map((info) => this.renderers.get(info.renderer_id))
        .find((record): record is RendererRecord => record !== undefined) ??
      null
    );
  }

  async execute(
    options: ExecuteFrontendRendererToolOptions
  ): Promise<ExecuteFrontendRendererToolResult> {
    const { userId, rendererId, toolName, args, timeoutMs } = options;
    const record = this.resolve(userId, rendererId);
    if (!record) {
      return { handled: false };
    }
    const call: FrontendRendererToolCall = {
      tool_call_id: randomUUID(),
      name: toolName,
      args
    };
    const result = await record.runner.executeRendererTool(
      record.info.renderer_id,
      call,
      timeoutMs
    );
    this.touch(record.info.renderer_id);
    if (!result.ok) {
      throw new Error(result.error ?? `${toolName} failed in renderer`);
    }
    return { handled: true, result: result.result };
  }

  get size(): number {
    return this.renderers.size;
  }
}
