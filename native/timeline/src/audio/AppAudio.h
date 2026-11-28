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
//
// The system backend opens the device at its own rate unless a rate is set
// (setSystemRate). A music project mixes at 48 kHz and lets miniaudio convert
// for the device (MUSIC-MODE.md 14.1), so playback, bounce and export share
// sample values: the window follows the document with setFollowDocumentRate.

#include "audio/AudioEngine.h"

#include <QMetaObject>
#include <QObject>
#include <QPointer>
#include <QString>

#include <functional>
#include <memory>
#include <string>

class PlaybackClock;
class TimelineSource;

namespace nt {
struct Timeline;
}

namespace nt::audio {

// The engine rate of a music project: MUSIC_SAMPLE_RATE in
// packages/protocol/src/ws-commands.ts.
inline constexpr int kMusicEngineRate = 48000;

// The rate the system backend should mix at for `timeline`: kMusicEngineRate
// for a sequence with a `music` object, else 0 (the device's own rate).
int engineRateFor(const Timeline& timeline);

// UI thread only. AppAudio owns the update timer and stops the engine before it dies.
class AppAudio {
public:
    AppAudio();
    ~AppAudio();
    AppAudio(const AppAudio&) = delete;
    AppAudio& operator=(const AppAudio&) = delete;

    // Returns false with `error` set for a bad mode or a device that fails to
    // open. A system device that refuses the set rate opens at its own rate
    // instead, with a warning on stderr. `latencyMs` sets the null device's
    // reported output latency.
    bool start(const QString& mode, double latencyMs, TimelineSource& source, PlaybackClock& clock, QString* error);
    void setReportPath(const QString& path) { m_reportPath = path; }
    // Whether the engine fills the window's loudness meter (audio/loudness/AppReadout.h). Set it before
    // start(). Only the engine of the open timeline should, not a preview of a candidate.
    void setPublishLoudness(bool publish) { m_publishLoudness = publish; }
    void setRecordSeconds(double seconds) { m_recordSeconds = seconds; }
    // The rate the system backend opens the device at; 0 is the device's own
    // rate (the default). Set it before start(), or while the system backend
    // runs: a different rate then restarts the engine, and the clock moves to
    // the new device as it does after a reroute. Other modes ignore it.
    // When the device does not open at `hz`, the engine reopens at the rate
    // it ran at, then at the device's own rate, and this returns false with
    // `error` set. With no engine left, the next call opens one again.
    bool setSystemRate(int hz, QString* error = nullptr);
    int systemRate() const { return m_systemRate; }
    // Set before start(): the system rate follows engineRateFor() of each
    // document the source loads (a new documentGeneration()).
    void setFollowDocumentRate(bool follow) { m_followDocumentRate = follow; }
    AudioEngine* engine();
    // Tests only: runs in place of AudioEngine::start, so a check can open
    // the null device for the system backend or fail an open.
    using EngineStarter = std::function<bool(AudioEngine&, const AudioEngine::Options&, std::string*)>;
    void setEngineStarterForTest(EngineStarter starter) { m_startEngine = std::move(starter); }

private:
    class UpdateTimer;

    bool openEngine(QString* error);
    void detachUpdate();
    void closeEngine();

    std::unique_ptr<UpdateTimer> m_update;
    QPointer<TimelineSource> m_source;
    QPointer<PlaybackClock> m_clock;
    QPointer<PlaybackClock> m_attachedClock;  // the clock whose audio feed is this engine's
    double m_latencyMs = 0;
    int m_systemRate = 0;
    bool m_followDocumentRate = false;
    quint64 m_documentGeneration = 0;
    QMetaObject::Connection m_documentConnection;
    double m_recordSeconds = 0;
    QString m_mode;
    QString m_reportPath;
    bool m_publishLoudness = false;
    EngineStarter m_startEngine;
    // The context of m_documentConnection. Declared last, so it is destroyed
    // first and the connection ends before the members its slot uses.
    QObject m_documentContext;
};

}  // namespace nt::audio
