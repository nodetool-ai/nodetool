#pragma once
#include "../run/PartialRunPlanner.h"
#include "WorkflowAutosave.h"
#include "AccountJobs.h"
#include "ReconnectPolicy.h"
#include "../run/GenerationHistory.h"
#include <QJsonObject>
#include <QJsonArray>
#include <QStringList>
#include <QNetworkAccessManager>
#include <QObject>
#include <QTimer>
#include <QWebSocket>
#include <QSet>
#include <chrono>
#include <cstddef>
#include <functional>
#include <memory>
namespace gr { class GraphRunner; }
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
  Q_PROPERTY(QVariantList mergeConflicts READ mergeConflicts NOTIFY stateChanged)
  Q_PROPERTY(bool serverBound READ serverBound NOTIFY stateChanged)
  Q_PROPERTY(bool connected READ connected NOTIFY stateChanged)
public:
  Q_PROPERTY(QVariantList queue READ queue NOTIFY stateChanged)
  QVariantList queue() const;
  // The server's latest `system_stats` sample: cpu_percent, memory_percent and memory_used_gb.
  QVariantMap systemStats() const { return m_systemStats; }
  explicit WorkflowSession(QObject *parent = nullptr);
  ~WorkflowSession() override;
  // Guest bundle for in-process runs, from --guest-bundle. Set it before the
  // first session is created. NODETOOL_GUEST_BUNDLE and a guest.bin or
  // guest.js next to the executable are the fallbacks. NODETOOL_LOCAL_RUNNER=0
  // turns in-process runs off.
  static void setGuestBundlePath(const QString &path);
  // Gives native host jobs of local runs until `deadline` to finish. They run
  // on the graph runner's process lanes, which outlive every runner. Call it
  // once every session, and with the last one the in-process runner, is
  // gone. Returns how many lane threads were still running a job at the
  // deadline. While any is, the caller must not run static destructors and
  // should end the process with std::quick_exit. Later local runs in this
  // process cannot start host jobs.
  static size_t finishLocalRunJobs(std::chrono::steady_clock::time_point deadline);
  // Supported graphs run in this process, with or without a server.
  bool localRunnerReady() const;
  // Whether the in-process runner supports this node's type.
  bool runsLocally(const QJsonObject &node) const;
  bool runsInProcess(const QString &jobId) const { return m_inProcessRuns.contains(jobId); }
  QJsonObject workflow() const;
  // The host invalidates synchronously. Only a snapshot reader serializes.
  void setSnapshotProvider(std::function<QJsonObject()> provider);
  void documentChanged();
  // Emits a pending documentChanged() notification now instead of in its queued turn.
  void flushDocumentNotification();
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
  // Units the local draft kept after an operation-level merge: kind, id, label,
  // reason and remoteDeleted.
  QVariantList mergeConflicts() const { return m_mergeConflicts; }
  // Applies a merged graph to the host document as one undoable edit. Returns
  // false when the document refuses it. Without an applier the session
  // replaces its own snapshot.
  void setGraphApplier(std::function<bool(const QJsonObject &)> applier) { m_graphApplier = std::move(applier); }
  bool serverBound() const { return !m_id.isEmpty() && !m_revision.isEmpty(); }
  void setVersionRestoreBusy(bool busy) { m_saving = busy; emit stateChanged(); if (!busy) { refreshRemoteWorkflow(); } }
  void acknowledgeRestoredVersion(const QJsonObject &response);
  Q_INVOKABLE void flushAutosave();
  // Saves a "Before execution" checkpoint version, then calls done(true). Calls done(false) when
  // the document changed meanwhile, so the caller must not run it. Runs that need no checkpoint
  // (no server binding, no nodes, a conflict, a failed request) call done(true) at once or after the reply.
  void checkpointBeforeRun(std::function<void(bool)> done);
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
  // Plans an edit preview: computed upstream nodes outside nodeIds reuse their
  // current generation (PartialRunPlanner::setPreview). A localOnly preview
  // runs only in process and fails without an error message, as the web's
  // browser preview does.
  QString runPreview(const QJsonObject &snapshot, const QStringList &nodeIds,
                     const QJsonArray &metadata, bool localOnly = false);
  void setNodeMetadata(const QJsonArray &metadata) { m_runMetadata = metadata; }
  void clearGenerations() { m_history.setWorkflow({}); m_generations.clear(); }
  GenerationHistory *generationHistory() { return &m_history; }
  PartialRunPlan lastPartialPlan() const { return m_lastPlan; }
  Q_INVOKABLE void stop(const QString &jobId);
  // Sends a live property change of a node to a run in progress, as the
  // web's update_node_properties command does: a node that reads its
  // properties while it runs uses the values from its next block. Returns
  // false when the run is unknown or finished, or the change was not sent.
  bool updateNodeProperties(const QString &jobId, const QString &nodeId, const QJsonObject &properties);
  Q_INVOKABLE void cancelJob(const QString &jobId);
  Q_INVOKABLE void reconnectRuns();
  // Retries the socket now, like the web's retryNow: a pending wait is cancelled, the attempt count
  // restarts and a session that gave up tries again. Does nothing while a socket is open or opening.
  Q_INVOKABLE void reconnectTransport();
  // How the status bar reads the socket, named as the web does: idle (no server chosen), connecting,
  // connected or offline.
  QString connectionState() const;
  // The text beside the state: "Reconnecting… (attempt N)" while retries continue, "Connection failed"
  // after the session gave up, and nothing otherwise.
  QString connectionDetail() const;
  // Consecutive attempts since the last open socket. Zero while connected.
  int reconnectAttempt() const { return m_reconnectAttempt; }
  // True once the policy's limit or a close code that retrying cannot fix ended the retries.
  bool gaveUp() const { return m_gaveUp; }
  // The schedule of automatic reconnects. The default is the web's.
  void setReconnectPolicy(const ReconnectPolicy &policy) { m_reconnectPolicy = policy; }
  // Static preflight of the stored workflow (POST /api/sdk/v1/preflight). done gets
  // the summary's cost object, or an error. Needs a server-bound workflow.
  void preflightCost(std::function<void(QJsonObject, QString)> done);
signals:
  void workflowChanged();
  void generationsChanged();
  void workflowOpened();
  void catalogChanged();
  void stateChanged();
  void credentialsChanged(QUrl server, QString token, QString userId);
  void errorOccurred(QString message);
  void saveConflict(QString workflowId);
  void saved(QString workflowId);
  void runEvent(QString jobId, QJsonObject event);
  void runSubmitted(QString jobId);
  void systemStatsChanged();
  // An automatic reconnect was queued as attempt number `attempt`, to start after `delayMs`.
  void reconnectScheduled(int attempt, int delayMs);

private:
  QSharedPointer<AccountJobs> m_accountJobs;
  QString planAndSubmit(const QJsonObject &snapshot, const QStringList &nodeIds,
                        const QJsonArray &metadata, const QJsonObject &params, bool preview, bool localOnly);
  QString submitRun(const QJsonObject &snapshot, const QJsonObject &params,
                    const QJsonObject &fullSnapshot, const QJsonArray &metadata,
                    const QStringList &executed, bool localOnly = false);
  void openSocket();
  void socketClosed();
  void scheduleReconnect();
  void clearConflict();
  void submitAutosave(bool checkpoint, std::function<void(bool)> done);
  void externalWorkflowChange(const QJsonObject &event);
  bool mergeRemoteWorkflow(const QJsonObject &remote, const QJsonArray &ops);
  WorkflowAutosave m_autosave;
  std::function<bool(const QJsonObject &)> m_graphApplier;
  QVariantList m_mergeConflicts;
  // Ops from workflow notices since the last comparison. A notice without ops
  // replaces the whole document and so rules out an operation-level merge.
  QJsonArray m_pendingOps;
  bool m_pendingWithoutOps = false;
  QString m_autosaveState = "saved";
  QJsonObject m_remoteWorkflow;
  bool m_conflictPending = false, m_remoteLoading = false, m_remoteAgain = false, m_flushAgain = false;
  // The compared server revision a deferred Keep local applies to.
  QString m_keepLocalRevision;
  void resumeKeepLocal();
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
  // Run events from the server and from the in-process runner.
  void ingestRunEvent(QJsonObject event);
  void receiveLocal(const QString &jobId, const QString &workflowId, const QByteArray &json);
  struct LocalRunRelay;
  std::shared_ptr<gr::GraphRunner> m_localRunner;
  std::shared_ptr<LocalRunRelay> m_localRelay;
  QSet<QString> m_inProcessRuns;
  QNetworkAccessManager m_network;
  QWebSocket m_socket;
  QUrl m_base;
  QString m_token, m_userId, m_id, m_revision;
    std::function<QJsonObject()> m_snapshotProvider;
    mutable QJsonObject m_workflow;
    mutable quint64 m_snapshotEdit = 0;
    bool m_documentNotificationPending = false;
    QJsonObject m_catalog, m_persistedWorkflow;
  QHash<QString, QJsonObject> m_runs;
  quint64 m_queueOrder = 0;
  QVariantMap m_systemStats;
  quint64 m_epoch = 0, m_documentEpoch = 0, m_loadEpoch = 0, m_edit = 0;
  bool m_connected = false, m_dirty = false, m_saving = false;
  bool m_reconnecting = false;
  // Retries run only while a server is chosen and the user has not closed it.
  bool m_autoReconnect = false, m_gaveUp = false, m_opened = false;
  int m_reconnectAttempt = 0;
  ReconnectPolicy m_reconnectPolicy;
  QTimer m_reconnectTimer;
};
} // namespace nodetool::node_editor
