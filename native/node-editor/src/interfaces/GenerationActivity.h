#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QSet>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>

namespace nodetool::node_editor {

// The Generations panel's list (GenerationsPanel.qml): every image, video and
// audio generation the account ran, from any workflow, with the running ones
// first. Port of web/src/stores/GenerationActivityStore.ts and the prediction
// half of useGenerationActivityTracking.ts.
//
// Two feeds fill it. The owner passes each `prediction` message a session
// receives to ingestPrediction, and the server's generations.list page to
// replaceHistory, which takes the place of the web's browser storage. The
// panel's requests go up as *Requested signals, so a test can use a plain
// instance and a QSignalSpy. The root editor window owns one instance for
// every tab, and QML gets a non-owning pointer through a required property.
//
// UI thread only.
class GenerationActivity : public QObject {
  Q_OBJECT
  // One map per generation, in panel order: id, status (generating,
  // generated, failed or cancelled), kind (image, video, audio or other),
  // title, meta, error, assetId, workflowId, startedAt, endedAt,
  // canOpenSource and canOpenAsWorkflow.
  Q_PROPERTY(QVariantList rows READ rows NOTIFY rowsChanged)
  // all, generating and failed, as the panel's filter chips count them.
  Q_PROPERTY(QVariantMap counts READ counts NOTIFY rowsChanged)
  Q_PROPERTY(bool loading READ loading NOTIFY loadingChanged)
  Q_PROPERTY(QString error READ error NOTIFY loadingChanged)
public:
  // GENERATION_HISTORY_LIMIT: finished generations kept. Running ones stay.
  static constexpr int historyLimit = 60;

  explicit GenerationActivity(QObject *parent = nullptr);
  ~GenerationActivity() override;

  QVariantList rows() const;
  QVariantMap counts() const;
  bool loading() const { return loading_; }
  QString error() const { return error_; }

  // A `prediction` message. Only media capabilities are listed, and a
  // settled message for an unknown id is ignored, as on the web.
  void ingestPrediction(const QJsonObject &message, qint64 now);
  // The generations.list records, newest first. A record settles the
  // matching live generation, and a finished one the panel has not seen is
  // added to the history.
  void replaceHistory(const QJsonArray &records, qint64 now);
  void setLoading(bool loading, const QString &error = {});
  // Workflow names by id, for the tiles' source line.
  void setWorkflowNames(const QHash<QString, QString> &names);

  Q_INVOKABLE void refresh() { emit refreshRequested(); }
  // Drops every finished generation until the next history page brings it back.
  Q_INVOKABLE void clearFinished();
  Q_INVOKABLE void openSource(const QString &id);
  Q_INVOKABLE void openAsWorkflow(const QString &id);

signals:
  void rowsChanged();
  void loadingChanged();
  void refreshRequested();
  void openSourceRequested(const QString &workflowId);
  // A workflow document ({name, graph}) to open in a new tab.
  void openAsWorkflowRequested(const QJsonObject &workflow);
  void errorOccurred(const QString &message);

private:
  struct Entry {
    QString id, status, kind, prompt, model, provider, capability, workflowId, error;
    QStringList assetIds, presetIds;
    QJsonObject params;
    qint64 startedAt = 0, endedAt = 0;
    // Set by a live prediction: the request the web records for Open as workflow.
    bool recorded = false;
  };
  QList<const Entry *> ordered() const;
  QString sourceTitle(const Entry &entry) const;
  void prune();
  QHash<QString, Entry> entries_;
  QSet<QString> cleared_;
  QHash<QString, QString> workflowNames_;
  bool loading_ = false;
  QString error_;
};

}  // namespace nodetool::node_editor
