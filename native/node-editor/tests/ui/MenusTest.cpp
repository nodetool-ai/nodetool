#include "ui/EditorWindow.h"
#include "../graph/BodyConnectionFixture.h"
#include "graph/EditorScene.h"
#include <QGraphicsView>
#include <QMenu>
#include <QtTest>
#include <QContextMenuEvent>
#include <QClipboard>
#include <QDir>
#include <QLineEdit>
#include <QPainter>
#include <QDialog>
#include <QQuickWidget>
#include <QQuickItem>
#include <QFile>
#include <QRegularExpression>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
using namespace nodetool;
class MenusTest final : public QObject {
    Q_OBJECT
    static QJsonArray catalog() {
        auto result = body_fixture::catalog();
        const auto out = QJsonArray{picker_fixture::slot("output", picker_fixture::type("str"))};
        for (const auto *type : {"nodetool.constant.String", "nodetool.constant.Audio", "nodetool.input.StringInput",
                                 "nodetool.workflows.subgraph.Subgraph", "nodetool.workflows.workflow_node.Workflow"}) {
            result.append(QJsonObject{{"node_type", type}, {"properties", QJsonArray{}}, {"outputs", out}});
        }
        return result;
    }
    static QJsonObject node(const QString &id, const QString &type, int x, int y = 100, const QJsonObject &data = {}, const QString &note = {}) {
        QJsonObject ui{{"position", QJsonObject{{"x", x}, {"y", y}}}};
        if (!note.isEmpty()) {
            ui["title"] = note;
        }
        return {{"id", id}, {"type", type}, {"data", data}, {"ui_properties", ui}};
    }
    static QtNodes::NodeId nodeId(EditorWindow &window, const QString &resource) {
        auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
        for (const auto id : model.allNodeIds()) {
            if (model.resourceId(id) == resource) {
                return id;
            }
        }
        return QtNodes::InvalidNodeId;
    }
    static QGraphicsView *view(EditorWindow &window) {
        return window.findChild<QGraphicsView *>();
    }
    static QQuickWidget *host(EditorWindow &window) {
        return window.findChild<QQuickWidget *>("context-menu-host");
    }
    // A real context-menu event on the canvas viewport.
    static QQuickWidget *contextAt(EditorWindow &window, const QPoint &point) {
        auto *canvas = view(window);
        QContextMenuEvent event(QContextMenuEvent::Mouse, point, canvas->viewport()->mapToGlobal(point));
        QApplication::sendEvent(canvas->viewport(), &event);
        auto *menu = host(window);
        if (menu) {
            QTest::qWait(60);
        }
        return menu;
    }
    static QQuickWidget *contextOnNode(EditorWindow &window, const QString &resource) {
        auto *item = window.scene()->nodeGraphicsObject(nodeId(window, resource));
        view(window)->centerOn(item);
        QTest::qWait(30);
        return contextAt(window, view(window)->mapFromScene(item->scenePos() + QPointF(20, 10)));
    }
    static QQuickItem *entry(QQuickWidget *menu, const QString &id) {
        QVariant result;
        QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, id));
        return qobject_cast<QQuickItem *>(result.value<QObject *>());
    }
    static QPoint centre(QQuickItem *item) {
        return item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
    }
    // The item ids in menu order, with "-" for a divider and "#label" for a header.
    static QStringList layout(QQuickWidget *menu) {
        QStringList result;
        for (const auto &value : menu->rootObject()->property("entries").toList()) {
            const auto row = value.toMap();
            result << (row.contains("separator") ? QString("-") : row.contains("header") ? "#" + row["header"].toString() : row["id"].toString());
        }
        return result;
    }
    static QStringList labels(QQuickWidget *menu) {
        QStringList result;
        for (const auto &value : menu->rootObject()->property("entries").toList()) {
            const auto row = value.toMap();
            if (row.contains("label")) {
                result << row["label"].toString();
            }
        }
        return result;
    }
    // Repeater delegates are visual children only, so findChild cannot reach them.
    static QQuickItem *visualChild(QQuickItem *parent, const QString &name) {
        for (auto *child : parent->childItems()) {
            if (child->objectName() == name) {
                return child;
            }
            if (auto *found = visualChild(child, name)) {
                return found;
            }
        }
        return nullptr;
    }
    static bool enabled(QQuickWidget *menu, const QString &id) {
        auto *item = entry(menu, id);
        return item && item->isEnabled();
    }
    static void clickEntry(QQuickWidget *menu, const QString &id) {
        auto *item = entry(menu, id);
        QVERIFY2(item, qPrintable(id));
        QTRY_VERIFY(item->isVisible() && item->width() > 0);
        QTest::mouseMove(menu, centre(item));
        QTest::qWait(30);
        QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, centre(item));
    }
    static void closeMenu(EditorWindow &window) {
        if (host(window)) {
            QTest::keyClick(host(window), Qt::Key_Escape);
        }
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
    }
    static QString lastType(EditorWindow &window) {
        return window.document()->nodes().last().toObject()["type"].toString();
    }
private slots:
    void initTestCase() {
        QLocale::setDefault(QLocale(QLocale::English, QLocale::UnitedStates));
    }
    void inventoryBindings() {
        QFile file(NODE_EDITOR_PARITY_DOC);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto contents = QString::fromUtf8(file.readAll());
        EditorWindow window;
        window.action("Keyboard shortcuts");
        auto *quick = window.findChild<QDialog *>("shortcuts-panel")->findChild<QQuickWidget *>();
        const auto rows = quick->rootObject()->property("rows").toList();
        QSet<QString> bound;
        for (const auto &value : rows) { bound.insert(value.toMap()["label"].toString()); }
        int inspected = 0;
        for (const auto &line : contents.split('\n')) {
            if (!line.startsWith("| shortcuts.ts") || !line.contains("Mapped through this work: ")) { continue; }
            ++inspected;
            const auto command = line.section("Mapped through this work: ", 1).section('.', 0, 0);
            QVERIFY2(bound.contains(command), qPrintable(command));
        }
        QVERIFY(inspected > 0);
    }
    void commandShortcut() {
        EditorWindow window; window.show(); QTest::qWait(50);
        auto *canvas = view(window); QVERIFY(canvas);
        canvas->setFocus(); QTest::keyClick(canvas->viewport(), Qt::Key_K, Qt::ControlModifier);
        QTRY_VERIFY(window.findChild<QDialog *>("command-panel"));
        auto *panel = window.findChild<QDialog *>("command-panel");
        auto *quick = panel->findChild<QQuickWidget *>(); QVERIFY(quick);
        QCOMPARE(quick->status(), QQuickWidget::Ready);
        QTest::qWait(50);
        auto *search = quick->rootObject()->findChild<QQuickItem *>("action-search"); QVERIFY(search);
        const auto point = search->mapToScene(QPointF(search->width()/2, search->height()/2)).toPoint();
        QTest::mouseClick(quick, Qt::LeftButton, Qt::NoModifier, point);
        QTest::keyClicks(quick, "Delete");
        QTRY_COMPARE(quick->rootObject()->property("query").toString(), QString("Delete"));
        QTest::keyClick(quick, Qt::Key_Return);
        QVERIFY(panel->isVisible());
        QCOMPARE(window.document()->undoStack()->index(), 0);
        QTest::keyClick(quick, Qt::Key_Escape);
        QTRY_VERIFY(!panel->isVisible());
    }

    // PaneContextMenu.tsx: Paste, Fit screen, constant and input submenus, then the add rows.
    void paneMenuEntriesAndEnablement() {
        EditorWindow window;
        window.setCatalog(catalog());
        window.resize(1400, 1000);
        window.show();
        QTest::qWait(50);
        QApplication::clipboard()->clear();
        auto *menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        QCOMPARE(layout(menu), (QStringList{"paste", "fit", "-", "add-constant", "add-input", "-", "add-comment", "add-group", "add-workflow", "add-subgraph", "add-app"}));
        QCOMPARE(labels(menu), (QStringList{"Paste", "Fit screen", "Add constant node", "Add input node", "Add comment", "Add group", "Add workflow", "Add subgraph", "Add app"}));
        QVERIFY(!enabled(menu, "paste"));
        QVERIFY(entry(menu, "paste")->property("reasonText").toString().contains("No valid node data"));
        QVERIFY(enabled(menu, "fit"));
        QVERIFY(enabled(menu, "add-constant"));
        QVERIFY(enabled(menu, "add-comment"));
        QVERIFY(enabled(menu, "add-workflow"));
        QVERIFY(!enabled(menu, "add-app"));
        QCOMPARE(entry(menu, "paste")->property("shortcutText").toString(), QKeySequence("Ctrl+V").toString(QKeySequence::NativeText));
        QCOMPARE(entry(menu, "fit")->property("shortcutText").toString(), QString("F"));
        closeMenu(window);
        QApplication::clipboard()->setText(R"({"nodes":[],"edges":[]})");
        menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        QVERIFY(enabled(menu, "paste"));
        closeMenu(window);
    }
    void paneSubmenuAddsNodeAtMenuPosition() {
        EditorWindow window;
        window.setCatalog(catalog());
        window.resize(1400, 1000);
        window.show();
        window.action("Reset zoom");
        QTest::qWait(50);
        const QPoint point(220, 260);
        auto *menu = contextAt(window, point);
        QVERIFY(menu);
        clickEntry(menu, "add-constant");
        const QString id = "add-constant:nodetool.constant.String";
        QTRY_VERIFY(entry(menu, id) && entry(menu, id)->isVisible() && entry(menu, id)->width() > 0);
        QCOMPARE(entry(menu, "add-constant:nodetool.constant.Audio") != nullptr, true);
        // The submenu lists only constants the catalog has, in label order.
        QCOMPARE(entry(menu, "add-constant:nodetool.constant.Bool"), nullptr);
        clickEntry(menu, id);
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        QCOMPARE(lastType(window), QString("nodetool.constant.String"));
        const auto stored = window.document()->nodes().last().toObject()["ui_properties"].toObject()["position"].toObject();
        const auto expected = view(window)->mapToScene(point);
        QVERIFY(std::abs(stored["x"].toDouble() - expected.x()) < 1);
        QVERIFY(std::abs(stored["y"].toDouble() - expected.y()) < 1);
        QCOMPARE(window.document()->undoStack()->index(), 1);
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        menu = contextAt(window, point);
        clickEntry(menu, "add-group");
        QTRY_COMPARE(window.document()->nodes().size(), 2);
        QVERIFY(lastType(window).endsWith(".Group"));
    }
    void paneKeyboardNavigation() {
        EditorWindow window;
        window.setCatalog(catalog());
        window.resize(1400, 1000);
        window.show();
        QTest::qWait(50);
        QApplication::clipboard()->clear();
        auto *menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        // Paste is off, so the first Down lands on Fit screen. Arrows skip dividers.
        QTest::keyClick(menu, Qt::Key_Down);
        QTRY_VERIFY(entry(menu, "fit")->property("highlighted").toBool());
        QTest::keyClick(menu, Qt::Key_Down);
        QTRY_VERIFY(entry(menu, "add-constant")->property("highlighted").toBool());
        QTest::keyClick(menu, Qt::Key_Up);
        QTRY_VERIFY(entry(menu, "fit")->property("highlighted").toBool());
        QTest::keyClick(menu, Qt::Key_Down);
        QTest::keyClick(menu, Qt::Key_Right);
        const QString audio = "add-constant:nodetool.constant.Audio";
        QTRY_VERIFY(entry(menu, audio) && entry(menu, audio)->isVisible());
        QTRY_VERIFY(entry(menu, audio)->property("highlighted").toBool());
        QTest::keyClick(menu, Qt::Key_Return);
        QTRY_COMPARE(window.document()->nodes().size(), 1);
        QCOMPARE(lastType(window), QString("nodetool.constant.Audio"));
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        QTest::keyClick(menu, Qt::Key_Escape);
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
    }

    void closedPaneMenuDoesNotMeasureDestroyedItems() {
        {
            EditorWindow window;
            window.setCatalog(catalog());
            window.resize(1000, 700);
            window.show();
            auto* pane = contextAt(window, QPoint(30, 100));
            QVERIFY(pane);
            QTest::keyClick(pane, Qt::Key_Escape);
            QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        }
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        QCoreApplication::processEvents();
        EditorWindow window;
        window.setCatalog(catalog());
        QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{
            node("plain", "Fixed", 0)}}, {"edges", QJsonArray{}}}}}));
        window.resize(1000, 700);
        window.show();
        window.action("Reset zoom");
        auto* menu = contextOnNode(window, "plain");
        QVERIFY(menu);
        QVERIFY(entry(menu, "copy"));
        QVERIFY(entry(menu, "delete-node"));
        QTest::keyClick(menu, Qt::Key_Escape);
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        QCoreApplication::processEvents();
    }

    // NodeContextMenu.tsx
    void nodeMenuEntriesAndActions() {
        EditorWindow window;
        window.setCatalog(catalog());
        QVERIFY(window.document()->load(QJsonObject{{"id", "node-menu"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("constant", "nodetool.constant.String", 0), node("plain", "Fixed", 700, 100, {}, "Existing note"), node("other", "Fixed", 1400),
            node("grouped", "Sink", 100, 400)}}, {"edges", QJsonArray{}}}}}));
        window.resize(1400, 1000);
        window.show();
        window.action("Reset zoom");
        QTest::qWait(60);
        QApplication::clipboard()->clear();
        auto *menu = contextOnNode(window, "plain");
        QVERIFY(menu);
        QCOMPARE(layout(menu), (QStringList{"chat-about-node", "-", "copy", "cut", "copy-json", "duplicate", "duplicate-vertical", "run-node", "toggle-bypass",
            "toggle-collapsed", "toggle-comment", "group-into-subgraph", "show-templates", "select-same-type", "-", "delete-node"}));
        QCOMPARE(labels(menu), (QStringList{"Chat about node", "Copy", "Cut", "Copy node as JSON", "Duplicate", "Duplicate vertically", "Run node", "Disable node",
            "Collapse node", "Delete comment", "Group into subgraph", "Show templates", "Select all Fixed nodes", "Delete node"}));
        QVERIFY(enabled(menu, "copy"));
        QVERIFY(enabled(menu, "toggle-comment"));
        QVERIFY(enabled(menu, "group-into-subgraph"));
        // No server is connected, so a run is off. Collapse needs no server.
        QVERIFY(!enabled(menu, "run-node"));
        QVERIFY(enabled(menu, "toggle-collapsed"));
        QCOMPARE(entry(menu, "delete-node")->property("textTone").toInt(), 6);
        QCOMPARE(entry(menu, "copy")->property("shortcutText").toString(), QKeySequence("Ctrl+C").toString(QKeySequence::NativeText));
        QCOMPARE(entry(menu, "toggle-bypass")->property("shortcutText").toString(), QString("B"));
        clickEntry(menu, "copy-json");
        QTRY_VERIFY(QApplication::clipboard()->text().contains("\"id\": \"plain\""));
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);

        menu = contextOnNode(window, "plain");
        clickEntry(menu, "toggle-bypass");
        QTRY_VERIFY(window.document()->node("plain")["ui_properties"].toObject()["bypassed"].toBool());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        menu = contextOnNode(window, "plain");
        QVERIFY(labels(menu).contains("Enable node"));
        clickEntry(menu, "toggle-comment");
        QTRY_VERIFY(window.document()->node("plain")["ui_properties"].toObject()["title"].toString().isEmpty());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        menu = contextOnNode(window, "plain");
        QVERIFY(labels(menu).contains("Add comment"));
        clickEntry(menu, "select-same-type");
        QTRY_COMPARE(window.selectedCount(), 2);
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);

        menu = contextOnNode(window, "constant");
        QVERIFY(labels(menu).contains("Convert to input node"));
        clickEntry(menu, "convert-to-input");
        QTRY_COMPARE(window.document()->node("constant")["type"].toString(), QString("nodetool.input.StringInput"));
        QCOMPARE(window.document()->node("constant")["data"].toObject()["name"].toString(), QString("string"));
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        menu = contextOnNode(window, "constant");
        QVERIFY(labels(menu).contains("Convert to constant node"));
        QVERIFY(!labels(menu).contains("Convert to input node"));
        clickEntry(menu, "delete-node");
        QTRY_COMPARE(window.document()->nodes().size(), 3);
    }
    void nodeMenuReadOnlyDisablesEdits() {
        EditorWindow window;
        window.setCatalog(catalog());
        window.resize(1400, 1000);
        window.show();
        QTest::qWait(50);
        QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "broken"}}}}, {"edges", QJsonArray{}}}}}));
        QVERIFY(window.readOnly());
        auto *menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        for (const auto *id : {"paste", "add-comment", "add-group", "add-workflow"}) {
            QVERIFY2(!enabled(menu, id), id);
        }
        QVERIFY(enabled(menu, "fit"));
        const auto before = window.document()->snapshot();
        clickEntry(menu, "add-comment");
        QCOMPARE(window.document()->snapshot(), before);
        QCOMPARE(window.document()->undoStack()->index(), 0);
    }

    // SelectionContextMenu.tsx
    void selectionMenuEntriesAndActions() {
        EditorWindow window;
        window.setCatalog(catalog());
        QVERIFY(window.document()->load(QJsonObject{{"id", "selection-menu"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("a", "Fixed", 0), node("b", "Sink", 600), node("c", "Sink", 1200)}}, {"edges", QJsonArray{
            QJsonObject{{"id", "ab"}, {"source", "a"}, {"target", "b"}, {"sourceHandle", "out"}, {"targetHandle", "message"}}}}}}}));
        window.resize(1400, 1000);
        window.show();
        window.action("Reset zoom");
        QTest::qWait(60);
        QVERIFY(window.selectNode("b"));
        QVERIFY(window.selectNode("a"));
        view(window)->setFocus();
        QTest::keyClick(view(window)->viewport(), Qt::Key_A, Qt::ControlModifier);
        QCOMPARE(window.selectedCount(), 3);
        auto *menu = contextOnNode(window, "a");
        QVERIFY(menu);
        QCOMPARE(layout(menu), (QStringList{"#Selection", "chat-about-selection", "-", "duplicate", "copy", "cut", "run-selected", "align", "arrange", "toggle-bypass",
            "collapse-expand", "surround-with-group", "group-into-subgraph", "-", "#Connected", "select-connected-all", "select-inputs", "select-outputs", "-", "delete"}));
        QCOMPARE(labels(menu), (QStringList{"Chat about selection", "Duplicate", "Copy", "Cut", "Run selected", "Align", "Arrange", "Disable all", "Collapse / expand",
            "Surround with group", "Group into subgraph", "Select all connected", "Select inputs", "Select outputs", "Delete"}));
        QVERIFY(enabled(menu, "copy"));
        QVERIFY(enabled(menu, "align"));
        QVERIFY(enabled(menu, "surround-with-group"));
        QVERIFY(!enabled(menu, "run-selected"));
        QVERIFY(enabled(menu, "collapse-expand"));
        QCOMPARE(entry(menu, "delete")->property("textTone").toInt(), 6);
        QCOMPARE(entry(menu, "align")->property("shortcutText").toString(), QString("A"));
        QCOMPARE(entry(menu, "arrange")->property("shortcutText").toString(), QKeySequence("Shift+A").toString(QKeySequence::NativeText));
        clickEntry(menu, "toggle-bypass");
        QTRY_VERIFY(window.document()->node("a")["ui_properties"].toObject()["bypassed"].toBool());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        // Select inputs and outputs follow the data edges through the whole graph.
        QVERIFY(window.selectNode("b"));
        QTest::keyClick(view(window)->viewport(), Qt::Key_I, Qt::ShiftModifier);
        QCOMPARE(window.selectedCount(), 2);
        QVERIFY(window.selectNode("a"));
        QTest::keyClick(view(window)->viewport(), Qt::Key_O, Qt::ShiftModifier);
        QCOMPARE(window.selectedCount(), 2);
        QVERIFY(window.selectNode("c"));
        QTest::keyClick(view(window)->viewport(), Qt::Key_C, Qt::ShiftModifier);
        QCOMPARE(window.selectedCount(), 1);
        QVERIFY(window.selectNode("a"));
        QTest::keyClick(view(window)->viewport(), Qt::Key_C, Qt::ShiftModifier);
        QCOMPARE(window.selectedCount(), 2);
        view(window)->setFocus();
        QTest::keyClick(view(window)->viewport(), Qt::Key_A, Qt::ControlModifier);
        menu = contextOnNode(window, "a");
        QVERIFY(menu);
        QVERIFY(labels(menu).contains("Enable all"));
        clickEntry(menu, "delete");
        QTRY_COMPARE(window.document()->nodes().size(), 0);
    }

    // EdgeContextMenu.tsx
    void edgeMenuEntriesAndStaleDismissal() {
        EditorWindow window;
        window.setCatalog(body_fixture::catalog());
        const QJsonObject data{{"id", "wire"}, {"source", "source"}, {"target", "sink"}, {"sourceHandle", "out"}, {"targetHandle", "message"}};
        const QJsonObject control{{"id", "control-wire"}, {"source", "source"}, {"target", "sink"}, {"sourceHandle", "__control__"}, {"targetHandle", "__control__"}, {"edge_type", "control"}};
        const QJsonObject initial{{"id", "edge-menu"}, {"graph", QJsonObject{{"nodes", QJsonArray{body_fixture::node("source", "Fixed", 100), body_fixture::node("sink", "Sink", 500)}},
            {"edges", QJsonArray{data}}}}};
        QVERIFY(window.document()->load(initial));
        window.resize(1400, 1000);
        window.show();
        QTest::qWait(60);
        const auto open = [&](const QString &id) {
            emit window.scene()->dataEdgeContextMenuRequested(id, QPointF(300, 140), view(window)->viewport()->mapToGlobal(QPoint(400, 300)));
            QTest::qWait(60);
            return host(window);
        };
        auto *menu = open("wire");
        QVERIFY(menu);
        QCOMPARE(layout(menu), (QStringList{"insert-reroute", "-", "delete-edge"}));
        QCOMPARE(labels(menu), (QStringList{"Insert reroute", "Delete edge"}));
        QVERIFY(enabled(menu, "insert-reroute"));
        QCOMPARE(entry(menu, "delete-edge")->property("textTone").toInt(), 6);
        clickEntry(menu, "insert-reroute");
        QTRY_COMPARE(window.document()->nodes().size(), 3);
        QCOMPARE(window.document()->undoStack()->index(), 1);
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        window.action("Undo");
        menu = open("wire");
        QVERIFY(menu);
        // A replaced document dismisses the menu before any entry can act on the old edge.
        QPointer<QQuickWidget> stale = menu;
        QVERIFY(window.document()->load(initial));
        QTRY_VERIFY(!stale || !stale->isVisible());
        QCOMPARE(window.document()->snapshot(), initial);
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        auto withControl = initial;
        auto graph = withControl["graph"].toObject();
        graph["edges"] = QJsonArray{data, control};
        withControl["graph"] = graph;
        QVERIFY(window.document()->load(withControl));
        menu = open("control-wire");
        QVERIFY(menu);
        QCOMPARE(layout(menu), (QStringList{"delete-edge"}));
        clickEntry(menu, "delete-edge");
        QTRY_COMPARE(window.document()->edges().size(), 1);
    }

    void contextClickAndStale() {
        EditorWindow window;
        window.setCatalog(catalog());
        window.show();
        QTest::qWait(50);
        auto *menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        QVERIFY(enabled(menu, "add-comment"));
        clickEntry(menu, "add-comment");
        QTRY_COMPARE(window.document()->graph()["nodes"].toArray().size(), 1);
        QCOMPARE(window.document()->undoStack()->index(), 1);
        QTRY_VERIFY(!host(window) || !host(window)->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        QPointer<QQuickWidget> staleMenu = menu;
        const QJsonObject replacement{{"id", "replacement"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
        QVERIFY(window.document()->load(replacement));
        QTRY_VERIFY(!staleMenu || !staleMenu->isVisible());
        QCOMPARE(window.document()->graph()["nodes"].toArray().size(), 0);
    }
    void accountAndReadOnly() {
        EditorWindow window; window.show(); QTest::qWait(50);
        auto *menu = contextAt(window, QPoint(30, 100));
        QVERIFY(menu);
        QPointer<QQuickWidget> staleMenu = menu;
        window.session()->connectToServer(QUrl("http://127.0.0.1:1"), "fixture", "replacement-account");
        QTRY_VERIFY(!staleMenu || !staleMenu->isVisible());
        QCOMPARE(window.document()->nodes().size(), 0);
        window.session()->disconnectFromServer();
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
    }
    void moreOpensDropdownWithDocumentedActions() {
        EditorWindow window; window.show(); QTest::qWait(50);
        window.action("More");
        QTRY_VERIFY(window.findChild<QMenu *>("more-menu"));
        QVERIFY(!window.findChild<QDialog *>("command-panel"));
        QStringList labels;
        for (auto *item : window.findChild<QMenu *>("more-menu")->actions()) { labels << item->text(); }
        for (const auto *expected : {"Auto layout", "Arrange selection", "Link selected", "Find node", "Group selection", "Ungroup", "Remove from group", "Run selected", "Disable selected", "Rename node", "Add comment", "Edit comment", "Server sync", "Canvas uploads"}) {
            QVERIFY2(labels.contains(expected), expected);
        }
        window.findChild<QMenu *>("more-menu")->close();
    }

    // KeyboardShortcutsView.tsx and ShortcutsSearchableList.tsx
    void helpLayoutControls() {
        EditorWindow window;
        window.resize(1400, 1000);
        window.show();
        QTest::qWait(50);
        window.action("Keyboard shortcuts");
        auto *panel = window.findChild<QDialog *>("shortcuts-panel");
        QVERIFY(panel);
        auto *quick = panel->findChild<QQuickWidget *>();
        QCOMPARE(quick->status(), QQuickWidget::Ready);
        QTest::qWait(60);
        auto *root = quick->rootObject();
        const auto key = [&](const QString &id) { return visualChild(root, "shortcut-key-" + id); };
        const auto press = [&](const QString &name) {
            auto *button = visualChild(root, name);
            QVERIFY2(button, qPrintable(name));
            QTest::mouseClick(quick, Qt::LeftButton, Qt::NoModifier, centre(button));
        };
        QCOMPARE(root->property("os").toString(), QString("win"));
        QCOMPARE(root->property("layoutName").toString(), QString("english"));
        QCOMPARE(root->property("category").toString(), QString("editor"));
        QVERIFY(key("c") && key("c")->property("lit").toBool());
        QVERIFY(key("control")->property("lit").toBool());
        QVERIFY(!key("meta")->property("lit").toBool());
        QVERIFY(!key("1")->property("lit").toBool());
        QVERIFY(key("1")->property("elsewhere").toBool());
        QCOMPARE(key("control")->property("caption").toString(), QString("CTRL"));
        QVERIFY(!key("ß"));
        // Platform: Control becomes Command on macOS.
        press("help-platform-mac");
        QTRY_COMPARE(root->property("os").toString(), QString("mac"));
        QTRY_VERIFY(key("meta")->property("lit").toBool());
        QVERIFY(!key("control")->property("lit").toBool());
        QCOMPARE(key("meta")->property("caption").toString(), QString("⌘"));
        press("help-platform-win");
        QTRY_VERIFY(key("control")->property("lit").toBool());
        // Layout: the German keyboard has its own keys.
        press("help-layout-german");
        QTRY_COMPARE(root->property("layoutName").toString(), QString("german"));
        QTRY_VERIFY(key("ß"));
        QVERIFY(!key("["));
        press("help-layout-english");
        QTRY_VERIFY(key("["));
        // Category: panels light the panel shortcuts only.
        press("help-category-panel");
        QTRY_COMPARE(root->property("category").toString(), QString("panel"));
        QTRY_VERIFY(key("1")->property("lit").toBool());
        QVERIFY(key("i")->property("lit").toBool());
        QVERIFY(!key("c")->property("lit").toBool());
        QVERIFY(key("c")->property("elsewhere").toBool());
        press("help-category-assets");
        QTRY_VERIFY(!key("1")->property("lit").toBool());
        press("help-category-workflow");
        QTRY_VERIFY(key("s")->property("lit").toBool());
        press("help-category-editor");
        QTRY_VERIFY(key("c")->property("lit").toBool());
        // Hovering or pressing a lit key lists the shortcuts that use it.
        QVariant titles;
        QMetaObject::invokeMethod(root->findChild<QQuickItem *>("shortcut-keyboard"), "titlesFor", Q_RETURN_ARG(QVariant, titles), Q_ARG(QVariant, QString("c")));
        QVERIFY(titles.toStringList().contains("Copy: CTRL + C"));
        QTest::keyPress(quick, Qt::Key_C);
        QTRY_COMPARE(root->findChild<QQuickItem *>("shortcut-keyboard")->property("pressedKey").toString(), QString("c"));
        QTest::keyRelease(quick, Qt::Key_C);
        QTRY_COMPARE(root->findChild<QQuickItem *>("shortcut-keyboard")->property("pressedKey").toString(), QString());
        // The list groups by category in the web order and the search filters it.
        QStringList sections;
        for (const auto &value : root->property("helpRows").toList()) {
            const auto title = value.toMap()["categoryTitle"].toString();
            if (sections.isEmpty() || sections.last() != title) {
                sections << title;
            }
        }
        QCOMPARE(sections, (QStringList{"Workflows", "Panels", "Node editor"}));
        auto *search = root->findChild<QQuickItem *>("action-search");
        QTest::mouseClick(quick, Qt::LeftButton, Qt::NoModifier, centre(search));
        QTest::keyClicks(quick, "fit");
        QTRY_COMPARE(root->property("helpRows").toList().size(), 1);
        QCOMPARE(root->property("helpRows").toList().first().toMap()["label"].toString(), QString("Fit"));
        QTest::keyClick(quick, Qt::Key_Escape);
        QTRY_VERIFY(!panel->isVisible());
    }

    // FindInWorkflowDialog.tsx and useFindInWorkflow.ts
    void findNextPreviousAndZoom() {
        EditorWindow window;
        window.setCatalog(catalog());
        QVERIFY(window.document()->load(QJsonObject{{"id", "find"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("alpha-1", "Fixed", 0, 0, {}, "Alpha first"), node("beta", "Sink", 900, 0), node("alpha-2", "Fixed", 1800, 900, {}, "Alpha second"),
            node("gamma", "Sink", 2700, 0, QJsonObject{{"message", "contains NEEDLE text"}})}}, {"edges", QJsonArray{}}}}}));
        window.resize(1400, 1000);
        window.show();
        window.action("Reset zoom");
        QTest::qWait(60);
        view(window)->setFocus();
        QTest::keyClick(view(window)->viewport(), Qt::Key_F, Qt::ControlModifier);
        auto findPanel = [&]() { return window.findChild<QQuickWidget *>("find-panel"); };
        QTRY_VERIFY(findPanel() && findPanel()->isVisible());
        auto *panel = findPanel();
        auto *controller = qvariant_cast<QObject *>(panel->rootObject()->property("controller"));
        QVERIFY(controller);
        const auto status = [&] { return controller->property("status").toString(); };
        QCOMPARE(status(), QString("Type to search nodes"));
        QTest::keyClicks(panel, "alpha");
        QTRY_COMPARE(status(), QString("1 of 2 node found"));
        QCOMPARE(controller->property("results").toList().size(), 2);
        // Down steps to the next result, selects it, and zooms to it at 100%.
        QTest::keyClick(panel, Qt::Key_Down);
        QTRY_COMPARE(status(), QString("2 of 2 node found"));
        QCOMPARE(window.selection(), QString("alpha-2"));
        const auto settled = [&](const QString &resource) {
            auto *item = window.scene()->nodeGraphicsObject(nodeId(window, resource));
            const auto centre = view(window)->mapFromScene(item->mapRectToScene(item->boundingRect()).center());
            const auto area = window.unobstructedViewport().center();
            return std::abs(view(window)->transform().m11() - 1.0) < 0.001 && std::abs(centre.x() - area.x()) < 3 && std::abs(centre.y() - area.y()) < 3;
        };
        QTRY_VERIFY_WITH_TIMEOUT(settled("alpha-2"), 3000);
        QTest::keyClick(panel, Qt::Key_Down);
        QTRY_COMPARE(status(), QString("1 of 2 node found"));
        QCOMPARE(window.selection(), QString("alpha-1"));
        QTRY_VERIFY_WITH_TIMEOUT(settled("alpha-1"), 3000);
        QTest::keyClick(panel, Qt::Key_Up);
        QTRY_COMPARE(status(), QString("2 of 2 node found"));
        QCOMPARE(window.selection(), QString("alpha-2"));
        // The buttons step the same way.
        auto *next = visualChild(panel->rootObject(), "find-next");
        auto *previous = visualChild(panel->rootObject(), "find-previous");
        QVERIFY(next && previous);
        QVERIFY(next->isEnabled() && previous->isEnabled());
        QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, centre(next));
        QTRY_COMPARE(status(), QString("1 of 2 node found"));
        QCOMPARE(window.selection(), QString("alpha-1"));
        QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, centre(previous));
        QTRY_COMPARE(status(), QString("2 of 2 node found"));
        QTest::keyClick(panel, Qt::Key_Return, Qt::ShiftModifier);
        QTRY_COMPARE(status(), QString("1 of 2 node found"));
        // Property values match too, and show the field and a snippet.
        const auto retype = [&](const QString &text) {
            auto *field = visualChild(panel->rootObject(), "find-search");
            QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, centre(field));
            QTest::keyClick(panel, Qt::Key_A, Qt::ControlModifier);
            QTest::keyClicks(panel, text);
        };
        retype("needle");
        QTRY_COMPARE(status(), QString("1 of 1 node found"));
        const auto hit = controller->property("results").toList().first().toMap();
        QCOMPARE(hit["id"].toString(), QString("gamma"));
        QCOMPARE(hit["field"].toString(), QString("message"));
        QVERIFY(hit["snippet"].toString().contains("NEEDLE"));
        retype("zzz");
        QTRY_COMPARE(status(), QString("No nodes found"));
        QVERIFY(!next->isEnabled());
        // Enter before the debounce runs acts on the typed text and closes the panel.
        retype("beta");
        QTest::keyClick(panel, Qt::Key_Return);
        QTRY_VERIFY(!findPanel() || !findPanel()->isVisible());
        QCOMPARE(window.selection(), QString("beta"));
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        // Escape and a press outside the panel close it without moving the selection.
        QTest::keyClick(view(window)->viewport(), Qt::Key_F, Qt::ControlModifier);
        QTRY_VERIFY(findPanel() && findPanel()->isVisible());
        QTest::keyClick(findPanel(), Qt::Key_Escape);
        QTRY_VERIFY(!findPanel() || !findPanel()->isVisible());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        window.action("Find node");
        QTRY_VERIFY(findPanel() && findPanel()->isVisible());
        QTest::qWait(200);
        QTest::mouseClick(view(window)->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(40, 600));
        QTRY_VERIFY(!findPanel() || !findPanel()->isVisible());
        QCOMPARE(window.document()->undoStack()->index(), 0);
    }

    void capturesAndHelp() {
        const QString directory = qEnvironmentVariable("NODETOOL_MENUS_CAPTURE_DIR");
        if (!directory.isEmpty()) { QVERIFY(QDir().mkpath(directory)); }
        EditorWindow window;
        window.setCatalog(catalog());
        QVERIFY(window.document()->load(QJsonObject{{"id", "captures"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("constant", "nodetool.constant.String", 80, 120), node("source", "Fixed", 480, 120, {}, "Source note"), node("sink", "Sink", 900, 140),
            node("grouped", "Sink", 900, 460)}}, {"edges", QJsonArray{
            QJsonObject{{"id", "wire"}, {"source", "source"}, {"target", "sink"}, {"sourceHandle", "out"}, {"targetHandle", "message"}}}}}}}));
        window.resize(1400, 1000);
        window.show();
        window.action("Reset zoom");
        QTest::qWait(80);
        QApplication::clipboard()->setText(R"({"nodes":[],"edges":[]})");
        for (const auto &theme : {QString("dark"), QString("light")}) {
            window.setDarkTheme(theme == "dark");
            QTest::qWait(60);
            for (const auto &surface : {QString("pane"), QString("pane-submenu"), QString("node"), QString("selection"), QString("edge"), QString("command"), QString("shortcuts"), QString("find")}) {
                QWidget *shown = nullptr;
                if (surface == "pane" || surface == "pane-submenu") {
                    shown = contextAt(window, QPoint(160, 560));
                    if (surface == "pane-submenu" && shown) {
                        // Paste is enabled here: Paste, Fit screen, then the constant submenu.
                        for (int step = 0; step < 3; ++step) { QTest::keyClick(shown, Qt::Key_Down); }
                        QTest::keyClick(shown, Qt::Key_Right);
                        QTest::qWait(120);
                    }
                } else if (surface == "node") {
                    window.selectNode("constant");
                    shown = contextOnNode(window, "constant");
                } else if (surface == "selection") {
                    window.selectNode("source");
                    view(window)->setFocus();
                    QTest::keyClick(view(window)->viewport(), Qt::Key_A, Qt::ControlModifier);
                    shown = contextOnNode(window, "source");
                } else if (surface == "edge") {
                    emit window.scene()->dataEdgeContextMenuRequested("wire", QPointF(700, 200), view(window)->viewport()->mapToGlobal(QPoint(700, 300)));
                    QTest::qWait(60);
                    shown = host(window);
                } else if (surface == "find") {
                    window.selectNode("source");
                    window.action("Find node");
                    shown = window.findChild<QQuickWidget *>("find-panel");
                    QTest::qWait(80);
                    if (shown) {
                        QTest::keyClicks(shown, "sink");
                        QTest::qWait(300);
                    }
                } else {
                    window.action(surface == "command" ? "Command menu" : "Keyboard shortcuts");
                    shown = window.findChild<QDialog *>(surface + "-panel");
                }
                QVERIFY2(shown, qPrintable(surface));
                QTest::qWait(100);
                if (surface == "command" || surface == "shortcuts") {
                    auto *quick = shown->findChild<QQuickWidget *>(); QVERIFY(quick);
                    QCOMPARE(quick->status(), QQuickWidget::Ready);
                    const auto rows = quick->rootObject()->property("rows").toList();
                    QSet<QString> seen;
                    for (const auto &value : rows) {
                        const auto row = value.toMap(); const auto label = row["label"].toString();
                        QVERIFY(!seen.contains(label)); seen.insert(label);
                        if (surface == "shortcuts") {
                            QVERIFY(!row["keys"].toString().isEmpty());
                            QVERIFY(!row["combos"].toList().isEmpty());
                            for (const auto &keys : row["keys"].toString().split(" / ")) {
                                const QKeySequence seq(keys, QKeySequence::NativeText);
                                QCOMPARE(window.shortcutCommand(int(seq[0].key()), seq[0].keyboardModifiers()), label);
                            }
                        }
                    }
                }
                if (!directory.isEmpty()) {
                    QPixmap capture = window.grab();
                    if (surface == "command" || surface == "shortcuts") {
                        QPainter painter(&capture); painter.drawPixmap(window.mapFromGlobal(shown->pos()), shown->grab()); painter.end();
                    }
                    QVERIFY(capture.save(directory + "/" + surface + "-" + theme + ".png"));
                }
                if (surface == "command" || surface == "shortcuts") {
                    shown->close();
                } else if (surface == "find") {
                    QTest::keyClick(shown, Qt::Key_Escape);
                } else {
                    QTest::keyClick(shown, Qt::Key_Escape);
                    QTest::keyClick(shown, Qt::Key_Escape);
                }
                QTest::qWait(30);
                QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
            }
        }
    }
};
QTEST_MAIN(MenusTest)
#include "MenusTest.moc"
