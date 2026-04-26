import type {
  RealtimeInferenceBackend,
  RealtimeInferenceCacheStatus,
  RealtimeInferenceEngine,
  RealtimeInferenceLoadingStatus,
  RealtimeInferenceMetrics,
  RealtimeInferencePlacement,
  VideoFrame
} from "@nodetool/protocol";

export interface BrowserRealtimeLoadingState {
  status: RealtimeInferenceLoadingStatus;
  progress: number | null;
  backend: RealtimeInferenceBackend | null;
  fallbackBackend: RealtimeInferenceBackend | null;
  cache: RealtimeInferenceCacheStatus;
  warm: boolean;
  error: string | null;
}

export type BrowserRealtimeLoadingUpdate = Partial<BrowserRealtimeLoadingState> & {
  status: RealtimeInferenceLoadingStatus;
};

export interface BrowserRealtimeLoadContext {
  modelId: string;
  engine: RealtimeInferenceEngine;
  preferredBackends: readonly RealtimeInferenceBackend[];
  report: (state: BrowserRealtimeLoadingUpdate) => void;
}

export interface BrowserRealtimeModelLoaderOptions<TModel> {
  modelId: string;
  engine: RealtimeInferenceEngine;
  preferredBackends: readonly RealtimeInferenceBackend[];
  load: (context: BrowserRealtimeLoadContext) => Promise<TModel>;
  onLoadingState?: (state: BrowserRealtimeLoadingState) => void;
}

const INITIAL_LOADING_STATE: BrowserRealtimeLoadingState = {
  status: "idle",
  progress: null,
  backend: null,
  fallbackBackend: null,
  cache: "unknown",
  warm: false,
  error: null
};

export class BrowserRealtimeModelLoader<TModel> {
  private currentState: BrowserRealtimeLoadingState = {
    ...INITIAL_LOADING_STATE
  };

  constructor(private readonly options: BrowserRealtimeModelLoaderOptions<TModel>) {}

  get state(): BrowserRealtimeLoadingState {
    return { ...this.currentState };
  }

  async load(): Promise<TModel> {
    try {
      return await this.options.load({
        modelId: this.options.modelId,
        engine: this.options.engine,
        preferredBackends: this.options.preferredBackends,
        report: (state) => this.report(state)
      });
    } catch (error) {
      this.report({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        warm: false
      });
      throw error;
    }
  }

  private report(update: BrowserRealtimeLoadingUpdate): void {
    this.currentState = {
      ...this.currentState,
      ...update,
      fallbackBackend:
        update.fallbackBackend ?? update.backend ?? this.currentState.fallbackBackend,
      progress: update.progress ?? this.currentState.progress,
      backend: update.backend ?? this.currentState.backend,
      cache: update.cache ?? this.currentState.cache,
      warm: update.warm ?? this.currentState.warm,
      error: update.error ?? null
    };
    this.options.onLoadingState?.(this.state);
  }
}

export interface VideoFrameSamplingOptions {
  everyNthFrame?: number;
  minTimestampDeltaNs?: number;
}

export function sampleVideoFrames(
  frames: readonly VideoFrame[],
  options: VideoFrameSamplingOptions = {}
): VideoFrame[] {
  const everyNthFrame = Math.max(1, Math.floor(options.everyNthFrame ?? 1));
  const minTimestampDeltaNs = Math.max(0, options.minTimestampDeltaNs ?? 0);
  const sampled: VideoFrame[] = [];
  let lastTimestamp: number | null = null;

  for (let index = 0; index < frames.length; index++) {
    const current = frames[index];
    if (index % everyNthFrame !== 0) {
      continue;
    }
    if (
      lastTimestamp !== null &&
      current.timestamp_ns - lastTimestamp < minTimestampDeltaNs
    ) {
      continue;
    }
    sampled.push(current);
    lastTimestamp = current.timestamp_ns;
  }

  return sampled;
}

export interface CreateInferenceMetricsInput {
  sessionId: string;
  workflowId: string | null;
  jobId: string | null;
  nodeId: string;
  nodeType: string;
  placement: RealtimeInferencePlacement;
  engine: RealtimeInferenceEngine;
  modelId: string;
  modelSource?: RealtimeInferenceMetrics["model"]["source"];
  state: BrowserRealtimeLoadingState;
  throughput?: {
    inferenceFps?: number | null;
    averageLatencyMs?: number | null;
  };
  createdAt?: string;
}

export function createInferenceMetrics(
  input: CreateInferenceMetricsInput
): RealtimeInferenceMetrics {
  return {
    type: "realtime_inference_metrics",
    session_id: input.sessionId,
    workflow_id: input.workflowId,
    job_id: input.jobId,
    node_id: input.nodeId,
    node_type: input.nodeType,
    placement: input.placement,
    engine: input.engine,
    backend: input.state.backend ?? "unknown",
    fallback_backend: input.state.fallbackBackend,
    model: {
      id: input.modelId,
      source: input.modelSource ?? "browser_cache"
    },
    loading: {
      status: input.state.status,
      progress: input.state.progress,
      warm: input.state.warm,
      cache: input.state.cache,
      error: input.state.error
    },
    throughput: {
      inference_fps: input.throughput?.inferenceFps ?? null,
      average_latency_ms: input.throughput?.averageLatencyMs ?? null
    },
    created_at: input.createdAt ?? new Date().toISOString()
  };
}
