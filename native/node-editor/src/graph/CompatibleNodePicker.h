#pragma once
#include <QObject>
#include <QPointer>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointF>
#include <QVariantList>
#include <QVector>
#include <QtNodes/Definitions>
#include <functional>
class QGraphicsView;
class QQmlEngine;
class QQuickWidget;
namespace nodetool {
class WorkflowGraphModel;
class EditorScene;
// A loose-wire choice produces one canonical add-node/add-edge document batch.
class CompatibleNodePicker final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
  Q_PROPERTY(QString query READ query NOTIFY changed)
  Q_PROPERTY(QString title READ title NOTIFY changed)
  Q_PROPERTY(bool active READ active NOTIFY changed)
  Q_PROPERTY(int generation READ generation NOTIFY changed)
  // A dynamic output's menu also deletes it (web OutputContextMenu.tsx:93-124, :622-630).
  Q_PROPERTY(bool canDeleteOutput READ canDeleteOutput NOTIFY changed)
public:
  CompatibleNodePicker(WorkflowGraphModel &model, EditorScene &scene,
                       QGraphicsView &view, QQmlEngine *engine,
                       QObject *parent = nullptr);
  ~CompatibleNodePicker() override;
  void setCatalog(const QJsonArray &catalog);
  QVariantList rows() const;
  QString query() const { return query_; }
  QString title() const;
  int generation() const { return generation_; }
  void choose(const QString &key) { choose(key, generation_); }
  bool active() const { return active_; }
  bool canDeleteOutput() const;
  QQuickWidget *widget() const;
  // Create `type` beside `source`'s output and wire the output into `targetPort` as one document step.
  bool addConnected(QtNodes::NodeId source, const QString &outputName, const QString &type, const QString &targetPort);
  std::function<bool(const QJsonObject &)> applyCommand;
public slots:
  void open(QtNodes::NodeId node, QtNodes::PortType port,
            QtNodes::PortIndex index, const QPointF &position);
  void openBody(QtNodes::NodeId node, QtNodes::PortType port,
                QtNodes::PortIndex index, QtNodes::NodeId target,
                const QPointF &position);
  void setQuery(const QString &query);
  void choose(const QString &key, int generation);
  void search(const QString &query, int generation);
  void dismiss(int generation);
  void deleteOutput(int generation);
  void cancel();
signals:
  void changed();
  void nodeCreated(const QString &id);
protected:
  bool eventFilter(QObject *object, QEvent *event) override;
private:
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QPointer<QQmlEngine> engine_;
  QPointer<QQuickWidget> widget_;
  QVector<QPointer<QQuickWidget>> retired_;
  QJsonArray catalog_;
  QVariantList candidates_;
  QString query_, resource_, handle_;
  QtNodes::NodeId node_ = QtNodes::InvalidNodeId;
  QtNodes::PortType port_ = QtNodes::PortType::None;
  QtNodes::PortIndex index_ = 0;
  QJsonObject type_;
  QPointF position_;
  bool active_ = false;
  int generation_ = 0;
  QtNodes::NodeId body_ = QtNodes::InvalidNodeId;
  QString bodyResource_;
  bool initialize(QtNodes::NodeId node, QtNodes::PortType port,
                  QtNodes::PortIndex index, const QPointF &position);
  void showWidget();
  void applyBody(const QString &port, const QJsonArray &prefix = {},
                 const QJsonObject &sourceTypeOverride = {}, bool newDynamicInput = false);
  bool current() const;
  QJsonObject connectCommand(const QJsonObject &metadata, bool forward, const QString &resource, const QString &handle,
                             const QString &port, const QPointF &position, QString &id) const;
  bool owns(QObject *object) const;
  void positionWidget();
};
}
