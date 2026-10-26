#pragma once

#include "playback/AudioClockFeed.h"

#include <QObject>
#include <QtQmlIntegration/qqmlintegration.h>

#include <cstdint>
#include <functional>
#include <mutex>

// The transport. While playing, the current time comes from one of two
// clocks (DESIGN.md D20, D21):
//   - the audio device, when an AudioClockFeed is attached and its device
//     runs at a forward rate. The playhead is then the audible position:
//     the frames the device rendered, interpolated to now, minus the output
//     latency.
//   - the monotonic clock otherwise.
// Play, seek, a rate change, a device change, and each switch between the
// two clocks set a new anchor at the current timeline time, so the playhead
// never jumps. `currentTimeMs()` is exact whenever it is read. The `time`
// property is the value at the last `tick()`; QML drives `tick()` once per
// frame. Only the playhead and the timecode bind to it, never the track list.
class PlaybackClock : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Created by main")
    Q_PROPERTY(double time READ time NOTIFY timeChanged)
    Q_PROPERTY(bool playing READ playing NOTIFY playingChanged)
    Q_PROPERTY(double durationMs READ durationMs WRITE setDurationMs NOTIFY durationMsChanged)
    Q_PROPERTY(bool loop READ loop WRITE setLoop NOTIFY loopChanged)
    Q_PROPERTY(double rate READ rate WRITE setRate NOTIFY rateChanged)
    Q_PROPERTY(double rangeInMs READ rangeInMs WRITE setRangeIn NOTIFY rangeChanged)
    Q_PROPERTY(double rangeOutMs READ rangeOutMs WRITE setRangeOut NOTIFY rangeChanged)
    Q_PROPERTY(double fps READ fps WRITE setFps NOTIFY fpsChanged)
    Q_PROPERTY(bool playingInToOut READ playingInToOut NOTIFY playingInToOutChanged)
    Q_PROPERTY(bool audioMaster READ audioMaster NOTIFY audioMasterChanged)

public:
    explicit PlaybackClock(QObject* parent = nullptr);

    double time() const { return m_timeMs; }
    bool playing() const { return m_playing; }
    double durationMs() const { return m_durationMs; }
    void setDurationMs(double ms);
    bool loop() const { return m_loop; }
    void setLoop(bool loop);
    double rate() const { return m_rate; }
    void setRate(double rate);
    double rangeInMs() const { return m_rangeInMs; }
    double rangeOutMs() const { return m_rangeOutMs; }
    double fps() const { return m_fps; }
    void setFps(double fps);
    bool playingInToOut() const { return m_playingInToOut; }
    // True while the audio device is the master clock.
    bool audioMaster() const;

    // The time now. Safe to call from the render thread while the GUI thread
    // is blocked in synchronize().
    double currentTimeMs() const;

    // Attach the audio device's clock state, or detach it with nullptr.
    void setAudioFeed(nt::playback::AudioClockFeed* feed);
    // Replace the monotonic clock (nanoseconds), for tests.
    void setNowSource(std::function<std::int64_t()> nowNs);

public slots:
    void play();
    void pause();
    void toggle();
    void stop();
    void playInToOut();
    void shuttle(int direction);
    void shuttleStop();
    void setRangeIn(double ms);
    void setRangeOut(double ms);
    void clearRange();
    void seek(double ms);
    // Samples the clock into `time` and applies clock switches. Call once
    // per frame.
    void tick();

signals:
    void timeChanged();
    void playingChanged();
    void durationMsChanged();
    void loopChanged();
    void rateChanged();
    void audioMasterChanged();
    void rangeChanged();
    void fpsChanged();
    void playingInToOutChanged();

private:
    enum class Source { Monotonic, Audio };

    double clampTime(double ms) const;
    // Bounds are captured on a play/restart, as in PreviewArea.handlePlay.
    void updateBoundsLocked();
    double resolveStartLocked(double ms) const;
    double boundedTimeLocked(double ms) const;
    // Raw timeline time at `nowNs` from the active source, not clamped.
    // Caller holds m_mutex.
    double rawTimeLocked(std::int64_t nowNs) const;
    bool audioUsable(const nt::playback::DeviceInfo& device) const;
    // Set both anchors at `ms`: the monotonic one directly, the audio one
    // with a seek command when the device is usable. Caller holds m_mutex.
    void anchorLocked(double ms, std::int64_t nowNs);
    void sendCommandLocked(bool seek, double seekMs, std::int64_t nowNs);

    mutable std::mutex m_mutex;
    std::function<std::int64_t()> m_nowNs;
    nt::playback::AudioClockFeed* m_feed = nullptr;
    nt::playback::TransportCommand m_command;  // the last command sent
    nt::playback::DeviceInfo m_device;          // the device facts the audio anchor uses
    Source m_source = Source::Monotonic;
    double m_monoAnchorMs = 0.0;
    std::int64_t m_monoAnchorNs = 0;
    double m_timeMs = 0.0;
    double m_durationMs = 0.0;
    double m_rate = 1.0;
    bool m_playing = false;
    bool m_loop = false;
    double m_rangeInMs = -1.0;
    double m_rangeOutMs = -1.0;
    double m_fps = 30.0;
    bool m_playingInToOut = false;
    double m_floorMs = 0.0;
    double m_endMs = 0.0;
};
