import type {
  RealtimeAnalysisEvent,
  RealtimeInferenceBackend,
  RealtimeInferenceCacheStatus,
  RealtimeInferenceEngine,
  RealtimeInferenceLoadingStatus,
  RealtimeInferenceMetrics,
  RealtimeInferencePlacement,
  RealtimeNodeProfile,
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

export interface BrowserRealtimeNodeDefinition {
  node_type: string;
  title: string;
  description: string;
  engine: RealtimeInferenceEngine;
  realtime_profile: RealtimeNodeProfile;
}

const ANALYSIS_NODE_PROFILE: RealtimeNodeProfile = {
  browser_capable: true,
  requires_browser_frame: true,
  requires_webgpu: false,
  emits_analysis_event: true,
  emits_parameter_update: false,
  emits_media_frame: false
};

export const REALTIME_BROWSER_NODE_DEFINITIONS = {
  HandLandmarks: {
    node_type: "nodetool.realtime.browser.HandLandmarks",
    title: "Hand Landmarks",
    description:
      "Browser-local hand landmark detection from realtime video frames using an injected MediaPipe-compatible detector.",
    engine: "mediapipe",
    realtime_profile: { ...ANALYSIS_NODE_PROFILE }
  },
  FrameClassification: {
    node_type: "nodetool.realtime.browser.FrameClassification",
    title: "Frame Classification",
    description:
      "Browser-local frame classification sampled from realtime video frames using an injected Transformers.js-style classifier.",
    engine: "transformersjs",
    realtime_profile: { ...ANALYSIS_NODE_PROFILE }
  }
} satisfies Record<string, BrowserRealtimeNodeDefinition>;

export interface BrowserFrameReference {
  sequence: number;
  timestamp_ns: number;
  width: number;
  height: number;
}

function toFrameReference(frame: VideoFrame): BrowserFrameReference {
  return {
    sequence: frame.sequence,
    timestamp_ns: frame.timestamp_ns,
    width: frame.width,
    height: frame.height
  };
}

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface DetectedHand {
  handedness?: string;
  landmarks: HandLandmark[];
}

export interface HandLandmarksResult {
  kind: "hand_landmarks";
  frame: BrowserFrameReference;
  hands: DetectedHand[];
}

export interface HandLandmarkDetector {
  detect(frame: VideoFrame): Promise<{ hands: DetectedHand[] }>;
}

export interface HandLandmarksNodeOptions {
  detector: HandLandmarkDetector;
}

export class HandLandmarksNode {
  readonly definition = REALTIME_BROWSER_NODE_DEFINITIONS.HandLandmarks;

  constructor(private readonly options: HandLandmarksNodeOptions) {}

  async analyze(frame: VideoFrame): Promise<HandLandmarksResult> {
    const detected = await this.options.detector.detect(frame);
    return {
      kind: "hand_landmarks",
      frame: toFrameReference(frame),
      hands: detected.hands
    };
  }
}

export interface FrameClassification {
  label: string;
  score: number;
}

export interface FrameClassificationResult {
  kind: "frame_classification";
  frame: BrowserFrameReference;
  classifications: FrameClassification[];
}

export interface FrameClassifier {
  classify(frame: VideoFrame): Promise<FrameClassification[]>;
}

export interface FrameClassificationNodeOptions extends VideoFrameSamplingOptions {
  classifier: FrameClassifier;
}

export class FrameClassificationNode {
  readonly definition = REALTIME_BROWSER_NODE_DEFINITIONS.FrameClassification;

  constructor(private readonly options: FrameClassificationNodeOptions) {}

  async analyze(frame: VideoFrame): Promise<FrameClassificationResult> {
    return {
      kind: "frame_classification",
      frame: toFrameReference(frame),
      classifications: await this.options.classifier.classify(frame)
    };
  }

  async analyzeBatch(frames: readonly VideoFrame[]): Promise<FrameClassificationResult[]> {
    const sampled = sampleVideoFrames(frames, {
      everyNthFrame: this.options.everyNthFrame,
      minTimestampDeltaNs: this.options.minTimestampDeltaNs
    });
    const results: FrameClassificationResult[] = [];
    for (const frame of sampled) {
      results.push(await this.analyze(frame));
    }
    return results;
  }
}

export type BrowserRealtimeAnalysisResult =
  | HandLandmarksResult
  | FrameClassificationResult;

export interface CreateAnalysisEventInput {
  sessionId: string;
  workflowId: string | null;
  jobId: string | null;
  nodeId: string;
  nodeType: string;
  event: BrowserRealtimeAnalysisResult;
  createdAt?: string;
}

function payloadFromAnalysisResult(
  event: BrowserRealtimeAnalysisResult
): Record<string, unknown> {
  if (event.kind === "hand_landmarks") {
    return { hands: event.hands };
  }
  return { classifications: event.classifications };
}

export function createAnalysisEvent(
  input: CreateAnalysisEventInput
): RealtimeAnalysisEvent {
  return {
    type: "realtime_analysis_event",
    session_id: input.sessionId,
    workflow_id: input.workflowId,
    job_id: input.jobId,
    node_id: input.nodeId,
    node_type: input.nodeType,
    event: input.event.kind,
    frame: input.event.frame,
    payload: payloadFromAnalysisResult(input.event),
    created_at: input.createdAt ?? new Date().toISOString()
  };
}
