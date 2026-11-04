#pragma once
#include <QColor>
#include <QPainterPath>
#include <QString>
#include <QTimer>
#include <QtNodes/BasicGraphicsScene>

namespace nodetool {
class WorkflowGraphModel;

// Colors and font families the canvas receives from Qt Quick. The web's node
// background, canvas grid, and translucent controls are native-editor roles.
struct CanvasTheme {
  QColor canvas{"#08090a"};
  QColor grid{"#1f2126"};
  QColor node{"#0d0e10"};
  QColor divider{0xff, 0xff, 0xff, 0x14};
  QColor field{0xff, 0xff, 0xff, 0x08};
  QColor textPrimary{"#f7f8f8"};
  QColor textSecondary{"#8a8f98"};
  QColor checker{0xff, 0xff, 0xff, 0x06};
  QColor primary{"#3d68a8"};
  QColor selectionShadow{0, 0, 0, 77};
  QString sansFamily{"Inter"};
};

// The curve of a wire. Painting, hit testing, and the bounds margin all use it.
QPainterPath wireCurve(const QPointF &out, const QPointF &in);

// Installs the web editor's node card, typed wires, and canvas grid through the
// QtNodes geometry and painter extension points. QtNodes owns items and input.
class EditorScene final : public QtNodes::BasicGraphicsScene {
  Q_OBJECT
public:
  EditorScene(WorkflowGraphModel &model, QObject *parent = nullptr);
  const CanvasTheme &theme() const { return theme_; }
  void setTheme(const CanvasTheme &theme);
  void setReducedMotion(bool reduced);
  double animationPhase() const { return phase_; }
  bool animationActive() const { return animation_.isActive(); }

protected:
  void drawBackground(QPainter *painter, const QRectF &rect) override;
  void drawForeground(QPainter *painter, const QRectF &rect) override;

private:
  WorkflowGraphModel &model_;
  CanvasTheme theme_;
  QTimer animation_;
  double phase_ = 0;
  bool reducedMotion_ = false;
  void refreshRuntime();
};
} // namespace nodetool
