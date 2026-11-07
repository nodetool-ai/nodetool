#pragma once
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QRectF>
#include <QVariantMap>
#include <QVector>
#include <QtNodes/Definitions>
#include <functional>
class QGraphicsView;
class QQmlEngine;
class QQuickWidget;
namespace nodetool {
class WorkflowGraphModel;
class EditorScene;
// One lazily opened Quick editor overlays the active painted property. The
// viewport remains a Graphics View and uses no Quick graphics proxy widgets.
class InlinePropertyPresenter final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantMap descriptor READ descriptor NOTIFY changed)
  Q_PROPERTY(QRectF editorRect READ editorRect NOTIFY geometryChanged)
  Q_PROPERTY(double zoom READ zoom NOTIFY geometryChanged)
  Q_PROPERTY(int generation READ generation NOTIFY changed)
  Q_PROPERTY(bool expanded READ expanded NOTIFY changed)
public:
  InlinePropertyPresenter(WorkflowGraphModel &model, EditorScene &scene,
                          QGraphicsView &view, QQmlEngine *engine,
                          QObject *parent = nullptr);
  ~InlinePropertyPresenter() override;
  QVariantMap descriptor() const { return descriptor_; }
  QRectF editorRect() const { return editorRect_; }
  double zoom() const { return zoom_; }
  int generation() const { return generation_; }
  bool expanded() const { return expanded_; }
  bool active() const { return !descriptor_.isEmpty(); }
  // True while a choice editor's dropdown list is open.
  bool popupOpen() const { return !popupRect_.isEmpty(); }
  QQuickWidget *editorWidget() const;
  std::function<bool(const QString &, const QString &, const QVariant &)> commitProperty;
  // Applies a batch, such as a linked width and height, as one undo step.
  std::function<bool(const QJsonObject &)> commitCommand;
public slots:
  void activate(QtNodes::NodeId id, const QString &name);
  void cancel();
  void reposition();
  void commit(const QVariant &value, int generation);
  // A table, column list or list select applies each change as its own undo
  // step and stays open, as the web's card editors do. close() applies a
  // queued change before closing.
  void apply(const QVariant &value, int generation);
  void close(int generation);
  // The height an open structured editor needs, in card units.
  void setContentHeight(double height);
  void expand();
  void popupRect(const QRectF &rect);
signals:
  void changed();
  void geometryChanged();
  void popupChanged();
protected:
  bool eventFilter(QObject *object, QEvent *event) override;
private:
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QPointer<QQmlEngine> engine_;
  QPointer<QQuickWidget> widget_;
  QVector<QPointer<QQuickWidget>> retiredWidgets_;
  QtNodes::NodeId node_ = QtNodes::InvalidNodeId;
  QString name_;
  QVariantMap descriptor_;
  QRectF editorRect_, popupRect_;
  double zoom_ = 1;
  int generation_ = 0;
  bool expanded_ = false;
  bool committing_ = false;
  QVariant pendingValue_;
  // An applied change re-projects the document. The editor survives it.
  bool holding_ = false;
  bool applyQueued_ = false;
  QVariant pendingApply_;
  double contentHeight_ = 0;
  void flushCommit();
  void flushApply();
  bool current() const;
  void updateMask();
};
}
