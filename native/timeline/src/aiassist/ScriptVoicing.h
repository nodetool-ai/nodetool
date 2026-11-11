#pragma once
#include "ai/GenerationTransport.h"
#include "aiassist/ScriptVoicingPlan.h"
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <QtQmlIntegration/qqmlintegration.h>
class ScriptVoicing : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString state READ state NOTIFY changed)
public:
    explicit ScriptVoicing(QObject* parent = nullptr);
    ~ScriptVoicing() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    bool busy() const { return m_state == "recovering" || m_state == "connecting" || m_state == "generating" || m_state == "transcribing" || m_state == "saving"; }
    QString error() const { return m_error; }
    QString state() const { return m_state; }
    Q_INVOKABLE void voice(const QJsonObject& script, const QString& lineId);
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void recover(const QJsonObject& script, const QString& lineId);
signals:
    void changed();
    void saved(QString scriptId);
private:
    friend class ScriptVoicingStateTest;
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
