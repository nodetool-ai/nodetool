#pragma once
#include <QObject>
#include <QString>
#include <QVariantList>

namespace nodetool::node_editor {

// What the canvas toolbar (Toolbar.qml) and the group controls
// (AuthoredControls.qml) read and do about runs: the shown queue, whether the
// server is connected, the open workflow's id, and the authored group command
// request.
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
public:
    explicit RunState(QObject *parent = nullptr);
    ~RunState() override;

    QVariantList queue() const { return queue_; }
    bool connected() const { return connected_; }
    QString workflowId() const { return workflowId_; }

    void setQueue(const QVariantList &queue);
    void setConnected(bool connected);
    void setWorkflowId(const QString &id);

    // A group's authored command, checked against the document and credential
    // epochs it was offered under.
    Q_INVOKABLE void runAuthored(const QString &resourceId, const QString &command, quint64 epoch, quint64 credentials) {
        emit authoredRequested(resourceId, command, epoch, credentials);
    }

signals:
    void queueChanged();
    void connectionChanged();
    void workflowIdChanged();
    void authoredRequested(const QString &resourceId, const QString &command, quint64 epoch, quint64 credentials);

private:
    QVariantList queue_;
    bool connected_ = false;
    QString workflowId_;
};

}  // namespace nodetool::node_editor
