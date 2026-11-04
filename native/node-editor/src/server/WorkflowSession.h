#pragma once
#include <QJsonObject>
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
  Q_PROPERTY(bool connected READ connected NOTIFY stateChanged)
public:
  explicit WorkflowSession(QObject *parent = nullptr);
  QJsonObject workflow() const { return m_workflow; }
  QJsonObject catalog() const { return m_catalog; }
  bool dirty() const { return m_dirty; }
  bool saving() const { return m_saving; }
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
  Q_INVOKABLE void stop(const QString &jobId);
  Q_INVOKABLE void reconnectRuns();
  Q_INVOKABLE void reconnectTransport();
signals:
  void workflowChanged();
  void workflowOpened();
  void catalogChanged();
  void stateChanged();
  void credentialsChanged(QUrl server, QString token);
  void errorOccurred(QString message);
  void saveConflict(QString workflowId);
  void saved(QString workflowId);
  void runEvent(QString jobId, QJsonObject event);
  void runSubmitted(QString jobId);

private:
  using Callback = std::function<void(QJsonObject, int, QString)>;
  void request(const QByteArray &method, const QString &path,
               const QJsonObject &body, Callback callback);
  bool send(const QString &command, const QJsonObject &data);
  void receive(const QByteArray &bytes);
  QNetworkAccessManager m_network;
  QWebSocket m_socket;
  QUrl m_base;
  QString m_token, m_userId, m_id, m_revision;
  QJsonObject m_workflow, m_catalog;
  QHash<QString, QJsonObject> m_runs;
  quint64 m_epoch = 0, m_documentEpoch = 0, m_loadEpoch = 0, m_edit = 0;
  bool m_connected = false, m_dirty = false, m_saving = false;
};
} // namespace nodetool::node_editor
