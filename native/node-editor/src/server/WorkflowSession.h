#pragma once
#include "../run/PartialRunPlanner.h"
#include "WorkflowAutosave.h"
#include "AccountJobs.h"
#include "../run/GenerationHistory.h"
#include <QJsonObject>
#include <QJsonArray>
#include <QStringList>
#include <QNetworkAccessManager>
#include <QObject>
#include <QWebSocket>
#include <functional>
namespace nodetool::node_editor {
// Host supplies credentials in memory. Snapshots use the persisted workflow
// format.
class WorkflowSession final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QJsonObject workflow READ workflow NOTIFY workflowChanged)
  Q_PROPERTY(QJsonObject catalog READ catalog NOTIFY catalogChanged)
  Q_PROPERTY(bool dirty READ dirty NOTIFY stateChanged)
  Q_PROPERTY(bool saving READ saving NOTIFY stateChanged)
  Q_PROPERTY(bool remoteLoading READ remoteLoading NOTIFY stateChanged)
  Q_PROPERTY(bool autosaveEnabled READ autosaveEnabled WRITE setAutosaveEnabled NOTIFY stateChanged)
  Q_PROPERTY(QString autosaveState READ autosaveState NOTIFY stateChanged)
  Q_PROPERTY(bool conflictPending READ conflictPending NOTIFY stateChanged)
  Q_PROPERTY(QJsonObject conflictWorkflow READ conflictWorkflow NOTIFY stateChanged)
  Q_PROPERTY(bool serverBound READ serverBound NOTIFY stateChanged)
  Q_PROPERTY(bool connected READ connected NOTIFY stateChanged)
public:
  Q_PROPERTY(QVariantList queue READ queue NOTIFY stateChanged)
  QVariantList queue() const;
  explicit WorkflowSession(QObject *parent = nullptr);
  QJsonObject workflow() const { return m_workflow; }
  QJsonObject catalog() const { return m_catalog; }
  bool dirty() const { return m_dirty; }
  bool saving() const { return m_saving; }
  bool remoteLoading() const { return m_remoteLoading; }
  bool autosaveEnabled() const { return m_autosave.enabled(); }
  void setAutosaveEnabled(bool enabled);
  void setAutosaveDelay(int milliseconds) { m_autosave.setDelay(milliseconds); }
  QString autosaveState() const { return m_autosaveState; }
  bool conflictPending() const { return m_conflictPending; }
  QJsonObject conflictWorkflow() const { return m_remoteWorkflow; }
  bool serverBound() const { return !m_id.isEmpty() && !m_revision.isEmpty(); }
  void setVersionRestoreBusy(bool busy) { m_saving = busy; emit stateChanged(); if (!busy) { refreshRemoteWorkflow(); } }
  void acknowledgeRestoredVersion(const QJsonObject &response);
  Q_INVOKABLE void flushAutosave();
  Q_INVOKABLE void detachServerWorkflow();
  Q_INVOKABLE void refreshRemoteWorkflow();
  Q_INVOKABLE void reloadRemoteWorkflow();
  Q_INVOKABLE void keepLocalWorkflow();
  bool connected() const { return m_connected; }
  QUrl serverUrl() const { return m_base; }
  Q_INVOKABLE void connectToServer(const QUrl &base, const QString &token,
                                   const QString &userId = "1");
  Q_INVOKABLE void disconnectFromServer();
  Q_INVOKABLE void loadCatalog();
  Q_INVOKABLE void openWorkflow(const QString &id);
  Q_INVOKABLE void setSnapshot(const QJsonObject &snapshot);
  Q_INVOKABLE void save();
  // Returns the client-generated job ID. Never automatically resubmits a run.
  Q_INVOKABLE QString run(const QJsonObject &snapshot,
                          const QJsonObject &params = {});
  // Plans targets through the web-compatible generation resolver.
  QString runSelected(const QJsonObject &snapshot, const QStringList &nodeIds,
                      const QJsonArray &metadata, const QJsonObject &params = {});
  void setNodeMetadata(const QJsonArray &metadata) { m_runMetadata = metadata; }
  void clearGenerations() { m_history.setWorkflow({}); m_generations.clear(); }
  GenerationHistory *generationHistory() { return &m_history; }
  PartialRunPlan lastPartialPlan() const { return m_lastPlan; }
  Q_INVOKABLE void stop(const QString &jobId);
  Q_INVOKABLE void cancelJob(const QString &jobId);
  Q_INVOKABLE void reconnectRuns();
  Q_INVOKABLE void reconnectTransport();
signals:
  void workflowChanged();
  void generationsChanged();
  void workflowOpened();
  void catalogChanged();
  void stateChanged();
  void credentialsChanged(QUrl server, QString token, QString userId);
  // Hosts that coalesce document snapshots flush them before the session reads or replaces its workflow.
  void snapshotRequested();
  void errorOccurred(QString message);
  void saveConflict(QString workflowId);
  void saved(QString workflowId);
  void runEvent(QString jobId, QJsonObject event);
  void runSubmitted(QString jobId);

private:
  QSharedPointer<AccountJobs> m_accountJobs;
  QString submitRun(const QJsonObject &snapshot, const QJsonObject &params,
                    const QJsonObject &fullSnapshot, const QJsonArray &metadata,
                    const QStringList &executed);
  void clearConflict();
  void externalWorkflowChange(const QJsonObject &event);
  WorkflowAutosave m_autosave;
  QString m_autosaveState = "saved";
  QJsonObject m_remoteWorkflow;
  bool m_conflictPending = false, m_remoteLoading = false, m_remoteAgain = false, m_flushAgain = false;
  quint64 m_remoteEpoch = 0;
  ExecutionGenerationStore m_generations;
  GenerationHistory m_history;
  QJsonArray m_runMetadata;
  PartialRunPlan m_lastPlan;
  using Callback = std::function<void(QJsonObject, int, QString)>;
  void request(const QByteArray &method, const QString &path,
               const QJsonObject &body, Callback callback);
  bool send(const QString &command, const QJsonObject &data);
  void receive(const QByteArray &bytes);
  QNetworkAccessManager m_network;
  QWebSocket m_socket;
  QUrl m_base;
  QString m_token, m_userId, m_id, m_revision;
  QJsonObject m_workflow, m_catalog, m_persistedWorkflow;
  QHash<QString, QJsonObject> m_runs;
  quint64 m_queueOrder = 0;
  quint64 m_epoch = 0, m_documentEpoch = 0, m_loadEpoch = 0, m_edit = 0;
  bool m_connected = false, m_dirty = false, m_saving = false;
  bool m_reconnecting = false;
};
} // namespace nodetool::node_editor
