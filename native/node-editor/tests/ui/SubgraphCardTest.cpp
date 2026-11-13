#include "document/ChildPorts.h"
#include "graph/EditorScene.h"
#include "ui/EditorWindow.h"
#include <QDir>
#include <QContextMenuEvent>
#include <QGraphicsView>
#include <QJsonDocument>
#include "EntryMenuSupport.h"
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;

class SubgraphCardTest : public QObject {
    Q_OBJECT
    static QString subgraphType() { return "nodetool.workflows.subgraph.Subgraph"; }
    static QJsonObject property(QString name, QString type) {
        return {{"name", name}, {"type", QJsonObject{{"type", type}}}};
    }
    static QJsonArray catalog() {
        return {
            QJsonObject{{"node_type", subgraphType()}, {"title", "Subgraph"},
                {"description", "Execute an inline subgraph."},
                {"properties", QJsonArray{property("graph", "dict")}},
                {"outputs", QJsonArray{}}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true}, {"is_streaming_output", true}},
            QJsonObject{{"node_type", "nodetool.input.StringInput"}, {"title", "String Input"},
                {"properties", QJsonArray{property("name", "str"), property("value", "str"), property("description", "str")}},
                {"outputs", QJsonArray{property("output", "str")}}},
            QJsonObject{{"node_type", "nodetool.output.Output"}, {"title", "Output"},
                {"properties", QJsonArray{property("name", "str"), property("value", "any")}}, {"outputs", QJsonArray{}}},
            QJsonObject{{"node_type", "test.Pass"}, {"title", "Pass"},
                {"properties", QJsonArray{property("value", "str")}}, {"outputs", QJsonArray{property("output", "str")}}}
        };
    }
    static QJsonObject node(QString id, QString type = "test.Pass", double x = 100) {
        return {{"id", id}, {"type", type}, {"data", QJsonObject{{"value", "seed"}}},
            {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 100}}}}}, {"extension", "keep"}};
    }
    static QJsonObject edge(QString id, QString source, QString target) {
        return {{"id", id}, {"source", source}, {"target", target}, {"sourceHandle", "output"}, {"targetHandle", "value"}, {"edge_type", "data"}, {"extension", 42}};
    }
    static WorkflowGraphModel &model(EditorWindow &w) {
        return static_cast<WorkflowGraphModel &>(w.scene()->graphModel());
    }
    static QtNodes::NodeId graphId(EditorWindow &w, QString id) {
        for (auto key : model(w).allNodeIds()) {
            if (model(w).resourceId(key) == id) { return key; }
        }
        return QtNodes::InvalidNodeId;
    }
    static QGraphicsView *view(EditorWindow &w) { return w.scene()->views().first(); }
    static void clickNode(EditorWindow &w, QString id, Qt::KeyboardModifiers modifiers = {}) {
        const auto key = graphId(w, id);
        const auto item = w.scene()->nodeGraphicsObject(key);
        const auto point = item->scenePos() + QPointF(90, 18);
        QTest::mouseClick(view(w)->viewport(), Qt::LeftButton, modifiers, view(w)->mapFromScene(point));
        QCoreApplication::processEvents();
    }
    static QQuickWidget *context(EditorWindow &w, QString id) {
        const auto item = w.scene()->nodeGraphicsObject(graphId(w, id));
        const auto point = view(w)->mapFromScene(item->scenePos() + QPointF(90, 18));
        QContextMenuEvent event(QContextMenuEvent::Mouse, point, view(w)->viewport()->mapToGlobal(point));
        QApplication::sendEvent(view(w)->viewport(), &event);
        QTest::qWait(60);
        return w.activeEditor()->findChild<QQuickWidget *>("context-menu-host");
    }
    // The context menu is a Quick popup; the entry is found by its id.
    static QQuickItem *groupItem(QQuickWidget *menu) {
        if (!menu || !menu->rootObject()) { return nullptr; }
        QVariant result;
        QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, QString("group-into-subgraph")));
        return qobject_cast<QQuickItem *>(result.value<QObject *>());
    }
    static QQuickItem *find(QQuickItem *item, const QString &name) {
        if (item->objectName() == name) { return item; }
        for (auto child : item->childItems()) {
            if (auto result = find(child, name)) { return result; }
        }
        return nullptr;
    }
    static bool clickQuick(EditorWindow &w, const QString &name, const QString &text = {}) {
        QCoreApplication::processEvents();
        for (auto *quick : w.findChildren<QQuickWidget *>()) {
            if (!quick->isVisible() || !quick->rootObject()) { continue; }
            auto *item = find(quick->rootObject(), name);
            if (!item || !item->isVisible()) { continue; }
            QTest::mouseClick(quick->quickWindow(), Qt::LeftButton, {}, item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
            if (!text.isEmpty()) { QTest::keyClicks(quick, text); }
            QCoreApplication::processEvents();
            return true;
        }
        return false;
    }
private slots:
    void footer_data() {
        QTest::addColumn<int>("count");
        QTest::addColumn<QString>("label");
        QTest::newRow("empty") << 0 << "empty";
        QTest::newRow("one") << 1 << "1 inner node";
        QTest::newRow("many") << 3 << "3 inner nodes";
    }
    void footer() {
        QFETCH(int, count);
        QFETCH(QString, label);
        EditorWindow w;
        w.resize(1280, 800);
        w.setCatalog(catalog());
        QJsonArray children;
        for (int i = 0; i < count; ++i) {
            auto child = node(QString::number(i), "nodetool.input.StringInput");
            child["data"] = QJsonObject{{"name", "prompt" + QString::number(i)}, {"value", "Describe the scene"}};
            children.append(child);
        }
        auto sub = node("sub", subgraphType());
        sub["data"] = QJsonObject{{"graph", QJsonObject{{"nodes", children}, {"edges", QJsonArray{}}, {"extension", "preserved"}}}};
        QVERIFY(w.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{sub}}, {"edges", QJsonArray{}}}}}));
        w.show();
        w.fit();
        QTest::qWait(100);
        clickNode(w, "sub");
        const auto before = QJsonDocument(w.document()->snapshot()).toJson();
        for (const auto &value : w.properties()) { QVERIFY(value.toMap()["name"] != "graph"); }
        QCOMPARE(QJsonDocument(w.document()->snapshot()).toJson(), before);
        const auto key = graphId(w, "sub");
        const auto card = model(w).layout(key);
        QCOMPARE(card.childCount, label);
        QVERIFY(!card.unknown);
        if (count == 1) {
            QVERIFY(!model(w).inlineDescriptor(key, "prompt0").isEmpty());
            const auto originalGraph = childGraph(w.document()->node("sub"));
            const auto inputRect = model(w).inlineFieldRect(key, "prompt0");
            const auto inputPoint = w.scene()->nodeGraphicsObject(key)->mapToScene(inputRect.center());
            QTest::mouseClick(view(w)->viewport(), Qt::LeftButton, {}, view(w)->mapFromScene(inputPoint));
            QCoreApplication::processEvents();
            auto *inlineEditor = w.findChild<QQuickWidget *>("inline-property-overlay");
            QVERIFY(inlineEditor);
            inlineEditor->setFocus();
            QVERIFY(clickQuick(w, "inline-multiline"));
            QTest::keyClick(inlineEditor->quickWindow(), Qt::Key_A, Qt::ControlModifier);
            for (const auto c : QString("A mountain at sunrise")) {
                QKeyEvent press(QEvent::KeyPress, c.toUpper().unicode(), Qt::NoModifier, QString(c));
                QKeyEvent release(QEvent::KeyRelease, c.toUpper().unicode(), Qt::NoModifier, QString(c));
                QApplication::sendEvent(inlineEditor->quickWindow(), &press);
                QApplication::sendEvent(inlineEditor->quickWindow(), &release);
            }
            clickNode(w, "sub");
            QTRY_COMPARE(w.document()->node("sub")["dynamic_properties"].toObject()["prompt0"].toString(), QString("A mountain at sunrise"));
            QCOMPARE(childGraph(w.document()->node("sub")), originalGraph);
            const auto formPoint = w.scene()->nodeGraphicsObject(key)->mapToScene(model(w).layout(key).outputFormRect().center());
            QTest::mouseClick(view(w)->viewport(), Qt::LeftButton, {}, view(w)->mapFromScene(formPoint));
            QVERIFY(clickQuick(w, "new-output-name", "result"));
            QVERIFY(clickQuick(w, "add-output"));
            QVERIFY(w.document()->node("sub")["dynamic_outputs"].toObject().contains("result"));
            if (auto *popup = w.findChild<QWidget *>("subgraph-output-form")) { popup->close(); }

            const auto dir = qEnvironmentVariable("NODETOOL_SUBGRAPH_CARD_CAPTURE_DIR");
            if (!dir.isEmpty()) {
                QVERIFY(QDir().mkpath(dir));
                for (bool dark : {true, false}) {
                    w.setDarkTheme(dark);
                    QTest::qWait(100);
                    QVERIFY(w.grab().save(dir + (dark ? "/subgraph-card-dark.png" : "/subgraph-card-light.png")));
                }
            }
        }
        const auto point = w.scene()->nodeGraphicsObject(key)->mapToScene(card.footerRect().center());
        QTest::mouseMove(view(w)->viewport(), view(w)->mapFromScene(point));
        QTest::mouseClick(view(w)->viewport(), Qt::LeftButton, {}, view(w)->mapFromScene(point));
        QTRY_VERIFY(w.document()->snapshot() != QJsonDocument::fromJson(before).object());
        QCOMPARE(w.document()->nodes().size(), count);
    }
    void invalidSelections() {
        EditorWindow w;
        w.setCatalog({});
        QVERIFY(w.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{node("a")}}, {"edges", QJsonArray{}}}}}));
        w.show();
        w.fit();
        QTest::qWait(100);
        clickNode(w, "a");
        auto *contextMenu = context(w, "a");
        auto *entry = groupItem(contextMenu);
        QVERIFY(entry);
        QVERIFY(!entry->isEnabled());
        QTest::keyClick(contextMenu, Qt::Key_Escape);
        w.setCatalog(catalog());
        w.scene()->clearSelection();
        QVERIFY(clickQuick(w, "toolbar-more"));
        QCoreApplication::processEvents();
        auto menu = entry_menu::host(*w.activeEditor(), "more");
        QVERIFY(menu);
        QVERIFY(entry_menu::entry(menu, "Group into subgraph").contains("enabled"));
        QVERIFY(!entry_menu::entry(menu, "Group into subgraph")["enabled"].toBool());
        QTest::keyClick(menu, Qt::Key_Escape);
    }
    void boundaryGrouping() {
        EditorWindow w;
        w.resize(1400, 900);
        w.setCatalog(catalog());
        const QJsonObject graph{{"nodes", QJsonArray{node("external", "test.Pass", -300), node("a"), node("b", "test.Pass", 450), node("sink", "test.Pass", 800)}},
            {"edges", QJsonArray{edge("incoming", "external", "a"), edge("internal", "a", "b"), edge("outgoing", "b", "sink"), edge("shared", "b", "external")}}, {"extension", "graph-kept"}};
        QVERIFY(w.document()->load({{"graph", graph}, {"extension", "workflow-kept"}}));
        w.show();
        w.fit();
        QTest::qWait(100);
        clickNode(w, "a");
        clickNode(w, "b", Qt::ControlModifier);
        QCOMPARE(w.selectedCount(), 2);
        const auto before = QJsonDocument(w.document()->snapshot()).toJson();
        auto *menu = context(w, "a");
        auto *entry = groupItem(menu);
        QVERIFY(entry);
        QVERIFY(entry->isEnabled());
        const auto target = entry->mapToScene(QPointF(entry->width() / 2, entry->height() / 2)).toPoint();
        QTest::mouseMove(menu, target);
        QTest::qWait(30);
        QTest::mouseClick(menu, Qt::LeftButton, {}, target);
        QTRY_COMPARE(w.document()->nodes().size(), 3);
        QJsonObject sub;
        for (const auto &value : w.document()->nodes()) {
            if (value.toObject()["type"] == subgraphType()) { sub = value.toObject(); }
        }
        QVERIFY(!sub.isEmpty());
        const auto inner = childGraph(sub);
        QCOMPARE(inner["nodes"].toArray().size(), 4);
        QCOMPARE(inner["edges"].toArray().size(), 3);
        QCOMPARE(inner["nodes"].toArray()[0].toObject(), node("a"));
        QCOMPARE(inner["edges"].toArray()[0].toObject()["sourceHandle"].toString(), QString("output"));
        QCOMPARE(w.document()->edges().size(), 3);
        QCOMPARE(sub["dynamic_inputs"].toObject().keys(), QStringList{"in1"});
        QCOMPARE(sub["dynamic_outputs"].toObject().keys(), QStringList{"out1"});
        for (const auto &value : w.document()->edges()) { QCOMPARE(value.toObject()["extension"].toInt(), 42); }
        QCOMPARE(w.document()->graph()["extension"].toString(), QString("graph-kept"));
        const auto after = QJsonDocument(w.document()->snapshot()).toJson();
        QTest::keyClick(view(w), Qt::Key_Z, Qt::ControlModifier);
        QTRY_COMPARE(QJsonDocument(w.document()->snapshot()).toJson(), before);
        QTest::keyClick(view(w), Qt::Key_Z, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_COMPARE(QJsonDocument(w.document()->snapshot()).toJson(), after);
    }
};
QTEST_MAIN(SubgraphCardTest)
#include "SubgraphCardTest.moc"
