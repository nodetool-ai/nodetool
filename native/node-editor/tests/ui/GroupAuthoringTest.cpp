#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include <QPainter>
#include <QContextMenuEvent>
#include <QSignalSpy>
#include <QScopeGuard>
#include <QFile>
#include <QJsonDocument>
#include <QSettings>
#include <QGraphicsView>
#include <QInputDialog>
#include <QTimer>
#include <QDir>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QWebSocketServer>
#include <QWebSocket>
#include "server/MsgPack.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
class GroupAuthoringTest final : public QObject {
  Q_OBJECT
private slots:
  // The chat window opens by default on a wide window (CanvasChatDockStore.ts), over the
  // right of the canvas where the fitted group header sits. The tests seed it collapsed, as
  // the window parity captures do, so the header controls are not under the chat.
  void init() { QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), true); }
  void pointerRunSubmitsGroupWithoutSelectingIt() {
    QWebSocketServer server("group run", QWebSocketServer::NonSecureMode);
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QJsonObject> requests;
    connect(&server, &QWebSocketServer::newConnection, this, [&] {
      auto *peer = server.nextPendingConnection(); peer->setParent(&server);
      connect(peer, &QWebSocket::binaryMessageReceived, this, [&](const QByteArray &bytes) {
        const auto message = node_editor::decodeMsgPack(bytes);
        QVERIFY(message); requests.append(message->toObject());
      });
    });
    EditorWindow window;
    window.show();
    window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
    QTRY_VERIFY(window.session()->connected());
    window.setCatalog(QJsonArray{QJsonObject{{"node_type", "fixture.Source"}}});
    QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "source"}, {"type", "fixture.Source"}}}}));
    QVERIFY(window.selectNode("source"));
    window.action("Group selection");
    const auto inner = window.document()->node("source")["parent_id"].toString();
    QVERIFY(window.selectNode(inner));
    window.action("Group selection");
    const auto group = window.document()->node(inner)["parent_id"].toString();
    QVERIFY(window.selectNode(group)); window.fit();
    QQuickWidget *controls = nullptr;
    QTRY_VERIFY((controls = window.findChild<QQuickWidget *>("authored-controls-" + group)));
    QTRY_COMPARE(controls->status(), QQuickWidget::Ready);
    auto *options = controls->rootObject()->findChild<QQuickItem *>("group-options");
    QVERIFY(options);
    auto *runGeometry = controls->rootObject()->findChild<QQuickItem *>("group-run");
    QVERIFY(runGeometry);
    QTRY_VERIFY(options->isVisible());
    QTRY_VERIFY(runGeometry->x() >= options->x() + options->width());
    QTRY_VERIFY(runGeometry->mapRectToScene(runGeometry->boundingRect()).right() <= controls->width() + 1);
    QVERIFY(runGeometry->height() <= 28);
    auto *button = controls->rootObject()->findChild<QQuickItem *>("group-run");
    QVERIFY(button); QTRY_VERIFY(button->isEnabled());
    QCOMPARE(button->property("accessibleName").toString(), QString("Run group"));
    QVERIFY(!button->property("loading").toBool());
    window.scene()->clearSelection();
    controls->show();
    QTest::mouseClick(controls, Qt::LeftButton, Qt::NoModifier, button->mapToScene(QPointF(button->width()/2, button->height()/2)).toPoint());
    QTRY_VERIFY(!requests.isEmpty());
    const auto nodes = requests.last()["data"].toObject()["graph"].toObject()["nodes"].toArray();
    QCOMPARE(nodes.size(), 1);
    QCOMPARE(nodes.first().toObject()["id"].toString(), QString("source"));
    QTRY_VERIFY(!button->isEnabled());
    // RunGroupButton.tsx: the label turns to "Group is running" and the button shows a spinner while the workflow runs.
    QTRY_COMPARE(button->property("accessibleName").toString(), QString("Group is running"));
    QVERIFY(button->property("loading").toBool());
  }
  void pointerColorIsBlockedAfterReadOnlyTransition() {
    EditorWindow window;
    window.show();
    window.action("Add comment");
    const auto note = window.document()->nodes().first().toObject()["id"].toString();
    QVERIFY(window.selectNode(note)); window.fit();
    QTRY_VERIFY(window.findChild<QQuickWidget *>("authored-controls-" + note));
    QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "legacy"}, {"type", "comment"}}}}));
    QTRY_VERIFY(window.readOnly());
    // Panels follow in a later pass. The read-only projection replaces the controls and disables the old ones.
    QTRY_VERIFY(static_cast<WorkflowGraphModel &>(window.scene()->graphModel()).readOnly());
    QQuickWidget *controls = nullptr;
    QTRY_VERIFY((controls = window.findChild<QQuickWidget *>("authored-controls-" + note)) && controls->isEnabled());
    QVERIFY(window.selectNode(note)); window.fit();
    auto *trigger = controls->rootObject()->findChild<QQuickItem *>("comment-color");
    QVERIFY(trigger);
    QTRY_VERIFY(!trigger->isEnabled());
    const auto snapshot = window.document()->snapshot();
    QTest::mouseClick(controls, Qt::LeftButton, Qt::NoModifier, trigger->mapToScene(QPointF(trigger->width()/2, trigger->height()/2)).toPoint());
    QCOMPARE(window.document()->snapshot(), snapshot);
  }
  void headerControlsExist() {
    EditorWindow window;
    window.show();
    window.action("Add comment");
    const auto note = window.document()->nodes().first().toObject()["id"].toString();
    QVERIFY(window.selectNode(note));
    window.action("Group selection");
    window.fit();
    QTRY_VERIFY(window.findChild<QQuickWidget *>("authored-controls-" + window.document()->node(note)["parent_id"].toString()));
  }
  void groupDisabledStateReflectsRunnableChildren() {
    EditorWindow window;
    QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "source"}, {"type", "fixture.Source"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}}));
    QVERIFY(window.selectNode("source"));
    window.action("Group selection");
    const auto group = window.document()->node("source")["parent_id"].toString();
    QVERIFY(window.selectNode(group));
    QVERIFY(!window.selectionDisabled());
    window.action("Disable selected");
    QVERIFY(window.selectionDisabled());
    QVERIFY(window.document()->node("source")["ui_properties"].toObject()["bypassed"].toBool());
    QVERIFY(!window.document()->node(group)["ui_properties"].toObject().contains("bypassed"));
    window.action("Undo");
    QVERIFY(!window.selectionDisabled());
    window.action("Redo");
    QVERIFY(window.selectionDisabled());
    window.action("Enable selected");
    QVERIFY(!window.selectionDisabled());
  }
  void pointerBypassAndColorRoundTrip() {
    EditorWindow window;
    window.show();
    QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "source"}, {"type", "fixture.Source"}}}}));
    QVERIFY(window.selectNode("source"));
    window.action("Group selection");
    const auto group = window.document()->node("source")["parent_id"].toString();
    QVERIFY(window.selectNode(group));
    window.fit();
    QQuickWidget *controls = nullptr;
    QTRY_VERIFY((controls = window.findChild<QQuickWidget *>("authored-controls-" + group)));
    QTRY_COMPARE(controls->status(), QQuickWidget::Ready);
    QTRY_VERIFY(controls->isVisible());
    auto *trigger = controls->rootObject()->findChild<QQuickItem *>("group-options");
    QVERIFY(trigger);
    QTest::mouseClick(controls, Qt::LeftButton, Qt::NoModifier, trigger->mapToScene(QPointF(trigger->width()/2, trigger->height()/2)).toPoint());
    auto *button = controls->rootObject()->findChild<QQuickItem *>("group-bypass");
    QVERIFY(button);
    QTRY_VERIFY(button->window());
    const auto index = window.document()->undoStack()->index();
    QTest::mouseClick(button->window(), Qt::LeftButton, Qt::NoModifier, button->mapToScene(QPointF(button->width()/2, button->height()/2)).toPoint());
    QTRY_VERIFY(window.document()->node("source")["ui_properties"].toObject()["bypassed"].toBool());
    QCOMPARE(window.document()->undoStack()->index(), index + 1);
    window.action("Undo");
    QVERIFY(!window.document()->node("source")["ui_properties"].toObject()["bypassed"].toBool());
    QTest::qWait(80);
    QTRY_VERIFY((controls = window.findChild<QQuickWidget *>("authored-controls-" + group)));
    QVERIFY(window.selectNode(group)); window.fit();
    trigger = controls->rootObject()->findChild<QQuickItem *>("group-options");
    QTest::mouseClick(controls, Qt::LeftButton, Qt::NoModifier, trigger->mapToScene(QPointF(trigger->width()/2, trigger->height()/2)).toPoint());
    auto *groupColor = controls->rootObject()->findChild<QQuickItem *>("group-color");
    QVERIFY(groupColor); QTRY_VERIFY(groupColor->window());
    QTest::mouseClick(groupColor->window(), Qt::LeftButton, Qt::NoModifier, groupColor->mapToScene(QPointF(groupColor->width()/2, groupColor->height()/2)).toPoint());
    auto *groupPalette = controls->rootObject()->findChild<QObject *>("comment-palette");
    QVERIFY(groupPalette);
    QList<QQuickItem *> groupItems{qvariant_cast<QQuickItem *>(groupPalette->property("contentItem"))};
    QQuickItem *groupSwatch = nullptr;
    while (!groupItems.isEmpty()) {
      auto *item = groupItems.takeLast();
      if (item->objectName() == "comment-swatch-#50FA7B") groupSwatch = item;
      groupItems.append(item->childItems());
    }
    QVERIFY(groupSwatch); QTRY_VERIFY(groupSwatch->window());
    const auto groupBefore = window.document()->undoStack()->index();
    QTest::mouseClick(groupSwatch->window(), Qt::LeftButton, Qt::NoModifier, groupSwatch->mapToScene(QPointF(groupSwatch->width()/2, groupSwatch->height()/2)).toPoint());
    QTRY_COMPARE(window.document()->node(group)["data"].toObject()["group_color"].toString(), QString("#50FA7B"));
    QCOMPARE(window.document()->undoStack()->index(), groupBefore + 1);
    window.action("Add comment");
    QString note;
    for (const auto value : window.document()->nodes()) if (value.toObject()["type"].toString().contains("Comment")) note = value.toObject()["id"].toString();
    QVERIFY(!note.isEmpty());
    QVERIFY(window.selectNode(note)); window.fit();
    QQuickWidget *commentControls = nullptr;
    QTRY_VERIFY((commentControls = window.findChild<QQuickWidget *>("authored-controls-" + note)));
    QTRY_COMPARE(commentControls->status(), QQuickWidget::Ready);
    QTRY_VERIFY(commentControls->isVisible());
    auto *colorButton = commentControls->rootObject()->findChild<QQuickItem *>("comment-color");
    QVERIFY(colorButton);
    QTest::mouseClick(commentControls, Qt::LeftButton, Qt::NoModifier, colorButton->mapToScene(QPointF(colorButton->width()/2, colorButton->height()/2)).toPoint());
    auto *palette = commentControls->rootObject()->findChild<QObject *>("comment-palette");
    QVERIFY(palette);
    auto *content = qvariant_cast<QQuickItem *>(palette->property("contentItem"));
    QVERIFY(content);
    QQuickItem *swatch = nullptr;
    QList<QQuickItem *> pending{content};
    while (!pending.isEmpty()) {
      auto *item = pending.takeLast();
      if (item->objectName() == "comment-swatch-#50FA7B") swatch = item;
      pending.append(item->childItems());
    }
    QVERIFY(swatch);
    QTRY_VERIFY(swatch->window());
    const auto before = window.document()->undoStack()->index();
    QTest::mouseClick(swatch->window(), Qt::LeftButton, Qt::NoModifier, swatch->mapToScene(QPointF(swatch->width()/2, swatch->height()/2)).toPoint());
    QTRY_COMPARE(window.document()->node(note)["data"].toObject()["comment_color"].toString(), QString("#50FA7B"));
    QCOMPARE(window.document()->undoStack()->index(), before + 1);
    QVERIFY(window.selectNode(note));
    const auto capture = qEnvironmentVariable("NODETOOL_GROUP_CAPTURE_DIR");
    if (!capture.isEmpty()) {
      QDir().mkpath(capture);
      for (const bool dark : {true, false}) {
        window.setDarkTheme(dark); window.fit(); QTest::qWait(80);
        QVERIFY(window.grab().save(capture + (dark ? "/comment-dark.png" : "/comment-light.png")));
      }
    }
    const auto snapshot = window.document()->snapshot();
    window.authoredAction(note, "color:#FF5555", window.documentEpoch() + 1, window.credentialsEpoch());
    window.authoredAction(note, "color:#FF5555", window.documentEpoch(), window.credentialsEpoch() + 1);
    QCOMPARE(window.document()->snapshot(), snapshot);
    QTemporaryDir dir;
    QVERIFY(window.saveFile(dir.filePath("workflow.json")));
    EditorWindow reopened;
    QVERIFY(reopened.openFile(dir.filePath("workflow.json")));
    QCOMPARE(reopened.document()->node(note)["data"], window.document()->node(note)["data"]);
    QCOMPARE(reopened.document()->node(group)["data"], window.document()->node(group)["data"]);
  }
  void keyboardGroupingAndNestedMovement() {
    EditorWindow window;
    window.show();
    window.action("Add comment");
    const auto note = window.document()->nodes().first().toObject()["id"].toString();
    QVERIFY(window.selectNode(note));
    auto view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    QTest::keyClick(view, Qt::Key_G, Qt::ControlModifier);
    QTRY_COMPARE(window.document()->nodes().size(), 2);
    const auto group = window.document()->node(note)["parent_id"].toString();
    QVERIFY(!group.isEmpty());
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    for (const auto id : model.allNodeIds()) { window.scene()->nodeGraphicsObject(id)->setSelected(true); }
    const auto initial = window.document()->snapshot();
    const auto groupPosition = window.document()->node(group)["ui_properties"].toObject()["position"].toObject();
    const QJsonValue relative = window.document()->node(note)["ui_properties"].toObject()["position"];
    const auto undoIndex = window.document()->undoStack()->index();
    QTest::keyClick(view, Qt::Key_Right);
    QCOMPARE(window.document()->node(group)["ui_properties"].toObject()["position"].toObject()["x"].toDouble(), groupPosition["x"].toDouble() + 10);
    QCOMPARE(window.document()->node(note)["ui_properties"].toObject()["position"], relative);
    QCOMPARE(window.document()->undoStack()->index(), undoIndex + 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), initial);
    QVERIFY(window.selectNode(note));
    QTest::keyClick(view, Qt::Key_Up);
    QCOMPARE(window.document()->node(note)["ui_properties"].toObject()["position"].toObject()["y"].toDouble(), relative.toObject()["y"].toDouble() - 10);
    QCOMPARE(window.document()->node(group)["ui_properties"].toObject()["position"].toObject(), groupPosition);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), initial);
  }
  void createGroupEditAndUndo() {
    EditorWindow window;
    window.show();
    window.action("Add comment");
    QTRY_COMPARE(window.document()->nodes().size(), 1);
    const auto note = window.document()->nodes().first().toObject()["id"].toString();
    QVERIFY(window.selectNode(note));
    QVERIFY(!window.readOnly());
    const auto baseline = window.document()->snapshot();
    // CommentNode.tsx edits the text on the card. Enter adds a line and Ctrl+Enter stores it.
    window.action("Edit comment");
    QQuickWidget *editor = nullptr;
    QTRY_VERIFY((editor = window.findChild<QQuickWidget *>("inline-title-overlay")) && editor->isVisible() && editor->rootObject()
                && editor->rootObject()->findChild<QQuickItem *>("inline-title-text")
                && editor->rootObject()->findChild<QQuickItem *>("inline-title-text")->hasActiveFocus());
    QTest::keyClick(editor, Qt::Key_A, Qt::ControlModifier);
    QTest::keyClicks(editor, "## A comment");
    QTest::keyClick(editor, Qt::Key_Return);
    QTest::keyClicks(editor, "With **formatting**");
    QTest::keyClick(editor, Qt::Key_Return, Qt::ControlModifier);
    QTRY_COMPARE(window.document()->node(note)["data"].toObject()["comment"].toString(), QString("## A comment\nWith **formatting**"));
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), baseline);
    QVERIFY(window.selectNode(note));
    window.action("Group selection");
    QTRY_COMPARE(window.document()->nodes().size(), 2);
    const auto group = window.document()->node(note)["parent_id"].toString();
    QVERIFY(!group.isEmpty());
    QVERIFY(!window.readOnly());
    QVERIFY(window.document()->node(group)["ui_properties"].toObject()["width"].toDouble() > 300);
    const auto grouped = window.document()->snapshot();
    const QJsonValue childPosition = window.document()->node(note)["ui_properties"].toObject()["position"];
    QVERIFY(window.selectNode(group));
    window.fit();
    QTest::qWait(80);
    auto view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    auto &model = window.scene()->graphModel();
    QtNodes::NodeGraphicsObject *frame = nullptr;
    for (const auto nodeId : model.allNodeIds()) {
      if (static_cast<WorkflowGraphModel &>(model).resourceId(nodeId) == group) { frame = window.scene()->nodeGraphicsObject(nodeId); }
    }
    QVERIFY(frame);
    // GroupNode.tsx drags a group by its label. Its body lets the pointer through.
    const auto start = view->mapFromScene(window.scene()->groupLabelRect(frame->nodeId(), std::abs(view->transform().m11())).center());
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    QTest::mouseMove(view->viewport(), start + QPoint(60, 35), 30);
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, start + QPoint(60, 35));
    QTRY_VERIFY(window.document()->snapshot() != grouped);
    QCOMPARE(window.document()->node(note)["ui_properties"].toObject()["position"], childPosition);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), grouped);
    QQuickWidget *header = nullptr;
    QTRY_VERIFY((header = window.findChild<QQuickWidget *>("authored-controls-" + group)));
    QVERIFY(window.selectNode(group));
    window.fit();
    QTest::qWait(80);
    const auto rendered = window.grab().toImage().copy(QRect(header->mapTo(&window, QPoint()), header->size()));
    for (const auto &name : {"group-options", "group-run"}) {
      const auto *control = header->rootObject()->findChild<QQuickItem *>(name);
      QVERIFY(control);
      const auto rect = control->mapRectToScene(control->boundingRect()).toAlignedRect().intersected(rendered.rect());
      int brightPixels = 0;
      for (int y = rect.top(); y <= rect.bottom(); ++y) for (int x = rect.left(); x <= rect.right(); ++x) {
        if (rendered.pixelColor(x,y).lightness() > 150) ++brightPixels;
      }
      QVERIFY2(brightPixels > 5, name);
    }
    const auto capture = qEnvironmentVariable("NODETOOL_GROUP_CAPTURE_DIR");
    if (!capture.isEmpty()) {
      QDir().mkpath(capture);
      for (const bool dark : {true, false}) {
        window.setDarkTheme(dark); window.fit(); QTest::qWait(80);
        QVERIFY(window.grab().save(capture + (dark ? "/group-dark.png" : "/group-light.png")));
      }
    }
    QVERIFY(window.selectNode(group));
    window.action("Ungroup");
    QCOMPARE(window.document()->nodes().size(), 1);
    QCOMPARE(window.document()->snapshot(), baseline);
    window.action("Undo");
    QVERIFY(window.selectNode(note));
    window.action("Remove from group");
    QVERIFY(window.document()->node(note)["parent_id"].toString().isEmpty());
    QCOMPARE(window.document()->nodes().size(), 2);
  }
  // useDragHandlers.ts and useAddToGroup.ts: dropping a card on a group moves it
  // in, keeps its place on the canvas and grows the group to hold it.
private:
  static QJsonObject comment(const QString &id, double x, double y, const QString &parent = {}) {
    QJsonObject node{{"id", id}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", id}}},
                     {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}, {"width", 160}, {"height", 90}}}};
    if (!parent.isEmpty()) { node["parent_id"] = parent; }
    return node;
  }
  static void loadDropFixture(EditorWindow &window, bool childInside) {
    const QJsonObject group{{"id", "frame"}, {"type", "nodetool.workflows.base_node.Group"}, {"data", QJsonObject{{"headline", "Frame"}}},
                            {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}, {"width", 300}, {"height", 240}}}};
    QJsonArray nodes{group, comment("card", childInside ? 40 : 500, childInside ? 60 : 40, childInside ? "frame" : QString{})};
    QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}).ok);
    window.resize(1200, 800);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    window.action("Reset zoom");
    window.findChild<QGraphicsView *>()->centerOn(250, 150);
    QTest::qWait(60);
  }
  static QtNodes::NodeGraphicsObject *itemFor(EditorWindow &window, const QString &resource) {
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == resource) { return window.scene()->nodeGraphicsObject(id); } }
    return nullptr;
  }
  static QPoint pointOn(EditorWindow &window, const QString &resource) {
    auto *view = window.findChild<QGraphicsView *>();
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    auto *item = itemFor(window, resource);
    const auto size = model.layout(item->nodeId()).size;
    return view->mapFromScene(item->scenePos() + QPointF(size.width() / 2.0, 24));
  }
  static QPointF absolute(EditorWindow &window, const QString &resource) {
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    return model.nodeData(itemFor(window, resource)->nodeId(), QtNodes::NodeRole::Position).toPointF();
  }
  static QPointF relative(EditorWindow &window, const QString &resource) {
    const auto position = window.document()->node(resource)["ui_properties"].toObject()["position"].toObject();
    return {position["x"].toDouble(), position["y"].toDouble()};
  }
  // Drags the card by a real press, moves and release. Alt rides every move.
  static void drag(EditorWindow &window, const QString &resource, const QVector<QPoint> &path, Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
    auto *view = window.findChild<QGraphicsView *>();
    const auto start = pointOn(window, resource);
    QTest::mousePress(view->viewport(), Qt::LeftButton, modifiers, start);
    for (const auto &step : path) { QTest::mouseEvent(QTest::MouseMove, view->viewport(), Qt::NoButton, modifiers, start + step, 15); }
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, modifiers, start + path.last());
    QTest::qWait(60);
  }

private slots:
  void dropOnGroupJoinsKeepsPlaceGrowsAndUndoesOnce() {
    EditorWindow window;
    loadDropFixture(window, false);
    const auto baseline = window.document()->snapshot();
    const auto index = window.document()->undoStack()->index();
    auto *view = window.findChild<QGraphicsView *>();
    const auto start = pointOn(window, "card");
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    // Moving over the frame draws it as the drop target.
    const auto target = view->mapFromScene(QPointF(260, 150));
    for (int step = 1; step <= 8; ++step) { QTest::mouseMove(view->viewport(), start + (target - start) * step / 8, 15); }
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QCOMPARE(window.scene()->dropGroup(), itemFor(window, "frame")->nodeId());
    QVERIFY(window.scene()->nodeDragActive());
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, target);
    QTRY_COMPARE(window.document()->node("card")["parent_id"].toString(), QString("frame"));
    QCOMPARE(window.scene()->dropGroup(), QtNodes::InvalidNodeId);
    // The card stays where it was dropped, now relative to the group.
    const auto dropped = absolute(window, "card");
    QCOMPARE(relative(window, "card") + absolute(window, "frame"), dropped);
    // The group grows to hold the card with the web's 25 px and 50 px padding.
    const auto ui = window.document()->node("frame")["ui_properties"].toObject();
    const auto size = model.layout(itemFor(window, "card")->nodeId()).size;
    QVERIFY(ui["width"].toDouble() >= relative(window, "card").x() + size.width() + 25 - 0.5);
    QVERIFY(ui["height"].toDouble() >= relative(window, "card").y() + size.height() + 50 - 0.5);
    QCOMPARE(window.document()->undoStack()->index(), index + 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), baseline);
  }

  void dropOutsideEveryGroupLeavesTheCardLoose() {
    EditorWindow window;
    loadDropFixture(window, false);
    drag(window, "card", {QPoint(30, 40), QPoint(60, 80), QPoint(90, 120)});
    QVERIFY(window.document()->node("card")["parent_id"].toString().isEmpty());
    QVERIFY(window.document()->node("frame")["ui_properties"].toObject()["width"].toDouble() == 300);
  }

  void groupedCardDroppedInsideItsGroupStaysGrouped() {
    EditorWindow window;
    loadDropFixture(window, true);
    const auto before = window.document()->node("frame")["ui_properties"].toObject();
    drag(window, "card", {QPoint(10, 10), QPoint(20, 20)});
    QCOMPARE(window.document()->node("card")["parent_id"].toString(), QString("frame"));
    QCOMPARE(window.document()->node("frame")["ui_properties"].toObject(), before);
  }

  // Alt takes the dragged card out of its group. Dropping it clear of every
  // group keeps it loose at the place it was dropped.
  void altDragTakesTheCardOutOfItsGroup() {
    EditorWindow window;
    loadDropFixture(window, true);
    const auto baseline = window.document()->snapshot();
    const auto start = absolute(window, "card");
    drag(window, "card", {QPoint(60, 0), QPoint(200, 40), QPoint(320, 80)}, Qt::AltModifier);
    QTRY_VERIFY(window.document()->node("card")["parent_id"].toString().isEmpty());
    // The card keeps its absolute place, 320 px right and 80 px down.
    QCOMPARE(absolute(window, "card"), start + QPointF(320, 80));
    QCOMPARE(relative(window, "card"), absolute(window, "card"));
    QCOMPARE(window.document()->undoStack()->index(), 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), baseline);
  }

  // Without Alt the same drag keeps the card in its group.
  void dragWithoutAltKeepsTheGroup() {
    EditorWindow window;
    loadDropFixture(window, true);
    drag(window, "card", {QPoint(60, 0), QPoint(200, 40), QPoint(320, 80)});
    QCOMPARE(window.document()->node("card")["parent_id"].toString(), QString("frame"));
  }

  // A fast shake pulls the card out of its group, as web isWiggling does.
  void shakingTheCardTakesItOutOfItsGroup() {
    EditorWindow window;
    loadDropFixture(window, true);
    QVector<QPoint> path;
    for (int i = 0; i < 8; ++i) { path << QPoint(i % 2 ? -30 : 30, 0); }
    path << QPoint(340, 70);
    drag(window, "card", path);
    QTRY_VERIFY(window.document()->node("card")["parent_id"].toString().isEmpty());
    QCOMPARE(window.document()->undoStack()->index(), 1);
  }

  // A gentle drag in one direction is not a shake.
  void steadyDragIsNotAShake() {
    EditorWindow window;
    loadDropFixture(window, true);
    drag(window, "card", {QPoint(40, 0), QPoint(80, 0), QPoint(120, 0), QPoint(160, 0)});
    QCOMPARE(window.document()->node("card")["parent_id"].toString(), QString("frame"));
  }

  // The group a dragged card hovers draws at 0.8 opacity, edged in the primary color.
  void dropTargetGroupHighlightsWhileDragging() {
    EditorWindow window;
    loadDropFixture(window, false);
    auto *view = window.findChild<QGraphicsView *>();
    const auto start = pointOn(window, "card");
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    const auto target = view->mapFromScene(QPointF(260, 150));
    for (int step = 1; step <= 8; ++step) { QTest::mouseMove(view->viewport(), start + (target - start) * step / 8, 15); }
    const auto frame = itemFor(window, "frame");
    QCOMPARE(window.scene()->dropGroup(), frame->nodeId());
    const auto capture = qEnvironmentVariable("NODETOOL_GROUP_CAPTURE_DIR");
    if (!capture.isEmpty()) {
      QDir().mkpath(capture);
      for (const bool dark : {true, false}) {
        window.setDarkTheme(dark);
        QTest::qWait(80);
        QVERIFY(window.grab().save(capture + (dark ? "/group-drop-target-dark.png" : "/group-drop-target-light.png")));
      }
      window.setDarkTheme(true);
    }
    QImage hovered(320, 260, QImage::Format_ARGB32_Premultiplied);
    hovered.fill(window.scene()->theme().canvas);
    { QPainter painter(&hovered); window.scene()->render(&painter, QRectF(0, 0, 320, 260), QRectF(-10, -10, 320, 260)); }
    QTest::mouseMove(view->viewport(), QPoint(start.x(), start.y() + 300), 15);
    QCOMPARE(window.scene()->dropGroup(), QtNodes::InvalidNodeId);
    QImage plain(320, 260, QImage::Format_ARGB32_Premultiplied);
    plain.fill(window.scene()->theme().canvas);
    { QPainter painter(&plain); window.scene()->render(&painter, QRectF(0, 0, 320, 260), QRectF(-10, -10, 320, 260)); }
    // A point inside the frame, clear of the card and the label: the frame's fill is lighter at full opacity.
    QVERIFY(hovered.pixelColor(110, 30) != plain.pixelColor(110, 30));
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, start + QPoint(0, 300));
  }

  // Real cards from the window parity fixture: Ctrl-click three cards, Ctrl+G
  // draws a frame around them, and dragging the frame's label moves the frame,
  // its cards and their wires together as one undo step.
  void groupingRealCardsDrawsAFrameAndDraggingMovesIt() {
    QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
    QVERIFY(file.open(QIODevice::ReadOnly));
    const auto data = QJsonDocument::fromJson(file.readAll()).object();
    EditorWindow window;
    window.resize(1440, 900);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    window.setCatalog(data["metadata"].toArray());
    QVERIFY(window.document()->load(data["workflow"].toObject()).ok);
    if (window.catalogVisible()) { window.action(QStringLiteral("Toggle nodes")); }
    QTest::qWait(100);
    window.fit();
    QTest::qWait(150);
    auto *view = window.findChild<QGraphicsView *>();
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto capture = qEnvironmentVariable("NODETOOL_GROUP_CAPTURE_DIR");
    const auto save = [&](const QString &name) {
      if (capture.isEmpty()) { return; }
      QDir().mkpath(capture);
      QVERIFY(window.grab().save(capture + "/" + name + ".png"));
    };
    save("real-1-before");
    const QStringList members{"prompt", "generate", "agent"};
    // A card's header: the pointer selects the card, Ctrl adds it to the selection.
    const auto header = [&](const QString &id) {
      auto *item = itemFor(window, id);
      return view->mapFromScene(item->scenePos() + QPointF(model.layout(item->nodeId()).size.width() / 2.0, 12));
    };
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, header(members[0]));
    for (int i = 1; i < members.size(); ++i) { QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::ControlModifier, header(members[i])); }
    for (const auto &id : members) { QVERIFY2(itemFor(window, id)->isSelected(), qPrintable(id)); }
    view->setFocus();
    QTest::keyClick(view, Qt::Key_G, Qt::ControlModifier);
    QTRY_VERIFY(!window.document()->node("prompt")["parent_id"].toString().isEmpty());
    const auto group = window.document()->node("prompt")["parent_id"].toString();
    for (const auto &id : members) { QCOMPARE(window.document()->node(id)["parent_id"].toString(), group); }
    QVERIFY(window.document()->node("subject")["parent_id"].toString().isEmpty());
    QTest::qWait(100);
    // The frame encloses every member card and is drawn behind them.
    auto *frame = itemFor(window, group);
    QVERIFY(frame);
    const QRectF bounds(frame->scenePos(), model.layout(frame->nodeId()).size);
    for (const auto &id : members) {
      auto *item = itemFor(window, id);
      QVERIFY2(bounds.contains(QRectF(item->scenePos(), model.layout(item->nodeId()).size)), qPrintable(id));
      QVERIFY(frame->zValue() < item->zValue());
    }
    // The frame paints: a point inside it, clear of every card, differs from the empty canvas.
    QPointF empty = bounds.bottomLeft() + QPointF(8, -8);
    const auto pixel = view->mapFromScene(empty);
    QVERIFY(view->grab().toImage().pixelColor(pixel) != window.scene()->theme().canvas);
    save("real-2-grouped");
    const auto zoom = std::abs(view->transform().m11());
    QHash<QString, QPointF> before;
    for (const auto &id : QStringList{group, "prompt", "generate", "agent", "subject"}) { before[id] = absolute(window, id); }
    const auto undoIndex = window.document()->undoStack()->index();
    const auto start = view->mapFromScene(window.scene()->groupLabelRect(frame->nodeId(), zoom).center());
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    for (int step = 1; step <= 6; ++step) { QTest::mouseMove(view->viewport(), start + QPoint(25, 20) * step, 15); }
    save("real-3-dragging");
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, start + QPoint(150, 120));
    const QPointF delta(150 / zoom, 120 / zoom);
    for (const auto &id : QStringList{group, "prompt", "generate", "agent"}) {
      QTRY_VERIFY2(QLineF(absolute(window, id), before[id] + delta).length() < 1.5, qPrintable(id));
    }
    QCOMPARE(absolute(window, "subject"), before["subject"]);
    // Children keep their positions relative to the group in the document.
    QTRY_COMPARE(window.document()->undoStack()->index(), undoIndex + 1);
    QCOMPARE(relative(window, "prompt") + absolute(window, group), absolute(window, "prompt"));
    QTest::qWait(100);
    // The moved frame still draws behind its cards.
    for (const auto &id : members) { QVERIFY2(frame->zValue() < itemFor(window, id)->zValue(), qPrintable(id)); }
    save("real-4-moved");
    window.action("Undo");
    for (const auto &id : QStringList{group, "prompt", "generate", "agent"}) { QTRY_COMPARE(absolute(window, id), before[id]); }
    // React Flow expandParent: a card dragged past the frame stays in the group,
    // which grows to hold it. Past the top-left the frame moves and its other
    // cards keep their canvas place. Each drag is one undo step.
    const auto frameRect = [&] { return QRectF(absolute(window, group), model.layout(itemFor(window, group)->nodeId()).size); };
    const auto cardRect = [&](const QString &id) { return QRectF(absolute(window, id), model.layout(itemFor(window, id)->nodeId()).size); };
    const auto dragCard = [&](const QString &id, const QPoint &by) {
      window.scene()->clearSelection();
      const auto from = header(id);
      QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, from);
      for (int step = 1; step <= 6; ++step) { QTest::mouseMove(view->viewport(), from + by * step / 6, 15); }
      QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, from + by);
      QTest::qWait(60);
    };
    const auto steps = window.document()->undoStack()->index();
    dragCard("agent", QPoint(int(120 * zoom), int(260 * zoom)));
    QTRY_COMPARE(window.document()->undoStack()->index(), steps + 1);
    QCOMPARE(window.document()->node("agent")["parent_id"].toString(), group);
    QTRY_VERIFY(frameRect().contains(cardRect("agent")));
    QCOMPARE(absolute(window, group), before[group]);
    const auto generate = absolute(window, "generate");
    dragCard("prompt", QPoint(int(-120 * zoom), int(-160 * zoom)));
    QTRY_COMPARE(window.document()->undoStack()->index(), steps + 2);
    QCOMPARE(window.document()->node("prompt")["parent_id"].toString(), group);
    QTRY_VERIFY(frameRect().contains(cardRect("prompt")));
    QVERIFY(frameRect().contains(cardRect("agent")));
    QCOMPARE(absolute(window, "generate"), generate);
    QCOMPARE(relative(window, "generate") + absolute(window, group), generate);
    QTest::qWait(100);
    save("real-5-expanded");
    window.action("Undo");
    window.action("Undo");
    for (const auto &id : QStringList{group, "prompt", "generate", "agent"}) { QTRY_COMPARE(absolute(window, id), before[id]); }
  }

  // GroupNode.tsx shows how to take cards out once a dragged card has stayed over the group for a second.
  void dropHintShowsAfterASecondOverTheGroup() {
    EditorWindow window;
    loadDropFixture(window, false);
    auto *view = window.findChild<QGraphicsView *>();
    const auto start = pointOn(window, "card");
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    const auto target = view->mapFromScene(QPointF(260, 150));
    for (int step = 1; step <= 8; ++step) { QTest::mouseMove(view->viewport(), start + (target - start) * step / 8, 15); }
    QCOMPARE(window.scene()->dropGroup(), itemFor(window, "frame")->nodeId());
    QVERIFY(!window.scene()->dropHintVisible());
    // The box sits above the frame: the canvas there changes once the hint shows.
    const auto above = view->mapFromScene(QPointF(150, -60));
    const auto before = view->grab().toImage().pixelColor(above);
    QTRY_VERIFY_WITH_TIMEOUT(window.scene()->dropHintVisible(), 2000);
    view->viewport()->repaint();
    QVERIFY(view->grab().toImage().pixelColor(above) != before);
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, target);
    QVERIFY(!window.scene()->dropHintVisible());
  }

  // GroupNode.tsx sets pointer-events: none on the group body. A press there
  // starts a box selection, and the box takes the cards it touches but not the
  // group it does not enclose.
  void groupBodyPressStartsABoxSelection() {
    // Trackpad navigation draws a box on a pane drag. Mouse navigation pans instead.
    QSettings().setValue("canvas/navigation", "trackpad");
    const auto restore = qScopeGuard([] { QSettings().remove("canvas/navigation"); });
    EditorWindow window;
    loadDropFixture(window, true);
    auto *view = window.findChild<QGraphicsView *>();
    const auto frame = itemFor(window, "frame"), card = itemFor(window, "card");
    const auto position = absolute(window, "frame");
    const auto start = view->mapFromScene(QPointF(260, 210)), end = view->mapFromScene(QPointF(120, 110));
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    for (int step = 1; step <= 6; ++step) { QTest::mouseMove(view->viewport(), start + (end - start) * step / 6, 15); }
    QVERIFY(!view->rubberBandRect().isNull());
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, end);
    QTest::qWait(30);
    QVERIFY(card->isSelected());
    QVERIFY(!frame->isSelected());
    QCOMPARE(absolute(window, "frame"), position);
    QCOMPARE(window.document()->undoStack()->index(), 0);
    // A click on the body is a click on the pane: it clears the selection.
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    QTRY_VERIFY(!card->isSelected());
    QVERIFY(!frame->isSelected());
  }

  // With mouse navigation a pane drag pans the canvas, and so does a drag on a group body.
  void groupBodyDragPansWithMouseNavigation() {
    QSettings().setValue("canvas/navigation", "mouse");
    const auto restore = qScopeGuard([] { QSettings().remove("canvas/navigation"); });
    EditorWindow window;
    loadDropFixture(window, true);
    auto *view = window.findChild<QGraphicsView *>();
    const auto position = absolute(window, "frame");
    const auto start = view->mapFromScene(QPointF(260, 210));
    const auto before = view->mapToScene(start);
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    for (int step = 1; step <= 4; ++step) { QTest::mouseMove(view->viewport(), start + QPoint(-20, -10) * step, 15); }
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, start + QPoint(-80, -40));
    QTest::qWait(30);
    QVERIFY(view->mapToScene(start) != before);
    QCOMPARE(absolute(window, "frame"), position);
    QVERIFY(!itemFor(window, "frame")->isSelected());
  }

  // useSelectionEvents.ts selectGroupsWithinSelection: a box that encloses the frame selects the group.
  void boxEnclosingTheGroupSelectsIt() {
    QSettings().setValue("canvas/navigation", "trackpad");
    const auto restore = qScopeGuard([] { QSettings().remove("canvas/navigation"); });
    EditorWindow window;
    loadDropFixture(window, true);
    auto *view = window.findChild<QGraphicsView *>();
    // A box from the pane that touches the card but not the whole frame leaves the group out.
    const auto start = view->mapFromScene(QPointF(-40, -80)), partial = view->mapFromScene(QPointF(120, 110));
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    for (int step = 1; step <= 6; ++step) { QTest::mouseMove(view->viewport(), start + (partial - start) * step / 6, 15); }
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, partial);
    QTest::qWait(30);
    QVERIFY(itemFor(window, "card")->isSelected());
    QVERIFY(!itemFor(window, "frame")->isSelected());
    const auto end = view->mapFromScene(QPointF(330, 270));
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    for (int step = 1; step <= 6; ++step) { QTest::mouseMove(view->viewport(), start + (end - start) * step / 6, 15); }
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, end);
    QTest::qWait(30);
    QVERIFY(itemFor(window, "frame")->isSelected());
    QVERIFY(itemFor(window, "card")->isSelected());
  }

  // GroupNode.tsx: with Alt held, a group that holds a selected card dims to
  // half opacity and its body selects and drags it.
  void altMakesTheGroupOfASelectedCardTakeThePointer() {
    EditorWindow window;
    loadDropFixture(window, true);
    auto *view = window.findChild<QGraphicsView *>();
    auto *scene = window.scene();
    const auto frame = itemFor(window, "frame");
    const auto body = view->mapFromScene(QPointF(260, 210));
    view->setFocus();
    // Alt without a selected child changes nothing.
    QTest::keyPress(view, Qt::Key_Alt);
    QVERIFY(!scene->groupTakesPointer(frame->nodeId()));
    QCOMPARE(scene->groupOpacity(frame->nodeId()), 1.0);
    QVERIFY(window.selectNode("card"));
    QVERIFY(scene->groupTakesPointer(frame->nodeId()));
    QCOMPARE(scene->groupOpacity(frame->nodeId()), 0.5);
    QTest::keyRelease(view, Qt::Key_Alt);
    QVERIFY(!scene->groupTakesPointer(frame->nodeId()));
    QCOMPARE(scene->groupOpacity(frame->nodeId()), 1.0);
    const auto position = absolute(window, "frame");
    const auto card = absolute(window, "card");
    QTest::keyPress(view, Qt::Key_Alt);
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::AltModifier, body);
    QVERIFY(frame->isSelected());
    for (int step = 1; step <= 4; ++step) { QTest::mouseMove(view->viewport(), body + QPoint(10, 8) * step, 15); }
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::AltModifier, body + QPoint(40, 32));
    QTest::keyRelease(view, Qt::Key_Alt);
    QTRY_COMPARE(absolute(window, "frame"), position + QPointF(40, 32));
    QCOMPARE(absolute(window, "card"), card + QPointF(40, 32));
  }

  // ReactFlowWrapper.tsx selectGroupFromLabel: Shift adds the group to the
  // selection or takes it out, and a plain click selects the group alone.
  void labelClickTogglesWithShiftAndSelectsAlone() {
    EditorWindow window;
    loadDropFixture(window, true);
    auto *view = window.findChild<QGraphicsView *>();
    auto *scene = window.scene();
    const auto frame = itemFor(window, "frame"), card = itemFor(window, "card");
    const auto label = scene->groupLabelRect(frame->nodeId(), std::abs(view->transform().m11()));
    // The label is as wide as its text, so the header beyond it is not the label.
    QVERIFY(label.width() < 150);
    const auto point = view->mapFromScene(label.center());
    QVERIFY(window.selectNode("card"));
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::ShiftModifier, point);
    QVERIFY(frame->isSelected());
    QVERIFY(card->isSelected());
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::ShiftModifier, point);
    QVERIFY(!frame->isSelected());
    QVERIFY(card->isSelected());
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::ShiftModifier, point);
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, point);
    QVERIFY(frame->isSelected());
    QVERIFY(!card->isSelected());
  }

  // A right-click on the group body opens the pane menu, on the label the group menu.
  void rightClickOnTheBodyReachesThePane() {
    EditorWindow window;
    loadDropFixture(window, true);
    auto *view = window.findChild<QGraphicsView *>();
    auto *scene = window.scene();
    QSignalSpy menus(scene, &EditorScene::canvasContextMenuRequested);
    const auto body = view->mapFromScene(QPointF(260, 210));
    QContextMenuEvent onBody(QContextMenuEvent::Mouse, body, view->viewport()->mapToGlobal(body));
    QApplication::sendEvent(view->viewport(), &onBody);
    QCOMPARE(menus.size(), 1);
    QCOMPARE(menus.at(0).at(0).toString(), QString());
    const auto label = view->mapFromScene(scene->groupLabelRect(itemFor(window, "frame")->nodeId(), std::abs(view->transform().m11())).center());
    QContextMenuEvent onLabel(QContextMenuEvent::Mouse, label, view->viewport()->mapToGlobal(label));
    QApplication::sendEvent(view->viewport(), &onLabel);
    QCOMPARE(menus.size(), 2);
    QCOMPARE(menus.at(1).at(0).toString(), QString("frame"));
  }
};
QTEST_MAIN(GroupAuthoringTest)
#include "GroupAuthoringTest.moc"
