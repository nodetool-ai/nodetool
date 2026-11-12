#pragma once
#include <QObject>
#include <QHash>
#include <QPointer>
#include <QRectF>
#include <QVector>
#include <QtNodes/Definitions>
#include <functional>
class QGraphicsView;
class QGraphicsObject;
class QQmlEngine;
class QQuickWidget;
namespace nodetool {
namespace node_editor { class WorkflowDocument; }
class WorkflowGraphModel;
class EditorScene;
class InlineTitlePresenter final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QString text READ text NOTIFY changed)
  Q_PROPERTY(bool group READ group NOTIFY changed)
  Q_PROPERTY(bool reroute READ reroute NOTIFY changed)
  Q_PROPERTY(bool comment READ comment NOTIFY changed)
  Q_PROPERTY(bool header READ header NOTIFY changed)
  Q_PROPERTY(bool singleLine READ singleLine NOTIFY changed)
  Q_PROPERTY(QRectF editorRect READ editorRect NOTIFY geometryChanged)
  Q_PROPERTY(double zoom READ zoom NOTIFY geometryChanged)
  Q_PROPERTY(int generation READ generation NOTIFY changed)
public:
  InlineTitlePresenter(WorkflowGraphModel &, EditorScene &, QGraphicsView &, QQmlEngine *, QObject *parent = nullptr);
  ~InlineTitlePresenter() override;
  QString text() const { return text_; }
  bool group() const { return group_; }
  bool reroute() const { return reroute_; }
  // A comment's text edits in place over the card. A Code node's header title
  // edits in a single line over the header.
  bool comment() const { return comment_; }
  bool header() const { return header_; }
  bool singleLine() const { return group_ || reroute_ || header_; }
  QRectF editorRect() const { return rect_; }
  double zoom() const { return zoom_; }
  int generation() const { return generation_; }
    void validateDocument(const node_editor::WorkflowDocument &document);
  bool active() const { return node_ != QtNodes::InvalidNodeId; }
  std::function<bool(const QString &, const QString &)> commitTitle;
  std::function<QRectF()> availableViewport;
public slots:
  void activate(QtNodes::NodeId);
  void cancel();
  void refresh();
  void reposition();
  void clearControls();
  void commit(const QString &text, int token);
  void setEditorHeight(double logicalHeight, int token);
signals:
  void changed();
  void geometryChanged();
  void activated();
protected:
  bool eventFilter(QObject *, QEvent *) override;
private:
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QPointer<QQmlEngine> engine_;
  QPointer<QQuickWidget> widget_;
  QVector<QPointer<QQuickWidget>> retired_;
  QHash<QtNodes::NodeId, QPointer<QGraphicsObject>> notes_;
  QHash<QtNodes::NodeId, QPointer<QQuickWidget>> controls_;
  void repositionControls();
  QtNodes::NodeId node_ = QtNodes::InvalidNodeId;
  QString text_;
  bool group_ = false, reroute_ = false, comment_ = false, header_ = false, committing_ = false;
  QString pending_;
  QRectF rect_;
  double zoom_ = 1, requestedHeight_ = 100;
  int generation_ = 0;
  bool current() const;
  void clearNotes();
  void flush();
};
}
