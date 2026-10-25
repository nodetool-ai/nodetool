#include "preview/SourcePool.h"

#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"
#include "preview/SceneEval.h"
#include "preview/SyntheticSource.h"

#include <QColor>
#include <QString>

#include <algorithm>
#include <cmath>
#include <chrono>
#include <set>

namespace nt {

SourcePool::SourcePool() : m_reaper([this] { reapLoop(); }) {}

SourcePool::~SourcePool() {
    clear();
    {
        std::lock_guard lock(m_reapMutex);
        m_reapStop = true;
    }
    m_reapCv.notify_all();
    // Wait a bounded time: a worker stuck in a system call that the interrupt
    // callback cannot end must not hang the renderer's teardown.
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (m_retiring.load() > 0 && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    if (m_retiring.load() == 0) {
        m_reaper.join();
    } else {
        m_reaper.detach();  // the process exit ends it
    }
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
        {
            std::unique_lock lock(m_reapMutex);
            m_reapCv.wait(lock, [this] { return m_reapStop || !m_reapQueue.empty(); });
            if (m_reapQueue.empty()) return;
            r = std::move(m_reapQueue.front());
            m_reapQueue.pop_front();
        }
        // Stops and joins the worker; one that does not end in time is
        // abandoned. A healthy worker ends in milliseconds once its I/O is
        // interrupted. A stalled one may be blocked in a call that never
        // returns, so it gets only a short grace.
        FfmpegDecoder::stopWithin(std::move(r.decoder), std::chrono::milliseconds(r.stalled ? 100 : 1000));
        --m_retiring;
    }
}

void SourcePool::update(const Timeline& timeline, double timeMs) {
    struct Want {
        const Clip* clip;
        double distanceMs;  // 0 when on screen
    };
    std::vector<Want> wants;
    for (const Clip& clip : timeline.clips) {
        if (clip.mediaPath.empty() || clip.hidden || !isVisualMediaType(clip.mediaType)) continue;
        const Track* track = timeline.findTrack(clip.trackId);
        if (!track || !track->visible) continue;
        if (timeMs >= clip.endMs()) continue;
        const double distance = std::max(0.0, clip.startMs - timeMs);
        if (distance > kPrerollMs) continue;
        wants.push_back({&clip, distance});
    }
    // At the cap, the clips furthest from the playhead lose their decoder.
    std::stable_sort(wants.begin(), wants.end(),
                     [](const Want& a, const Want& b) { return a.distanceMs < b.distanceMs; });
    if (wants.size() > static_cast<size_t>(kMaxOpenDecoders)) wants.resize(kMaxOpenDecoders);

    std::set<std::string> keep;
    for (const Want& w : wants) {
        const Clip& clip = *w.clip;
        keep.insert(clip.id);
        auto it = m_entries.find(clip.id);
        if (it == m_entries.end()) {
            Entry e;
            e.label = clip.name;
            e.nominal = QSize(clip.width.value_or(timeline.width), clip.height.value_or(timeline.height));
            // Pre-roll: decode from where the clip will start showing.
            const double startSourceMs = clip.inPointMs + std::max(0.0, timeMs - clip.startMs);
            e.decoder = std::make_unique<FfmpegSource>(clip.mediaPath, startSourceMs / 1000.0, e.nominal, modeFor(clip.mediaPath));
            it = m_entries.emplace(clip.id, std::move(e)).first;
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
            e.decoder = std::make_unique<FfmpegSource>(clip.mediaPath, sourceMs / 1000.0, e.nominal, DecodeMode::Software);
        }
        checkOpened(clip.id, e, clip.mediaPath);
    }
    for (auto it = m_entries.begin(); it != m_entries.end();) {
        if (keep.count(it->first) == 0) {
            retire(it->second);
            it = m_entries.erase(it);
        } else {
            ++it;
        }
    }
    int open = 0;
    for (const auto& [id, e] : m_entries) {
        if (e.decoder) ++open;
    }
    m_open = open;
}

void SourcePool::checkOpened(const std::string& clipId, Entry& e, const std::string& mediaPath) {
    if (!e.decoder) return;
    const auto facts = e.decoder->decoder().facts();
    if (!facts) return;  // still opening
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
        if (it == m_report.end() || it->second.ok != r.ok || it->second.reason != r.reason ||
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
