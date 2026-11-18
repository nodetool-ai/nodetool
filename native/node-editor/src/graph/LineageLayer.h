#pragma once
#include <QColor>
#include <QFont>
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QPainterPath>
#include <QPointer>
#include <QRectF>
#include <QSet>
#include <QStringList>

#include <functional>
#include <map>
#include <memory>

class QGraphicsScene;
class QGraphicsItem;

namespace nodetool {
class CanvasSurface;
class WorkflowGraphModel;
}
namespace nodetool::canvas {
class CanvasScene;
}
namespace nodetool::node_editor {
enum class LineageSide { Left, Right, Top, Bottom };
struct LineageAnchors {
  QPointF source, target;
  LineageSide sourceSide = LineageSide::Right, targetSide = LineageSide::Left;
};
struct LineageTheme {
  QColor stroke{"#8a8f98"};
  QColor selected{"#3d68a8"};
  QFont labelFont;
};
[[nodiscard]] LineageAnchors lineageAnchors(const QRectF &source,
                                            const QRectF &target);
[[nodiscard]] QPainterPath lineageCurve(const QRectF &source,
                                        const QRectF &target);

// Scene-space overlay for graph.links only. No ports, data edges or execution
// model access. Refresh absolute geometry after node/group motion; view
// transforms supply zoom. Nodes and normal wires remain above the link hit
// targets.
// UI thread only. On the QtNodes canvas the attached QGraphicsScene owns the
// link items. On the Quick canvas the layer owns its canvas::LineageItem
// links through std::unique_ptr, and the scene borrows them.
class LineageLayer final : public QObject {
  Q_OBJECT
public:
  explicit LineageLayer(QGraphicsScene &scene, QObject *parent = nullptr);
  explicit LineageLayer(canvas::CanvasScene &scene, QObject *parent = nullptr);
  ~LineageLayer() override;
  // Atomic validation. Missing measurements hide that link until a later
  // update.
  [[nodiscard]] QString update(const QJsonObject &graph,
                               const QHash<QString, QRectF> &absoluteGeometry);
  [[nodiscard]] QString update(const QJsonObject &graph, const WorkflowGraphModel &model,
                               const CanvasSurface &canvas);
  static bool isLinkItem(const QGraphicsItem *item);
  void setTheme(const LineageTheme &theme);
  void setSelectedLinkIds(const QStringList &ids);
  [[nodiscard]] QStringList selectedLinkIds() const;
  [[nodiscard]] QPainterPath linkPath(const QString &id) const;
  // The link's item on either canvas, or null.
  [[nodiscard]] QObject *linkItem(const QString &id) const;
  // UI thread only. One link's item on whichever canvas the layer draws on.
  class Link {
  public:
    virtual ~Link() = default;
    virtual void updateGeometry(QPainterPath path, QString label, const LineageTheme &theme, bool selected) = 0;
    virtual void setLinkSelected(bool selected) = 0;
    virtual QPainterPath path() const = 0;
    virtual QString label() const = 0;
    virtual QObject *object() const = 0;
  };
signals:
  // Host clears other selections on a non-additive request and applies
  // removeLink on deletion. Signals never edit the document themselves.
  void selectionRequested(const QString &id, bool additive);
  void deleteRequested(const QString &id);
  void contextMenuRequested(const QString &id, const QPoint &screenPosition);

private:
  std::unique_ptr<Link> createLink(const QString &id);
  QPointer<QGraphicsScene> scene_;
  // The Quick canvas's scene, and the factory its constructor sets
  // (canvas/LineageItem.cpp), so that this file needs no Qt Quick.
  QPointer<QObject> quickScene_;
  std::function<std::unique_ptr<Link>(const QString &)> quickLink_;
  bool quick_ = false;
  std::map<QString, std::unique_ptr<Link>> items_;
  QSet<QString> known_, selected_;
  LineageTheme theme_;
};
} // namespace nodetool::node_editor
