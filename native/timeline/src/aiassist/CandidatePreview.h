#pragma once
#include "assets/TimelineMediaConsumer.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "assets/AssetMedia.h"
#include "audio/AppAudio.h"
#include <QPointer>
#include <QUrl>
#include <optional>
#include <QtQmlIntegration/qqmlintegration.h>
class QThread;
// The review owns an isolated document and a silent clock. It never edits the cut.
class CandidatePreview : public nt::assets::TimelineMediaConsumer {
    Q_OBJECT
    Q_INTERFACES(QQmlParserStatus)
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(TimelineModel* previewTimeline READ previewTimeline CONSTANT)
    Q_PROPERTY(PlaybackClock* previewClock READ previewClock CONSTANT)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString audioMode READ audioMode WRITE setAudioMode NOTIFY changed)
public:
    explicit CandidatePreview(QObject* parent = nullptr);
    explicit CandidatePreview(const nt::server::AssetCacheRoot& cache, QObject* parent = nullptr);
    ~CandidatePreview() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    TimelineModel* previewTimeline() const { return m_preview; }
    PlaybackClock* previewClock() const { return m_clock; }
    bool ready() const { return m_ready; }
    bool busy() const { return m_loading; }
    QString error() const { return m_error; }
    QString audioMode() const { return m_audioMode; }
    void setAudioMode(const QString& mode);
    Q_INVOKABLE void togglePlay();
    Q_INVOKABLE bool preview(const QString& assetId, const QString& mediaType, double durationMs);
    // Plays a file on this machine, such as a project folder file, with no
    // server read. A durationMs of 0 takes the file's own duration.
    Q_INVOKABLE bool previewFile(const QString& localPath, const QString& mediaType, double durationMs = 0);
    // previewFile for a file:// URL. QUrl::toLocalFile gives the platform path,
    // so a Windows drive letter does not keep a leading slash.
    Q_INVOKABLE bool previewUrl(const QUrl& url, const QString& mediaType, double durationMs = 0);
    Q_INVOKABLE void close();
signals:
    void timelineChanged();
    void changed();
private:
    QPointer<TimelineModel> m_timeline;
    TimelineModel* m_preview;
    PlaybackClock* m_clock;
    QThread* m_worker = nullptr;
    // An asset id, or a local path when assetId is empty.
    struct PendingPreview { QString assetId; QString localPath; QString mediaType; double durationMs; };
    bool start(const PendingPreview& request);
    std::optional<PendingPreview> m_pending;
    bool m_loading = false;
    QString m_error;
    QString m_audioMode = QStringLiteral("none");
    std::unique_ptr<nt::audio::AppAudio> m_audio;
    quint64 m_serial = 0;
    bool m_ready = false;
};
