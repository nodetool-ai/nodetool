#pragma once

// The bench JSON line and its budget (DESIGN.md § Harness). Pure: the app
// collects the samples, this turns them into measurements and a verdict.

#include <QJsonObject>
#include <QString>

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace nt::bench {

struct Summary {
    int count = 0;
    double p50 = 0.0;
    double p95 = 0.0;
    double max = 0.0;
};

// Nearest-rank percentiles. Count 0 gives an empty summary.
Summary summarize(std::vector<double> samples);

struct WarmupInfo {
    int frames = 0;                 // frames excluded from every measurement
    double maxRenderIntervalMs = 0; // largest render interval among them
    int maxRenderIntervalAt = -1;   // its warm-up frame index
    double maxCpuMs = 0;
    int maxCpuAt = -1;
};

struct BenchData {
    QString fixture;
    int frames = 0;  // measured frames
    WarmupInfo warmup;
    bool vsync = true;
    double refreshHz = 0.0;
    int layersMax = 0;
    std::vector<double> cpuMs;              // render() body per measured frame
    std::vector<double> gpuObservationsMs;  // lastCompletedGpuTime values seen
    std::vector<double> renderIntervalMs;   // between render() starts
    std::vector<double> submitIntervalMs;  // between frameSwapped signals
    // The window the frames went to: logical size, device pixel ratio, and
    // the physical size the swap chain renders.
    bool realtime = false;  // the clock played in real time (else stepped)
    // Media correctness (PLAN M1b exits 1, 2, 6).
    std::vector<double> frameError;  // per frame with a drawn media layer: largest |shown - expected| index
    int mediaFrames = 0;             // frames with at least one media layer in the plan
    int missingMediaFrames = 0;      // of those, frames where a media layer had no picture
    int correctMediaFrames = 0;      // of those, frames with every media layer drawn and frame error 0
    int heldFrames = 0;              // frames that kept the last picture (D12)
    int cutMisses = 0;               // media layers with no picture on their first frame
    int missingLayerFrames = 0;      // layer-frames without a picture
    int openDecodersMax = 0;
    std::optional<double> decoderCloseMs;  // timeline close to 0 open decoders
    std::optional<double> frameRefCloseMs; // timeline close to 0 live hardware FrameRefs
    QString decode;                        // --decode: sw, hw or auto
    long long cpuCopies = 0;               // planes uploaded from CPU memory in the measured frames
    long long hardwareLayerFrames = 0;     // layer-frames drawn from imported decoder surfaces
    // CPU over the measured window, in percent of one core: the process, the
    // GUI thread, the render thread, and the rest (decode workers, FFmpeg and
    // VideoToolbox threads, Qt).
    // A value is absent when its query failed. With the basic render loop the
    // GUI thread also renders: the render thread is then not counted again.
    double cpuWallMs = 0.0;
    std::optional<double> processCpuPercent;
    std::optional<double> mainCpuPercent;
    std::optional<double> renderCpuPercent;
    bool guiAndRenderShareThread = false;
    // Stall diagnostics (F7): measured frames whose render interval was over
    // 50 ms, with the frame's offset from the first measured frame and its
    // render() body time, and scheduling facts recorded at the start.
    struct Stall {
        int frame = 0;
        double atMs = 0.0;
        double intervalMs = 0.0;
        double cpuMs = 0.0;
    };
    std::vector<Stall> stalls;
    // Times the window lost exposure in the measured window (occluded by
    // another window, a Space switch). Qt renders nothing then, so a run with
    // a loss does not measure the compositor and fails.
    int exposureLosses = 0;
    int framesReleasedInFlight = 0;  // FrameRefs released before the GPU finished with them
    QJsonObject scheduling;
    int windowWidth = 0;
    int windowHeight = 0;
    double devicePixelRatio = 1.0;
};

// `frameSwapped` means a frame was queued for presentation, not that it was
// shown, so these are submission intervals. A submission interval longer than
// 1.5 periods of `refreshHz` (the target rate) missed
// round(interval / period) - 1 vsyncs. Null without vsync or a rate.
std::optional<int> skippedSubmits(const std::vector<double>& submitIntervalMs, double refreshHz, bool vsync);

// The display cadence the window actually ran at: the p50 submission
// interval, snapped to the nearest of 120, 60 and 30 Hz. QScreen reports the
// panel's top rate, but ProMotion and a throttled background window can run
// slower. Information only: skips count against the budget's targetHz.
// 0 with no intervals.
double measuredCadenceHz(const std::vector<double>& submitIntervalMs);

// Budget limits keyed "<measurement>.<p50|p95|max|count>" (count is a
// minimum, the others maxima), the parameter "targetHz" (the rate skips are
// counted against, default 60; not a limit), or a scalar: "skippedSubmitsFraction" (skipped
// submits over measured frames, a maximum), "frameErrorZeroFraction" (frames
// with every media layer drawn at frame error 0, over all frames with media,
// a minimum), "missingMediaFrames", "cutMisses", "decoderCloseMs",
// "frameRefCloseMs" and "cpuCopies" (maxima). `gpuMs` is information only and takes no
// limit, because it measures the whole window, not the compositor.
using Budget = std::map<std::string, double>;

struct BudgetParse {
    std::optional<Budget> budget;
    QString error;
};

// `text` is either a JSON object ({"cpuMs.p95": 2}) or the inline form
// "cpuMs.p95=2,gpuMs.p95=2". Unknown measurements or stats are errors.
BudgetParse parseBudget(const QString& text);

struct BudgetResult {
    std::string key;
    double limit = 0.0;
    std::optional<double> value;  // absent: no samples (fails)
    bool pass = false;
};

struct Report {
    QJsonObject json;
    std::vector<BudgetResult> budget;
    bool pass = true;  // every budget entry passed (true with no budget)
};

Report buildReport(const BenchData& data, const std::optional<Budget>& budget);

}  // namespace nt::bench
