#pragma once

// Pure Step Sequencer data model, timing, deterministic hashing, scheduling,
// pitch resolution, pattern expansion, text conversion, MIDI->Pattern
// conversion, and track device-automation overlay (SQ1-SQ21, SQ41-SQ42, SQ47,
// SQ60).
//
// Mirrors packages/timeline/src/midi/{stepPattern,stepPatternExpand}.ts.
// Thread affinity: pure stateless functions with no shared mutable state;
// safe to call from any thread (GUI, plan-build, worker, tests). Never called
// on the real-time audio callback thread.

#include <QJsonArray>
#include <QJsonObject>
#include <QSet>
#include <QString>
#include <QStringList>

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace nt::midi {

inline constexpr int kMidiPpq = 960;
inline constexpr int kStepPatternMaxRows = 128;
inline constexpr int kStepPatternMaxSteps = 64;
inline constexpr int kStepPatternPageSize = 16;

inline constexpr std::array<std::string_view, 22> kStepRates{
    "4",  "2",  "1",  "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1T",  "2T",
    "4T", "8T", "16T", "32T", "1D",  "2D",  "4D",   "8D",   "16D",  "32D", "64D"};

// Step rates ordered by ascending tick length (60..15360).
inline constexpr std::array<std::string_view, 22> kStepRatesByTicks{
    "1/64", "32T", "64D", "1/32", "16T", "32D", "1/16", "8T",  "16D", "1/8", "4T",
    "8D",   "1/4", "2T",  "4D",   "1/2", "1T",  "2D",   "1",   "1D",  "2",   "4"};

// Integer ticks at MIDI_PPQ = 960, or nullopt for unknown rates.
[[nodiscard]] std::optional<int> stepRateTicks(std::string_view rate) noexcept;
[[nodiscard]] bool isValidStepRate(std::string_view rate) noexcept;
[[nodiscard]] std::string_view nudgeStepRate(std::string_view rate, int delta) noexcept;

// Deterministic hashing (SQ13, SQ60): 32-bit FNV-1a and mulberry32.
[[nodiscard]] std::uint32_t fnv1a32Bytes(std::span<const std::uint8_t> bytes) noexcept;
[[nodiscard]] std::uint32_t rowKeyHash(std::string_view rowId) noexcept;
[[nodiscard]] std::uint32_t fnv1a32Uints(std::uint32_t a, std::uint32_t b, std::uint32_t c, std::uint32_t d) noexcept;
[[nodiscard]] double mulberry32(std::uint32_t state) noexcept;
[[nodiscard]] double stepHash(std::uint32_t seed, std::uint32_t rowKey, std::uint32_t step,
                              std::uint32_t cycle) noexcept;
[[nodiscard]] double stepHash(std::uint32_t seed, std::string_view rowId, std::uint32_t step,
                              std::uint32_t cycle) noexcept;

// Playback order (SQ11, SQ60).
[[nodiscard]] std::vector<int> playOrder(int n, std::string_view mode, std::uint32_t seed, std::int64_t cycle,
                                         std::uint32_t rowKey = 0, std::optional<int> prevPos = std::nullopt);
[[nodiscard]] std::vector<int> playOrder(int n, std::string_view mode, std::uint32_t seed, std::int64_t cycle,
                                         std::string_view rowId, std::optional<int> prevPos = std::nullopt);

// One scheduled step occurrence in one cycle (SQ10, SQ60).
struct RowScheduleEntry {
    int stepIndex = 0;
    std::int64_t startTick = 0;
    int lengthTicks = 0;
};
[[nodiscard]] std::vector<RowScheduleEntry> rowSchedule(const QJsonObject& row, std::uint32_t seed,
                                                        std::uint32_t cycle = 0);
[[nodiscard]] std::int64_t patternMusicalLengthTicks(const QJsonObject& pattern,
                                                     std::int64_t barTicks = std::int64_t{4} * kMidiPpq);

// Swing and note repeats (SQ14, SQ15, SQ60).
[[nodiscard]] std::int64_t swingDelay(std::int64_t tick, std::string_view division, double swing) noexcept;
[[nodiscard]] std::vector<std::int64_t> repeatPositions(std::int64_t totalTicks, int repeat, double distribution);
[[nodiscard]] std::vector<int> repeatVelocities(int velocity, int repeat, double velocityRamp, double velocityCurve);

// Pitch resolution (SQ4, SQ18, SQ19, SQ42, SQ60).
struct StepKey {
    int tonic = 0;               // 0 (C) .. 11 (B)
    std::string mode = "major";  // "major" | "minor"
};
[[nodiscard]] StepKey resolveStepKey(const QJsonValue& keyValue);
[[nodiscard]] int shortestTonicDelta(int fromTonic, int toTonic) noexcept;
[[nodiscard]] int kitPadPitch(int pad, const QJsonObject& instrument = {});
[[nodiscard]] int kitStepPitchBend(int padPitch, const QJsonObject& step) noexcept;
[[nodiscard]] std::optional<int> stepPitch(const QJsonObject& row, const QJsonObject& step,
                                           const QJsonObject& ctx = {});

// Normalization, compaction, validation, labels (SQ1-SQ8).
[[nodiscard]] QJsonObject normalizeStep(const QJsonObject& step = {});
[[nodiscard]] QJsonObject compactStep(const QJsonObject& step);
[[nodiscard]] QJsonArray defaultSubrowsForAssignment(const QJsonObject& assignment);
[[nodiscard]] QJsonObject normalizeRow(const QJsonObject& partial, const QJsonObject& patternDefaults);
[[nodiscard]] QJsonObject normalizePattern(const QJsonObject& partial = {});
[[nodiscard]] QStringList validateStepPattern(const QJsonObject& pattern);
[[nodiscard]] QString stepNoteName(int pitch);
[[nodiscard]] std::optional<int> parseStepNoteName(const QString& name);
[[nodiscard]] QString rowLabel(const QJsonObject& row, const QJsonObject& instrument = {});

struct InferredAssignment {
    QJsonObject assignment;
    std::optional<QString> customName;
};
[[nodiscard]] InferredAssignment assignmentFromRowName(const QString& name, const QJsonObject& instrument = {});

// Pattern text format (SQ47, SQ60).
struct ParsedPatternLine {
    QString name;
    std::optional<QString> stepRate;
    QJsonArray steps;
};
[[nodiscard]] QString patternToText(const QJsonObject& pattern, const QJsonObject& instrument = {});
[[nodiscard]] std::vector<ParsedPatternLine> parsePatternTextLines(const QString& text, QString* error = nullptr);
[[nodiscard]] QJsonObject patternFromText(const QString& text, const QJsonObject& options = {},
                                          QString* error = nullptr);

// Expansion (SQ9-SQ19, SQ41-SQ42, SQ60).
// Returns {notes: QJsonArray, controllers: QJsonArray, deviceAutomation: QJsonArray}
// matching TS `expandPattern(pattern, ctx)` JSON exactly. Resource-limit
// failures return empty arrays and an `error`; conversion must refuse that result.
[[nodiscard]] QJsonObject expandPattern(const QJsonObject& pattern, const QJsonObject& ctx);

// Expands a clip's `pattern` against document tempo, chords, key and track
// instrument. Returns empty QJsonObject if `clip` has no `pattern` object.
[[nodiscard]] QJsonObject expandPatternClip(const QJsonObject& clip, const QJsonObject& doc = {});

// Expands a pattern clip for native playback (`notes` and `controllers` in
// clip content ticks starting at 0, with CE6 `quantize`, `transpose`, and
// `velocityOffset` applied in TS `expandMidiLoop` / `applyMidiRegionParams`
// order). Returns empty QJsonObject when `clip` has no `pattern`.
[[nodiscard]] QJsonObject expandPatternClipForPlayback(const QJsonObject& clip, const QJsonObject& doc = {});

// Overlays derived `kind: "device"` automation from pattern clips on `track`
// onto `track.automation` (SQ41). Stored automation wins outside each pattern
// clip's `[startMs, startMs + durationMs)` window.
[[nodiscard]] QJsonArray deriveTrackAutomationFromPatterns(const QJsonObject& track, const QJsonArray& clips,
                                                           const QJsonObject& doc = {});

// MIDI -> Pattern conversion (SQ21, SQ60).
// Returns {pattern: QJsonObject, droppedNotes: int, mergedCollisions: int},
// or {error: QString} for an invalid step rate.
[[nodiscard]] QJsonObject midiToPattern(const QJsonArray& notes, const QJsonArray& controllers,
                                        const QJsonObject& options);

// Pattern-level mutation helpers shared with PatternOps (SQ2, SQ7, SQ18, SQ32, SQ36, SQ37).
[[nodiscard]] QJsonObject resizeRowLength(const QJsonObject& row, int newLength);
[[nodiscard]] QJsonObject resizePatternLength(const QJsonObject& pattern, int newLength);
[[nodiscard]] QJsonObject setPatternStepRate(const QJsonObject& pattern, const QString& stepRate);
[[nodiscard]] QJsonObject setPatternPlayback(const QJsonObject& pattern, const QString& playback);
[[nodiscard]] QJsonObject setPatternMidiChannel(const QJsonObject& pattern, int midiChannel);
[[nodiscard]] QJsonObject setPatternAutomationMode(const QJsonObject& pattern, const QString& automationMode);
[[nodiscard]] QJsonObject setPatternLoop(const QJsonObject& pattern, std::optional<int> loopStart0,
                                         std::optional<int> loopEndExcl);
[[nodiscard]] QJsonObject setPatternKey(const QJsonObject& pattern, const QJsonObject& nextKey);
[[nodiscard]] QJsonObject setStepValue(const QJsonObject& row, int stepIndex, const QJsonObject& values,
                                       bool keepOff = false, QString* error = nullptr);
[[nodiscard]] QJsonObject applyMonoAtSteps(const QJsonObject& pattern, const QString& activeRowId,
                                           const std::vector<int>& stepIndices);
[[nodiscard]] QJsonObject clearRowSteps(const QJsonObject& row, const std::optional<std::vector<int>>& indices,
                                        const QString& mode = {});
[[nodiscard]] QJsonObject applyPatternRowSort(const QJsonObject& pattern, const QJsonObject& instrument = {});
[[nodiscard]] std::optional<std::vector<int>> parseStepSelection(const QJsonValue& spec, int maxSteps,
                                                                 QString* error = nullptr);

// Row and pattern transforms (SQ35, SQ53). `mode` empty rotates whole steps.
[[nodiscard]] QJsonObject rotateRowSteps(const QJsonObject& row, int by, const QString& mode = {});
[[nodiscard]] QJsonObject nudgeRowValues(const QJsonObject& row, const QString& mode, double delta,
                                         const QJsonObject& instrument = {});
[[nodiscard]] QJsonObject tieRowSteps(const QJsonObject& row, int fromIdx, int toIdx, bool tie);
[[nodiscard]] QJsonObject randomizePatternSteps(const QJsonObject& pattern, const QString& mode,
                                                const std::optional<QSet<QString>>& rowIds,
                                                const std::optional<std::vector<int>>& stepIndices, std::uint32_t seed,
                                                double density = 50);

}  // namespace nt::midi
