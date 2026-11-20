#include "canvas/CanvasInteraction.h"
#include "canvas/CanvasStyle.h"
#include "graph/WorkflowGraphModel.h"
#include <qtnodes/ConnectionIdUtils.hpp>
#include <QtTest>

using namespace nodetool;
using namespace nodetool::canvas;
using namespace QtNodes;

namespace {

// UI thread only. Supplies the canvas's default selection, movement, and draft
// operations using the graph model and rectangles alone.
class FakeHost final : public CanvasInteractionHost {
public:
  explicit FakeHost(WorkflowGraphModel &model) : model_(model) {}

  QList<CanvasHit> hitsAt(QPointF point) const override {
    QList<CanvasHit> hits;
    for (const auto &card : nodesFrontToBack()) {
      if (bounds(card.id).adjusted(-6, 0, 6, 0).contains(point)) {
        CanvasHit hit;
        hit.node = card.id;
        hits.append(hit);
      }
    }
    return hits;
  }

  QList<CanvasNodeHit> nodesFrontToBack() const override {
    QList<CanvasNodeHit> cards;
    for (const auto id : model_.allNodeIds()) {
      const CanvasNodeHit card{id, bounds(id).topLeft(), selection.contains(id)};
      if (model_.isGroup(id)) {
        cards.append(card);
      } else {
        cards.prepend(card);
      }
    }
    return cards;
  }

  std::optional<CanvasNodeHit> node(NodeId id) override {
    if (!model_.nodeExists(id)) { return std::nullopt; }
    return CanvasNodeHit{id, bounds(id).topLeft(), selection.contains(id)};
  }

  QList<NodeId> selectedNodes() const override { return selection.values(); }
  QList<ConnectionId> selectedWires() const override { return {}; }
  qsizetype selectionCount() const override { return selection.size(); }
  std::optional<QRectF> rubberBandArea() const override { return band; }
  void clearSelection() override { selection.clear(); }
  void selectNode(NodeId id, bool selected) override {
    if (selected) {
      selection.insert(id);
    } else {
      selection.remove(id);
    }
  }

  PortIndex portAt(NodeId id, PortType side, QPointF local) override {
    if (model_.portVisible(id, side, 0) && QLineF(portPosition(id, side, 0), local).length() <= 6) { return 0; }
    return InvalidPortIndex;
  }

  QPointF portPosition(NodeId id, PortType side, PortIndex index) override {
    const auto &layout = model_.layout(id);
    return side == PortType::In ? QPointF(0, layout.inputY.value(index))
                                : QPointF(layout.size.width(), layout.outputY.value(index));
  }

  void basePointerEvent(PointerAction action, const CanvasPointerEvent &event) override {
    baseActions.append(action);
    const auto point = event.scenePosition;
    if (action == PointerAction::Press) {
      pressPosition = point;
      clearSelection();
      for (const auto &hit : hitsAt(point)) {
        if (model_.isGroup(hit.node)) { continue; }
        selection.insert(hit.node);
        const auto origin = bounds(hit.node).topLeft();
        const auto port = portAt(hit.node, PortType::Out, point - origin);
        if (port != InvalidPortIndex) {
          startDraft(makeIncompleteConnectionId(hit.node, PortType::Out, port), PortType::In, point);
        } else {
          grabbed = hit.node;
          originalPosition = origin;
        }
        return;
      }
      band.emplace(point, point);
    } else if (action == PointerAction::Move) {
      if (grabbed != InvalidNodeId) {
        model_.setNodeData(grabbed, NodeRole::Position, originalPosition + point - pressPosition);
      } else if (band) {
        band = QRectF(pressPosition, point).normalized();
        for (const auto &card : nodesFrontToBack()) { selectNode(card.id, band->intersects(bounds(card.id))); }
      }
    } else if (action == PointerAction::Release) {
      grabbed = InvalidNodeId;
      band.reset();
    }
  }

  NodeId grabbedNode() const override { return grabbed; }
  std::optional<ConnectionId> draftWire() const override { return draft; }
  void startDraft(ConnectionId id, PortType, QPointF point) override {
    draft = id;
    draftPoint = point;
  }
  void moveDraft(const CanvasPointerEvent &event) override { draftPoint = event.scenePosition; }
  void finishDraft(const CanvasPointerEvent &event) override {
    for (const auto &hit : hitsAt(event.scenePosition)) {
      const auto index = portAt(hit.node, PortType::In, draftPoint - bounds(hit.node).topLeft());
      if (index == InvalidPortIndex) { continue; }
      const auto connection = makeCompleteConnectionId(*draft, hit.node, index);
      if (model_.connectionPossible(connection)) { model_.addConnection(connection); }
      break;
    }
    clearDraft();
  }
  void clearDraft() override { draft.reset(); }
  bool hasWire(ConnectionId id) override { return model_.connectionExists(id); }
  void setWireVisible(ConnectionId, bool) override {}
  void prepareNodeGeometry(NodeId) override {}
  void repaintNode(NodeId) override {}
  void repaintCanvas() override {}
  void invalidateForeground() override {}
  void draftFeedbackChanged() override { ++feedbackChanges; }
  void restoreGroupOrder() override {}
  void refreshGroupPointer() override {}
  void setNodeCursor(NodeId, std::optional<Qt::CursorShape>) override {}
  void setViewportCursor(std::optional<Qt::CursorShape>, bool) override {}
  void setButtonHover(NodeId, bool, bool, const QString &) override {}

  QRectF bounds(NodeId id) const {
    return {model_.nodeData(id, NodeRole::Position).toPointF(), model_.layout(id).size};
  }

  QSet<NodeId> selection;
  QList<PointerAction> baseActions;
  std::optional<QRectF> band;
  QPointF draftPoint;
  int feedbackChanges = 0;

private:
  WorkflowGraphModel &model_;
  std::optional<ConnectionId> draft;
  NodeId grabbed = InvalidNodeId;
  QPointF pressPosition;
  QPointF originalPosition;
};

// UI thread only. Members own the fixture model, interaction and its host.
class Fixture {
public:
  Fixture() : host(model), interaction(model, host, theme) {
    const auto node = [](const char *id, const char *type, int x, int y) {
      return QJsonObject{{"id", id},
                         {"type", type},
                         {"data", QJsonObject{}},
                         {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
    };
    const QJsonArray nodes{node("source", "fixture.Source", 0, 0), node("target", "fixture.Target", 500, 0),
                           node("group", "nodetool.workflows.base_node.Group", 0, 400)};
    const QJsonObject portType{{"type", "str"}};
    const QJsonArray catalog{
        QJsonObject{{"node_type", "fixture.Source"},
                    {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", portType}}}}},
        QJsonObject{{"node_type", "fixture.Target"},
                    {"input_fields", QJsonArray{"in"}},
                    {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", portType}}}}},
    };
    model.project({{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}, catalog);
    for (const auto id : model.allNodeIds()) {
      const auto resource = model.resourceId(id);
      if (resource == "source") { source = id; }
      if (resource == "target") { target = id; }
      if (resource == "group") { group = id; }
    }
    model.commit = [this](const QJsonObject &command) {
      commands.append(command);
      return true;
    };
  }

  bool pointer(PointerAction action, QPointF point, Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
    return interaction.pointerEvent(action,
                                    {
                                        .scenePosition = point,
                                        .screenPosition = point.toPoint(),
                                        .button = action == PointerAction::Move ? Qt::NoButton : Qt::LeftButton,
                                        .buttons = action == PointerAction::Release ? Qt::NoButton : Qt::LeftButton,
                                        .modifiers = modifiers,
                                    });
  }

  WorkflowGraphModel model;
  FakeHost host;
  CanvasTheme theme;
  CanvasInteraction interaction;
  QList<QJsonObject> commands;
  NodeId source = InvalidNodeId;
  NodeId target = InvalidNodeId;
  NodeId group = InvalidNodeId;
};

} // namespace

// UI thread only.
class CanvasInteractionTest final : public QObject {
  Q_OBJECT

private slots:
  void clickSelectsCardAndGroupLabel() {
    Fixture f;
    const auto card = f.host.bounds(f.source);
    QVERIFY(!f.pointer(PointerAction::Press, card.topLeft() + QPointF(80, 20)));
    QVERIFY(!f.pointer(PointerAction::Release, card.topLeft() + QPointF(80, 20)));
    QCOMPARE(f.host.selection, QSet<NodeId>{f.source});

    QSignalSpy selected(&f.interaction, &CanvasInteraction::nodeSelected);
    const auto label = f.interaction.groupLabelRect(f.group, 1).center();
    QVERIFY(f.pointer(PointerAction::Press, label));
    QVERIFY(f.pointer(PointerAction::Release, label));
    QCOMPARE(f.host.selection, QSet<NodeId>{f.group});
    QCOMPARE(f.host.baseActions, (QList{PointerAction::Press, PointerAction::Release}));
    QCOMPARE(selected.count(), 2);
  }

  void dragMovesCardAndReportsThreshold() {
    Fixture f;
    const auto origin = f.host.bounds(f.source).topLeft();
    const auto point = origin + QPointF(80, 20);
    QSignalSpy drag(&f.interaction, &CanvasInteraction::nodeDragChanged);

    f.pointer(PointerAction::Press, point);
    f.pointer(PointerAction::Move, point + QPointF(3, 0));
    QCOMPARE(drag.count(), 0);
    f.pointer(PointerAction::Move, point + QPointF(45, 20));
    QVERIFY(f.interaction.nodeDragActive());
    QCOMPARE(f.host.bounds(f.source).topLeft(), origin + QPointF(45, 20));
    f.pointer(PointerAction::Release, point + QPointF(45, 20));
    QVERIFY(!f.interaction.nodeDragActive());
    QCOMPARE(drag.count(), 2);
    QCOMPARE(drag[0][0].toBool(), true);
    QCOMPARE(drag[1][0].toBool(), false);
  }

  void wireDragConnectsPorts() {
    Fixture f;
    QVERIFY(f.model.portVisible(f.source, PortType::Out, 0));
    QVERIFY(f.model.portVisible(f.target, PortType::In, 0));
    const auto from = f.host.bounds(f.source).topLeft() + f.host.portPosition(f.source, PortType::Out, 0);
    const auto to = f.host.bounds(f.target).topLeft() + f.host.portPosition(f.target, PortType::In, 0);
    QSignalSpy loose(&f.interaction, &CanvasInteraction::looseWireDropped);
    f.pointer(PointerAction::Press, from);
    QCOMPARE(f.interaction.draftEnd().node, f.source);
    QVERIFY(f.pointer(PointerAction::Move, to));
    QCOMPARE(f.host.draftPoint, to);
    QCOMPARE(f.interaction.handleConnectable(f.target, PortType::In, 0), 1);
    QVERIFY(f.pointer(PointerAction::Release, to));

    QCOMPARE(f.commands.size(), 1);
    QCOMPARE(f.commands[0]["op"].toString(), QStringLiteral("addEdge"));
    const auto edge = f.commands[0]["edge"].toObject();
    QCOMPARE(edge["sourceHandle"].toString(), QStringLiteral("out"));
    QCOMPARE(edge["targetHandle"].toString(), QStringLiteral("in"));
    QCOMPARE(loose.count(), 0);
    QVERIFY(!f.host.draftWire());
    QCOMPARE(f.host.feedbackChanges, 2);
  }

  void rubberBandKeepsOnlyEnclosedGroups() {
    Fixture f;
    f.pointer(PointerAction::Press, QPointF(-40, -40));
    f.pointer(PointerAction::Move, QPointF(440, 450));
    QVERIFY(f.host.band);
    QVERIFY(f.host.selection.contains(f.group));
    f.interaction.selectionChanged();
    QCOMPARE(f.host.selection, QSet<NodeId>{f.source});

    f.pointer(PointerAction::Move, f.host.bounds(f.group).bottomRight() + QPointF(20, 20));
    f.interaction.selectionChanged();
    QCOMPARE(f.host.selection, (QSet<NodeId>{f.source, f.group}));
    f.pointer(PointerAction::Release, f.host.band->bottomRight());
    QVERIFY(!f.host.band);
  }

  void escapeAndFocusOutRestoreResize() {
    Fixture f;
    const auto before = f.host.bounds(f.group);
    const auto corner = before.bottomRight() - QPointF(5, 5);
    QCOMPARE(f.interaction.keyPress(Qt::Key_Escape), false);
    for (const auto cancelWithKey : {true, false}) {
      QVERIFY(f.pointer(PointerAction::Press, corner));
      QVERIFY(f.pointer(PointerAction::Move, corner + QPointF(50, 40)));
      QCOMPARE(f.host.bounds(f.group).size(), before.size() + QSizeF(50, 40));
      if (cancelWithKey) {
        QVERIFY(f.interaction.keyPress(Qt::Key_Escape));
      } else {
        f.interaction.focusOut();
      }
      QCOMPARE(f.host.bounds(f.group), before);
    }
    QVERIFY(f.commands.isEmpty());
  }
};

QTEST_MAIN(CanvasInteractionTest)
#include "CanvasInteractionTest.moc"
