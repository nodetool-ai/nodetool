#include "canvas/PaintStates.h"

#include "canvas/EditorSceneApi.h"
#include "graph/TypeStyle.h"
#include "graph/WorkflowGraphModel.h"
#include <qtnodes/ConnectionIdUtils.hpp>
#include <qtnodes/AbstractNodeGeometry.hpp>

namespace nodetool::canvas {
using namespace QtNodes;
namespace {
// A collect handle (list[T] with a concrete T) is a ring: PropertyField.tsx isCollectType.
bool collectPort(const QJsonValue &port) {
  // value() copies. operator[] on the temporary object would return a dangling reference.
  const auto type = port.toObject().value("type");
  if (!type.isObject()) { return false; }
  const auto declared = type.toObject();
  const auto args = declared.value("type_args").toArray();
  return declared.value("type") == "list" && args.size() == 1 && args[0].toObject().value("type") != "any";
}
} // namespace

CardPaintState cardPaintState(const EditorSceneApi &scene, const WorkflowGraphModel &model, const CardItemState &item) {
  const auto id = item.id;
  const auto &layout = model.layout(id);
  const auto kind = model.isReroute(id) ? CardKind::Reroute
                  : model.isGroup(id)   ? CardKind::Group
                  : model.isComment(id) ? CardKind::Comment
                                        : CardKind::Node;
  const auto zoom = item.zoom;
  const auto hasResult = kind == CardKind::Node && model.hasRuntimeOutput(id);
  const auto running = kind == CardKind::Node && model.runningShown(id);
  CardPaintState state{
      .theme = scene.theme(),
      .layout = layout,
      .bounds = item.bounds,
      .kind = kind,
      .zoom = zoom,
      .groupOpacity = scene.groupOpacity(id),
      .animationPhase = scene.animationPhase(),
      .runningAngle = running ? scene.runningAngle() : 90,
      .groupDropTarget = scene.dropGroup() == id,
      .selected = item.selected,
      .focused = !model.focusedNode().isEmpty() && model.focusedNode() == model.resourceId(id),
      .readOnly = model.readOnly(),
      .bypassed = model.bypassed(id),
      .grouped = model.depth(id) > 0,
      .runningShown = running,
      .runtimeConnected = model.runtimeConnected(),
      .headerActionHovered = item.headerActionHovered,
      .footerHovered = item.footerHovered,
      .comment = kind == CardKind::Comment ? model.comment(id) : QJsonValue{},
      .runtime = model.runtimeState(id),
      .outputRect = hasResult ? model.canvasResultRect(id) : QRectF{},
      .preview = hasResult ? model.runtimePreview(id) : QImage{},
      .body = {},
      .handles = {},
  };
  state.body.hasResult = hasResult && !layout.sourceTab;
  state.body.running = state.runtime.value("status") == QStringLiteral("running");
  state.body.hovered = item.hovered;
  if (scene.sliderDraftNode() == id) {
    state.body.draftProperty = scene.sliderDraftProperty();
    state.body.draftValue = scene.sliderDraftValue();
  }
  if (scene.cropDraftNode() == id) { state.body.cropDraft = scene.cropDraft(); }
  if (scene.paintDraftNode() == id) { state.body.paintDraft = scene.paintDraft(); }
  if (scene.brushCursorNode() == id) { state.body.brushCursor = scene.brushCursor(); }

  if (zoom > zoomedOutThreshold && (kind == CardKind::Node || kind == CardKind::Reroute)) {
    const auto &hover = scene.hoveredHandle();
    const auto &focus = model.focusedHandle();
    for (const auto side : {PortType::In, PortType::Out}) {
      const auto ports = model.ports(id, side);
      const auto &rows = side == PortType::In ? layout.inputY : layout.outputY;
      for (PortIndex index = 0; index < PortIndex(rows.size()); ++index) {
        if (!model.portVisible(id, side, index)) { continue; }
        const auto port = index < PortIndex(ports.size()) ? ports[int(index)] : QJsonValue{};
        const auto type = kind == CardKind::Reroute ? model.rerouteHandleType(id)
                                                    : model.portData<QString>(id, side, index, PortRole::DataType);
        state.handles.append(HandlePaintState{
            .position = scene.nodeGeometry().portPosition(id, side, index),
            .color = typeColor(type),
            .collect = side == PortType::In && collectPort(port),
            .hovered = hover.node == id && hover.type == side && hover.index == index,
            .focused = state.focused && focus.side == side && index < PortIndex(ports.size()) &&
                       port.toObject()["name"].toString() == focus.name,
            .connectable = scene.handleConnectable(id, side, index),
        });
      }
    }
  }
  return state;
}

WirePaintState wireGeometry(const WorkflowGraphModel &model, ConnectionId id, QPointF out, QPointF in, bool draft) {
  WirePaintState state;
  state.out = out;
  state.in = in;
  state.visible = model.wireVisible(id);
  state.control = !draft && model.isControlWire(id);
  state.draft = draft;
  return state;
}

void fillWirePaintState(WirePaintState &state, const EditorSceneApi &scene, const WorkflowGraphModel &model,
                        ConnectionId id, bool selected, bool hovered, double zoom,
                        const std::function<bool(NodeId)> &nodeSelected) {
  state.selected = selected;
  state.hovered = hovered;
  if (state.draft) {
    const auto side = id.outNodeId != InvalidNodeId ? PortType::Out : PortType::In;
    const auto node = getNodeId(side, id);
    const auto index = getPortIndex(side, id);
    state.draftFromOutput = side == PortType::Out;
    state.sourceColor = typeColor(model.portData<QString>(node, side, index, PortRole::DataType));
    const auto ports = model.ports(node, side);
    const auto declared = index < PortIndex(ports.size()) ? ports[int(index)].toObject()["type"] : QJsonValue{};
    state.control = (declared.isObject() ? declared.toObject()["type"].toString() : declared.toString()) == "control";
  } else if (!state.control) {
    const auto runtime = model.runtimeEdgeState(id);
    state.sourceColor = model.wirePortColor(id, PortType::Out);
    state.targetColor = model.wirePortColor(id, PortType::In);
    state.endpointSelected = nodeSelected(id.outNodeId) || nodeSelected(id.inNodeId);
    state.bypassed = model.bypassed(id.outNodeId) || model.bypassed(id.inNodeId);
    state.streaming = model.metadata(id.outNodeId)["is_streaming_output"].toBool();
    state.flowing = model.runtimeWireFlowing(id) && model.runtimeConnected();
    state.messageSent = runtime["status"] == "message_sent";
    state.counter = runtime["counter"].toInt();
    state.connecting = scene.draftEnd().node != InvalidNodeId;
    state.animationActive = scene.animationActive();
    state.animationPhase = scene.animationPhase();
    state.zoom = zoom;
  }
}

} // namespace nodetool::canvas
