#pragma once
#include <QColor>
#include <QSize>
#include <QRectF>
#include <QString>
#include <QVector>

namespace nodetool {
// Measurements from web/src/components/node and web/src/styles. The native
// painter and the visual comparison both read them from here.
namespace node_metrics {
inline constexpr int defaultWidth = 280;
inline constexpr int rerouteWidth = 60;
inline constexpr int rerouteHeight = 20;
inline constexpr int rerouteLabelGap = 6;
inline constexpr int radius = 8;
inline constexpr int borderWidth = 1;
inline constexpr int padding = 8;
inline constexpr int micro = 2;
inline constexpr int headerHeight = 24;
inline constexpr int titleOffset = 28;
inline constexpr int disabledBadgeWidth = 70;
// web/src/styles/nodes.states.css bypassed card and edge opacity.
inline constexpr double disabledOpacity = 0.8;
inline constexpr double disabledWireOpacity = 0.5;
inline constexpr int contentTop = 37;
inline constexpr int rowHeight = 18;
inline constexpr int handleRowStep = 28;
inline constexpr int inlineRowGap = 6;
inline constexpr int fieldHeight = 29;
inline constexpr int multilineFieldHeight = 65;
inline constexpr int previewHeight = 80;
inline constexpr int playbackHeight = 180;
inline constexpr int fieldRadius = 6;
inline constexpr double handleDiameter = 12;
inline constexpr double handleRing = 2;
inline constexpr double wireWidth = 1.5;
inline constexpr double wireSelectedWidth = 2;
inline constexpr double wireHoverWidth = 4;
inline constexpr double wireGlowWidth = 6;
inline constexpr double wireOpacity = 0.5;
inline constexpr double wireGlowOpacity = 0.25;
inline constexpr double wireHitWidth = 10;
// The longest control offset QtNodes' fixed connection bounds can contain.
inline constexpr double wireMaxReverseOffset = 200;
// QtNodes grows connection bounds by its PointDiameter setting. This covers the
// hit stroke plus the short reverse wires whose offset exceeds its control points.
inline constexpr double wireBoundsMargin = 16;
inline constexpr double gridGap = 25;
inline constexpr double gridCross = 3;
inline constexpr int fontTitle = 13;
inline constexpr int fontLabel = 13;
inline constexpr int fontValue = 11;
} // namespace node_metrics

enum class NodeRowKind { Handle, Label, Field, Multiline, Number, Toggle, Preview };

struct NodeRow {
  NodeRowKind kind = NodeRowKind::Label;
  QString label;
  QString propertyName;
  QString value;
  QString typeName;
  bool conditionalUnavailable = false;
  bool placeholder = false;
  bool checked = false;
  bool choice = false;
  bool bare = false;
  double y = 0;
  double height = 0;
  double fieldY = 0;
  int port = -1;
};

struct NodeLayout {
  QSize size{node_metrics::defaultWidth, 72};
  QSize minimumSize{150, 40};
  QString title;
  QString icon;
  QColor accent;
  // The running ring's conic stops: output then property type colors, five
  // entries, as getNodeColors in web/src/components/node/BaseNode.tsx.
  QVector<QColor> runningColors;
  bool unknown = false;
    bool subgraph = false;
    bool addOutput = false;
    bool runningProgress = false;
    QRectF outputFormRect() const { return QRectF(node_metrics::padding, footerRect().y() - node_metrics::handleRowStep * (runningProgress ? 2 : 1), size.width() - 2 * node_metrics::padding, node_metrics::handleRowStep); }
    QString childCount;
    QRectF footerRect() const { return QRectF(0, size.height() - node_metrics::handleRowStep, size.width(), node_metrics::handleRowStep); }
  QVector<NodeRow> rows;
  QVector<double> inputY;
  QVector<double> outputY;
};

// Port colors from web/src/config/data_types.ts.
QColor typeColor(const QString &type);
QString typeIcon(const QString &type);
QString iconPath(const QString &name);
// "first_name" becomes "First name", as the web's property labels do.
QString displayName(const QString &name);
} // namespace nodetool
