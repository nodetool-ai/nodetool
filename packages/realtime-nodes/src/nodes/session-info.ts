import { BaseNode } from "@nodetool/node-sdk";
import type { RealtimeSessionInfo } from "@nodetool/protocol";
import type { ExecutionContext } from "@nodetool/runtime";

export class SessionInfo extends BaseNode {
  static readonly nodeType = "nodetool.realtime.SessionInfo";
  static readonly title = "Realtime Session Info";
  static readonly description =
    "Output the active realtime session details, including parameters, media tracks, transport, and metrics.\nTags: realtime, session, metadata, metrics, diagnostics, media-tracks";
  static readonly metadataOutputTypes = {
    session: "dict",
    session_id: "str",
    workflow_id: "str",
    transport: "str",
    parameters: "dict",
    media_tracks: "list[dict]",
    metrics: "dict"
  };
  static readonly isRealtimeCapable = true;
  static readonly ownsWarmState = true;

  private session: RealtimeSessionInfo | null = null;

  resetWarmState(): void {
    this.session = null;
  }

  async onSessionStart(
    _context: ExecutionContext,
    session: RealtimeSessionInfo
  ): Promise<void> {
    this.session = session;
  }

  async process(): Promise<Record<string, unknown>> {
    const session = this.session;
    return {
      session,
      session_id: session?.session_id ?? "",
      workflow_id: session?.workflow_id ?? null,
      transport: session?.transport ?? "",
      parameters: session?.parameters ?? {},
      media_tracks: session?.media_tracks ?? [],
      metrics: session?.metrics ?? null
    };
  }
}

export const SESSION_INFO_NODES = [SessionInfo] as const;
