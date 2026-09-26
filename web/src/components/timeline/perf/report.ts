/**
 * Machine-readable contract for the browser timeline performance baseline.
 * Counters unavailable in a browser or operating system stay null.
 */
export interface TimelinePerfRun {
  /** Optional L3 label describing the measured path without changing schemaVersion. */
  measurementPath?: "browser-preview" | "browser-export" | "server-export";
  /** What the scenario actually proved; diagnostic methods do not claim pixel parity. */
  oracleMethod?:
    | "decoded-source-pixel-grid"
    | "known-composite-color-grid"
    | "dissolve-overlap-pixel-check"
    | "caption-and-title-pixel-check"
    | "matte-center-corner-pixel-check"
    | "effect-signal-diagnostic"
    | "motion-blur-signal-diagnostic"
    | "reverse-source-time-check"
    | "latest-request-pixel-grid"
    | "known-export-pixel";
  /** Optional elapsed wall time for exports and scenario-specific probes. */
  elapsedMs?: number | null;
  /** A correctness check against decoded pixels or a known frame identity. */
  frameOraclePassed?: boolean | null;
  /** Scenario-specific source dimensions and simultaneous video layer count. */
  scenarioConfig?: { width: number; height: number; videoStreams: number };
  outputSizeBytes?: number | null;
  bitmapCacheResidentBytes?: {
    textBytes: number | null;
    shapeBytes: number | null;
  };
  bitmapCachePeakFrameBytes?: {
    textBytes: number | null;
    shapeBytes: number | null;
  };
  encodedDimensions?: { width: number; height: number };
  cutFrameEvidence?: {
    firstDecodedMediaTimeSeconds: number | null;
    firstUploadedMediaTimeSeconds: number | null;
    expectedSourceTimeSeconds: number | null;
    sourceUploadObserved: boolean;
  };
  preparedCutEvidence?: {
    preparedElementPromoted: boolean;
    additionalLoadCalls: number;
    decodedPixelMatchesPreview: boolean;
    timelineAtFirstFrameMs: number | null;
    firstUploadMediaTimeSeconds: number | null;
    lastUploadMediaTimeSeconds: number | null;
    firstUploadAtMs: number | null;
    firstSubmitAtMs: number | null;
    lastUploadSubmitAtMs: number | null;
    currentMediaTimeAtScreenshotSeconds: number | null;
    pixelMatches: number;
    sourceDimensions: { width: number; height: number } | null;
    previewDimensions: { width: number; height: number };
    firstSubmitLayerCount: number | null;
    firstSubmitDrawnLayers: number | null;
    firstMatchingPreviewDelayMs: number | null;
    sourceMediaTimeAtFirstMatchSeconds: number | null;
    immediatePreviewScreenshotPath: string;
    firstMatchingPreviewScreenshotPath: string | null;
    pixelSamplesPath: string;
  };
  sampleCount: number;
  /** Hidden source-video callbacks, distinct from canvas presentation. */
  decodedVideoFrames?: number | null;
  sourceUploads: number | null;
  compositorSubmissions: number | null;
  /** Preview-canvas presentations. Null when only hidden source-video callbacks were observed. */
  presentedFrames: number | null;
  decodedFrameIntervalsMs?: { p50: number; p95: number; p99: number } | null;
  /** Intentionally held preview-canvas frames, unavailable in the current fixture. */
  heldFrames: number | null;
  droppedVideoFrames: number | null;
  duplicateVideoFrames: number | null;
  correctFrameMatches: boolean | null;
  p50PresentationIntervalMs: number | null;
  p95PresentationIntervalMs: number | null;
  p99PresentationIntervalMs: number | null;
  cutToCorrectFrameMs: number | null;
  cutSourceTimeSeconds: number | null;
  /** Reserved measurements for L3 scenarios; null means unobserved here. */
  extendedMetrics: {
    mainThreadTimeMs: number | null;
    gpuCompletionTimeMs: number | null;
    audioDriftMs: number | null;
    queueDepth: number | null;
    estimatedAllocatedBytes: number | null;
    peakProcessMemoryBytes: number | null;
    exportFramesPerSecond: number | null;
    cancellationMs: number | null;
    scrubToCorrectFrameMs: number | null;
  };
}

export interface TimelinePerfReport {
  schemaVersion: 2;
  fixtureVersion: string;
  reportKind?: "baseline" | "isolatedScenario";
  inheritedBaselinePath?: string;
  environment: {
    browser: string;
    os: string;
    renderBackend: "webgpu" | "canvas2d";
    gpuAdapter: string | null;
    codec: string;
    mediaWidth: number;
    mediaHeight: number;
    displayRefreshHz: number | null;
    previewWidth: number;
    previewHeight: number;
    cache: "cold" | "warm";
  };
  scenarios: Record<string, TimelinePerfRun>;
}

/**
 * Reject incomplete baseline reports before they are written or compared.
 * In particular, a successful empty browser run must not look like zero cost.
 */
export function validateTimelinePerfReport(
  value: unknown
): value is TimelinePerfReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<TimelinePerfReport>;
  if (
    report.schemaVersion !== 2 ||
    typeof report.fixtureVersion !== "string" ||
    (report.reportKind !== undefined && !["baseline", "isolatedScenario"].includes(report.reportKind)) ||
    (report.inheritedBaselinePath !== undefined && typeof report.inheritedBaselinePath !== "string") ||
    !report.environment ||
    !report.scenarios ||
    !["webgpu", "canvas2d"].includes(report.environment.renderBackend) ||
    typeof report.environment.browser !== "string" ||
    typeof report.environment.os !== "string" ||
    typeof report.environment.codec !== "string" ||
    !Number.isFinite(report.environment.mediaWidth) ||
    !Number.isFinite(report.environment.mediaHeight) ||
    !Number.isFinite(report.environment.previewWidth) ||
    !Number.isFinite(report.environment.previewHeight) ||
    !["cold", "warm"].includes(report.environment.cache)
  ) {
    return false;
  }

  const runs = Object.values(report.scenarios);
  if (report.reportKind === "isolatedScenario") {
    if (runs.length < 1) return false;
  } else if (!report.scenarios.steady24Fps || !report.scenarios.trimmedCut || runs.length < 2) {
    return false;
  }
  for (const run of runs) {
    if (
      !run ||
      !Number.isInteger(run.sampleCount) ||
      run.sampleCount < 1 ||
      (run.decodedVideoFrames !== undefined && run.decodedVideoFrames !== null && (!Number.isInteger(run.decodedVideoFrames) || run.decodedVideoFrames < 0)) ||
      (run.sourceUploads !== null && (!Number.isInteger(run.sourceUploads) || run.sourceUploads < 0)) ||
      (run.compositorSubmissions !== null && (!Number.isInteger(run.compositorSubmissions) || run.compositorSubmissions < 0)) ||
      (run.presentedFrames !== null && (!Number.isInteger(run.presentedFrames) || run.presentedFrames < 0)) ||
      (run.heldFrames !== null && (!Number.isInteger(run.heldFrames) || run.heldFrames < 0)) ||
      (run.droppedVideoFrames !== null && (!Number.isInteger(run.droppedVideoFrames) || run.droppedVideoFrames < 0)) ||
      (run.duplicateVideoFrames !== null && (!Number.isInteger(run.duplicateVideoFrames) || run.duplicateVideoFrames < 0))
    ) {
      return false;
    }
    const metrics = run.extendedMetrics;
    if (!metrics) return false;
    if (
      (run.measurementPath !== undefined && !["browser-preview", "browser-export", "server-export"].includes(run.measurementPath)) ||
      (run.oracleMethod !== undefined && ![
        "decoded-source-pixel-grid",
        "known-composite-color-grid",
        "dissolve-overlap-pixel-check",
        "caption-and-title-pixel-check",
        "matte-center-corner-pixel-check",
        "effect-signal-diagnostic",
        "motion-blur-signal-diagnostic",
        "reverse-source-time-check",
        "latest-request-pixel-grid",
        "known-export-pixel"
      ].includes(run.oracleMethod)) ||
      (run.elapsedMs !== undefined && run.elapsedMs !== null && (!Number.isFinite(run.elapsedMs) || run.elapsedMs < 0)) ||
      (run.scenarioConfig !== undefined && (
        !Number.isInteger(run.scenarioConfig.width) || run.scenarioConfig.width < 1 ||
        !Number.isInteger(run.scenarioConfig.height) || run.scenarioConfig.height < 1 ||
        !Number.isInteger(run.scenarioConfig.videoStreams) || run.scenarioConfig.videoStreams < 0
      )) ||
      (run.outputSizeBytes !== undefined && run.outputSizeBytes !== null && (!Number.isFinite(run.outputSizeBytes) || run.outputSizeBytes < 0)) ||
      (run.bitmapCacheResidentBytes !== undefined && (
        (run.bitmapCacheResidentBytes.textBytes !== null && (!Number.isFinite(run.bitmapCacheResidentBytes.textBytes) || run.bitmapCacheResidentBytes.textBytes < 0)) ||
        (run.bitmapCacheResidentBytes.shapeBytes !== null && (!Number.isFinite(run.bitmapCacheResidentBytes.shapeBytes) || run.bitmapCacheResidentBytes.shapeBytes < 0))
      )) ||
      (run.bitmapCachePeakFrameBytes !== undefined && (
        (run.bitmapCachePeakFrameBytes.textBytes !== null && (!Number.isFinite(run.bitmapCachePeakFrameBytes.textBytes) || run.bitmapCachePeakFrameBytes.textBytes < 0)) ||
        (run.bitmapCachePeakFrameBytes.shapeBytes !== null && (!Number.isFinite(run.bitmapCachePeakFrameBytes.shapeBytes) || run.bitmapCachePeakFrameBytes.shapeBytes < 0))
      )) ||
      (run.encodedDimensions !== undefined && (
        !Number.isInteger(run.encodedDimensions.width) || run.encodedDimensions.width < 1 ||
        !Number.isInteger(run.encodedDimensions.height) || run.encodedDimensions.height < 1
      )) ||
      (run.cutFrameEvidence !== undefined && (
        (run.cutFrameEvidence.firstDecodedMediaTimeSeconds !== null && (!Number.isFinite(run.cutFrameEvidence.firstDecodedMediaTimeSeconds) || run.cutFrameEvidence.firstDecodedMediaTimeSeconds < 0)) ||
        (run.cutFrameEvidence.firstUploadedMediaTimeSeconds !== null && (!Number.isFinite(run.cutFrameEvidence.firstUploadedMediaTimeSeconds) || run.cutFrameEvidence.firstUploadedMediaTimeSeconds < 0)) ||
        (run.cutFrameEvidence.expectedSourceTimeSeconds !== null && (!Number.isFinite(run.cutFrameEvidence.expectedSourceTimeSeconds) || run.cutFrameEvidence.expectedSourceTimeSeconds < 0)) ||
        typeof run.cutFrameEvidence.sourceUploadObserved !== "boolean"
      )) ||
      (run.preparedCutEvidence !== undefined && (
        typeof run.preparedCutEvidence.preparedElementPromoted !== "boolean" ||
        !Number.isInteger(run.preparedCutEvidence.additionalLoadCalls) || run.preparedCutEvidence.additionalLoadCalls < 0 ||
        typeof run.preparedCutEvidence.decodedPixelMatchesPreview !== "boolean" ||
        (run.preparedCutEvidence.timelineAtFirstFrameMs !== null && (!Number.isFinite(run.preparedCutEvidence.timelineAtFirstFrameMs) || run.preparedCutEvidence.timelineAtFirstFrameMs < 0)) ||
        (run.preparedCutEvidence.firstUploadMediaTimeSeconds !== null && (!Number.isFinite(run.preparedCutEvidence.firstUploadMediaTimeSeconds) || run.preparedCutEvidence.firstUploadMediaTimeSeconds < 0)) ||
        (run.preparedCutEvidence.lastUploadMediaTimeSeconds !== null && (!Number.isFinite(run.preparedCutEvidence.lastUploadMediaTimeSeconds) || run.preparedCutEvidence.lastUploadMediaTimeSeconds < 0)) ||
        (run.preparedCutEvidence.firstUploadAtMs !== null && (!Number.isFinite(run.preparedCutEvidence.firstUploadAtMs) || run.preparedCutEvidence.firstUploadAtMs < 0)) ||
        (run.preparedCutEvidence.firstSubmitAtMs !== null && (!Number.isFinite(run.preparedCutEvidence.firstSubmitAtMs) || run.preparedCutEvidence.firstSubmitAtMs < 0)) ||
        (run.preparedCutEvidence.lastUploadSubmitAtMs !== null && (!Number.isFinite(run.preparedCutEvidence.lastUploadSubmitAtMs) || run.preparedCutEvidence.lastUploadSubmitAtMs < 0)) ||
        (run.preparedCutEvidence.currentMediaTimeAtScreenshotSeconds !== null && (!Number.isFinite(run.preparedCutEvidence.currentMediaTimeAtScreenshotSeconds) || run.preparedCutEvidence.currentMediaTimeAtScreenshotSeconds < 0)) ||
        !Number.isInteger(run.preparedCutEvidence.pixelMatches) || run.preparedCutEvidence.pixelMatches < 0 || run.preparedCutEvidence.pixelMatches > 25 ||
        (run.preparedCutEvidence.sourceDimensions !== null && (!Number.isInteger(run.preparedCutEvidence.sourceDimensions.width) || run.preparedCutEvidence.sourceDimensions.width < 1 || !Number.isInteger(run.preparedCutEvidence.sourceDimensions.height) || run.preparedCutEvidence.sourceDimensions.height < 1)) ||
        !Number.isInteger(run.preparedCutEvidence.previewDimensions.width) || run.preparedCutEvidence.previewDimensions.width < 1 || !Number.isInteger(run.preparedCutEvidence.previewDimensions.height) || run.preparedCutEvidence.previewDimensions.height < 1 ||
        (run.preparedCutEvidence.firstSubmitLayerCount !== null && (!Number.isInteger(run.preparedCutEvidence.firstSubmitLayerCount) || run.preparedCutEvidence.firstSubmitLayerCount < 0)) ||
        (run.preparedCutEvidence.firstSubmitDrawnLayers !== null && (!Number.isInteger(run.preparedCutEvidence.firstSubmitDrawnLayers) || run.preparedCutEvidence.firstSubmitDrawnLayers < 0))
        || (run.preparedCutEvidence.firstMatchingPreviewDelayMs !== null && (!Number.isFinite(run.preparedCutEvidence.firstMatchingPreviewDelayMs) || run.preparedCutEvidence.firstMatchingPreviewDelayMs < 0))
        || (run.preparedCutEvidence.sourceMediaTimeAtFirstMatchSeconds !== null && (!Number.isFinite(run.preparedCutEvidence.sourceMediaTimeAtFirstMatchSeconds) || run.preparedCutEvidence.sourceMediaTimeAtFirstMatchSeconds < 0))
        || typeof run.preparedCutEvidence.immediatePreviewScreenshotPath !== "string"
        || (run.preparedCutEvidence.firstMatchingPreviewScreenshotPath !== null && typeof run.preparedCutEvidence.firstMatchingPreviewScreenshotPath !== "string")
        || typeof run.preparedCutEvidence.pixelSamplesPath !== "string"
      )) ||
      (run.frameOraclePassed !== undefined && run.frameOraclePassed !== null && typeof run.frameOraclePassed !== "boolean")
    ) return false;
    if (run.decodedFrameIntervalsMs !== undefined && run.decodedFrameIntervalsMs !== null) {
      const { p50, p95, p99 } = run.decodedFrameIntervalsMs;
      if (![p50, p95, p99].every((value) => Number.isFinite(value) && value >= 0) || p50 > p95 || p95 > p99) return false;
    }
    if ([run.p50PresentationIntervalMs, run.p95PresentationIntervalMs, run.p99PresentationIntervalMs].some(
      (value) => value !== null && (!Number.isFinite(value) || value < 0)
    )) return false;
    if (run.measurementPath === "server-export") {
      if (run.elapsedMs == null || run.extendedMetrics.exportFramesPerSecond == null) return false;
    } else if (run.measurementPath === "browser-export") {
      if (run.compositorSubmissions !== null && run.compositorSubmissions < 0) return false;
    } else if (run.compositorSubmissions === null || run.compositorSubmissions < 1) {
      return false;
    }
    for (const value of Object.values(metrics)) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) return false;
    }
  }
  const cut = report.scenarios.trimmedCut;
  if (report.reportKind === "isolatedScenario" && !cut) return true;
  if (!cut) return false;
  if (
    typeof cut.correctFrameMatches !== "boolean" ||
    (cut.cutToCorrectFrameMs !== null &&
      (!Number.isFinite(cut.cutToCorrectFrameMs) || cut.cutToCorrectFrameMs < 0)) ||
    (cut.cutSourceTimeSeconds !== null &&
      (!Number.isFinite(cut.cutSourceTimeSeconds) || cut.cutSourceTimeSeconds < 0))
  ) {
    return false;
  }
  return true;
}
