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
  // A click on a card's media drop zone asks for a file of that kind, as the
  // web dropzone input does. Returns a local path, or empty when cancelled.
  std::function<QString(const QString &kind)> chooseFile;
public slots:
  void cancel(const QString &key);
  void retry(const QString &key);
  void cancelAll();
signals:
  void changed();
  void errorOccurred(QString message);
  void nodeCreated(QString id);
  void workflowFileDropped(QString path);
  // The Copy action of a loaded image on a card.
  void copyRequested(QString node, QString property);
protected:
  bool eventFilter(QObject *, QEvent *) override;
private:
  struct Transfer {
    QString key, name, kind, assetId, state, error;
    // A drop on a card's media drop zone sets that property instead of adding a node.
    QString targetNode, targetProperty, targetKind;
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
  // The node, property and media type of the drop zone under a viewport point.
  QStringList dropZone(const QPoint &viewportPosition) const;
  // The drop zone a click acts on, with "pick" or "copy" as its fourth entry.
  QStringList clickZone(const QPoint &viewportPosition) const;
  void drop(const QMimeData *, const QPointF &, const QStringList &zone);
  // Asks for a file for the drop zone clicked at a viewport point, then uploads it as a drop.
  void pickFile(const QStringList &zone, const QPoint &viewportPosition);
  QStringList pressZone_;
  QPoint pressPoint_;
};
}
