#include "preview/SourcePool.h"

#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"
#include "preview/SceneEval.h"
#include "preview/StillImageSource.h"
#include "preview/SyntheticSource.h"

#include <QColor>
#include <QString>

#include <algorithm>
#include <cmath>
#include <chrono>
#include <set>
#include <utility>

namespace nt {

// native-rules #12: lambda captures raw this and runs on the reaper thread
SourcePool::SourcePool() : m_reaper([this] { reapLoop(); }) {}

SourcePool::SourcePool(WorkerReadProbes probes) : SourcePool() {
    m_readProbes = std::move(probes);
}

SourcePool::~SourcePool() {
    clear();
    {
        std::lock_guard lock(m_reapMutex);
        m_reapStop = true;
    }
    m_reapCv.notify_all();
    // The reaper gives queued workers no grace during shutdown. Only a
    // worker already being retired can spend its remaining grace period,
    // so joining stays bounded and every access to the queue ends here.
    m_reaper.join();
}

void SourcePool::clear() {
    for (auto& [id, e] : m_entries) retire(e);
    m_entries.clear();
    m_open = 0;
}

void SourcePool::retire(Entry& e, bool stalled) {
    if (!e.decoder) return;
    std::unique_ptr<FfmpegDecoder> decoder = e.decoder->takeDecoder();
    e.decoder.reset();  // textures: released here, on the render thread
    if (!decoder) return;
    ++m_retiring;
    {
        std::lock_guard lock(m_reapMutex);
        m_reapQueue.push_back({std::move(decoder), stalled});
    }
    m_reapCv.notify_one();
}

void SourcePool::reapLoop() {
    for (;;) {
        Retiring r;
        bool stopping = false;
        {
            std::unique_lock lock(m_reapMutex);
            m_reapCv.wait(lock, [this] { return m_reapStop || !m_reapQueue.empty(); });
            if (m_reapQueue.empty()) return;
            r = std::move(m_reapQueue.front());
            m_reapQueue.pop_front();
            stopping = m_reapStop;
        }
        // Stops and joins the worker; one that does not end in time is
        // abandoned. A healthy worker ends in milliseconds once its I/O is
        // interrupted. A stalled one may be blocked in a call that never
        // returns, so it gets only a short grace.
        FfmpegDecoder::stopWithin(std::move(r.decoder), std::chrono::milliseconds(stopping ? 0 : (r.stalled ? 100 : 1000)));
        --m_retiring;
    }
}

void SourcePool::update(const Timeline& timeline, double timeMs, const std::set<std::string>& required,
                        const std::shared_ptr<void>& mediaLeases) {
    struct Want {
        const Clip* clip;
        double distanceMs;  // 0 when on screen
        int priority;       // 0 = required, 1 = upcoming lookahead, 2 = recently passed
    };
    std::vector<Want> wants;
    for (const Clip& clip : timeline.clips) {
        if (clip.mediaPath.empty() || clip.hidden || !isVisualMediaType(clip.mediaType)) continue;
        const Track* track = timeline.findTrack(clip.trackId);
        if (!track || !track->visible) continue;
        const bool needed = required.contains(clip.id);
        if (needed) {
            wants.push_back({&clip, 0.0, 0});
            continue;
        }
        if (timeMs < clip.endMs()) {
            const double distance = std::max(0.0, clip.startMs - timeMs);
            if (distance <= kPrerollMs) wants.push_back({&clip, distance, 1});
            continue;
        }
        // Keep an already-open decoder briefly behind the playhead so scrubbing
        // back across a cut reuses it instead of reopening from disk.
        const double behind = timeMs - clip.endMs();
        if (behind <= kPrerollMs && m_entries.contains(clip.id)) {
            wants.push_back({&clip, behind, 2});
        }
    }
    // At the cap, required clips stay, then upcoming lookahead, then recently passed clips.
    std::stable_sort(wants.begin(), wants.end(),
                     [](const Want& a, const Want& b) {
                         if (a.priority != b.priority) return a.priority < b.priority;
                         return a.distanceMs < b.distanceMs;
                     });
    const auto requiredCount = static_cast<size_t>(std::count_if(wants.begin(), wants.end(),
        [](const Want& want) { return want.priority == 0; }));
    const auto limit = std::max(static_cast<size_t>(kMaxOpenDecoders), requiredCount);
    if (wants.size() > limit) wants.resize(limit);

    std::set<std::string> keep;
    for (const Want& w : wants) {
        keep.insert(w.clip->id);
    }
    // Collect retiring entries first so a newly wanted clip using the same
    // media file (e.g. scrubbing across split cuts) can adopt an open, healthy
    // decoder and its GPU textures instead of reopening from disk.
    std::vector<Entry> retiring;
    for (auto it = m_entries.begin(); it != m_entries.end();) {
        if (keep.count(it->first) == 0) {
            retiring.push_back(std::move(it->second));
            it = m_entries.erase(it);
        } else {
            ++it;
        }
    }
    const auto takeAdoptable = [&](const std::string& mediaPath, bool image) -> std::unique_ptr<FfmpegSource> {
        const bool swOnly = m_softwareOnly.count(mediaPath) != 0;
        for (auto it = retiring.begin(); it != retiring.end(); ++it) {
            if (!it->decoder || it->mediaPath != mediaPath || it->image != image) continue;
            if (it->decoder->decoder().stalled()) continue;
            if (const auto facts = it->decoder->decoder().facts()) {
                if (!facts->usable()) continue;
                if (swOnly && facts->decoder != "software") continue;
            } else if (swOnly) {
                continue;
            }
            std::unique_ptr<FfmpegSource> adopted = std::move(it->decoder);
            retiring.erase(it);
            return adopted;
        }
        return nullptr;
    };

    const int hwCores = std::max(1, static_cast<int>(std::thread::hardware_concurrency()));
    int activeVideoCount = 0;
    int upcomingVideoCount = 0;
    for (const Want& w : wants) {
        if (w.clip->mediaType == MediaType::Image) continue;
        if (w.priority == 0 || w.distanceMs <= 0.0) {
            ++activeVideoCount;
        } else if (w.priority == 1) {
            ++upcomingVideoCount;
        }
    }
    const int multiThreads = std::clamp((hwCores * 2) / 3, std::min(4, hwCores), 8);
    const auto softwareThreadsFor = [&](const Want& w, bool image) -> int {
        if (image) return 1;
        const bool activeNow = w.priority == 0 || w.distanceMs <= 0.0;
        if (activeNow) {
            if (activeVideoCount <= 1) return 0;  // solo clip gets FFmpeg auto (all cores)
            // Keep enough frame-thread wavefront depth so staggered GOP stragglers
            // do not stall, while capping below FFmpeg auto (ncpu+1) to cut
            // multi-track DPB memory and cross-core contention.
            return multiThreads;
        }
        // Upcoming lookahead matches the budget it will need when it becomes
        // active so crossing a cut does not rebuild the codec mid-seek.
        if (activeVideoCount >= 2 || upcomingVideoCount >= 2) return multiThreads;
        return 0;
    };

    for (const Want& w : wants) {
        const Clip& clip = *w.clip;
        const bool isImage = clip.mediaType == MediaType::Image;
        const int swThreads = softwareThreadsFor(w, isImage);
        auto it = m_entries.find(clip.id);
        if (it != m_entries.end() && it->second.mediaPath != clip.mediaPath) {
            retiring.push_back(std::move(it->second));
            m_entries.erase(it);
            it = m_entries.end();
        }
        if (it == m_entries.end()) {
            Entry e;
            e.label = clip.name;
            e.mediaPath = clip.mediaPath;
            e.image = isImage;
            e.nominal = QSize(clip.width.value_or(timeline.width), clip.height.value_or(timeline.height));
            // Pre-roll: decode from where the clip will start showing.
            const double startSourceMs = clip.inPointMs + std::max(0.0, timeMs - clip.startMs);
            if (auto adopted = takeAdoptable(clip.mediaPath, e.image)) {
                adopted->setSoftwareThreads(swThreads);
                adopted->resetForClip(startSourceMs / 1000.0, e.nominal);
                e.decoder = std::move(adopted);
            } else {
                e.decoder = std::make_unique<FfmpegSource>(clip.mediaPath, startSourceMs / 1000.0, e.nominal,
                                                           modeFor(clip.mediaPath), mediaLeases, m_readProbes.video,
                                                           swThreads);
            }
            it = m_entries.emplace(clip.id, std::move(e)).first;
        } else if (it->second.decoder && w.priority != 2) {
            // Keep idle recently-passed decoders at their open thread budget so
            // scrubbing back across a cut never triggers a codec reopen.
            it->second.decoder->setSoftwareThreads(swThreads);
        }
        Entry& e = it->second;
        if (e.decoder && e.decoder->decoder().stalled()) {
            // The watchdog: retire the stalled decoder with no join here, and
            // reopen the clip in software where it shows now. Its cached
            // frames go too: they hold the stalled session's surfaces.
            m_softwareOnly.insert(clip.mediaPath);
            FrameCache::shared().eraseSource(clip.mediaPath);
            retire(e, true);
            const double sourceMs = clip.inPointMs + std::max(0.0, timeMs - clip.startMs);
            e.decoder = std::make_unique<FfmpegSource>(clip.mediaPath, sourceMs / 1000.0, e.nominal,
                                                       DecodeMode::Software, mediaLeases, m_readProbes.video,
                                                       swThreads);
        }
        checkOpened(clip.id, e, clip.mediaPath, mediaLeases);
    }
    for (Entry& leftover : retiring) {
        retire(leftover);
    }
    int open = 0;
    for (const auto& [id, e] : m_entries) {
        if (e.decoder) ++open;
    }
    m_open = open;
}

void SourcePool::checkOpened(const std::string& clipId, Entry& e, const std::string& mediaPath,
                             const std::shared_ptr<void>& mediaLeases) {
    if (!e.decoder) return;
    const auto facts = e.decoder->decoder().facts();
    if (!facts) return;  // still opening
    const QString path = QString::fromStdString(mediaPath);
    if (e.image && facts->opened && facts->error.empty() && facts->rejection == "alpha" &&
        StillImageSource::canRead(path)) {
        // The YUV path has no alpha plane. A still image needs no decoder:
        // one RGBA texture keeps its transparency.
        e.still = std::make_unique<StillImageSource>(path, mediaLeases, m_readProbes.still);
        MediaReport r;
        r.clipId = clipId;
        r.mediaPath = mediaPath;
        r.ok = true;
        r.decoder = "image";
        {
            std::lock_guard lock(m_reportMutex);
            m_report[clipId] = r;
            ++m_reportVersion;
        }
        retire(e);
        return;
    }
    {
        // Facts are republished when a decoder falls back to software, so
        // the entry follows the newest.
        MediaReport r;
        r.clipId = clipId;
        r.mediaPath = mediaPath;
        r.ok = facts->usable();
        r.reason = !facts->error.empty() ? facts->error : facts->rejection;
        r.decoder = facts->decoder;
        r.fallback = m_softwareOnly.count(mediaPath) != 0 ? std::string(kStallFallback) : facts->fallback;
        std::lock_guard lock(m_reportMutex);
        const auto it = m_report.find(clipId);
        if (it == m_report.end() || it->second.mediaPath != r.mediaPath || it->second.ok != r.ok || it->second.reason != r.reason ||
            it->second.decoder != r.decoder || it->second.fallback != r.fallback) {
            m_report[clipId] = r;
            ++m_reportVersion;
        }
    }
    if (!facts->usable()) {
        // D10a: a placeholder instead of the picture, and no decoder kept open.
        const QString reason = QString::fromStdString(!facts->opened          ? "cannot open"
                                                      : !facts->rejection.empty() ? facts->rejection
                                                                                  : "decode failed");
        e.placeholder = std::make_unique<SyntheticSource>(
            QString::fromStdString(e.label) + QStringLiteral(" — ") + reason, QColor(70, 70, 76), e.nominal, 30.0);
        retire(e);
    }
}

std::optional<DecodeMode> SourcePool::modeFor(const std::string& mediaPath) const {
    if (m_softwareOnly.count(mediaPath) != 0) return DecodeMode::Software;
    return std::nullopt;
}

LayerSource* SourcePool::sourceFor(const std::string& clipId) {
    auto it = m_entries.find(clipId);
    if (it == m_entries.end()) return nullptr;
    if (it->second.still) return it->second.still.get();
    if (it->second.placeholder) return it->second.placeholder.get();
    return it->second.decoder.get();
}

std::vector<MediaReport> SourcePool::report() const {
    std::lock_guard lock(m_reportMutex);
    std::vector<MediaReport> out;
    for (const auto& [id, r] : m_report) out.push_back(r);
    return out;
}

}  // namespace nt
