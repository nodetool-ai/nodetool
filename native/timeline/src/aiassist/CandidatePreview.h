#pragma once
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "assets/AssetMedia.h"
#include "audio/AppAudio.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>
class QThread;
// The review owns an isolated document and a silent clock. It never edits the cut.
class CandidatePreview : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(TimelineModel* previewTimeline READ previewTimeline CONSTANT)
    Q_PROPERTY(PlaybackClock* previewClock READ previewClock CONSTANT)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString audioMode READ audioMode WRITE setAudioMode NOTIFY changed)
public:
    explicit CandidatePreview(QObject* parent = nullptr);
    ~CandidatePreview() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    TimelineModel* previewTimeline() const { return m_preview; }
    PlaybackClock* previewClock() const { return m_clock; }
    bool ready() const { return m_ready; }
    bool busy() const { return m_worker != nullptr; }
    QString error() const { return m_error; }
    QString audioMode() const { return m_audioMode; }
    void setAudioMode(const QString& mode);
    Q_INVOKABLE void togglePlay();
    Q_INVOKABLE bool preview(const QString& assetId, const QString& mediaType, double durationMs);
    Q_INVOKABLE void close();
signals:
    void changed();
private:
    QPointer<TimelineModel> m_timeline;
    TimelineModel* m_preview;
    PlaybackClock* m_clock;
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    QThread* m_worker = nullptr;
    QString m_error;
    QString m_audioMode = QStringLiteral("none");
    std::unique_ptr<nt::audio::AppAudio> m_audio;
    quint64 m_serial = 0;
    bool m_ready = false;
};
