#pragma once
#include <QHash>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QObject>
#include <QUrl>

namespace nodetool::node_editor {
// Saved assets of a Preview source's last job, so a Preview keeps its value after a reload
// (web useNodeResultHistory lastJobAssets and assetsToPreviewValue).
class PreviewSourceAssets final : public QObject {
  Q_OBJECT
public:
  struct Wire { QString source; QString handle; };
  explicit PreviewSourceAssets(QObject *parent = nullptr);
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  // Lists the saved assets of each wired source once per workflow and source node.
  void request(const QString &workflowId, const QHash<QString, Wire> &previews);
  // The value each Preview shows, keyed by Preview node id. Previews without saved assets are absent.
  QHash<QString, QJsonValue> values() const;
  // The assets of the most recent job, narrowed to one output handle when the assets name their handles.
  static QJsonValue previewValue(const QJsonArray &assets, const QString &outputName);
signals:
  void changed();
private:
  void fetch(const QString &source, quint64 epoch);
  QNetworkAccessManager network_;
  QUrl origin_;
  QString token_, user_, workflow_;
  quint64 epoch_ = 0;
  QHash<QString, Wire> previews_;
  QHash<QString, QJsonArray> assets_;
  QSet<QString> requested_;
};
}
