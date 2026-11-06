#pragma once
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QString>

namespace nt::ai {
class GenerationTransport;

// One workflow-bound clip job. The caller persists context() before start and
// owns document lifetime, candidate review and the undoable application.
class WorkflowGeneration : public QObject {
    Q_OBJECT
public:
    explicit WorkflowGeneration(GenerationTransport* transport, QObject* parent = nullptr);
    // Freeze inputs without sending. A context is suitable for persistence.
    bool prepare(const QString& sequenceId, const QString& jobId, const QJsonObject& workflow,
                 const QJsonObject& clip, QString* error = nullptr);
    void reset();
    QJsonObject context() const { return m_context; }
    QString status() const { return m_status; }
    bool start();
    // A restored context sends reconnect_job only, never run_job.
    bool recover(const QJsonObject& context);
    // Reconcile a jobs.get response using the frozen, unique terminal output key.
    bool applyJobSnapshot(const QJsonObject& context, const QJsonObject& job);
    // Call on this object's thread. Dispatch jobs.cancel with the returned input
    // on a worker, then deliver its result via finishCancel on this thread.
    QJsonObject beginCancel();
    bool finishCancel(bool ok, const QJsonObject& result, const QString& error = {});
    void acceptMessage(const QJsonObject& message);

signals:
    void statusChanged(QString status, QString error);
    void candidate(QJsonObject context, QString assetId);

private:
    void updateStatus(const QString& status, const QString& error = {});
    QPointer<GenerationTransport> m_transport;
    QJsonObject m_context;
    QJsonObject m_runData;
    QString m_status;
    QString m_outputAsset;
    bool m_terminal = false;
    bool m_cancelling = false;
    bool m_missingOutput = false;
};
}
