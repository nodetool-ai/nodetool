#pragma once

#include "canvas/CanvasInteraction.h"
#include <qtnodes/Definitions.hpp>

class QObject;

namespace QtNodes {
class AbstractGraphModel;
class AbstractNodeGeometry;
}

namespace nodetool {
struct CanvasTheme;

// UI thread only. What the editor needs from a canvas scene, whichever canvas
// draws it: the QtNodes scene (EditorScene) or the Quick scene
// (canvas::EditorCanvasScene). Gesture signals live on interaction().
class EditorSceneApi {
public:
  using HandleHover = canvas::CanvasInteraction::HandleHover;
  using DragOutcome = canvas::CanvasInteraction::DragOutcome;
  virtual ~EditorSceneApi() = default;

  // The object to block with QSignalBlocker to hold back the scene's
  // selection notifications for a batch: the QGraphicsScene itself, or the
  // Quick scene's selection gate.
  virtual QObject &sceneObject() = 0;
  virtual canvas::CanvasInteraction &interaction() = 0;
  virtual const canvas::CanvasInteraction &interaction() const = 0;
  virtual QtNodes::AbstractGraphModel &graphModel() = 0;
  virtual const QtNodes::AbstractGraphModel &graphModel() const = 0;
  virtual QtNodes::AbstractNodeGeometry &nodeGeometry() = 0;
  virtual const QtNodes::AbstractNodeGeometry &nodeGeometry() const = 0;
  virtual const CanvasTheme &theme() const = 0;
  virtual void setTheme(const CanvasTheme &theme) = 0;
  virtual void setReducedMotion(bool reduced) = 0;
  virtual double animationPhase() const = 0;
  // Reduced motion holds the ring at its first frame, as the web does.
  virtual double runningAngle() const = 0;
  virtual bool animationActive() const = 0;
  virtual bool branchDimmed(QtNodes::NodeId id) const = 0;
  // The card height that fits a comment's Markdown at a card width: the text,
  // the 16 px above and below it, and 2 px of slack as CommentNode.tsx adds.
  virtual double commentContentHeight(const QString &markdown, double cardWidth) const = 0;
  virtual void clearSelection() = 0;
  virtual void resetDraftConnection() = 0;

  QRectF groupLabelRect(QtNodes::NodeId id, double zoom) const { return interaction().groupLabelRect(id, zoom); }
  DragOutcome takeDragOutcome() { return interaction().takeDragOutcome(); }
  HandleHover draftEnd() const { return interaction().draftEnd(); }
  int handleConnectable(QtNodes::NodeId node, QtNodes::PortType side, QtNodes::PortIndex index) const {
    return interaction().handleConnectable(node, side, index);
  }
  bool groupTakesPointer(QtNodes::NodeId id) const { return interaction().groupTakesPointer(id); }
  double groupOpacity(QtNodes::NodeId id) const { return interaction().groupOpacity(id); }
  bool dropHintVisible() const { return interaction().dropHintVisible(); }
  void keepEnclosedGroups(const QRectF &area) { interaction().keepEnclosedGroups(area); }
  void setAltHeld(bool held) { interaction().setAltHeld(held); }
  QString reconnectingEdgeId() const { return interaction().reconnectingEdgeId(); }
  QtNodes::NodeId sliderDraftNode() const { return interaction().sliderDraftNode(); }
  QString sliderDraftProperty() const { return interaction().sliderDraftProperty(); }
  double sliderDraftValue() const { return interaction().sliderDraftValue(); }
  QtNodes::NodeId cropDraftNode() const { return interaction().cropDraftNode(); }
  QtNodes::NodeId brushCursorNode() const { return interaction().brushCursorNode(); }
  QPointF brushCursor() const { return interaction().brushCursor(); }
  QRectF cropDraft() const { return interaction().cropDraft(); }
  QtNodes::NodeId paintDraftNode() const { return interaction().paintDraftNode(); }
  QtNodes::NodeId dropGroup() const { return interaction().dropGroup(); }
  const QImage &paintDraft() const { return interaction().paintDraft(); }
  const HandleHover &hoveredHandle() const { return interaction().hoveredHandle(); }
  bool nodeDragActive() const { return interaction().nodeDragActive(); }
};

} // namespace nodetool
