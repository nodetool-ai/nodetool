#pragma once
#include <QObject>
#include <QHash>
#include <QJsonObject>
#include <QSet>

namespace nodetool::node_editor {
// Whether a job or node status means the run has ended. Shared by the runtime
// model, the session and the editor window so they settle on the same statuses.
bool isTerminalRunStatus(const QString &status);
class NodeRuntimeModel final : public QObject {
  Q_OBJECT
public:
  explicit NodeRuntimeModel(QObject *parent = nullptr);
  QString selectedRunId() const { return selected_; }
  QJsonObject nodeState(const QString &nodeId) const;
  QJsonObject edgeState(const QString &edgeId) const;
  bool connected() const { return connected_; }
public slots:
  void beginRun(QString jobId);
  // An unknown or empty ID selects no run.
  void selectRun(QString jobId);
  // Forgets every run, for a server change.
  void reset();
  void ingest(QString jobId, QJsonObject event);
  void setConnected(bool connected);
signals:
  void nodeChanged(QString nodeId);
  void projectionChanged();
  // One edge's state changed in the shown run. Edge states never change a card's
  // layout, so this does not project the run again.
  void edgeChanged(QString edgeId);
private:
  struct Run {
    QHash<QString, QJsonObject> nodes;
    QHash<QString, QJsonObject> edges;
    // Nodes whose outputs came from the previous run and have no output of this one yet.
    QSet<QString> held;
    double sequence = 0;
    bool terminal = false;
    bool truncated = false;
    QString terminalStatus;
  };
  QHash<QString, Run> runs_;
  QList<QString> order_;
  QString selected_;
  bool connected_ = true;
};
}
