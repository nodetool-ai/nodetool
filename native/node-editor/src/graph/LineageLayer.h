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

class QGraphicsObject;
class QGraphicsScene;
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
class LineageLayer final : public QObject {
  Q_OBJECT
public:
  explicit LineageLayer(QGraphicsScene &scene, QObject *parent = nullptr);
  ~LineageLayer() override;
  // Atomic validation. Missing measurements hide that link until a later
  // update.
  [[nodiscard]] QString update(const QJsonObject &graph,
                               const QHash<QString, QRectF> &absoluteGeometry);
  void setTheme(const LineageTheme &theme);
  void setSelectedLinkIds(const QStringList &ids);
  [[nodiscard]] QStringList selectedLinkIds() const;
  [[nodiscard]] QPainterPath linkPath(const QString &id) const;
  [[nodiscard]] QGraphicsObject *linkItem(const QString &id) const;
signals:
  // Host clears other selections on a non-additive request and applies
  // removeLink on deletion. Signals never edit the document themselves.
  void selectionRequested(const QString &id, bool additive);
  void deleteRequested(const QString &id);
  void contextMenuRequested(const QString &id, const QPoint &screenPosition);

private:
  QPointer<QGraphicsScene> scene_;
  QHash<QString, QPointer<QGraphicsObject>> items_;
  QSet<QString> known_, selected_;
  LineageTheme theme_;
};
} // namespace nodetool::node_editor
