#pragma once
#include "../properties/AssetPickerController.h"
#include <QHash>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QPointer>
#include <QPointF>
#include <QVariantList>
#include <functional>
class QGraphicsView;
class QMimeData;
namespace nodetool {
class WorkflowGraphModel;
class CanvasDropController final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList transfers READ transfers NOTIFY changed)
public:
  CanvasDropController(WorkflowGraphModel &, QGraphicsView &, QObject *parent = nullptr);
  ~CanvasDropController() override;
  QVariantList transfers() const;
  void configure(const QUrl &origin, const QString &token, const QString &userId);
  void setCatalog(const QJsonArray &metadata);
  void setWorkflowId(const QString &serverWorkflowId);
  std::function<bool(const QJsonObject &)> applyCommand;
  std::function<QJsonObject(const QJsonObject &, const QPointF &, const QJsonObject &)> createNode;
public slots:
  void cancel(const QString &key);
  void retry(const QString &key);
  void cancelAll();
signals:
  void changed();
  void errorOccurred(QString message);
  void nodeCreated(QString id);
protected:
  bool eventFilter(QObject *, QEvent *) override;
private:
  struct Transfer {
    QString key, name, kind, assetId, state, error;
    QUrl file;
    QPointF position;
    QJsonValue value;
    bool hasValue = false;
    qint64 sent = 0, total = 0;
    quint64 serial = 0;
  };
  WorkflowGraphModel &model_;
  QGraphicsView &view_;
  node_editor::AssetPickerController uploader_;
  QNetworkAccessManager network_;
  QUrl origin_;
  QString token_, user_, workflow_;
  QHash<QString, QJsonObject> catalog_;
  QHash<QString, Transfer> transfers_;
  QStringList order_;
  QHash<QString, QPointer<QNetworkReply>> replies_;
  quint64 epoch_ = 0, nextSerial_ = 0;
  void fail(const QString &, const QString &);
  void start(const QString &);
  void fetchAsset(const QString &);
  void downloadText(const QString &, const QUrl &);
  void finish(const QString &, const QJsonValue &);
  bool accepts(const QMimeData *) const;
  void drop(const QMimeData *, const QPointF &);
};
}
