#include "graph/EditorScene.h"
#include "graph/InlinePropertyPresenter.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QContextMenuEvent>
#include <QDir>
#include <QGraphicsView>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QScrollBar>
#include <QSettings>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include <QWebSocket>
#include <QWebSocketServer>
#include <cmath>
#include "server/MsgPack.h"

using namespace nodetool;

// The web node toolbar floats above the selected card and follows it
// (NodeSelectionToolbar.tsx, NodeToolButtons.tsx). A card header double-click
// collapses the card to the 40 px strip of collapsed.css, and a Code node's
// header double-click renames it (NodeHeader.tsx). Every test drives the real
// pointer and key paths of an EditorWindow.
class NodeActionsTest final : public QObject {
    Q_OBJECT

private:
    static QJsonObject placed(const QString &id, const QString &type, double x, double y, const QJsonObject &extra = {}) {
        QJsonObject ui{{"position", QJsonObject{{"x", x}, {"y", y}}}};
        for (auto it = extra.begin(); it != extra.end(); ++it) {
            ui.insert(it.key(), it.value());
        }
        return {{"id", id}, {"type", type}, {"ui_properties", ui}};
    }

    static void load(EditorWindow &window) {
        const auto text = QJsonObject{{"type", "str"}};
        window.setCatalog({
            QJsonObject{{"node_type", "t"}, {"title", "Card"}, {"input_fields", QJsonArray{"in"}},
                {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", text}}}},
                {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", text}}}}},
            QJsonObject{{"node_type", "nodetool.code.Code"}, {"title", "Code"}, {"properties", QJsonArray{}},
                {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", text}}}}}});
        QJsonArray nodes{placed("a", "t", 100, 300), placed("b", "t", 500, 300), placed("c", "t", 900, 300),
                         placed("code", "nodetool.code.Code", 100, 600),
                         placed("g", "nodetool.workflows.base_node.Group", 500, 560, {{"width", 300}, {"height", 220}})};
        QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}).ok);
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        window.action("Reset zoom");
        QTest::qWait(80);
    }

    static QGraphicsView *viewOf(EditorWindow &window) { return window.findChild<QGraphicsView *>(); }
    static WorkflowGraphModel *modelOf(EditorWindow &window) { return window.findChild<WorkflowGraphModel *>(); }

    static QtNodes::NodeId idOf(EditorWindow &window, const QString &resource) {
        for (const auto id : modelOf(window)->allNodeIds()) {
            if (modelOf(window)->resourceId(id) == resource) {
                return id;
            }
        }
        return QtNodes::InvalidNodeId;
    }

    // The card in view coordinates, the space the overlays are placed in.
    static QRect cardRect(EditorWindow &window, const QString &resource) {
        const auto id = idOf(window, resource);
        const auto *item = window.scene()->nodeGraphicsObject(id);
        const QRectF scene(item->scenePos(), QSizeF(modelOf(window)->layout(id).size));
        return viewOf(window)->mapFromScene(scene).boundingRect().translated(viewOf(window)->viewport()->pos());
    }

    static QPoint headerPoint(EditorWindow &window, const QString &resource) {
        const auto card = cardRect(window, resource);
        return viewOf(window)->viewport()->mapFrom(viewOf(window), card.topLeft() + QPoint(card.width() / 2, 12));
    }

    static void centerOn(EditorWindow &window, const QString &resource) {
        viewOf(window)->centerOn(window.scene()->nodeGraphicsObject(idOf(window, resource)));
        QTest::qWait(40);
    }

    static void click(EditorWindow &window, const QString &resource, Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
        centerOn(window, resource);
        QTest::mouseClick(viewOf(window)->viewport(), Qt::LeftButton, modifiers, headerPoint(window, resource));
        // The card toolbar shows 200 ms after the selection settles (NodeSelectionToolbar.tsx).
        QTest::qWait(260);
    }

    static QQuickWidget *toolbar(EditorWindow &window) {
        for (auto *panel : window.findChildren<QQuickWidget *>()) {
            if (panel->source().fileName() == "SelectionToolbar.qml") {
                return panel;
            }
        }
        return nullptr;
    }

    static QQuickItem *button(EditorWindow &window, const QString &name) {
        auto *bar = toolbar(window);
        return bar && bar->rootObject() ? bar->rootObject()->findChild<QQuickItem *>(name) : nullptr;
    }

    static QPoint center(QQuickItem *item) {
        return item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
    }

    static QJsonObject ui(EditorWindow &window, const QString &resource) {
        return window.document()->node(resource)["ui_properties"].toObject();
    }

    // The toolbar sits centered over the card with the web's 8 px gap.
    static void expectAbove(EditorWindow &window, const QString &resource) {
        auto *bar = toolbar(window);
        QVERIFY(bar);
        QTRY_VERIFY(bar->isVisible());
        const auto card = cardRect(window, resource);
        QVERIFY2(std::abs(bar->geometry().center().x() - card.center().x()) <= 1,
                 qPrintable(QString("toolbar center %1, card center %2").arg(bar->geometry().center().x()).arg(card.center().x())));
        QCOMPARE(bar->geometry().bottom() + 1 + 8, card.top());
    }

private slots:
    void initTestCase() { QStandardPaths::setTestModeEnabled(true); }

    // The chat dock state persists between windows, so each test starts from a collapsed chat.
    void init() { QSettings().setValue("canvas-chat-dock/collapsed", true); }
    void cleanup() { QSettings().setValue("canvas-chat-dock/collapsed", true); }

    // A selected card gets the web toolbar over it: Run, Disable, Duplicate,
    // Chat and More, and none of the multi-selection actions.
    void toolbarFloatsAboveTheSelectedCard() {
        EditorWindow window;
        load(window);
        click(window, "a");
        expectAbove(window, "a");
        for (const auto &name : {"selection-run-selected", "selection-disable-selected", "selection-duplicate",
                                 "selection-chat-about-node", "selection-more-node-actions"}) {
            QVERIFY2(button(window, name), name);
        }
        for (const auto &name : {"selection-delete", "selection-group-selection", "selection-link-selected", "selection-arrange-selection"}) {
            QVERIFY2(!button(window, name), name);
        }
        click(window, "b");
        expectAbove(window, "b");
    }

    // NodeSelectionToolbar.tsx wraps the selection in useDelayedVisibility(200 ms) so a click
    // that turns into a drag does not flash the toolbar. Deselecting hides it at once and
    // selecting again restarts the delay.
    void toolbarShowsTwoHundredMillisecondsAfterTheSelection() {
        EditorWindow window;
        load(window);
        centerOn(window, "a");
        auto *bar = toolbar(window);
        QVERIFY(bar);
        QVERIFY(!bar->isVisible());
        QElapsedTimer clock;
        clock.start();
        QTest::mouseClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "a"));
        QCOMPARE(window.scene()->selectedItems().size(), 1);
        QTest::qWait(100);
        QVERIFY2(!bar->isVisible(), "the toolbar waits 200 ms");
        QTRY_VERIFY_WITH_TIMEOUT(bar->isVisible(), 1000);
        QVERIFY2(clock.elapsed() >= 195, qPrintable(QString::number(clock.elapsed())));
        window.scene()->clearSelection();
        QCoreApplication::processEvents();
        QVERIFY2(!bar->isVisible(), "deselecting hides the toolbar at once");
        QTest::mouseClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "a"));
        QTest::qWait(100);
        QVERIFY2(!bar->isVisible(), "selecting again restarts the delay");
        QTRY_VERIFY_WITH_TIMEOUT(bar->isVisible(), 1000);
    }

    // The toolbar also hides while a Select dropdown is open (NodeSelectionToolbar.tsx reads
    // useSelect activeSelect, which is the dropdown store, not a box selection).
    void toolbarHidesWhileADropdownIsOpen() {
        EditorWindow window;
        load(window);
        click(window, "a");
        expectAbove(window, "a");
        auto *presenter = window.findChild<InlinePropertyPresenter *>();
        QVERIFY(presenter);
        presenter->popupRect(QRectF(0, 0, 40, 40));
        QVERIFY(!toolbar(window)->isVisible());
        presenter->popupRect({});
        expectAbove(window, "a");
    }

    // The toolbar tracks the card through a pan, a zoom, a resize and a move.
    void toolbarFollowsPanZoomAndGeometry() {
        EditorWindow window;
        load(window);
        click(window, "a");
        expectAbove(window, "a");
        auto *view = viewOf(window);
        const auto start = view->viewport()->rect().center();
        QTest::mousePress(view->viewport(), Qt::MiddleButton, Qt::NoModifier, start);
        QTest::mouseMove(view->viewport(), start + QPoint(70, 40));
        QTest::mouseRelease(view->viewport(), Qt::MiddleButton, Qt::NoModifier, start + QPoint(70, 40));
        QTest::qWait(40);
        expectAbove(window, "a");
        window.action("Zoom in");
        QTest::qWait(40);
        expectAbove(window, "a");
        window.action("Zoom out");
        window.action("Zoom out");
        QTest::qWait(40);
        expectAbove(window, "a");
        // A resize from the corner handle moves the card center, and the toolbar follows.
        const auto before = cardRect(window, "a");
        const auto corner = view->viewport()->mapFrom(view, before.bottomRight() - QPoint(6, 6));
        QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, corner);
        QTest::mouseMove(view->viewport(), corner + QPoint(60, 30));
        QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, corner + QPoint(60, 30));
        QTest::qWait(60);
        QVERIFY(cardRect(window, "a").width() > before.width());
        expectAbove(window, "a");
    }

    // The web hides the toolbar while the card drags and shows it again where the card lands.
    void toolbarHidesWhileTheCardDrags() {
        EditorWindow window;
        load(window);
        click(window, "a");
        expectAbove(window, "a");
        auto *view = viewOf(window);
        const auto start = headerPoint(window, "a");
        QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
        for (int step = 1; step <= 6; ++step) {
            QTest::mouseMove(view->viewport(), start + QPoint(step * 12, step * 6), 15);
        }
        QVERIFY(window.scene()->nodeDragActive());
        QVERIFY(!toolbar(window)->isVisible());
        QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, start + QPoint(72, 36));
        QTest::qWait(60);
        QVERIFY(!window.scene()->nodeDragActive());
        expectAbove(window, "a");
    }

    // A group, a comment and several cards keep the canvas toolbar at the top center.
    void groupsCommentsAndSelectionsKeepTheCanvasToolbar() {
        EditorWindow window;
        load(window);
        click(window, "a");
        click(window, "b", Qt::ControlModifier);
        auto *bar = toolbar(window);
        QVERIFY(bar);
        QTRY_VERIFY(bar->isVisible());
        QCOMPARE(bar->y(), 30);
        QVERIFY(button(window, "selection-group-selection"));
        QVERIFY(!button(window, "selection-more-node-actions"));
        window.selectNode("g");
        QTest::qWait(60);
        QTRY_VERIFY(bar->isVisible());
        QCOMPARE(bar->y(), 30);
    }

    // More opens the node context menu under the button.
    void moreButtonOpensTheNodeMenu() {
        EditorWindow window;
        load(window);
        click(window, "a");
        QQuickItem *more = nullptr;
        QTRY_VERIFY((more = button(window, "selection-more-node-actions")));
        QTest::mouseClick(toolbar(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(more));
        QQuickWidget *menu = nullptr;
        QTRY_VERIFY((menu = window.findChild<QQuickWidget *>("context-menu-host")) && menu->isVisible());
        QVariant result;
        QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, QString("toggle-collapsed")));
        QVERIFY(qobject_cast<QQuickItem *>(result.value<QObject *>()));
    }

    // Duplicate and Disable run from the toolbar with real clicks, each as one undo step.
    void toolbarDisableAndDuplicate() {
        EditorWindow window;
        load(window);
        click(window, "a");
        const auto baseline = window.document()->snapshot();
        QQuickItem *disable = nullptr;
        QTRY_VERIFY((disable = button(window, "selection-disable-selected")));
        QTest::mouseClick(toolbar(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(disable));
        QTRY_VERIFY(ui(window, "a")["bypassed"].toBool());
        QCOMPARE(window.document()->undoStack()->index(), 1);
        window.action("Undo");
        QCOMPARE(window.document()->snapshot(), baseline);
        QQuickItem *duplicate = nullptr;
        QTRY_VERIFY((duplicate = button(window, "selection-duplicate")));
        QTest::mouseClick(toolbar(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(duplicate));
        QTRY_COMPARE(window.document()->nodes().size(), 6);
        QCOMPARE(window.document()->undoStack()->index(), 1);
    }

    // The chat button opens the chat with a draft that names the node.
    void chatButtonOpensTheChat() {
        // The dock state persists between windows, so start from a collapsed chat.
        QSettings().setValue("canvas-chat-dock/collapsed", true);
        EditorWindow window;
        load(window);
        click(window, "a");
        QQuickItem *chat = nullptr;
        QTRY_VERIFY((chat = button(window, "selection-chat-about-node")));
        QVERIFY(!window.chatVisible());
        QTest::mouseClick(toolbar(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(chat));
        QTRY_VERIFY(window.chatVisible());
    }

    // A double-click on the header collapses the card to a 40 px strip and
    // another expands it. Each is one undo step and keeps the expanded size.
    void headerDoubleClickCollapsesAndExpands() {
        EditorWindow window;
        load(window);
        const auto id = idOf(window, "a");
        const auto expanded = modelOf(window)->layout(id).size;
        QVERIFY(expanded.height() > 40);
        const auto baseline = window.document()->snapshot();
        centerOn(window, "a");
        QTest::mouseDClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "a"));
        QTRY_VERIFY(ui(window, "a")["collapsed"].toBool());
        QCOMPARE(window.document()->undoStack()->index(), 1);
        const auto &strip = modelOf(window)->layout(id);
        QVERIFY(strip.collapsed);
        QCOMPARE(strip.size.height(), 40);
        QVERIFY(strip.size.width() >= 140 && strip.size.width() <= expanded.width());
        QVERIFY(strip.rows.isEmpty());
        // Every socket sits on the strip's midline.
        for (const auto y : strip.inputY) { QCOMPARE(y, 20.0); }
        for (const auto y : strip.outputY) { QCOMPARE(y, 20.0); }
        // The expanded size stays in the document for the expand.
        QVERIFY(!ui(window, "a").contains("width") || ui(window, "a")["width"].toInt() >= 140);
        QTest::qWait(40);
        QTest::mouseDClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "a"));
        QTRY_VERIFY(!ui(window, "a")["collapsed"].toBool());
        QCOMPARE(modelOf(window)->layout(idOf(window, "a")).size, expanded);
        QCOMPARE(window.document()->undoStack()->index(), 2);
        window.action("Undo");
        window.action("Undo");
        QCOMPARE(window.document()->snapshot(), baseline);
    }

    // C toggles the collapsed state of the selection. The first card's next
    // state drives every selected card, in one undo step.
    void cKeyCollapsesTheSelectionUniformly() {
        EditorWindow window;
        load(window);
        click(window, "a");
        auto *view = viewOf(window);
        QTest::keyClick(view, Qt::Key_C);
        QTRY_VERIFY(ui(window, "a")["collapsed"].toBool());
        QVERIFY(!ui(window, "b")["collapsed"].toBool());
        click(window, "a");
        click(window, "b", Qt::ControlModifier);
        QCOMPARE(window.selectedCount(), 2);
        const auto index = window.document()->undoStack()->index();
        QTest::keyClick(view, Qt::Key_C);
        QTRY_COMPARE(window.document()->undoStack()->index(), index + 1);
        QCOMPARE(ui(window, "a")["collapsed"].toBool(), ui(window, "b")["collapsed"].toBool());
        // A group has no collapsed state.
        window.selectNode("g");
        const auto snapshot = window.document()->snapshot();
        QTest::keyClick(view, Qt::Key_C);
        QCOMPARE(window.document()->snapshot(), snapshot);
    }

    // The node menu's Collapse entry names the state and runs the same action.
    void nodeMenuCollapsesAndNamesTheState() {
        EditorWindow window;
        load(window);
        auto open = [&](const QString &resource) -> QQuickWidget * {
            centerOn(window, resource);
            const auto point = headerPoint(window, resource);
            QContextMenuEvent event(QContextMenuEvent::Mouse, point, viewOf(window)->viewport()->mapToGlobal(point));
            QApplication::sendEvent(viewOf(window)->viewport(), &event);
            QTest::qWait(80);
            return window.findChild<QQuickWidget *>("context-menu-host");
        };
        auto label = [](QQuickWidget *menu) {
            for (const auto &value : menu->rootObject()->property("entries").toList()) {
                const auto row = value.toMap();
                if (row["id"].toString() == "toggle-collapsed") {
                    return row["label"].toString();
                }
            }
            return QString();
        };
        auto *menu = open("b");
        QVERIFY(menu);
        QCOMPARE(label(menu), QString("Collapse node"));
        QVariant result;
        QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, QString("toggle-collapsed")));
        auto *entry = qobject_cast<QQuickItem *>(result.value<QObject *>());
        QVERIFY(entry);
        QVERIFY(entry->isEnabled());
        QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, center(entry));
        QTRY_VERIFY(ui(window, "b")["collapsed"].toBool());
        menu = open("b");
        QVERIFY(menu);
        QCOMPARE(label(menu), QString("Expand node"));
    }

    // A collapsed card paints as a strip: the body area below it shows the canvas.
    void collapsedCardPaintsAsAStrip() {
        EditorWindow window;
        load(window);
        window.action("Reset zoom");
        click(window, "c");
        window.action("Toggle collapse");
        QTRY_VERIFY(ui(window, "c")["collapsed"].toBool());
        QTest::qWait(60);
        const auto image = window.grab().toImage();
        const auto card = cardRect(window, "c");
        QVERIFY(std::abs(card.height() - 40) <= 1);
        const auto canvas = window.scene()->theme().canvas;
        const auto below = window.mapFromGlobal(viewOf(window)->viewport()->mapToGlobal(viewOf(window)->viewport()->mapFrom(viewOf(window), card.bottomLeft() + QPoint(card.width() / 2, 30))));
        QVERIFY(image.rect().contains(below));
        // 30 px under the strip is bare canvas, not an expanded body.
        QVERIFY(std::abs(image.pixelColor(below).lightness() - canvas.lightness()) < 40);
    }

    // A Code node's header edits in place: Enter stores the title, a blank
    // draft or the metadata title stores nothing, and Escape discards.
    void codeHeaderRenamesInPlace() {
        EditorWindow window;
        load(window);
        auto overlay = [&]() -> QQuickWidget * {
            for (auto *widget : window.findChildren<QQuickWidget *>()) {
                const auto *text = widget->rootObject() ? widget->rootObject()->findChild<QQuickItem *>("inline-title-text") : nullptr;
                if (widget->objectName() == "inline-title-overlay" && widget->isVisible() && text && text->hasActiveFocus()) {
                    return widget;
                }
            }
            return nullptr;
        };
        const auto baseline = window.document()->snapshot();
        centerOn(window, "code");
        QTest::mouseDClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "code"));
        QQuickWidget *widget = nullptr;
        QTRY_VERIFY((widget = overlay()));
        auto *field = widget->rootObject()->findChild<QQuickItem *>("inline-title-text");
        QVERIFY(field);
        QTRY_VERIFY(field->hasActiveFocus());
        QCOMPARE(field->property("text").toString(), QString("Code"));
        QVERIFY(!ui(window, "code")["collapsed"].toBool());
        QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier);
        QTest::keyClicks(widget, "Parse rows");
        QTest::keyClick(widget, Qt::Key_Return);
        QTRY_COMPARE(ui(window, "code")["title"].toString(), QString("Parse rows"));
        QCOMPARE(window.document()->undoStack()->index(), 1);
        QCOMPARE(modelOf(window)->layout(idOf(window, "code")).title, QString("Parse rows"));
        // Escape discards.
        centerOn(window, "code");
        QTest::mouseDClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "code"));
        QTRY_VERIFY((widget = overlay()));
        QTest::keyClicks(widget, " draft");
        QTest::keyClick(widget, Qt::Key_Escape);
        QTRY_VERIFY(!overlay());
        QCOMPARE(ui(window, "code")["title"].toString(), QString("Parse rows"));
        QCOMPARE(window.document()->undoStack()->index(), 1);
        // The metadata title stores nothing, so the header follows the metadata again.
        centerOn(window, "code");
        QTest::mouseDClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, headerPoint(window, "code"));
        QTRY_VERIFY((widget = overlay()));
        QTest::keyClick(widget, Qt::Key_A, Qt::ControlModifier);
        QTest::keyClicks(widget, "Code");
        QTest::keyClick(widget, Qt::Key_Return);
        QTRY_VERIFY(ui(window, "code")["title"].toString().isEmpty());
        QCOMPARE(modelOf(window)->layout(idOf(window, "code")).title, QString("Code"));
        window.action("Undo");
        window.action("Undo");
        QCOMPARE(window.document()->snapshot(), baseline);
    }

    // web NodeStore.toggleBypassSelected: shouldBypass = bypassedCount < selected / 2.
    // B and the toolbar button follow that majority, so one disabled card out of
    // two enables both, and one out of three disables all three.
    void bKeyAndToolbarFollowTheBypassMajority() {
        EditorWindow window;
        load(window);
        click(window, "a");
        window.action("Disable selected");
        QTRY_VERIFY(ui(window, "a")["bypassed"].toBool());
        click(window, "a");
        click(window, "b", Qt::ControlModifier);
        QCOMPARE(window.selectedCount(), 2);
        QTRY_VERIFY(button(window, "selection-enable-selected"));
        QVERIFY(!button(window, "selection-disable-selected"));
        QTest::keyClick(viewOf(window), Qt::Key_B);
        QTRY_VERIFY(!ui(window, "a")["bypassed"].toBool());
        QVERIFY(!ui(window, "b")["bypassed"].toBool());
        click(window, "c");
        window.action("Disable selected");
        QTRY_VERIFY(ui(window, "c")["bypassed"].toBool());
        click(window, "a");
        click(window, "b", Qt::ControlModifier);
        click(window, "c", Qt::ControlModifier);
        QCOMPARE(window.selectedCount(), 3);
        QTRY_VERIFY(button(window, "selection-disable-selected"));
        QTest::keyClick(viewOf(window), Qt::Key_B);
        QTRY_VERIFY(ui(window, "a")["bypassed"].toBool());
        QVERIFY(ui(window, "b")["bypassed"].toBool());
        QVERIFY(ui(window, "c")["bypassed"].toBool());
    }

    // web useRunFromHere returns isWorkflowRunning: false. Run node is an
    // independent job that neither the toolbar nor the menu disables while
    // another run is active. Run selected on several cards still waits.
    void runNodeStartsAnIndependentJobDuringAnActiveRun() {
        QWebSocketServer server("run node", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QList<QJsonObject> requests;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            auto *peer = server.nextPendingConnection();
            peer->setParent(&server);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [&](const QByteArray &bytes) {
                const auto message = node_editor::decodeMsgPack(bytes);
                QVERIFY(message);
                requests.append(message->toObject());
            });
        });
        EditorWindow window;
        load(window);
        window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
        QTRY_VERIFY(window.session()->connected());
        click(window, "a");
        window.action("Run selected");
        QTRY_COMPARE(requests.size(), 1);
        QTRY_VERIFY(window.runActive());
        click(window, "b");
        QQuickItem *run = nullptr;
        QTRY_VERIFY((run = button(window, "selection-run-selected")));
        QVERIFY(run->isEnabled());
        QTest::mouseClick(toolbar(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(run));
        QTRY_COMPARE(requests.size(), 2);
        const auto nodes = requests.last()["data"].toObject()["graph"].toObject()["nodes"].toArray();
        QCOMPARE(nodes.size(), 1);
        QCOMPARE(nodes.first().toObject()["id"].toString(), QString("b"));
        click(window, "a");
        click(window, "b", Qt::ControlModifier);
        QCOMPARE(window.selectedCount(), 2);
        window.action("Run selected");
        QTest::qWait(60);
        QCOMPARE(requests.size(), 2);
    }

    // web nodes.states.css .bypassed .base-node: a dashed border over a 45 degree
    // stripe of action-hover, and NodeHeader.tsx draws the Disabled chip in the
    // warning tone.
    void disabledCardPaintsStripesAndAWarningBadge() {
        EditorWindow window;
        load(window);
        click(window, "a");
        window.action("Disable selected");
        QTRY_VERIFY(ui(window, "a")["bypassed"].toBool());
        window.scene()->clearSelection();
        window.action("Reset zoom");
        QTest::qWait(80);
        const auto image = window.grab().toImage();
        const auto crop = [&](const QString &resource) {
            const auto card = cardRect(window, resource);
            const auto origin = window.mapFromGlobal(viewOf(window)->viewport()->mapToGlobal(viewOf(window)->viewport()->mapFrom(viewOf(window), card.topLeft())));
            return image.copy(origin.x(), origin.y(), card.width(), card.height());
        };
        const auto disabled = crop("a");
        const auto enabled = crop("b");
        QCOMPARE(disabled.size(), enabled.size());
        const auto distinct = [](const QImage &card, int fromX, int toX, int y) {
            QSet<QRgb> colors;
            for (int x = fromX; x < toX; ++x) { colors.insert(card.pixel(x, y)); }
            return colors.size();
        };
        // A row inside the card's bottom padding, clear of text and sockets.
        const int y = disabled.height() - 5;
        QCOMPARE(distinct(enabled, 24, enabled.width() - 24, y), 1);
        QVERIFY2(distinct(disabled, 24, disabled.width() - 24, y) >= 2, "a disabled card shows diagonal stripes");
        const auto warm = [](const QImage &card) {
            int count = 0;
            for (int row = 4; row < 26; ++row) {
                for (int x = card.width() - 80; x < card.width() - 6; ++x) {
                    const auto c = card.pixelColor(x, row);
                    count += c.red() > c.blue() + 15 ? 1 : 0;
                }
            }
            return count;
        };
        QCOMPARE(warm(enabled), 0);
        QVERIFY2(warm(disabled) > 10, "the Disabled badge uses the warning tone");
    }

    void captures() {
        const auto directory = qEnvironmentVariable("NODETOOL_NODE_ACTIONS_CAPTURE_DIR");
        if (directory.isEmpty()) {
            QSKIP("Set NODETOOL_NODE_ACTIONS_CAPTURE_DIR to write the captures");
        }
        QDir().mkpath(directory);
        EditorWindow window;
        load(window);
        click(window, "a");
        for (const bool dark : {true, false}) {
            window.setDarkTheme(dark);
            QTest::qWait(120);
            expectAbove(window, "a");
            QVERIFY(window.grab().save(directory + (dark ? "/node-toolbar-dark.png" : "/node-toolbar-light.png")));
        }
        window.action("Toggle collapse");
        click(window, "b");
        window.action("Toggle collapse");
        for (const bool dark : {true, false}) {
            window.setDarkTheme(dark);
            QTest::qWait(120);
            QVERIFY(window.grab().save(directory + (dark ? "/node-collapsed-dark.png" : "/node-collapsed-light.png")));
        }
    }
};

QTEST_MAIN(NodeActionsTest)
#include "NodeActionsTest.moc"
