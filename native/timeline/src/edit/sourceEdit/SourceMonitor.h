#pragma once
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "assets/AssetMedia.h"
#include "audio/AppAudio.h"
#include <QPointer>
#include <QSize>
#include <QUrl>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>
#include <optional>

class QThread;
class SourceMonitor : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Owned by SourceViewerState")
    Q_PROPERTY(TimelineModel* timeline READ timeline CONSTANT)
    Q_PROPERTY(PlaybackClock* clock READ clock CONSTANT)
    Q_PROPERTY(PlaybackClock* programClock READ programClock WRITE setProgramClock NOTIFY programClockChanged)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString mediaType READ mediaType NOTIFY changed)
    Q_PROPERTY(bool hasVideo READ hasVideo NOTIFY changed)
    Q_PROPERTY(bool hasAudio READ hasAudio NOTIFY changed)
    Q_PROPERTY(QString mediaPath READ mediaPath NOTIFY changed)
    Q_PROPERTY(QString audioPath READ audioPath NOTIFY changed)
    Q_PROPERTY(QUrl mediaUrl READ mediaUrl NOTIFY changed)
    Q_PROPERTY(double frameRate READ frameRate NOTIFY changed)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY changed)
    Q_PROPERTY(QSize frameSize READ frameSize NOTIFY changed)
    Q_PROPERTY(bool audible READ audible NOTIFY audibleChanged)
public:
    explicit SourceMonitor(QObject* parent = nullptr);
    ~SourceMonitor() override;
    TimelineModel* timeline() const { return m_model; }
    PlaybackClock* clock() const { return m_clock; }
    PlaybackClock* programClock() const { return m_programClock; }
    void setProgramClock(PlaybackClock* clock);
    bool ready() const { return m_ready; }
    bool busy() const { return m_busy; }
    QString error() const { return m_error; }
    QString mediaType() const { return m_mediaType; }
    bool hasVideo() const { return m_hasVideo; }
    bool hasAudio() const { return m_hasAudio; }
    QString mediaPath() const { return m_mediaPath; }
    QString audioPath() const { return m_audioPath; }
    QUrl mediaUrl() const { return QUrl::fromLocalFile(m_mediaPath); }
    double frameRate() const { return m_frameRate; }
    double durationMs() const { return m_durationMs; }
    QSize frameSize() const { return m_frameSize; }
    bool audible() const { return m_ready && m_hasAudio && m_clock->playing() && m_clock->rate() == 1; }
    Q_INVOKABLE void open(const QVariantMap& asset, double cueMs = 0);
    void openLocal(const QVariantMap& asset, const QString& mediaPath, const QString& audioPath, double cueMs = 0);
    Q_INVOKABLE void close();
    Q_INVOKABLE void togglePlay();
    Q_INVOKABLE void shuttle(int direction);
    Q_INVOKABLE void shuttleStop();
    Q_INVOKABLE void stepFrames(int frames);
    Q_INVOKABLE void seek(double ms);
    Q_INVOKABLE void pause();
    void setRecordSecondsForTest(double seconds) { m_recordSeconds = seconds; }
    nt::audio::AudioEngine* audioEngineForTest() { return m_audio ? m_audio->engine() : nullptr; }
signals:
    void changed();
    void programClockChanged();
    void audibleChanged();
    void opened();
private:
    struct Request { QVariantMap asset; QString mediaPath; QString audioPath; double cueMs = 0; bool local = false; };
    void startOpen(const Request& request);
    void ensureAudio();
    void updateAudio();
    void silence();
    void stopProgram();
    double lastFrameMs() const;
    TimelineModel* m_model;
    PlaybackClock* m_clock;
    QPointer<PlaybackClock> m_programClock;
    bool m_stoppingOther = false;
    bool m_ready = false;
    bool m_busy = false;
    bool m_hasVideo = false;
    bool m_hasAudio = false;
    bool m_audible = false;
    QString m_error;
    QString m_mediaType;
    QString m_mediaPath;
    QString m_audioPath;
    double m_frameRate = 30;
    double m_durationMs = 0;
    QSize m_frameSize;
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    std::shared_ptr<const nt::Timeline> m_silent;
    std::unique_ptr<nt::audio::AppAudio> m_audio;
    double m_recordSeconds = 0;
    QThread* m_worker = nullptr;
    std::optional<Request> m_pending;
    quint64 m_serial = 0;
};
