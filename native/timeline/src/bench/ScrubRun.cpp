#include "bench/ScrubRun.h"

#include "bench/BenchReport.h"
#include "playback/PlaybackClock.h"
#include "preview/FrameCache.h"
#include "preview/PreviewCompositor.h"
#include "preview/hw/HwInterop.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QJsonArray>

#include <algorithm>
#include <cmath>
#include <random>

namespace nt::bench {
namespace {

constexpr qint64 kSeekTimeoutMs = 10000;

double round3(double v) {
    return std::round(v * 1000.0) / 1000.0;
}

QJsonObject summaryJson(const std::vector<double>& samples) {
    const Summary s = summarize(samples);
    if (s.count == 0) return QJsonObject{{QStringLiteral("count"), 0}};
    return QJsonObject{{QStringLiteral("p50"), round3(s.p50)},
                       {QStringLiteral("p95"), round3(s.p95)},
                       {QStringLiteral("max"), round3(s.max)},
                       {QStringLiteral("count"), s.count}};
}

class Runner {
public:
    explicit Runner(const ScrubContext& ctx) : m_ctx(ctx) {
        m_ctx.compositor->setCollectFrameStats(true);
        m_frames = std::max<long long>(1, std::llround(ctx.durationMs * ctx.fps / 1000.0));
    }

    double frameMs(long long frame) const { return static_cast<double>(frame) * 1000.0 / m_ctx.fps; }
    long long frames() const { return m_frames; }

    // Renders one frame and returns the stats of the frame rendered before it
    // (stats arrive one synchronize later), or null.
    const FrameStat* render() {
        m_ctx.renderFrame();
        QCoreApplication::processEvents();
        const auto& stats = m_ctx.compositor->frameStats();
        return stats.empty() ? nullptr : &stats.back();
    }

    // The frame is exact at `ms` when every layer shows its exact frame.
    static bool exactAt(const FrameStat* s, double ms) {
        return s && s->allExact && std::abs(s->timeMs - ms) < 0.001;
    }

    // Seeks (paused) and renders until the picture is exact. Returns the wall
    // time in ms and the frames it took, or a negative time on timeout.
    std::pair<double, int> seekAndWait(double ms) {
        QElapsedTimer t;
        t.start();
        m_ctx.clock->seek(ms);
        int rendered = 0;
        while (t.elapsed() < kSeekTimeoutMs) {
            const FrameStat* s = render();
            ++rendered;
            if (exactAt(s, ms)) return {static_cast<double>(t.nsecsElapsed()) / 1.0e6, rendered};
        }
        return {-1.0, rendered};
    }

private:
    ScrubContext m_ctx;
    long long m_frames = 1;
};

}  // namespace

QJsonObject runScrubScript(const ScrubContext& ctx, const QJsonObject& script) {
    Runner run(ctx);
    size_t peakPinned = 0;
    const auto samplePinned = [&] { peakPinned = std::max(peakPinned, FrameCache::shared().pinnedElsewhereBytes()); };
    QJsonObject report{{QStringLiteral("fixture"), ctx.fixture}, {QStringLiteral("decode"), ctx.decode}};
    // Frames (D35 checks): seek to each listed frame and wait until it is
    // exact or a GPU resource failed, then record the frame's surfaces.
    // It runs before the warm-up, which an incomplete frame would fail.
    if (const QJsonArray list = script.value(u"frames").toArray(); !list.isEmpty()) {
        QJsonArray frames;
        for (const QJsonValue& v : list) {
            const long long frame = v.toInteger();
            const double ms = run.frameMs(frame);
            ctx.clock->seek(ms);
            QElapsedTimer t;
            t.start();
            const FrameStat* last = nullptr;
            bool exact = false;
            while (t.elapsed() < kSeekTimeoutMs) {
                last = run.render();
                if (Runner::exactAt(last, ms)) {
                    exact = true;
                    break;
                }
                if (last && last->resourceFailures > 0 && std::abs(last->timeMs - ms) < 0.001) break;
            }
            frames.append(QJsonObject{{QStringLiteral("frame"), static_cast<double>(frame)},
                                      {QStringLiteral("exact"), exact},
                                      {QStringLiteral("surfaces"), last ? last->surfaces : -1},
                                      {QStringLiteral("resourceFailures"), last ? last->resourceFailures : -1},
                                      {QStringLiteral("surfaceBytes"), last ? static_cast<double>(last->surfaceBytes) : -1.0},
                                      {QStringLiteral("surfaceOverBudget"), last && last->surfaceOverBudget}});
        }
        report[QStringLiteral("frames")] = frames;
    }

    // Warm up: open the sources and decode the start.
    if (run.seekAndWait(0.0).first < 0) {
        report[QStringLiteral("error")] = QStringLiteral("the first frame was never exact");
        return report;
    }

    // 1. Paused seeks to exact frames (exit 1). With coldCache the scrub
    //    cache is emptied before each seek, so every one is a real decode.
    if (const QJsonObject spec = script.value(u"exactSeeks").toObject(); !spec.isEmpty()) {
        std::mt19937 rng(static_cast<unsigned>(spec.value(u"seed").toInt(1)));
        std::uniform_int_distribution<long long> pick(0, run.frames() - 1);
        const bool cold = spec.value(u"coldCache").toBool(true);
        std::vector<double> latency;
        std::vector<double> renders;
        int timeouts = 0;
        for (int i = 0; i < spec.value(u"count").toInt(30); ++i) {
            if (cold) FrameCache::shared().clear();
            const auto [ms, rendered] = run.seekAndWait(run.frameMs(pick(rng)));
            if (ms < 0) {
                ++timeouts;
                continue;
            }
            latency.push_back(ms);
            renders.push_back(rendered);
        }
        report[QStringLiteral("exactSeeks")] = QJsonObject{{QStringLiteral("coldCache"), cold},
                                                            {QStringLiteral("latencyMs"), summaryJson(latency)},
                                                            {QStringLiteral("framesToExact"), summaryJson(renders)},
                                                            {QStringLiteral("timeouts"), timeouts}};
    }

    // 2. Cache seeks (exit 3): show a frame, seek away, seek back. The frame
    //    after the seek back must be exact: drawn from the cache in the same
    //    frame, with no decode.
    if (const QJsonObject spec = script.value(u"cacheSeeks").toObject(); !spec.isEmpty()) {
        std::mt19937 rng(static_cast<unsigned>(spec.value(u"seed").toInt(2)));
        std::uniform_int_distribution<long long> pick(0, run.frames() - 1);
        // Every trial is reported (review F5): attempts, trials whose setup
        // seeks timed out, and per completed trial whether the return
        // request was a cache hit and exact on its first frame.
        const int attempts = spec.value(u"count").toInt(20);
        int count = 0;
        int prepTimeouts = 0;
        int sameFrame = 0;
        int returnHits = 0;
        for (int i = 0; i < attempts; ++i) {
            const long long frame = pick(rng);
            const long long away = (frame + run.frames() / 2) % run.frames();
            if (run.seekAndWait(run.frameMs(frame)).first < 0 || run.seekAndWait(run.frameMs(away)).first < 0) {
                ++prepTimeouts;
                continue;
            }
            ++count;
            const long long hitsBefore = FrameCache::shared().hits();
            ctx.clock->seek(run.frameMs(frame));
            run.render();  // the first frame after the seek back
            if (FrameCache::shared().hits() > hitsBefore) ++returnHits;
            const FrameStat* first = run.render();  // its stats arrive with the next frame
            if (Runner::exactAt(first, run.frameMs(frame))) ++sameFrame;
        }
        report[QStringLiteral("cacheSeeks")] = QJsonObject{{QStringLiteral("attempts"), attempts},
                                                            {QStringLiteral("count"), count},
                                                            {QStringLiteral("prepTimeouts"), prepTimeouts},
                                                            {QStringLiteral("sameFrame"), sameFrame},
                                                            {QStringLiteral("returnHits"), returnHits}};
        samplePinned();
    }

    // 3. Scrubs (exit 2): a random walk of seeks at `rateHz` for `seconds`,
    //    rendering as fast as the offscreen path goes, then stop. The
    //    picture must settle on the exact frame of the last request.
    QJsonArray scrubs;
    bool allExact = true;
    if (const QJsonObject spec = script.value(u"scrubs").toObject(); !spec.isEmpty()) {
        const int runs = spec.value(u"runs").toInt(5);
        const double rateHz = spec.value(u"rateHz").toDouble(60.0);
        const double seconds = spec.value(u"seconds").toDouble(10.0);
        const double maxStepFrames = spec.value(u"maxStepFrames").toDouble(9.0);
        std::mt19937 rng(static_cast<unsigned>(spec.value(u"seed").toInt(3)));
        QDir().mkpath(ctx.outDir);
        for (int r = 0; r < runs; ++r) {
            std::uniform_int_distribution<long long> start(0, run.frames() - 1);
            std::uniform_real_distribution<double> step(-maxStepFrames, maxStepFrames);
            std::uniform_real_distribution<double> jump(0.0, 1.0);
            long long frame = start(rng);
            long long requests = 0;
            long long renders = 0;
            QElapsedTimer wall;
            wall.start();
            qint64 nextNs = 0;
            const qint64 periodNs = static_cast<qint64>(1.0e9 / rateHz);
            while (wall.nsecsElapsed() < static_cast<qint64>(seconds * 1.0e9)) {
                if (wall.nsecsElapsed() >= nextNs) {
                    // Mostly drag steps; one request in twenty jumps anywhere.
                    frame = jump(rng) < 0.05 ? start(rng)
                                             : std::clamp<long long>(frame + std::llround(step(rng)), 0, run.frames() - 1);
                    ctx.clock->seek(run.frameMs(frame));
                    ++requests;
                    nextNs += periodNs;
                }
                run.render();
                ++renders;
            }
            // What the harness delivered (review F4): one request reaches the
            // decoder per render at most, so a slow render lowers the rate.
            const double scrubSec = static_cast<double>(wall.nsecsElapsed()) / 1.0e9;
            // Stop: the last request must land.
            QElapsedTimer settle;
            settle.start();
            const double finalMs = run.frameMs(frame);
            bool exact = false;
            while (settle.elapsed() < kSeekTimeoutMs) {
                if (Runner::exactAt(run.render(), finalMs)) {
                    exact = true;
                    break;
                }
            }
            const double latencyMs = static_cast<double>(settle.nsecsElapsed()) / 1.0e6;
            QJsonObject lastStat;
            if (!exact) {
                // Why the picture did not settle: the last frame's state.
                if (const auto& stats = ctx.compositor->frameStats(); !stats.empty()) {
                    const FrameStat& st = stats.back();
                    lastStat = QJsonObject{{QStringLiteral("timeMs"), st.timeMs},
                                           {QStringLiteral("allExact"), st.allExact},
                                           {QStringLiteral("layers"), st.layers},
                                           {QStringLiteral("missingLayers"), st.missingLayers},
                                           {QStringLiteral("frameError"), st.frameError},
                                           {QStringLiteral("hardwareLayers"), st.hardwareLayers},
                                           {QStringLiteral("openDecoders"), st.openDecoders}};
                }
            }
            // The settled still, for the barcode check.
            QString still;
            if (exact) {
                ctx.compositor->requestCapture();
                QElapsedTimer cap;
                cap.start();
                while (!ctx.compositor->captureReady() && cap.elapsed() < kSeekTimeoutMs) run.render();
                if (ctx.compositor->captureReady()) {
                    still = QStringLiteral("%1/scrub_%2_frame_%3.png").arg(ctx.outDir).arg(r).arg(frame, 6, 10, QLatin1Char('0'));
                    ctx.compositor->takeCapture().convertToFormat(QImage::Format_RGB888).save(still);
                }
            }
            samplePinned();
            allExact = allExact && exact;
            scrubs.append(QJsonObject{{QStringLiteral("run"), r},
                                      {QStringLiteral("requests"), static_cast<double>(requests)},
                                      {QStringLiteral("renders"), static_cast<double>(renders)},
                                      {QStringLiteral("durationMs"), round3(scrubSec * 1000.0)},
                                      {QStringLiteral("requestsPerSecond"), round3(static_cast<double>(requests) / scrubSec)},
                                      {QStringLiteral("finalFrame"), static_cast<double>(frame)},
                                      {QStringLiteral("finalMs"), round3(finalMs)},
                                      {QStringLiteral("exact"), exact},
                                      {QStringLiteral("settleMs"), round3(latencyMs)},
                                      {QStringLiteral("still"), still},
                                      {QStringLiteral("unsettledState"), lastStat}});
        }
        samplePinned();
        report[QStringLiteral("scrubs")] = scrubs;
        report[QStringLiteral("scrubsExact")] = allExact;
    }

    samplePinned();
    const FrameCache& cache = FrameCache::shared();
    // Review F3: real allocation sizes. Resident is what the cache holds
    // (after eviction, and at its worst moment before eviction); pinned is
    // what it evicted while another owner still held it.
    report[QStringLiteral("cache")] = QJsonObject{
        {QStringLiteral("residentBytes"), static_cast<double>(cache.bytes())},
        {QStringLiteral("peakBytes"), static_cast<double>(cache.peakBytes())},
        {QStringLiteral("peakBeforeEvictionBytes"), static_cast<double>(cache.peakBeforeEvictionBytes())},
        {QStringLiteral("pinnedElsewhereBytes"), static_cast<double>(cache.pinnedElsewhereBytes())},
        {QStringLiteral("peakPinnedElsewhereBytes"), static_cast<double>(peakPinned)},
        {QStringLiteral("budgetBytes"), static_cast<double>(cache.budgetBytes())},
        {QStringLiteral("underBudget"), cache.peakBytes() <= cache.budgetBytes()},
        {QStringLiteral("hits"), static_cast<double>(cache.hits())},
        {QStringLiteral("misses"), static_cast<double>(cache.misses())},
    };
    // The loader report: which decoder drew each clip, and any fallback
    // (the watchdog's "hw decoder stalled, fell back to sw").
    QJsonArray media;
    for (const MediaReportEntry& m : ctx.compositor->mediaReport()) {
        media.append(QJsonObject{{QStringLiteral("clipId"), m.clipId},
                                 {QStringLiteral("ok"), m.ok},
                                 {QStringLiteral("decoder"), m.decoder},
                                 {QStringLiteral("fallback"), m.fallback},
                                 {QStringLiteral("reason"), m.reason}});
    }
    report[QStringLiteral("media")] = media;
    // Intermediate surfaces (D35): the most drawn in one frame, the render
    // targets the pool holds now, and how many it ever created. A steady
    // scene creates no more targets than its busiest frame needs.
    int maxSurfaces = 0;
    int targets = 0;
    long long created = 0;
    for (const FrameStat& st : ctx.compositor->frameStats()) {
        maxSurfaces = std::max(maxSurfaces, st.surfaces);
        targets = st.surfaceTargets;
        created = std::max(created, st.surfaceTargetsCreated);
    }
    report[QStringLiteral("surfaces")] = QJsonObject{{QStringLiteral("maxPerFrame"), maxSurfaces},
                                                      {QStringLiteral("targetsLive"), targets},
                                                      {QStringLiteral("targetsCreated"), static_cast<double>(created)}};
    // Hardware frames still wrapped for the GPU (the screen and the retire
    // queue): a stalled decoder must not leave any behind.
    report[QStringLiteral("liveFrameRefs")] = hw::FrameRef::live();
    return report;
}

}  // namespace nt::bench
