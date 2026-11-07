#pragma once
#include "PartialRunPlanner.h"
#include <QNetworkAccessManager>
#include <QObject>
#include <QVariantList>
#include <functional>
namespace nodetool::node_editor {
// Authenticated durable assets are execution data. Downloads never use the
// display/media preview cache or capped metadata.text.
class GenerationHistory final : public QObject {
  Q_OBJECT
  Q_PROPERTY(bool loading READ loading NOTIFY changed)
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
public:
  explicit GenerationHistory(ExecutionGenerationStore *store, QObject *parent = nullptr);
  ~GenerationHistory() override;
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  void setWorkflow(const QJsonObject &snapshot);
  void selectNode(const QString &nodeId);
  Q_INVOKABLE void refresh();
  bool loading() const { return loading_; }
  QString error() const { return error_; }
  QVariantList rows() const;
  bool contains(const QString &nodeId, const QString &generationId) const;
  QJsonObject outputs(const QString &nodeId, const QString &generationId) const;
  void liveChanged();
signals:
  void changed();
private:
  void cancel();
  void fail(const QString &message);
  void fetch(const QUrl &url, quint64 epoch, std::function<void(QByteArray)> done);
  void hydrateNext(quint64 epoch);
  void finishAsset(const QJsonObject &asset, const QJsonObject &outputs, quint64 epoch);
  ExecutionGenerationStore *store_;
  QNetworkAccessManager network_;
  QUrl origin_;
  QString token_, user_, workflow_, selectedNode_, error_;
  QSet<QString> nodeIds_;
  QJsonArray pending_;
  ExecutionGenerations hydrated_;
  quint64 epoch_ = 0;
  qsizetype bytes_ = 0;
  bool loading_ = false;
};
}
