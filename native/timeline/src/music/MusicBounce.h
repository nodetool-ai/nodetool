#pragma once

// The context bounce of Regenerate and Add instrument (docs/MUSIC-MODE.md
// section 14.3, MD13, MD16, AU-4).
//
// A bounce renders a changed copy of the timeline snapshot with the device's
// own mixer (`renderOffline`, MF9) at 48 kHz over the context window:
//
// - Mix (Add instrument): the target track is muted and nothing else changes.
//   Mute, solo, gain, pan, fades, effects and automation apply as in playback.
// - Dry (Regenerate): only the target track and its audio clips remain, at
//   unity: clip and track gain 0 dB, pan centre, no fades, no clip, track or
//   master effects, no automation, no keyed clip volume, master at 0 dB.
//
// The result is written as a 32-bit float stereo WAV (writeStereoFloatWav)
// and, when a server target is given, uploaded with `nt::assets::importFile`
// with `metadata: {"generation_context": "music", ...}` so the asset browser
// can leave it out (MR10).
//
// A `--music-bounce` CLI mode (MusicBounceCli.cpp) writes one window to WAV.

#include "model/TimelineTypes.h"
#include "server/AutosaveController.h"

#include <QJsonObject>
#include <QObject>
#include <QString>
#include <QStringList>

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

class QThread;

namespace nt::music {

enum class BounceKind { Mix, Dry };

// The changed copy. Pure, callable from any thread.
[[nodiscard]] Timeline bounceTimeline(const Timeline& source, BounceKind kind, const std::string& targetTrackId);

// The window [startFrame, startFrame + frames) of `bounceTimeline(...)` at
// 48 kHz: exactly `frames * 2` interleaved stereo samples. `problems` gets
// one line per voice with no PCM. Pure, callable from any thread.
[[nodiscard]] std::vector<float> renderBounce(const Timeline& source, BounceKind kind, const std::string& targetTrackId,
                                              std::int64_t startFrame, std::int64_t frames,
                                              std::vector<std::string>* problems = nullptr,
                                              std::function<bool()> cancelled = {});

struct BounceResult {
    bool ok = false;
    bool cancelled = false;
    QString assetId;   // set when uploaded
    QString wavPath;   // the written file when the caller named one
    QString error;
    std::int64_t frames = 0;
};

// Runs one bounce on a worker thread.
//
// Thread affinity: created, started, cancelled and destroyed on the GUI
// thread. The worker thread is a QThread (the upload's ServerClient owns Qt
// network objects) that only this object holds, through a std::unique_ptr.
// It works on its own copy of the timeline, touches no member, and hands the
// result back through a queued call guarded by a QPointer. The destructor
// requests interruption, which the render and the upload check, and joins
// the thread before any member is destroyed, so no queued call outlives it.
class MusicBounce : public QObject {
    Q_OBJECT
public:
    struct Job {
        // The snapshot captured at submission (MD16). Bounced as `kind`.
        Timeline timeline;
        BounceKind kind = BounceKind::Mix;
        std::string targetTrackId;
        std::int64_t startFrame = 0;
        std::int64_t frames = 0;
        // Set: upload the WAV there. Unset: keep the WAV at `wavPath`.
        std::optional<nt::server::SaveTarget> upload;
        // Where the WAV goes. Empty with an upload: a temporary file.
        QString wavPath;
        // Extra fields of the asset's `metadata` object (the job id).
        QJsonObject metadata;
    };

    explicit MusicBounce(QObject* parent = nullptr);
    ~MusicBounce() override;
    MusicBounce(const MusicBounce&) = delete;
    MusicBounce& operator=(const MusicBounce&) = delete;

    // False when a bounce is already running or the window is empty.
    bool start(Job job);
    void cancel();
    [[nodiscard]] bool running() const { return static_cast<bool>(m_worker); }

signals:
    void finished(const nt::music::BounceResult& result);

private:
    void deliver(const BounceResult& result);
    std::unique_ptr<QThread> m_worker;
};

// The asset name of a bounce upload.
[[nodiscard]] QString bounceAssetName(BounceKind kind, std::int64_t startFrame);

} // namespace nt::music

Q_DECLARE_METATYPE(nt::music::BounceResult)
