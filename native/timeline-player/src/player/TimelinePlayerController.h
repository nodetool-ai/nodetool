#pragma once

#include "model/TimelineDocumentLoader.h"
#include "model/TimelineSource.h"
#include "playback/PlaybackClock.h"

#include <QObject>
#include <QPointer>
#include <QQmlParserStatus>
#include <QQuickWindow>
#include <QString>
#include <QtQmlIntegration/qqmlintegration.h>

#include <memory>

class StaticTimelineSource;

namespace nt::audio { class AudioEngine; }

// Plays one timeline by its ID. It asks the host's loader for the document,
// keeps it in a StaticTimelineSource with the media leases of the load, and
// runs a PlaybackClock over it. TimelinePlayer.qml draws `source` at
// `clock` with PreviewCompositor and drives clock.tick() once per frame.
//
// - Status: Idle without a timeline ID, Loading until the loader answers,
//   then Ready or Error. Unavailable when `window` renders with the software
//   scene graph, which cannot draw the picture: nothing is loaded then.
// - Audio: `audioMode` Off runs the clock on the monotonic source. Null and
//   Device open an AudioEngine on the first play, on miniaudio's null
//   backend or on the default output device, and make it the clock's
//   master. `audioEnabled` is true while that engine runs.
// - One player plays at a time in a QML engine (PlaybackArbiter): play()
//   pauses the player that played before, which also closes its audio.
// - A load result for another ID than the current one is dropped, and so is
//   one that arrives after destruction (the connection ends with this
//   object). Give each controller its own loader: a new load() supersedes
//   the previous one, and cancel() discards it.
//
// Thread affinity: UI thread only. TimelinePlayer.qml owns it as a QML child.
// A C++ host may own it through a std::unique_ptr. It owns the clock, the
// source, the audio engine and the leases. The audio engine's device
// callback and decode worker reach the clock only through the engine's
// AudioClockFeed seqlocks.
class TimelinePlayerController : public QObject, public QQmlParserStatus {
    Q_OBJECT
    Q_INTERFACES(QQmlParserStatus)
    QML_ELEMENT
    Q_PROPERTY(QString timelineId READ timelineId WRITE setTimelineId NOTIFY timelineIdChanged)
    Q_PROPERTY(nt::TimelineDocumentLoader* loader READ loader WRITE setLoader NOTIFY loaderChanged)
    Q_PROPERTY(QQuickWindow* window READ window WRITE setWindow NOTIFY windowChanged)
    Q_PROPERTY(bool playbackVisible READ playbackVisible WRITE setPlaybackVisible NOTIFY playbackVisibleChanged)
    Q_PROPERTY(AudioMode audioMode READ audioMode WRITE setAudioMode NOTIFY audioModeChanged)
    Q_PROPERTY(Status status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString error READ error NOTIFY statusChanged)
    Q_PROPERTY(bool playing READ playing NOTIFY playingChanged)
    Q_PROPERTY(double positionMs READ positionMs NOTIFY positionMsChanged)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY documentChanged)
    Q_PROPERTY(double fps READ fps NOTIFY documentChanged)
    Q_PROPERTY(int frame READ frame NOTIFY frameChanged)
    Q_PROPERTY(bool audioEnabled READ audioEnabled NOTIFY audioEnabledChanged)
    Q_PROPERTY(TimelineSource* source READ source CONSTANT)
    Q_PROPERTY(PlaybackClock* clock READ clock CONSTANT)

public:
    enum class Status { Idle, Loading, Ready, Error, Unavailable };
    Q_ENUM(Status)
    enum class AudioMode { Off, Null, Device };
    Q_ENUM(AudioMode)

    explicit TimelinePlayerController(QObject* parent = nullptr);
    ~TimelinePlayerController() override;

    QString timelineId() const { return m_timelineId; }
    void setTimelineId(const QString& id);
    nt::TimelineDocumentLoader* loader() const { return m_loader; }
    void setLoader(nt::TimelineDocumentLoader* loader);
    QQuickWindow* window() const { return m_window; }
    void setWindow(QQuickWindow* window);
    AudioMode audioMode() const { return m_audioMode; }
    void setAudioMode(AudioMode mode);

    Status status() const { return m_status; }
    QString error() const { return m_error; }
    bool playbackVisible() const { return m_playbackVisible; }
    void setPlaybackVisible(bool visible);

    bool playing() const;
    double positionMs() const;
    double durationMs() const { return m_durationMs; }
    double fps() const { return m_fps; }
    int frame() const { return m_frame; }
    bool audioEnabled() const { return m_audio != nullptr; }
    TimelineSource* source() const;
    PlaybackClock* clock() const { return m_clock.get(); }

    Q_INVOKABLE void play();
    Q_INVOKABLE void pause();
    Q_INVOKABLE void toggle();
    Q_INVOKABLE void seek(double ms);
    // Pauses, then moves `frames` frames from the current one, within the
    // timeline.
    Q_INVOKABLE void stepFrames(int frames);

    void classBegin() override;
    void componentComplete() override;

signals:
    void timelineIdChanged();
    void loaderChanged();
    void windowChanged();
    void audioModeChanged();
    void statusChanged();
    void playingChanged();
    void playbackVisibleChanged();
    void positionMsChanged();
    void documentChanged();
    void frameChanged();
    void audioEnabledChanged();

private:
    friend class PlaybackArbiter;

    // The first load of a QML declaration, one event-loop turn after
    // componentComplete().
    void start();
    void loaderDestroyed();
    void refreshAvailability();
    void clockTimeChanged();
    bool graphicsUnavailable() const;
    // Drops the document and asks the loader again. Without `force` it acts
    // only when the window's availability changed.
    void reload(bool force);
    // Another player started: pause and close the audio device.
    void yieldPlayback();
    void loaded(const QString& id, const QUuid& request, const std::shared_ptr<const nt::Timeline>& doc,
                const std::shared_ptr<void>& mediaLeases);
    void failed(const QString& id, const QUuid& request, QString message);
    void setStatus(Status status, const QString& error = {});
    void updateFrame();
    bool openAudio();
    // Detaches the clock from the engine's feed, then stops the device
    // callback and the decode worker, then frees the engine.
    void closeAudio(bool notify = true);

    QString m_timelineId;
    QPointer<nt::TimelineDocumentLoader> m_loader;
    QPointer<QQuickWindow> m_window;
    AudioMode m_audioMode = AudioMode::Off;
    Status m_status = Status::Idle;
    QString m_error;
    // False from classBegin() until the event-loop turn after
    // componentComplete(), so a QML declaration sets every input, its window
    // included, before the first load.
    bool m_complete = true;
    // A new token identifies each reload, including before load() starts.
    QUuid m_request;
    bool m_loading = false;
    bool m_playbackVisible = true;
    double m_durationMs = 0.0;
    double m_fps = 30.0;
    int m_frame = 0;
    // The source pins its media until after the audio engine stops.
    std::unique_ptr<PlaybackClock> m_clock;
    std::unique_ptr<StaticTimelineSource> m_source;
    std::unique_ptr<nt::audio::AudioEngine> m_audio;
};
