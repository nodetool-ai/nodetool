#pragma once

// Owns the decoders of media clips (DESIGN.md D18). Each frame the render
// thread tells it which clips are on screen and which start soon; it opens a
// decoder for a clip within kPrerollMs of its start so the first frame is
// ready at the cut, caps open decoders at kMaxOpenDecoders (closing the one
// furthest from the playhead), and closes decoders of clips no longer wanted.
// A clip whose media is rejected (D10a) or fails to open gets a placeholder
// and an entry in the loader report.
//
// Closing a decoder joins its worker, which can wait on I/O. The render
// thread never does that: it releases the textures and hands the decoder to
// a retire thread, which stops it (its FFmpeg interrupt callback ends any
// blocking read) and joins it. A worker that does not end within its grace
// time is abandoned (FfmpegDecoder::stopWithin), so the retire thread and the
// teardown stay bounded.
//
// The watchdog: a VideoToolbox decoder that is stalled (no progress for 1 s
// with a target pending) is retired with no wait, and its media decodes in
// software for the rest of the session, with kStallFallback in the report.

#include "model/TimelineTypes.h"
#include "preview/LayerSource.h"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <thread>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace nt {

class FfmpegDecoder;
enum class DecodeMode;
class FfmpegSource;

inline constexpr int kMaxOpenDecoders = 12;  // MAX_OPEN_DECODERS: 8 layers + 4 ahead
inline constexpr double kPrerollMs = 2000.0;
inline constexpr const char* kStallFallback = "hw decoder stalled, fell back to sw";

struct MediaReport {
    std::string clipId;
    std::string mediaPath;
    bool ok = false;
    std::string reason;    // rejection or open/decode error, empty when ok
    std::string decoder;   // "videotoolbox" or "software"
    std::string fallback;  // why VideoToolbox is not used (--decode auto)
};

class SourcePool {
public:
    SourcePool();
    ~SourcePool();

    // Render thread, once per frame, before any sourceFor(): opens, keeps and
    // closes decoders for the media clips of `timeline` at `timeMs`.
    void update(const Timeline& timeline, double timeMs);

    // The source for a media clip, or null when none is open. A rejected or
    // failed clip returns its placeholder.
    LayerSource* sourceFor(const std::string& clipId);

    // Render thread: retires every source now (their last frames go to the
    // retire queue). The renderer calls it before it waits for the GPU.
    void clear();

    // Decoders open now, including those still being retired. Any thread.
    int openDecoders() const { return m_open.load() + m_retiring.load(); }

    // One entry per media clip opened so far: ok, or the reason it was not.
    std::vector<MediaReport> report() const;
    // Bumps on every change to the report. Any thread.
    long long reportVersion() const { return m_reportVersion.load(); }

private:
    struct Entry {
        std::unique_ptr<FfmpegSource> decoder;
        std::unique_ptr<LayerSource> placeholder;
        std::string label;
        QSize nominal;
    };
    void checkOpened(const std::string& clipId, Entry& e, const std::string& mediaPath);
    // Render thread: drops the textures, hands the decoder to the retire thread.
    // A stalled decoder gets no grace time before it is abandoned.
    void retire(Entry& e, bool stalled = false);
    void reapLoop();
    std::optional<DecodeMode> modeFor(const std::string& mediaPath) const;

    std::map<std::string, Entry> m_entries;
    std::atomic<int> m_open{0};

    // Retire thread: joins decoders off the render thread.
    std::mutex m_reapMutex;
    std::condition_variable m_reapCv;
    struct Retiring {
        std::unique_ptr<FfmpegDecoder> decoder;
        bool stalled = false;
    };
    std::deque<Retiring> m_reapQueue;
    // Media whose VideoToolbox decoder stalled: software for the session.
    std::set<std::string> m_softwareOnly;
    bool m_reapStop = false;
    std::atomic<int> m_retiring{0};
    std::thread m_reaper;
    mutable std::mutex m_reportMutex;
    std::map<std::string, MediaReport> m_report;
    std::atomic<long long> m_reportVersion{0};
};

}  // namespace nt
