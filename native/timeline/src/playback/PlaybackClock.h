#pragma once

#include <QElapsedTimer>
#include <QObject>
#include <QtQmlIntegration/qqmlintegration.h>

// The transport. While playing, the current time comes from a monotonic clock,
// so `currentTimeMs()` is exact whenever it is read. The `time` property is the
// value at the last `tick()`; QML drives `tick()` once per frame. Only the
// playhead and the timecode bind to it, never the track list.
class PlaybackClock : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Created by main")
    Q_PROPERTY(double time READ time NOTIFY timeChanged)
    Q_PROPERTY(bool playing READ playing NOTIFY playingChanged)
    Q_PROPERTY(double durationMs READ durationMs WRITE setDurationMs NOTIFY durationMsChanged)
    Q_PROPERTY(bool loop READ loop WRITE setLoop NOTIFY loopChanged)

public:
    explicit PlaybackClock(QObject* parent = nullptr);

    double time() const { return m_timeMs; }
    bool playing() const { return m_playing; }
    double durationMs() const { return m_durationMs; }
    void setDurationMs(double ms);
    bool loop() const { return m_loop; }
    void setLoop(bool loop);

    // The time now, read from the monotonic clock. Safe to call from the
    // render thread while the GUI thread is blocked in synchronize().
    double currentTimeMs() const;

public slots:
    void play();
    void pause();
    void toggle();
    void seek(double ms);
    // Samples the monotonic clock into `time`. Call once per frame.
    void tick();

signals:
    void timeChanged();
    void playingChanged();
    void durationMsChanged();
    void loopChanged();

private:
    double clampTime(double ms) const;

    QElapsedTimer m_timer;
    double m_originMs = 0.0;  // timeline time at m_timer start
    double m_timeMs = 0.0;
    double m_durationMs = 0.0;
    bool m_playing = false;
    bool m_loop = true;
};
