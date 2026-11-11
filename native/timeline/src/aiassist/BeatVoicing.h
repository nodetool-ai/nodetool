#pragma once
#include "ai/GenerationTransport.h"
#include "aiassist/ScriptVoicingPlan.h"
#include "assets/AssetMedia.h"
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <QVariantMap>
#include <functional>
#include <memory>
#include <utility>
#include <QtQmlIntegration/qqmlintegration.h>
class BeatVoicing : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(bool hasCandidate READ hasCandidate NOTIFY changed)
    Q_PROPERTY(QVariantMap candidate READ candidate NOTIFY changed)
public:
    using MediaResolver = std::function<nt::Clip(nt::server::ServerClient&, const QString&, const QJsonObject&, const QJsonObject&, nt::assets::MediaProtection&, quint64)>;
    explicit BeatVoicing(QObject* parent = nullptr);
    void setMediaResolver(MediaResolver resolver) { m_mediaResolver = std::move(resolver); }
    ~BeatVoicing() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    bool busy() const { return m_state == "recovering" || m_state == "connecting" || m_state == "generating" || m_state == "transcribing" || m_state == "saving"; }
    QString error() const { return m_error; }
    QString state() const { return m_state; }
    Q_INVOKABLE void voice(const QString& clipId, const QString& provider, const QString& model, const QString& voice);
    bool hasCandidate() const { return !m_candidate.isEmpty(); }
    QVariantMap candidate() const { return m_candidate.toVariantMap(); }
    Q_INVOKABLE bool apply();
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void recover(const QString& clipId);
signals:
    void changed();
    void applied(QString clipId);
private:
    friend class BeatVoicingStateTest;
    void receive(const QJsonObject& message);
    void persist(const QJsonObject& transcription);
    void fail(const QString& error);
    bool current() const;
    bool checkpoint();
    void lookup();
    nt::ai::GenerationTransport m_transport;
    QPointer<TimelineModel> m_timeline;
    std::optional<nt::server::SaveTarget> m_target;
    nt::aiassist::VoicePlan m_plan;
    QJsonObject m_generationResult;
    QJsonObject m_transcription;
    QJsonObject m_observedClip;
    QJsonObject m_candidate;
    std::optional<nt::Clip> m_candidateMedia;
    MediaResolver m_mediaResolver = nt::assets::resolveDroppedMedia;
    std::shared_ptr<nt::assets::MediaProtection> m_mediaProtection = std::make_shared<nt::assets::MediaProtection>();
    QString m_requestId;
    QString m_lineId;
    QString m_assetId;
    QString m_state;
    QString m_error;
    quint64 m_generation = 0;
    quint64 m_epoch = 0;
    QThread* m_worker = nullptr;
    QTimer m_timeout;
    QTimer m_poll;
    QString m_generationRequestId;
    QString m_checkpoint;
};
