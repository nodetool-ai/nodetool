import { describe, expect, it } from "@jest/globals";
import { validateTimelinePerfReport, type TimelinePerfReport } from "../report";

const validReport: TimelinePerfReport = {
  schemaVersion: 2,
  fixtureVersion: "timeline-preview-v1",
  environment: {
    browser: "Chromium",
    os: "macOS",
    renderBackend: "webgpu",
    gpuAdapter: null,
    codec: "H.264",
    mediaWidth: 640,
    mediaHeight: 360,
    displayRefreshHz: null,
    previewWidth: 640,
    previewHeight: 360,
    cache: "warm"
  },
  scenarios: {
    steady24Fps: {
      sampleCount: 2,
      decodedVideoFrames: 2,
      decodedFrameIntervalsMs: { p50: 40, p95: 42, p99: 42 },
      sourceUploads: 2,
      compositorSubmissions: 2,
      presentedFrames: null,
      heldFrames: null,
      droppedVideoFrames: null,
      duplicateVideoFrames: null,
      correctFrameMatches: null,
      p50PresentationIntervalMs: null,
      p95PresentationIntervalMs: null,
      p99PresentationIntervalMs: null,
      cutToCorrectFrameMs: null,
      cutSourceTimeSeconds: null,
      extendedMetrics: {
        mainThreadTimeMs: null,
        gpuCompletionTimeMs: null,
        audioDriftMs: null,
        queueDepth: null,
        estimatedAllocatedBytes: null,
        peakProcessMemoryBytes: null,
        exportFramesPerSecond: null,
        cancellationMs: null,
        scrubToCorrectFrameMs: null
      }
    },
    trimmedCut: {
      sampleCount: 1,
      decodedVideoFrames: 1,
      sourceUploads: 1,
      compositorSubmissions: 1,
      presentedFrames: null,
      heldFrames: null,
      droppedVideoFrames: null,
      duplicateVideoFrames: null,
      correctFrameMatches: true,
      p50PresentationIntervalMs: null,
      p95PresentationIntervalMs: null,
      p99PresentationIntervalMs: null,
      cutToCorrectFrameMs: 12,
      cutSourceTimeSeconds: 7.25,
      extendedMetrics: {
        mainThreadTimeMs: null,
        gpuCompletionTimeMs: null,
        audioDriftMs: null,
        queueDepth: null,
        estimatedAllocatedBytes: null,
        peakProcessMemoryBytes: null,
        exportFramesPerSecond: null,
        cancellationMs: null,
        scrubToCorrectFrameMs: null
      }
    }
  }
};

describe("timeline performance report", () => {
  it("accepts two populated runs and preserves unavailable counters", () => {
    expect(validateTimelinePerfReport(validReport)).toBe(true);
  });

  it("rejects malformed decoded-frame intervals and presentation counters", () => {
    const report = structuredClone(validReport);
    report.scenarios.steady24Fps.decodedFrameIntervalsMs = { p50: 42, p95: 40, p99: 43 };
    expect(validateTimelinePerfReport(report)).toBe(false);
    report.scenarios.steady24Fps.decodedFrameIntervalsMs = null;
    report.scenarios.steady24Fps.p50PresentationIntervalMs = -1;
    expect(validateTimelinePerfReport(report)).toBe(false);
  });

  it("accepts Canvas2D preview fallback and browser export without compositor counters", () => {
    const fallback = structuredClone(validReport);
    fallback.environment.renderBackend = "canvas2d";
    expect(validateTimelinePerfReport(fallback)).toBe(true);

    fallback.scenarios.browserExport = {
      ...structuredClone(fallback.scenarios.steady24Fps),
      measurementPath: "browser-export",
      sourceUploads: null,
      compositorSubmissions: null,
      elapsedMs: 2_000,
      frameOraclePassed: true,
      bitmapCacheResidentBytes: { textBytes: null, shapeBytes: null }
    };
    expect(validateTimelinePerfReport(fallback)).toBe(true);
  });

  it("accepts additional named scenarios for L3", () => {
    const extended: TimelinePerfReport = structuredClone(validReport);
    extended.scenarios.fourStream4k = structuredClone(extended.scenarios.steady24Fps);
    extended.scenarios.fourStream4k.measurementPath = "browser-preview";
    extended.scenarios.fourStream4k.frameOraclePassed = true;
    expect(validateTimelinePerfReport(extended)).toBe(true);
  });

  it("accepts one fresh isolated scenario without inherited baseline runs", () => {
    const isolated: TimelinePerfReport = {
      ...structuredClone(validReport),
      reportKind: "isolatedScenario",
      inheritedBaselinePath: "timeline-preview-cold.json",
      scenarios: { fourStream4k: structuredClone(validReport.scenarios.steady24Fps) }
    };
    expect(validateTimelinePerfReport(isolated)).toBe(true);
  });

  it("rejects an empty isolated scenario report", () => {
    const isolated: TimelinePerfReport = {
      ...structuredClone(validReport),
      reportKind: "isolatedScenario",
      scenarios: {}
    };
    expect(validateTimelinePerfReport(isolated)).toBe(false);
  });

  it("accepts export scenarios with elapsed time and unavailable process metrics", () => {
    const extended: TimelinePerfReport = structuredClone(validReport);
    extended.scenarios.browserExport1080p = {
      ...structuredClone(extended.scenarios.steady24Fps),
      measurementPath: "browser-export",
      elapsedMs: 850,
      frameOraclePassed: true,
      extendedMetrics: {
        ...structuredClone(extended.scenarios.steady24Fps.extendedMetrics),
        exportFramesPerSecond: 24,
        peakProcessMemoryBytes: null
      }
    };
    extended.scenarios.serverExport4k = {
      ...structuredClone(extended.scenarios.steady24Fps),
      measurementPath: "server-export",
      elapsedMs: 2_500,
      frameOraclePassed: true,
      sourceUploads: null,
      compositorSubmissions: null,
      extendedMetrics: {
        ...structuredClone(extended.scenarios.steady24Fps.extendedMetrics),
        exportFramesPerSecond: 12,
        peakProcessMemoryBytes: null
      }
    };
    expect(validateTimelinePerfReport(extended)).toBe(true);
  });

  it("records a rendered cut that missed its source in-point", () => {
    const report = structuredClone(validReport);
    report.scenarios.trimmedCut.correctFrameMatches = false;
    report.scenarios.trimmedCut.cutToCorrectFrameMs = null;
    report.scenarios.trimmedCut.cutSourceTimeSeconds = 0.2;
    expect(validateTimelinePerfReport(report)).toBe(true);
  });

  it("rejects an invalid empty run", () => {
    const invalid = structuredClone(validReport);
    invalid.scenarios.steady24Fps.sampleCount = 0;
    expect(validateTimelinePerfReport(invalid)).toBe(false);
  });
});
