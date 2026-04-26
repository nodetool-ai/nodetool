import type { RealtimeMetrics, RealtimeSessionRecord } from "@nodetool/protocol";
import { realtimeSessionManager } from "./session-manager.js";

export interface RealtimeLifecycleActiveJob {
  realtimeRunner?: {
    updateMetrics?: (metrics: RealtimeMetrics) => void;
  };
}

export interface RealtimeLifecycleOrchestratorOptions {
  getUserId: () => string;
  getActiveJob: (jobId: string) => RealtimeLifecycleActiveJob | undefined;
  getMetrics: (session: RealtimeSessionRecord) => RealtimeMetrics;
  sendMessage: (message: Record<string, unknown>) => Promise<void>;
  onMetricsError?: (error: unknown) => void;
  intervalMs?: number;
}

export class RealtimeLifecycleOrchestrator {
  private readonly sessionJobs = new Map<string, string>();
  private readonly jobSessions = new Map<string, string>();
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: RealtimeLifecycleOrchestratorOptions) {}

  trackSessionJob(sessionId: string, jobId: string): void {
    this.sessionJobs.set(sessionId, jobId);
    this.jobSessions.set(jobId, sessionId);
  }

  clearSessionTracking(sessionId: string, jobId?: string | null): void {
    this.sessionJobs.delete(sessionId);
    if (jobId) {
      this.jobSessions.delete(jobId);
    }
  }

  getTrackedSessionIds(): string[] {
    return [...this.sessionJobs.keys()];
  }

  getSessionIdForJob(jobId: string): string | undefined {
    return this.jobSessions.get(jobId);
  }

  async emitMetrics(): Promise<void> {
    const userId = this.options.getUserId();
    const sessions = realtimeSessionManager
      .listSessions(userId)
      .filter(
        (session) => session.status === "starting" || session.status === "running"
      );

    for (const session of sessions) {
      const metrics = this.options.getMetrics(session);
      if (session.job_id) {
        const realtimeRunner = this.options.getActiveJob(session.job_id)
          ?.realtimeRunner;
        if (typeof realtimeRunner?.updateMetrics === "function") {
          realtimeRunner.updateMetrics(metrics);
        }
      }
      await this.options.sendMessage(metrics as unknown as Record<string, unknown>);
    }
  }

  startMetricsBroadcast(): void {
    this.stopMetricsBroadcast();
    const intervalMs = this.options.intervalMs ?? 500;
    this.metricsTimer = setInterval(() => {
      this.emitMetrics().catch((error) => {
        this.options.onMetricsError?.(error);
      });
    }, intervalMs);
  }

  stopMetricsBroadcast(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }
}
