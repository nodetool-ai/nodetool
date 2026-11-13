#pragma once
#include <QAbstractItemModel>
#include <QObject>
#include <QPointer>
#include <QString>
#include <QVariantList>

namespace nodetool::node_editor {

// What the canvas toolbar (Toolbar.qml), the group controls
// (AuthoredControls.qml), the queue overlay (QueueOverlay.qml) and the run
// output (RunOutput.qml) read and do about runs: the shown queue, whether the
// server is connected, the open workflow's id, the run output's runs, selected
// run and models, and the authored command, ask-the-agent, cancel, select and
// clear requests, and the queue history's report request.
//
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class RunState : public QObject {
    Q_OBJECT
    // The debounced queue: one map per job with workflow_id, status, order,
    // queue_position, stopping, terminal and editedSinceError.
    Q_PROPERTY(QVariantList queue READ queue NOTIFY queueChanged)
    Q_PROPERTY(bool connected READ connected NOTIFY connectionChanged)
    // The open workflow, which picks its own jobs out of the queue.
    Q_PROPERTY(QString workflowId READ workflowId NOTIFY workflowIdChanged)
    // The run output's runs, one map per run with jobId and status, and the
    // selected run's id.
    Q_PROPERTY(QVariantList outputRuns READ outputRuns NOTIFY outputChanged)
    Q_PROPERTY(QString selectedRunId READ selectedRunId NOTIFY outputChanged)
    // The selected run's media collections and rich entries. The run output
    // model owns them, and the owner keeps it alive while QML can read them.
    Q_PROPERTY(QAbstractItemModel *collections READ collections NOTIFY outputModelsChanged)
    Q_PROPERTY(QAbstractItemModel *richEntries READ richEntries NOTIFY outputModelsChanged)
public:
    explicit RunState(QObject *parent = nullptr);
    ~RunState() override;

    QVariantList queue() const { return queue_; }
    bool connected() const { return connected_; }
    QString workflowId() const { return workflowId_; }
    QVariantList outputRuns() const { return outputRuns_; }
    QString selectedRunId() const { return selectedRunId_; }
    QAbstractItemModel *collections() const { return collections_; }
    QAbstractItemModel *richEntries() const { return richEntries_; }

    void setQueue(const QVariantList &queue);
    void setConnected(bool connected);
    void setWorkflowId(const QString &id);
    void setOutput(const QVariantList &runs, const QString &selectedRunId);
    // Non-owning: the pointers clear themselves when a model is destroyed.
    void setOutputModels(QAbstractItemModel *collections, QAbstractItemModel *richEntries);

    // A group's authored command, checked against the document and credential
    // epochs it was offered under.
    Q_INVOKABLE void runAuthored(const QString &resourceId, const QString &command, quint64 epoch, quint64 credentials) {
        emit authoredRequested(resourceId, command, epoch, credentials);
    }
    // Opens the chat about a run.
    Q_INVOKABLE void askAgent(const QString &runId) { emit agentRequested(runId); }
    // Stops a queued or running job.
    Q_INVOKABLE void cancelJob(const QString &jobId) { emit cancelRequested(jobId); }
    // Shows a run in the run output.
    Q_INVOKABLE void selectRun(const QString &runId) { emit selectRunRequested(runId); }
    // Clears the run output.
    Q_INVOKABLE void clearOutput() { emit clearOutputRequested(); }
    // Opens a bug report for a failed job in the queue history.
    Q_INVOKABLE void reportJob(const QString &jobId) { emit reportJobRequested(jobId); }

signals:
    void queueChanged();
    void connectionChanged();
    void workflowIdChanged();
    void authoredRequested(const QString &resourceId, const QString &command, quint64 epoch, quint64 credentials);
    void agentRequested(const QString &runId);
    void outputChanged();
    void outputModelsChanged();
    void cancelRequested(const QString &jobId);
    void selectRunRequested(const QString &runId);
    void clearOutputRequested();
    void reportJobRequested(const QString &jobId);

private:
    QVariantList queue_;
    bool connected_ = false;
    QString workflowId_;
    QVariantList outputRuns_;
    QString selectedRunId_;
    QPointer<QAbstractItemModel> collections_;
    QPointer<QAbstractItemModel> richEntries_;
};

}  // namespace nodetool::node_editor
