#pragma once
#include <QColor>
#include <QPainterPath>
#include <QString>
#include <QTimer>
#include <QElapsedTimer>
#include <QHash>
#include <QPointer>
#include <QJsonObject>
#include <QtNodes/BasicGraphicsScene>

namespace nodetool {
class WorkflowGraphModel;

// Colors and font families the canvas receives from Qt Quick. The web's node
// background, canvas grid, and translucent controls are native-editor roles.
struct CanvasTheme {
  QColor canvas{"#08090a"};
  QColor grid{"#1f2126"};
  QColor node{"#0d0e10"};
  QColor reroutePaper{"#101113"};
  QColor rerouteBorder{"#808590"};
  QColor divider{0xff, 0xff, 0xff, 0x14};
  QColor field{0xff, 0xff, 0xff, 0x08};
  QColor textPrimary{"#f7f8f8"};
  QColor textSecondary{"#8a8f98"};
  QColor checker{0xff, 0xff, 0xff, 0x06};
    QColor subgraphAccent{"#7C3AED"};
  QColor primary{"#3d68a8"};
  QColor selectionShadow{0, 0, 0, 77};
  QString sansFamily{"Inter"};
};

// The curve of a wire. Painting, hit testing, and the bounds margin all use it.
double groupLabelScale(double zoom);
// The running ring's conic start angle in CSS degrees after elapsedMs: 90 to
// 450 over MOTION.pulse (2s ease-in-out), as runningGradientAnimation.
double runningRingAngle(qint64 elapsedMs);
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
  // Reduced motion holds the ring at its first frame, as the web does.
  double runningAngle() const { return animation_.isActive() ? runningRingAngle(clock_.elapsed()) : 90; }
  bool animationActive() const { return animation_.isActive(); }
  QRectF groupLabelRect(QtNodes::NodeId id, double zoom);
  QString reconnectingEdgeId() const { return reconnectEdge_.value("id").toString(); }
  void resetDraftConnection();

signals:
    void outputFormRequested(const QString &id);
    void childOpenRequested(const QString &id);
  void canvasContextMenuRequested(const QString &nodeId, const QPoint &screenPosition);
  void dataEdgeContextMenuRequested(const QString &edgeId, const QPointF &scenePosition, const QPoint &screenPosition);
  void reconnectRequested(const QString &id, const QJsonObject &connection);
  void reconnectDiscarded(const QString &id);
  void titleEditRequested(QtNodes::NodeId id);
  void inlineEditRequested(QtNodes::NodeId id, const QString &name);
  void looseWireDropped(QtNodes::NodeId node, QtNodes::PortType port,
                        QtNodes::PortIndex index, const QPointF &position);
  void wireBodyDropped(QtNodes::NodeId node, QtNodes::PortType port,
                       QtNodes::PortIndex index, QtNodes::NodeId target,
                       const QPointF &position);

protected:
  void contextMenuEvent(QGraphicsSceneContextMenuEvent *event) override;
  void mouseDoubleClickEvent(QGraphicsSceneMouseEvent *event) override;
  void mousePressEvent(QGraphicsSceneMouseEvent *event) override;
  void mouseReleaseEvent(QGraphicsSceneMouseEvent *event) override;
  void keyPressEvent(QKeyEvent *event) override;
  void focusOutEvent(QFocusEvent *event) override;
  void mouseMoveEvent(QGraphicsSceneMouseEvent *event) override;
  void drawBackground(QPainter *painter, const QRectF &rect) override;
  void drawForeground(QPainter *painter, const QRectF &rect) override;

private:
  WorkflowGraphModel &model_;
  CanvasTheme theme_;
  QTimer animation_;
  QElapsedTimer clock_;
  double phase_ = 0;
  bool reducedMotion_ = false;
    bool outputFormPress_ = false;
    QtNodes::NodeId footerPress_ = QtNodes::InvalidNodeId;
    QtNodes::NodeId footerHover_ = QtNodes::InvalidNodeId;
  bool inlinePress_ = false;
  bool wireReconnect_ = false;
  QJsonObject reconnectEdge_;
  QtNodes::PortType reconnectSide_ = QtNodes::PortType::None;
  QPointer<QObject> reconnectWire_;
  bool beginReconnect(QtNodes::ConnectionId connection, QtNodes::PortType side);
  void refreshRuntime();
  void restoreGroupOrder();
  void cancelGesture();
  enum class Gesture { None, Label, Resize };
  Gesture gesture_ = Gesture::None;
  QtNodes::NodeId gestureNode_ = QtNodes::InvalidNodeId;
  QPointF gestureOrigin_;
  QRectF gestureBounds_;
  QJsonObject gestureUi_;
  QHash<QtNodes::NodeId, QPointF> gesturePositions_;
  QVector<QtNodes::NodeId> gestureSelected_;
  Qt::Edges resizeEdges_;
  QSize minimumSize_;
  double eventZoom(const QGraphicsSceneMouseEvent *event) const;
};
} // namespace nodetool
