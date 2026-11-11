// Ported from FilmCraft (https://github.com/storytold/filmcraft, crates/audio-dsp/src/remix.rs and fft.rs), MIT OR Apache-2.0, see native/timeline/licenses/FilmCraft-MIT.txt
#include "remix/RemixFile.h"
#include "assets/AssetWav.h"
#include "audio/AudioSource.h"
#include <algorithm>
#include <cmath>
#include <limits>

namespace nt::remix {
namespace {
bool stopped(const std::function<bool()>& cancelled) { return cancelled && cancelled(); }
bool validWindow(const FileWindow& window) {
    // Leave integer headroom for conversion to source frames and window sums.
    constexpr double maxMs = static_cast<double>(std::numeric_limits<int64_t>::max() / kOutputRate) / 2;
    return std::isfinite(window.startMs) && std::isfinite(window.durationMs) && window.startMs >= 0 &&
           window.durationMs >= 0 && window.startMs < maxMs && window.durationMs < maxMs;
}
int64_t toFrames(double ms, int rate) { return static_cast<int64_t>(std::llround(ms * rate / 1000)); }
} // namespace
AnalysisResult analyzeFile(const FileWindow& window, const std::function<void(double)>& progress,
                           const std::function<bool()>& cancelled) {
    if (stopped(cancelled)) {
        return {{}, Error::Cancelled};
    }
    if (!validWindow(window)) {
        return {{}, Error::ReadFailed};
    }
    if (window.durationMs > kMaxAnalysisSeconds * 1000) {
        return {{}, Error::TooLong};
    }
    const auto start = toFrames(window.startMs, kAnalysisRate), length = toFrames(window.durationMs, kAnalysisRate);
    std::string error;
    auto source = audio::AudioSource::open(window.path, kAnalysisRate, &error, cancelled);
    if (!source || !source->seek(start)) {
        return {{}, stopped(cancelled) ? Error::Cancelled : Error::ReadFailed};
    }
    int64_t remaining = length;
    std::vector<float> stereo;
    return analyze(
        [&](std::span<float> mono) -> int64_t {
            const auto count = std::min(remaining, static_cast<int64_t>(mono.size()));
            if (count == 0) {
                return 0;
            }
            stereo.resize(static_cast<size_t>(count) * 2);
            const auto n = source->read(stereo.data(), count);
            if (source->decodeErrors() > 0 || n < 0) {
                return -1;
            }
            for (int64_t i = 0; i < n; ++i) {
                mono[static_cast<size_t>(i)] =
                    (stereo[static_cast<size_t>(i * 2)] + stereo[static_cast<size_t>(i * 2 + 1)]) * 0.5f;
            }
            remaining -= n;
            return n;
        },
        kAnalysisRate, length, progress, cancelled);
}
Error bakeWav(const FileWindow& window, const Plan& plan24k, int64_t targetFrames, const QString& wavPath,
              const std::function<void(double)>& progress, const std::function<bool()>& cancelled) {
    if (stopped(cancelled)) {
        return Error::Cancelled;
    }
    if (!validWindow(window)) {
        return Error::ReadFailed;
    }
    if (targetFrames <= 0) {
        return Error::TargetTooShort;
    }
    if (plan24k.pieces.empty()) {
        return Error::ReadFailed;
    }
    // Public plans can be supplied by callers, so validate before scaling or
    // converting them into bounded renderer requests.
    const auto window24 = toFrames(window.durationMs, kAnalysisRate);
    int64_t total = 0;
    for (auto p : plan24k.pieces) {
        if (p.src < 0 || p.len <= 0 || p.src > window24 || p.len > window24 - p.src ||
            p.len > std::numeric_limits<int64_t>::max() / 2 - total) {
            return Error::ReadFailed;
        }
        total += p.len;
    }
    if (plan24k.xfade < 0 || plan24k.xfade > window24) {
        return Error::ReadFailed;
    }
    std::string error;
    auto source = audio::AudioSource::open(window.path, kOutputRate, &error, cancelled);
    if (!source) {
        return stopped(cancelled) ? Error::Cancelled : Error::ReadFailed;
    }
    const auto start = toFrames(window.startMs, kOutputRate), length = toFrames(window.durationMs, kOutputRate);
    constexpr int64_t cacheFrames = 16384;
    std::vector<float> cache(static_cast<size_t>(cacheFrames) * 2);
    int64_t cacheStart = -1, cacheCount = 0;
    PlanRenderer renderer(plan24k.scaled(2), targetFrames, [&](int64_t src, int64_t count, float* dst) {
        std::fill_n(dst, static_cast<size_t>(count) * 2, 0.f);
        int64_t offset = std::max<int64_t>(0, -src);
        while (offset < count && src + offset < length) {
            if (stopped(cancelled)) {
                return false;
            }
            const auto frame = src + offset, page = (frame / cacheFrames) * cacheFrames;
            if (page != cacheStart) {
                cacheStart = page;
                const auto n = std::min(cacheFrames, length - page);
                if (source->position() != start + page && !source->seek(start + page)) {
                    return false;
                }
                cacheCount = source->read(cache.data(), n);
                if (cacheCount < 0 || source->decodeErrors() > 0) {
                    return false;
                }
            }
            const auto inPage = frame - page;
            const auto n = std::min({count - offset, cacheFrames - inPage, length - frame});
            const auto available = std::max<int64_t>(0, std::min(n, cacheCount - inPage));
            if (available > 0) {
                std::copy_n(cache.data() + inPage * 2, static_cast<size_t>(available) * 2, dst + offset * 2);
            }
            offset += n;
        }
        return true;
    });
    int64_t pos = 0;
    if (progress) {
        progress(0);
    }
    const auto result = assets::writeStereoWavStream(
        wavPath,
        [&](std::span<float> dst) -> qint64 {
            const auto n = std::min(targetFrames - pos, static_cast<int64_t>(dst.size() / 2));
            if (n == 0) {
                return 0;
            }
            if (stopped(cancelled) || !renderer.read(pos, n, dst.data())) {
                return -1;
            }
            pos += n;
            if (progress) {
                progress(static_cast<double>(pos) / targetFrames);
            }
            return n;
        },
        [&] { return stopped(cancelled); });
    if (stopped(cancelled)) {
        return Error::Cancelled;
    }
    return result && *result == static_cast<uint64_t>(targetFrames) ? Error::None : Error::ReadFailed;
}
} // namespace nt::remix
