#include "TempoGrid.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <utility>

namespace nt::tempo {
namespace {
constexpr double GRID_INDEX_EPSILON = 1e-9;

double jsRound(double value) {
    if (!std::isfinite(value) || value == 0) {
        return value;
    }
    const double lower = std::floor(value);
    const double rounded = value - lower < 0.5 ? lower : lower + 1;
    return rounded == 0 ? std::copysign(0.0, value) : rounded;
}
double jsMax(double a, double b) {
    return std::isnan(a) || std::isnan(b) ? std::numeric_limits<double>::quiet_NaN() : std::max(a, b);
}
std::string numberText(double value) {
    if (std::isnan(value)) {
        return "NaN";
    }
    if (std::isinf(value)) {
        return value < 0 ? "-Infinity" : "Infinity";
    }
    if (value == 0) {
        return "0";
    }
    std::array<char, 64> buffer{};
    const auto converted =
        std::to_chars(buffer.data(), buffer.data() + buffer.size(), value, std::chars_format::scientific);
    std::string text(buffer.data(), converted.ptr);
    const auto e = text.find('e');
    if (e == std::string::npos) {
        return text;
    }
    const int exponent = std::stoi(text.substr(e + 1));
    const bool negative = text.front() == '-';
    std::string digits = text.substr(negative ? 1 : 0, e - (negative ? 1 : 0));
    const auto dot = digits.find('.');
    if (dot != std::string::npos) {
        digits.erase(dot, 1);
    }
    if (exponent >= -6 && exponent < 21) {
        const int point = exponent + 1;
        if (point <= 0) {
            text = "0." + std::string(static_cast<std::size_t>(-point), '0') + digits;
        } else if (point >= static_cast<int>(digits.size())) {
            text = digits + std::string(static_cast<std::size_t>(point) - digits.size(), '0');
        } else {
            text = digits;
            text.insert(static_cast<std::size_t>(point), ".");
        }
        return (negative ? "-" : "") + text;
    }
    return text.substr(0, e) + "e" + (exponent >= 0 ? "+" : "") + std::to_string(exponent);
}
std::string optionalText(const std::optional<double>& value) { return value ? numberText(*value) : "undefined"; }
std::vector<double> dedupeSorted(std::vector<double> times) {
    // JavaScript Set stores either signed zero as positive zero.
    for (auto& time : times) {
        if (time == 0) {
            time = 0;
        }
    }
    std::ranges::sort(times);
    times.erase(std::unique(times.begin(), times.end()), times.end());
    return times;
}
SnapClipBounds bounds(double start, double duration) { return {start, start + duration, duration}; }
std::string distanceNote(std::string_view label, double time, std::span<const double> grid) {
    std::optional<double> nearest;
    double distance = std::numeric_limits<double>::infinity();
    for (double candidate : grid) {
        const double current = std::abs(candidate - time);
        if (current < distance) {
            nearest = candidate;
            distance = current;
        }
    }
    const std::string prefix = std::string(label) + " " + numberText(time) + "ms";
    if (!nearest) {
        return prefix + " has no beat to reach";
    }
    return prefix + " is " + numberText(jsRound(distance)) + "ms from the nearest beat (" + numberText(*nearest) +
           "ms)";
}
ClipSnapResult snapOneClip(const SnapClipInput& clip, std::span<const double> grid, const SnapOptions& options) {
    const auto before = bounds(clip.startMs, clip.durationMs);
    const auto unchanged = [&](std::string reason) -> ClipSnapResult {
        return {clip.id, false, before, before, 0, 0, std::move(reason)};
    };
    if (grid.empty()) {
        return unchanged("the beat grid is empty");
    }
    const bool wantsStart = options.mode == "start" || options.mode == "both";
    const bool wantsEnd = options.mode == "end" || options.mode == "both";
    const auto startTarget = wantsStart ? nearestGridTime(before.startMs, grid, options.toleranceMs) : std::nullopt;
    const auto endTarget = wantsEnd ? nearestGridTime(before.endMs, grid, options.toleranceMs) : std::nullopt;
    if (!startTarget && !endTarget) {
        std::string notes;
        if (wantsStart) {
            notes = distanceNote("start", before.startMs, grid);
        }
        if (wantsEnd) {
            if (!notes.empty()) {
                notes += "; ";
            }
            notes += distanceNote("end", before.endMs, grid);
        }
        return unchanged(notes + "; tolerance is " + numberText(options.toleranceMs) + "ms");
    }
    SnapClipBounds after{};
    if (options.action == "move") {
        const double shift =
            startTarget ? *startTarget - before.startMs : endTarget.value_or(before.endMs) - before.endMs;
        after = bounds(before.startMs + shift, before.durationMs);
    } else {
        const double start = startTarget.value_or(before.startMs);
        after = bounds(start, endTarget.value_or(before.endMs) - start);
    }
    if (after.startMs < 0) {
        return unchanged("snapping would start the clip at " + numberText(after.startMs) + "ms, before zero");
    }
    if (after.durationMs <= 0) {
        return unchanged("snapping would leave the clip " + numberText(after.durationMs) + "ms long");
    }
    if (after.startMs == before.startMs && after.durationMs == before.durationMs) {
        return {clip.id, false, before, after, 0, 0, "already on the grid"};
    }
    return {clip.id, true, before, after, after.startMs - before.startMs, after.endMs - before.endMs, std::nullopt};
}
void assertTempo(const Tempo& tempo) {
    if (!std::isfinite(tempo.bpm) || tempo.bpm <= 0) {
        throw std::invalid_argument("bpm must be a positive number; got " + numberText(tempo.bpm) + ".");
    }
    if (!std::isfinite(tempo.beatsPerBar) || tempo.beatsPerBar <= 0) {
        throw std::invalid_argument("beatsPerBar must be a positive number; got " + numberText(tempo.beatsPerBar) +
                                    ".");
    }
    if (!std::isfinite(tempo.beatUnit) || tempo.beatUnit <= 0) {
        throw std::invalid_argument("beatUnit must be a positive number; got " + numberText(tempo.beatUnit) + ".");
    }
}
} // namespace

BeatGridResult buildBeatGrid(const BeatGridSpec& spec) {
    const auto error = [](std::string message) -> BeatGridResult { return {{}, std::move(message)}; };
    if (spec.onsetsMs && spec.bpm) {
        return error("A beat grid takes exactly one of `onsets_ms` and `bpm`; both "
                     "were given.");
    }
    if (!spec.onsetsMs && !spec.bpm) {
        return error("A beat grid needs `onsets_ms` (times in ms, e.g. detect_audio_events' "
                     "`onsets.times` multiplied by 1000) or `bpm` with `count`.");
    }
    std::vector<double> times;
    if (spec.onsetsMs) {
        for (double onset : *spec.onsetsMs) {
            if (!std::isfinite(onset) || onset < 0) {
                return error("onsets_ms holds " + numberText(onset) +
                             "; every onset must be a time in ms at or after zero.");
            }
            times.push_back(jsRound(onset));
        }
        if (times.empty()) {
            return error("onsets_ms is empty; there is nothing to snap to.");
        }
        if (times.size() > MAX_BEAT_GRID_POINTS) {
            return error("onsets_ms holds " + std::to_string(times.size()) + " times; at most 2048.");
        }
    } else {
        const double bpm = spec.bpm.value_or(0);
        if (!std::isfinite(bpm) || bpm <= 0) {
            return error("bpm must be a positive number; got " + optionalText(spec.bpm) + ".");
        }
        const double offset = spec.offsetMs.value_or(0);
        if (!std::isfinite(offset) || offset < 0) {
            return error("offset_ms must be a time in ms at or after zero; got " + optionalText(spec.offsetMs) + ".");
        }
        const double count = spec.count.value_or(0);
        if (!std::isfinite(count) || std::floor(count) != count || count < 1) {
            return error("count must be a positive whole number of beats; got " + optionalText(spec.count) + ".");
        }
        if (count > MAX_BEAT_GRID_POINTS) {
            return error("count is " + numberText(count) + "; at most 2048 beats per grid.");
        }
        const double interval = 60000 / bpm;
        for (int i = 0; i < count; ++i) {
            times.push_back(jsRound(offset + i * interval));
        }
    }
    return {dedupeSorted(std::move(times)), {}};
}
double beatCountToCover(double bpm, double offsetMs, double untilMs) {
    if (!std::isfinite(bpm) || bpm <= 0) {
        return 0;
    }
    const double beyond = jsMax(0, untilMs - offsetMs);
    const double count = std::floor(beyond / (60000 / bpm)) + 2;
    return std::isnan(count) ? count : std::min<double>(MAX_BEAT_GRID_POINTS, count);
}
std::optional<double> nearestGridTime(double timeMs, std::span<const double> grid, double toleranceMs) {
    std::optional<double> best;
    double bestDistance = std::numeric_limits<double>::infinity();
    for (double candidate : grid) {
        const double distance = std::abs(candidate - timeMs);
        if (distance > toleranceMs) {
            continue;
        }
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
            continue;
        }
        if (distance == bestDistance && best && candidate < *best) {
            best = candidate;
        }
    }
    return best;
}
SnapResult snapClipsToGrid(std::span<const SnapClipInput> clips, std::span<const double> grid,
                           const SnapOptions& options) {
    auto clamped = options;
    clamped.toleranceMs = jsMax(0, options.toleranceMs);
    SnapResult result{clamped.toleranceMs, clamped.mode, clamped.action, 0, 0, {}};
    result.clips.reserve(clips.size());
    for (const auto& clip : clips) {
        auto snapped = snapOneClip(clip, grid, clamped);
        if (snapped.snapped) {
            ++result.snapped;
        } else {
            ++result.skipped;
        }
        result.clips.push_back(std::move(snapped));
    }
    return result;
}
double beatGridPhaseMs(std::span<const double> onsetsMs, double bpm) {
    if (!std::isfinite(bpm) || bpm <= 0 || onsetsMs.empty()) {
        return 0;
    }
    const double interval = 60000 / bpm;
    const double tolerance = std::min(50.0, interval / 4);
    const auto phaseOf = [interval](double time) { return std::fmod(std::fmod(time, interval) + interval, interval); };
    double bestPhase = phaseOf(onsetsMs.front());
    int bestScore = -1;
    for (double candidate : onsetsMs) {
        const double phase = phaseOf(candidate);
        int score = 0;
        for (double onset : onsetsMs) {
            const double distance = std::abs(phaseOf(onset) - phase);
            if (std::min(distance, interval - distance) <= tolerance) {
                ++score;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestPhase = phase;
        }
    }
    return bestPhase;
}
std::optional<ClipBeatPlan> planClipBeats(const BeatClip& clip, std::span<const double> onsetsMs, double sourceBpm,
                                          double beatsPerBar) {
    if (!std::isfinite(sourceBpm) || sourceBpm <= 0 || !(clip.rate > 0)) {
        return std::nullopt;
    }
    const double bpm = sourceBpm * clip.rate;
    const double interval = 60000 / bpm;
    std::vector<double> timelineOnsets;
    timelineOnsets.reserve(onsetsMs.size());
    for (double onset : onsetsMs) {
        timelineOnsets.push_back(clip.startMs + onset / clip.rate);
    }
    const double phase = beatGridPhaseMs(timelineOnsets, bpm);
    const double firstBeat = phase + std::ceil((clip.startMs - phase) / interval) * interval;
    const double barMs = interval * jsMax(1, jsRound(beatsPerBar));
    std::vector<double> bars;
    for (int bar = 0; firstBeat + bar * barMs < clip.startMs + clip.durationMs && bar < MAX_BEAT_GRID_POINTS; ++bar) {
        bars.push_back(jsRound(firstBeat + bar * barMs));
    }
    return ClipBeatPlan{jsRound(bpm * 100) / 100, jsRound(std::fmod(firstBeat, barMs)), std::move(bars)};
}
Tempo resolveTempo(const std::optional<Tempo>& tempo) { return tempo.value_or(Tempo{}); }
double beatDurationMs(const Tempo& tempo) {
    assertTempo(tempo);
    return (60000 / tempo.bpm) * (4 / tempo.beatUnit);
}
double barDurationMs(const Tempo& tempo) { return beatDurationMs(tempo) * tempo.beatsPerBar; }
BarsBeats barsBeatsAt(double ms, const Tempo& tempo) {
    const double beatMs = beatDurationMs(tempo);
    const double relative = ms - tempo.offsetMs;
    const double beatIndex = std::floor(relative / beatMs + GRID_INDEX_EPSILON);
    const double intoBeat = relative - beatIndex * beatMs;
    const double tick = std::min(MIDI_PPQ - 1, jsMax(0, std::floor((intoBeat / beatMs) * MIDI_PPQ)));
    const double barIndex = std::floor(beatIndex / tempo.beatsPerBar);
    return {barIndex + 1, beatIndex - barIndex * tempo.beatsPerBar + 1, tick};
}
double divisionToTicks(std::string_view division) {
    constexpr std::array<double, 6> ticks{
        MIDI_PPQ, MIDI_PPQ / 2, MIDI_PPQ / 4, MIDI_PPQ / 8, (MIDI_PPQ / 2) * (2.0 / 3), (MIDI_PPQ / 4) * (2.0 / 3)};
    for (std::size_t i = 0; i < std::size(QUANTIZE_DIVISIONS); ++i) {
        if (division == QUANTIZE_DIVISIONS[i]) {
            return ticks[i];
        }
    }
    throw std::invalid_argument("Unknown quantize division \"" + std::string(division) +
                                "\"; expected one of 1/4, 1/8, 1/16, 1/32, 1/8T, 1/16T.");
}
double ticksToMs(double ticks, double bpm) { return (ticks / MIDI_PPQ) * (60000 / bpm); }
double tempoGridIntervalMs(const Tempo& tempo, std::string_view division) {
    if (division == "bar") {
        return barDurationMs(tempo);
    }
    if (division == "beat") {
        return beatDurationMs(tempo);
    }
    return ticksToMs(divisionToTicks(division), tempo.bpm);
}
std::vector<double> tempoGridMs(const GridSpec& spec) {
    const double interval = tempoGridIntervalMs(spec.tempo, spec.division);
    if (!std::isfinite(interval) || interval <= 0) {
        throw std::invalid_argument("A " + spec.division + " grid has no positive interval at " +
                                    numberText(spec.tempo.bpm) + " BPM.");
    }
    if (!std::isfinite(spec.fromMs) || !std::isfinite(spec.toMs)) {
        throw std::invalid_argument("fromMs and toMs must both be times in ms.");
    }
    if (spec.toMs < spec.fromMs) {
        return {};
    }
    const double first = std::ceil((spec.fromMs - spec.tempo.offsetMs) / interval - GRID_INDEX_EPSILON);
    const double last = std::floor((spec.toMs - spec.tempo.offsetMs) / interval + GRID_INDEX_EPSILON);
    const double count = last - first + 1;
    if (count <= 0) {
        return {};
    }
    if (count > MAX_BEAT_GRID_POINTS) {
        throw std::invalid_argument("A " + spec.division + " grid over " + numberText(spec.fromMs) + ".." +
                                    numberText(spec.toMs) + "ms holds " + numberText(count) + " lines; at most 2048.");
    }
    std::vector<double> times;
    // Iterate a bounded count, even when an index is too large for i + 1 to
    // advance.
    for (int i = 0; i < count; ++i) {
        times.push_back(spec.tempo.offsetMs + (first + i) * interval);
    }
    return times;
}
std::vector<double> visibleTempoGrid(const GridSpec& spec) {
    const double from = jsMax(0, spec.fromMs);
    if (!std::isfinite(from) || !std::isfinite(spec.toMs) || spec.toMs <= from) {
        return {};
    }
    const double interval = tempoGridIntervalMs(spec.tempo, spec.division);
    if (!std::isfinite(interval) || interval <= 0) {
        return {};
    }
    const double span = std::min(spec.toMs - from, (MAX_BEAT_GRID_POINTS - 1) * interval);
    return tempoGridMs({spec.tempo, spec.division, from, from + span});
}
std::vector<BarRulerTick> computeBarRulerTicks(const Tempo& tempo, double msPerPx, double fromMs, double toMs) {
    if (!std::isfinite(msPerPx) || msPerPx <= 0) {
        return {};
    }
    const double barMs = barDurationMs(tempo);
    const double beatMs = beatDurationMs(tempo);
    if (!std::isfinite(barMs) || barMs <= 0) {
        return {};
    }
    const auto barTimes = visibleTempoGrid({tempo, "bar", fromMs - barMs, toMs});
    int stride = 1;
    while ((barMs * stride) / msPerPx < 44) {
        stride *= 2;
        if (stride > 1024) {
            break;
        }
    }
    const bool showBeats = stride == 1 && beatMs / msPerPx >= 8;
    std::vector<BarRulerTick> ticks;
    for (double time : barTimes) {
        const double bar = barsBeatsAt(time, tempo).bar;
        const bool labelled = std::fmod(std::fmod(bar - 1, stride) + stride, stride) == 0;
        if (time >= fromMs) {
            ticks.push_back({time, "bar", labelled ? std::optional(numberText(bar)) : std::nullopt});
        }
        if (!showBeats) {
            continue;
        }
        for (int beat = 1; beat < tempo.beatsPerBar; ++beat) {
            const double timeMs = time + beat * beatMs;
            if (timeMs > toMs) {
                break;
            }
            if (timeMs < fromMs) {
                continue;
            }
            ticks.push_back({timeMs, "beat", std::nullopt});
        }
    }
    return ticks;
}
std::vector<DivisionOption> gridDivisionOptions() {
    std::vector<DivisionOption> options{{"bar", "Bar"}, {"beat", "Beat"}};
    for (auto division : QUANTIZE_DIVISIONS) {
        options.push_back({std::string(division), std::string(division)});
    }
    return options;
}
SnapGridSpec snapGridSpecFrom(const Tempo& tempo, bool hasMidiTrack, const SnapView& view) {
    const double width =
        view.lanesViewportWidthPx == 0 || std::isnan(view.lanesViewportWidthPx) ? 1200 : view.lanesViewportWidthPx;
    const double from = view.scrollLeftPx * view.msPerPx;
    SnapGridSpec result;
    static_cast<GridSpec&>(result) = {tempo, view.gridDivision, from, from + width * view.msPerPx};
    result.snapEnabled = view.snapEnabled;
    result.hasMidiTrack = hasMidiTrack;
    result.rulerMode = view.rulerMode;
    return result;
}
bool gridSnapApplies(const SnapGridSpec& grid) {
    return grid.snapEnabled && (grid.hasMidiTrack || grid.rulerMode == "bars");
}
std::vector<double> mergeSnapCandidates(std::span<const double> candidates, const SnapGridSpec& grid) {
    std::vector<double> result(candidates.begin(), candidates.end());
    if (!gridSnapApplies(grid)) {
        return result;
    }
    const auto lines = visibleTempoGrid(grid);
    if (lines.empty()) {
        return result;
    }
    result.insert(result.end(), lines.begin(), lines.end());
    return dedupeSorted(std::move(result));
}
} // namespace nt::tempo
