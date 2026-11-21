#pragma once
#include "canvas/CanvasStyle.h"
#include "NodeLayout.h"
#include <QString>
#include <functional>
#include <map>
#include <memory>
#include <utility>
class QPainter;
class QColor;
class QRectF;
class QSvgRenderer;
class QTextDocument;

namespace nodetool {
// UI thread only. Caches parsed SVG icon renderers and laid-out rich text
// documents per scene so tiled card paints do not re-parse XML, Markdown or
// syntax highlighting on every tile or zoom settle. Owned by EditorCanvasScene
// and borrowed during synchronous paint calls.
class CanvasIconCache {
public:
  CanvasIconCache();
  ~CanvasIconCache();
  CanvasIconCache(const CanvasIconCache &) = delete;
  CanvasIconCache &operator=(const CanvasIconCache &) = delete;
  QSvgRenderer *material(const QString &name, const QColor &color);
  QSvgRenderer *typeIcon(const QString &key, const QColor &color);
  QTextDocument *textDocument(const QString &key, const std::function<void(QTextDocument &)> &populate);

private:
  std::map<std::pair<QString, QRgb>, std::unique_ptr<QSvgRenderer>> material_;
  std::map<std::pair<QString, QRgb>, std::unique_ptr<QSvgRenderer>> type_;
  std::map<QString, std::unique_ptr<QTextDocument>> textDocs_;
};

// The painted controls of a node card: the canvas twin of the QML controls in
// NodeTool.UiPrimitives. A card row is painted rather than instantiated,
// because a QML item per row costs too much on large graphs. Each control
// reads its colors from CanvasTheme, which is filled from Ui.Theme through the
// presentation map, and its lengths from node_metrics or card_media. A control
// owns its look only. A body decides which control a row uses and where it sits.
//
// Thread affinity: UI thread only. Every function paints into the caller's
// QPainter, borrows its arguments for the call and keeps nothing.

// Paints a Material icon path in a rect and the header type icon the web draws.
void paintCardIcon(QPainter *painter, const QString &typeIcon, const QString &fallback, const QRectF &rect, const QColor &color,
                   CanvasIconCache *icons = nullptr);
void paintMaterialIcon(QPainter *painter, const QString &name, const QRectF &rect, const QColor &color,
                       CanvasIconCache *icons = nullptr);

namespace card_controls {
// Text faces and the alpha scaling shared by the controls.
QFont sans(const CanvasTheme &theme, int pixels, QFont::Weight weight = QFont::Normal);
QFont mono(const CanvasTheme &theme, int pixels);
QColor faded(QColor color, double alpha);

// Ui.TextField surface: a rounded field fill.
void fillField(QPainter *painter, const CanvasTheme &theme, const QRectF &rect);
// Ui.EmptyState (web CheckerDropzone): checker field, icon and message.
void paintPlaceholder(QPainter *painter, const CanvasTheme &theme, const QRectF &rect, const QString &icon, const QString &message,
                      CanvasIconCache *icons = nullptr);
// Ui.Select chevron, at the right edge of a field.
void paintChevron(QPainter *painter, const CanvasTheme &theme, const QRectF &field);
// Ui.TextArea with variable and mention chips: the prompt composer. No Ui twin for the chips.
void paintComposer(QPainter *painter, const CanvasTheme &theme, const NodeRow &row);
// Ui.ToolbarIconButton: a small icon button, tinted and filled when active.
void paintIconButton(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, CanvasIconCache *icons = nullptr);
// Ui.EditorButton: the warning, bare, icon and dashed add-input actions.
void paintAction(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, CanvasIconCache *icons = nullptr);
// The segmented control (review finding F4, not yet in Ui): a mode switch.
void paintSegmented(QPainter *painter, const CanvasTheme &theme, const NodeRow &row);
// Ui.Slider: label, track, snap marks, thumb and value cell.
void paintSlider(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, double value);
// No Ui twin yet: a color button over a checker, with its label.
void paintSwatch(QPainter *painter, const CanvasTheme &theme, const NodeRow &row);
// Ui.TextField and Ui.Select: a labelled field with an optional chevron.
void paintField(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row);
// Ui.ChipMenu with a Ui.Select chevron: the model chip.
void paintModelChip(QPainter *painter, const CanvasTheme &theme, const NodeRow &row);
// Ui.TextArea (read-only): the constant string preview.
void paintTextArea(QPainter *painter, const CanvasTheme &theme, const NodeRow &row);
// No Ui twin: a dashed drop target with a message, or an icon with a hint.
void paintDropZone(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, CanvasIconCache *icons = nullptr);
// Ui.NumberField boxes with Ui.ToolbarIconButton icons: width and height.
void paintImageSize(QPainter *painter, const CanvasTheme &theme, const NodeRow &row, CanvasIconCache *icons = nullptr);
} // namespace card_controls
} // namespace nodetool
