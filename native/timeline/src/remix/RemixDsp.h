// Ported from FilmCraft (https://github.com/storytold/filmcraft, crates/audio-dsp/src/remix.rs and fft.rs), MIT OR Apache-2.0, see native/timeline/licenses/FilmCraft-MIT.txt
#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <optional>
#include <span>
#include <utility>
#include <vector>

namespace nt::remix {
inline constexpr int kAnalysisRate = 24000;
inline constexpr int kOutputRate = 48000;
inline constexpr int kContextBeats = 4, kMinPieceBeats = 4;
inline constexpr double kCrossfadeSeconds = 0.02;
inline constexpr int64_t kMaxAnalysisSeconds = 600;

enum class Error {
    None,
    InvalidSampleRate,
    TooLong,
    TooComplex,
    NoBeat,
    TooShort,
    TargetTooShort,
    Cancelled,
    ReadFailed
};
const char* describe(Error);
struct Piece {
    int64_t src = 0, len = 0;
    bool operator==(const Piece&) const = default;
};
struct Plan {
    std::vector<Piece> pieces;
    int64_t xfade = 0;
    // Joints have centred fades. They do not shorten the summed piece length.
    int64_t length() const;
    std::vector<int64_t> joints() const;
    std::vector<std::pair<int64_t, int64_t>> cuts() const;
    static Plan identity(int64_t len, int64_t xfade);
    Plan scaled(int64_t factor) const;
    bool operator==(const Plan&) const = default;
};
struct Params {
    double segments = 50, variations = 50;
};
struct Analysis {
    int sampleRate = 0;
    // Length, beat positions and period are samples at sampleRate. Beats lead attacks by 10 ms.
    int64_t len = 0;
    std::vector<int64_t> beats;
    double period = 0, bpm = 0;
    std::vector<float> sim; // beats.size() squared, row-major
    float jumpScore(size_t i, size_t j) const;
    bool operator==(const Analysis&) const = default;
};
struct AnalysisResult {
    std::optional<Analysis> analysis;
    Error error = Error::None;
};
struct PlanResult {
    std::optional<Plan> plan;
    Error error = Error::None;
};
// Fill mono samples. Return the count, zero at EOF, or a negative count on failure.
using MonoReader = std::function<int64_t(std::span<float>)>;
// Retains sliding windows and per-frame features, never the whole signal.
// Progress is 0..1 on success, and omitted when expectedSamples <= 0.
AnalysisResult analyze(const MonoReader& read, int sampleRate, int64_t expectedSamples = 0,
                       const std::function<void(double)>& progress = {}, const std::function<bool()>& cancelled = {});
AnalysisResult analyze(std::span<const float> mono, int sampleRate);
PlanResult plan(const Analysis&, int64_t targetSamples, Params);
// Read stereo interleaved frames, with silence outside the source range.
using SourceReader = std::function<bool(int64_t srcFrame, int64_t frames, float* dst)>;
// Plans and source positions use 48 kHz frames. Fits to the exact target using
// a 16-tap Kaiser sinc table, except a one-frame difference is padded/truncated.
class PlanRenderer {
public:
    PlanRenderer(Plan plan48k, int64_t targetFrames, SourceReader source);
    int64_t frames() const;
    double stretch() const; // plan.length() / targetFrames
    // Random access within [0, frames()), independent of request boundaries.
    bool read(int64_t outFrame, int64_t frames, float* dst);

private:
    bool readPlan(int64_t first, int64_t count, float* dst);
    Plan m_plan;
    int64_t m_target = 0;
    double m_step = 1;
    bool m_resample = false;
    SourceReader m_source;
    std::array<std::array<double, 16>, 257> m_kernel{};
    std::vector<float> m_sourceBuffer, m_planBuffer;
};
} // namespace nt::remix
