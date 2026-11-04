#pragma once
#include <QColor>
#include <QSize>
#include <QString>
#include <QVector>

namespace nodetool {
// Measurements from web/src/components/node and web/src/styles. The native
// painter and the visual comparison both read them from here.
namespace node_metrics {
inline constexpr int defaultWidth = 280;
inline constexpr int radius = 8;
inline constexpr int borderWidth = 1;
inline constexpr int padding = 8;
inline constexpr int micro = 2;
inline constexpr int headerHeight = 24;
inline constexpr int titleOffset = 28;
inline constexpr int contentTop = 37;
inline constexpr int rowHeight = 18;
inline constexpr int handleRowStep = 28;
inline constexpr int inlineRowGap = 6;
inline constexpr int fieldHeight = 29;
inline constexpr int multilineFieldHeight = 65;
inline constexpr int previewHeight = 80;
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
  QString value;
  QString typeName;
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
  QString title;
  QString icon;
  QColor accent;
  bool unknown = false;
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
