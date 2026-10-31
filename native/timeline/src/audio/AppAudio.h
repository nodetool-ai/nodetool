#pragma once

// The app's audio: an AudioEngine on the chosen backend, fed the model's
// snapshots and attached to the clock as its master (DESIGN.md D21). The
// mode comes from --audio:
//   none    no engine; the clock runs on the monotonic clock (D20);
//   null    miniaudio's null backend: the mix runs in real time and makes no
//           sound. Every automated run that wants audio uses it.
//   system  the default output device. The default only for a plain
//           interactive launch (resolveAudioMode in AudioMode.h).
// With a report path, the destructor stops the engine and writes its stats
// as JSON there.

#include "audio/AudioEngine.h"

#include <QMetaObject>
#include <QString>

#include <memory>

class PlaybackClock;
class TimelineModel;

namespace nt::audio {

class AppAudio {
public:
    AppAudio() = default;
    ~AppAudio();
    AppAudio(const AppAudio&) = delete;
    AppAudio& operator=(const AppAudio&) = delete;

    // Returns false with `error` set for a bad mode or a device that fails to
    // open. `latencyMs` sets the null device's reported output latency.
    bool start(const QString& mode, double latencyMs, TimelineModel& model, PlaybackClock& clock, QString* error);
    void setReportPath(const QString& path) { m_reportPath = path; }
    AudioEngine* engine() { return m_engine.get(); }

private:
    std::unique_ptr<AudioEngine> m_engine;
    PlaybackClock* m_clock = nullptr;
    QString m_mode;
    QString m_reportPath;
    QMetaObject::Connection m_connections[3];
};

}  // namespace nt::audio
