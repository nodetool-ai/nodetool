#pragma once

#include <array>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace nt::tempo {
inline constexpr int MAX_BEAT_GRID_POINTS = 2048;
inline constexpr double DEFAULT_BEAT_TOLERANCE_MS = 60;
inline constexpr double MIDI_PPQ = 960;
inline constexpr std::array<std::string_view, 6> QUANTIZE_DIVISIONS{"1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"};
using TempoGridDivision = std::string;

struct BeatGridSpec {
    std::optional<std::vector<double>> onsetsMs;
    std::optional<double> bpm;
    std::optional<double> offsetMs;
    std::optional<double> count;
};
struct BeatGridResult {
    std::vector<double> times;
    std::string error;
    [[nodiscard]] bool ok() const { return error.empty(); }
};
struct Tempo {
    double bpm = 120;
    double offsetMs = 0;
    double beatsPerBar = 4;
    double beatUnit = 4;
};
struct BarsBeats {
    double bar = 0;
    double beat = 0;
    double tick = 0;
};
struct GridSpec {
    Tempo tempo;
    TempoGridDivision division = "beat";
    double fromMs = 0;
    double toMs = 0;
};
struct SnapGridSpec : GridSpec {
    bool snapEnabled = false;
    bool hasMidiTrack = false;
    std::string rulerMode = "time";
};
struct SnapView {
    bool snapEnabled = false;
    std::string rulerMode = "time";
    TempoGridDivision gridDivision = "beat";
    double msPerPx = 1;
    double scrollLeftPx = 0;
    double lanesViewportWidthPx = 0;
};
struct DivisionOption {
    std::string value;
    std::string label;
};
struct BarRulerTick {
    double timeMs = 0;
    std::string kind;
    std::optional<std::string> label;
};
struct SnapClipInput {
    std::string id;
    double startMs = 0;
    double durationMs = 0;
};
struct SnapClipBounds {
    double startMs = 0;
    double endMs = 0;
    double durationMs = 0;
};
struct ClipSnapResult {
    std::string clipId;
    bool snapped = false;
    SnapClipBounds before;
    SnapClipBounds after;
    double deltaStartMs = 0;
    double deltaEndMs = 0;
    std::optional<std::string> reason;
};
struct SnapOptions {
    double toleranceMs = DEFAULT_BEAT_TOLERANCE_MS;
    std::string mode = "start";
    std::string action = "move";
};
struct SnapResult {
    double toleranceMs = 0;
    std::string mode;
    std::string action;
    int snapped = 0;
    int skipped = 0;
    std::vector<ClipSnapResult> clips;
};
struct BeatClip {
    double startMs = 0;
    double durationMs = 0;
    double rate = 0;
};
struct ClipBeatPlan {
    double bpm = 0;
    double offsetMs = 0;
    std::vector<double> barTimesMs;
};

[[nodiscard]] BeatGridResult buildBeatGrid(const BeatGridSpec& spec);
[[nodiscard]] double beatCountToCover(double bpm, double offsetMs, double untilMs);
[[nodiscard]] std::optional<double> nearestGridTime(double timeMs, std::span<const double> grid, double toleranceMs);
[[nodiscard]] SnapResult snapClipsToGrid(std::span<const SnapClipInput> clips, std::span<const double> grid,
                                         const SnapOptions& options = {});
[[nodiscard]] double beatGridPhaseMs(std::span<const double> onsetsMs, double bpm);
[[nodiscard]] std::optional<ClipBeatPlan> planClipBeats(const BeatClip& clip, std::span<const double> onsetsMs,
                                                        double sourceBpm, double beatsPerBar);
[[nodiscard]] Tempo resolveTempo(const std::optional<Tempo>& tempo);
[[nodiscard]] double beatDurationMs(const Tempo& tempo);
[[nodiscard]] double barDurationMs(const Tempo& tempo);
[[nodiscard]] BarsBeats barsBeatsAt(double ms, const Tempo& tempo);
[[nodiscard]] double divisionToTicks(std::string_view division);
[[nodiscard]] double ticksToMs(double ticks, double bpm);
[[nodiscard]] double tempoGridIntervalMs(const Tempo& tempo, std::string_view division);
[[nodiscard]] std::vector<double> tempoGridMs(const GridSpec& spec);
[[nodiscard]] std::vector<double> visibleTempoGrid(const GridSpec& spec);
[[nodiscard]] std::vector<BarRulerTick> computeBarRulerTicks(const Tempo& tempo, double msPerPx, double fromMs,
                                                             double toMs);
[[nodiscard]] std::vector<DivisionOption> gridDivisionOptions();
[[nodiscard]] SnapGridSpec snapGridSpecFrom(const Tempo& tempo, bool hasMidiTrack, const SnapView& view);
[[nodiscard]] bool gridSnapApplies(const SnapGridSpec& grid);
[[nodiscard]] std::vector<double> mergeSnapCandidates(std::span<const double> candidates, const SnapGridSpec& grid);
} // namespace nt::tempo
