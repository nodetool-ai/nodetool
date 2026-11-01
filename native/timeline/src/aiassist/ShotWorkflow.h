#pragma once
#include "ai/GenerationTransport.h"
#include "assets/AssetMedia.h"
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <functional>
#include "server/ServerClient.h"
#include <QtQmlIntegration/qqmlintegration.h>
class ShotWorkflow : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QVariantMap board READ board NOTIFY changed)
    Q_PROPERTY(QVariantMap pendingCandidate READ pendingCandidate NOTIFY changed)
public:
    using Call = std::function<nt::server::QueryResult(bool, const QString&, const QJsonObject&)>;
    void setCall(Call call) { m_call = std::move(call); }
    using MediaResolver = std::function<nt::Clip(nt::server::ServerClient&, const QString&, const QJsonObject&, const QJsonObject&, nt::assets::MediaProtection&, quint64)>;
    void setMediaResolver(MediaResolver resolver) { m_mediaResolver = std::move(resolver); }
    explicit ShotWorkflow(QObject* parent = nullptr);
    ~ShotWorkflow() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    bool busy() const;
    QString state() const { return m_state; }
    QString error() const { return m_error; }
    QVariantMap board() const { return m_board.toVariantMap(); }
    QVariantMap pendingCandidate() const { return m_candidate.toVariantMap(); }
    Q_INVOKABLE QVariantList candidates(const QJsonObject& board, const QString& shotId, const QString& kind) const;
    Q_INVOKABLE void render(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model);
    Q_INVOKABLE void accept(const QJsonObject& board, const QString& shotId, const QString& kind, int index);
    Q_INVOKABLE bool link(const QJsonObject& board, const QString& clipId, const QString& shotId);
    Q_INVOKABLE bool unlink(const QString& clipId);
    Q_INVOKABLE void derive(const QJsonObject& board, const QString& clipId, int frameCount, const QString& action);
    Q_INVOKABLE void recover(const QJsonObject& board, const QString& shotId, const QString& kind);
    // The prompt a render of this shot sends, before reference images are attached.
    Q_INVOKABLE QString prompt(const QJsonObject& document, const QJsonObject& shot, const QString& kind) const;
    Q_INVOKABLE void cancel();
signals:
    void changed();
    void saved(QJsonObject board);
private:
    friend class ShotWorkflowTest;
    Call m_call;
    MediaResolver m_mediaResolver;
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    void receive(const QJsonObject& frame);
    void persist(const QJsonObject& board, const QJsonObject& localEdit = {});
    void fail(const QString& error);
    bool current() const;
    bool checkpoint();
    void lookup();
    void startRender();
    void selectQueuedRequest();
    void resetProtection();
    nt::ai::GenerationTransport m_transport;
    QTimer m_poll;
    QPointer<TimelineModel> m_timeline;
    std::optional<nt::server::SaveTarget> m_target;
    QThread* m_worker = nullptr;
    QJsonObject m_board;
    QJsonObject m_request;
    QJsonObject m_renderInputs;
    QJsonObject m_candidate;
    QJsonArray m_requests;
    QJsonArray m_productionCandidates;
    int m_requestIndex = 0;
    bool m_dispatched = false;
    bool m_stopQueue = false;
    QString m_shotId;
    QString m_kind;
    QString m_requestId;
    QString m_lookupId;
    QString m_checkpoint;
    QString m_state;
    QString m_error;
    quint64 m_generation = 0;
    quint64 m_epoch = 0;
};
