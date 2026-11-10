#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include <QDialog>
#include <QMenu>
#include <QDir>
#include <QGraphicsView>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QMouseEvent>
#include <QRegularExpression>
#include <memory>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
namespace {
QJsonObject portProperty(const QString &name) { return {{"name", name}, {"type", QJsonObject{{"type", "str"}}}}; }
QJsonArray catalog() {
    QJsonArray result;
    for (const auto &type : {QString("test.Dynamic"), QString("test.Content")}) {
        QJsonObject entry{{"node_type", type}, {"title", "Dynamic"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true},
            {"properties", QJsonArray{portProperty("input_1")}}, {"inline_fields", QJsonArray{"input_1"}}, {"outputs", QJsonArray{portProperty("out")}}};
        if (type.endsWith("Content")) { entry["body"] = "content_card"; }
        result.append(entry);
    }
    return result;
}
QJsonObject node(const QString &id, const QString &type, int x = 100) {
    return {{"id", id}, {"type", type}, {"data", QJsonObject{{"input_1", "static"}}},
        {"dynamic_properties", QJsonObject{{"extra", "keep"}}},
        {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 100}}}}}};
}
struct Host {
    EditorWindow window;
    QGraphicsView *view = nullptr;
    WorkflowGraphModel *model = nullptr;
    explicit Host(const QString &type = "test.Dynamic", const QJsonArray &edges = {}) {
        window.resize(1280, 720); window.setCatalog(catalog());
        const auto loaded = window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{node("n", type), node("source", "test.Dynamic", 500)}}, {"edges", edges}}}});
        Q_ASSERT(loaded.ok);
        window.show(); window.action("Reset zoom"); QTest::qWait(80);
        view = window.scene()->views().first();
        model = &static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
        window.fit(); QTest::qWait(30);
    }
    QtNodes::NodeId id(const QString &resource = "n") const {
        for (const auto key : model->allNodeIds()) { if (model->resourceId(key) == resource) { return key; } }
        return QtNodes::InvalidNodeId;
    }
    QRectF action(const QString &name) const {
        QCoreApplication::processEvents();
        for (const auto &row : model->layout(id()).rows) { if (row.action == name) { return row.rect; } }
        return {};
    }
    void click(const QRectF &rect, bool twice = false) {
        const auto point = view->mapFromScene(window.scene()->nodeGraphicsObject(id())->mapToScene(rect.center()));
        if (twice) { QTest::mouseDClick(view->viewport(), Qt::LeftButton, {}, point); }
        else { QTest::mouseClick(view->viewport(), Qt::LeftButton, {}, point); }
        QCoreApplication::processEvents();
    }
    QQuickWidget *dialog() {
        for (auto *quick : window.findChildren<QQuickWidget *>("dynamic-port-dialog-host")) { if (quick->isVisible()) { return quick; } }
        return nullptr;
    }
};
NodeRow dynamicRow(const WorkflowGraphModel &model, QtNodes::NodeId id, const QString &name) {
    for (const auto &row : model.layout(id).rows) { if (row.propertyName == name) { return row; } }
    return {};
}
QMenu *typeMenu(EditorWindow &window) {
    for (auto *menu : window.findChildren<QMenu *>("dynamic-slot-type-menu")) { if (menu->isVisible()) { return menu; } }
    return nullptr;
}
QQuickItem *find(QQuickItem *root, const QString &name) {
    if (!root) { return nullptr; }
    if (root->objectName() == name) { return root; }
    for (auto *child : root->childItems()) { if (auto *found = find(child, name)) { return found; } }
    return nullptr;
}
void type(QQuickWidget *quick, const QString &text) {
    auto *field = find(quick->rootObject(), "dynamic-port-name");
    Q_ASSERT(field);
    QTest::mouseClick(quick->quickWindow(), Qt::LeftButton, {}, field->mapToScene(QPointF(field->width() / 2, field->height() / 2)).toPoint());
    QTest::keyClick(quick, Qt::Key_A, Qt::ControlModifier); QTest::keyClicks(quick, text);
}
}
class DynamicCardTest final : public QObject {
    Q_OBJECT
private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(".*(?:TypeError|[Bb]inding loop|[Rr]earrange).*"));
    }
    void popupTeardown_data() {
        QTest::addColumn<QString>("mode"); QTest::addColumn<bool>("closeTab");
        QTest::newRow("owner-open-input") << QString("input") << false;
        QTest::newRow("owner-open-rename") << QString("rename") << false;
        QTest::newRow("owner-deferred-popup") << QString("deferred") << false;
        QTest::newRow("owner-deleted-quick") << QString("deleted-quick") << false;
        QTest::newRow("tab-open-rename") << QString("rename") << true;
        QTest::newRow("tab-deferred-popup") << QString("deferred") << true;
    }
    void popupTeardown() {
        QFETCH(QString, mode); QFETCH(bool, closeTab);
        auto host = std::make_unique<Host>();
        if (mode == "rename") {
            QRectF label;
            for (const auto &row : host->model->layout(host->id()).rows) { if (row.propertyName == "extra") { label = row.renameLabelRect; } }
            QVERIFY(!label.isEmpty()); host->click(label, true);
        } else { host->click(host->action("addInput")); }
        QTRY_VERIFY(host->dialog());
        QPointer<QQuickWidget> quick = host->dialog();
        QPointer<QDialog> popup = host->window.findChild<QDialog *>("dynamic-port-dialog"); QVERIFY(popup);
        type(quick, "must_not_commit");
        QSignalSpy changes(host->window.document(), &node_editor::WorkflowDocument::changed);
        if (mode == "deferred") {
            QVERIFY(QMetaObject::invokeMethod(quick->rootObject(), "cancel"));
            QVERIFY(popup); QVERIFY(!popup->isVisible());
        } else if (mode == "deleted-quick") {
            // native-rules #2: explicit delete of a QPointer-held QQuickItem
            delete quick.data();
            host->window.dynamicPorts()->setSelectedNode("source");
            QVERIFY(!quick);
        }
        if (closeTab) {
            QVERIFY(host->window.closeTab(host->window.activeTab()));
            QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
            host->window.dynamicPorts()->setSelectedNode("source");
        } else { host.reset(); }
        QVERIFY(!quick); QVERIFY(!popup);
        QCOMPARE(changes.count(), 0);
    }
    void popupTakesKeysWithoutAClick() {
        Host h;
        h.click(h.action("addInput")); QTRY_VERIFY(h.dialog());
        auto *quick = h.dialog();
        auto *field = find(quick->rootObject(), "dynamic-port-name"); QVERIFY(field);
        QTRY_VERIFY(field->hasActiveFocus());
        auto *target = QApplication::activePopupWidget() ? QApplication::activePopupWidget()->focusWidget() : QApplication::focusWidget();
        QVERIFY(target);
        QTest::keyClicks(target, "typed");
        QTRY_COMPARE(field->property("text").toString(), QString("typed"));
    }
    void genericCardAddsNamedInputsAndOutputs() {
        Host h;
        QVERIFY2(!h.action("addInput").isEmpty(), "Generic card must expose Add input");
        QVERIFY(!h.action("addOutput").isEmpty());
        h.click(h.action("addInput")); QTRY_VERIFY(h.dialog());
        QPointer<QQuickWidget> quick = h.dialog(); QVERIFY(quick->rootObject());
        type(quick, "added"); QTest::keyClick(quick, Qt::Key_Return);
        QTRY_VERIFY(h.window.document()->node("n")["dynamic_properties"].toObject().contains("added"));
        QCOMPARE(h.window.document()->node("n")["dynamic_properties"].toObject()["added"].toString(), QString());
        h.window.action("Undo");
        QVERIFY(!h.window.document()->node("n")["dynamic_properties"].toObject().contains("added"));
        h.click(h.action("addOutput")); QTRY_VERIFY(h.dialog());
        quick = h.dialog(); type(quick, "answer"); QTest::keyClick(quick, Qt::Key_Return);
        QTRY_COMPARE(h.window.document()->node("n")["dynamic_outputs"].toObject()["answer"].toObject()["type"].toString(), QString("str"));
    }
    void outputTypeSelectionPersists() {
        Host h; QVERIFY(!h.action("addOutput").isEmpty());
        h.click(h.action("addOutput")); QTRY_VERIFY(h.dialog());
        QPointer<QQuickWidget> quick = h.dialog();
        type(quick, "boolean_answer");
        QTest::keyClick(quick, Qt::Key_Tab);
        auto *selector = find(quick->rootObject(), "dynamic-port-type"); QVERIFY(selector);
        QTRY_VERIFY(selector->hasActiveFocus());
        QTest::keyClick(quick, Qt::Key_Home);
        QTest::keyClick(quick, Qt::Key_Backtab);
        QTest::keyClick(quick, Qt::Key_Return);
        QTRY_VERIFY(h.window.document()->node("n")["dynamic_outputs"].toObject().contains("boolean_answer"));
        QCOMPARE(h.window.document()->node("n")["dynamic_outputs"].toObject()["boolean_answer"].toObject()["type"].toString(), QString("bool"));
        h.window.action("Undo"); QVERIFY(!h.window.document()->node("n")["dynamic_outputs"].toObject().contains("boolean_answer"));
    }
    void cardRenamePreservesConnectedValuesAndEdges() {
        const QJsonObject edge{{"id", "e"}, {"source", "source"}, {"sourceHandle", "out"}, {"target", "n"}, {"targetHandle", "extra"}, {"extension", 42}};
        Host h("test.Dynamic", QJsonArray{edge}); const auto before = h.window.document()->snapshot();
        QRectF label;
        for (const auto &row : h.model->layout(h.id()).rows) {
            if (row.propertyName == "extra") { label = row.renameLabelRect; }
        }
        QVERIFY(!label.isEmpty()); h.click(label, true); QTRY_VERIFY(h.dialog());
        auto *quick = h.dialog(); type(quick, "renamed"); QTest::keyClick(quick, Qt::Key_Return);
        QTRY_VERIFY(h.window.document()->node("n")["dynamic_properties"].toObject().contains("renamed"));
        QCOMPARE(h.window.document()->node("n")["dynamic_properties"].toObject()["renamed"].toString(), QString("keep"));
        auto expected = edge; expected["targetHandle"] = "renamed";
        QCOMPARE(h.window.document()->edges().first().toObject(), expected);
        QCOMPARE(h.window.document()->undoStack()->count(), 1);
        h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(), before);
    }
    void addValidationCancelAndStaleSelection() {
        Host h; QVERIFY(!h.action("addInput").isEmpty());
        const auto before = h.window.document()->snapshot();
        for (const auto &name : {QString("input_1"), QString("extra"), QString("1bad"), QString("__reserved")}) {
            h.click(h.action("addInput")); QTRY_VERIFY(h.dialog()); QPointer<QQuickWidget> quick = h.dialog();
            type(quick, name); QTest::keyClick(quick, Qt::Key_Return);
            QCOMPARE(h.window.document()->snapshot(), before);
            QVERIFY(quick->isVisible());
            QTest::keyClick(quick, Qt::Key_Escape); QTRY_VERIFY(!quick || !quick->isVisible());
            QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        }
        h.click(h.action("addInput")); QTRY_VERIFY(h.dialog());
        QPointer<QQuickWidget> quick = h.dialog(); type(quick, "stale");
        QVERIFY(h.window.selectNode("source")); QTRY_VERIFY(!quick || !quick->isVisible());
        QCOMPARE(h.window.document()->snapshot(), before);
    }
    void editControlRenamesOnBlurAndEscapeCancels() {
        Host h;
        const auto editRect = [&] {
            for (const auto &row : h.model->layout(h.id()).rows) { if (row.propertyName == "extra") { return row.renameButtonRect; } }
            return QRectF{};
        };
        QVERIFY(!editRect().isEmpty()); h.click(editRect()); QTRY_VERIFY(h.dialog());
        QPointer<QQuickWidget> quick = h.dialog(); type(quick, "blurred"); QTest::keyClick(quick, Qt::Key_Tab);
        QTRY_VERIFY(h.window.document()->node("n")["dynamic_properties"].toObject().contains("blurred"));
        h.window.action("Undo");
        h.click(editRect()); QTRY_VERIFY(h.dialog()); quick = h.dialog(); type(quick, "canceled"); QTest::keyClick(quick, Qt::Key_Escape);
        QTRY_VERIFY(!quick || !quick->isVisible());
        QVERIFY(h.window.document()->node("n")["dynamic_properties"].toObject().contains("extra"));
        QVERIFY(!h.window.document()->node("n")["dynamic_properties"].toObject().contains("canceled"));
    }
    void addInputWireTargetForcesNewSlotAndRejectsSelfConnection() {
        Host h; QVERIFY(!h.action("addInput").isEmpty());
        const auto drag = [&](const QString &source) {
            const auto key = h.id(source);
            const auto start = h.view->mapFromScene(h.window.scene()->nodeGraphicsObject(key)->mapToScene(h.window.scene()->nodeGeometry().portPosition(key, QtNodes::PortType::Out, 0)));
            const auto drop = h.view->mapFromScene(h.window.scene()->nodeGraphicsObject(h.id())->mapToScene(h.action("addInput").center()));
            QTest::mousePress(h.view->viewport(), Qt::LeftButton, {}, start);
            QMouseEvent move(QEvent::MouseMove, QPointF(drop), QPointF(h.view->viewport()->mapToGlobal(drop)), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
            QApplication::sendEvent(h.view->viewport(), &move);
            QTest::mouseRelease(h.view->viewport(), Qt::LeftButton, {}, drop);
            QCoreApplication::processEvents();
        };
        const auto before = h.window.document()->snapshot();
        drag("source"); QTRY_COMPARE(h.window.document()->edges().size(), 1);
        const auto handle = h.window.document()->edges().first().toObject()["targetHandle"].toString();
        QVERIFY(handle != "input_1"); QVERIFY(handle != "extra");
        QVERIFY(h.window.document()->node("n")["dynamic_inputs"].toObject().contains(handle));
        QCOMPARE(h.window.document()->undoStack()->count(), 1);
        h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(), before);
        drag("n"); QCOMPARE(h.window.document()->snapshot(), before);
    }
    void readOnlyCollapsedAndRoundTripPreserveCanonicalData() {
        const QJsonObject edge{{"id", "e"}, {"source", "source"}, {"sourceHandle", "out"}, {"target", "n"}, {"targetHandle", "extra"}, {"extension", "keep"}};
        Host h("test.Dynamic", QJsonArray{edge});
        const auto before = h.window.document()->snapshot();
        const auto add = h.action("addInput"); QVERIFY(!add.isEmpty());
        h.model->project(before, catalog(), true);
        h.click(add); QVERIFY(!h.dialog()); QCOMPARE(h.window.document()->snapshot(), before);
        h.model->project(before, catalog(), false);
        auto ui = h.window.document()->node("n")["ui_properties"].toObject(); ui["collapsed"] = true;
        QVERIFY(h.window.document()->applyCommand({{"op", "setNodeField"}, {"id", "n"}, {"field", "ui_properties"}, {"value", ui}}));
        QCoreApplication::processEvents();
        QVERIFY(h.action("addInput").isEmpty());
        h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(), before);
        node_editor::WorkflowDocument reopened; reopened.setNodeMetadata(catalog());
        QVERIFY(reopened.load(before)); QCOMPARE(reopened.snapshot(), before);
    }
    void manyDynamicLabelsKeepCanonicalPorts() {
        QJsonObject values;
        for (int index = 0; index < 2000; ++index) { values[QStringLiteral("slot_%1").arg(index)] = index; }
        auto many = node("n", "test.Dynamic"); many["dynamic_properties"] = values;
        const QJsonObject snapshot{{"graph", QJsonObject{{"nodes", QJsonArray{many}}, {"edges", QJsonArray{}}}}};
        WorkflowGraphModel model; model.project(snapshot, catalog());
        const auto id = *model.allNodeIds().begin();
        int labels = 0;
        for (const auto &row : model.layout(id).rows) { labels += !row.renameLabelRect.isEmpty(); }
        QCOMPARE(labels, values.size());
        QCOMPARE(model.ports(id, QtNodes::PortType::In).size(), values.size() + 1);
        QCOMPARE(model.nodeSnapshot(id), many);
    }
    void captures_data() {
        QTest::addColumn<bool>("dark"); QTest::addColumn<QSize>("size");
        QTest::newRow("dark-wide") << true << QSize(1280, 720);
        QTest::newRow("light-wide") << false << QSize(1280, 720);
        QTest::newRow("dark-narrow") << true << QSize(960, 1000);
        QTest::newRow("light-narrow") << false << QSize(960, 1000);
    }
    void captures() {
        QFETCH(bool, dark); QFETCH(QSize, size);
        Host h; h.window.setDarkTheme(dark); h.window.resize(size); h.window.fit(); QTest::qWait(60);
        QVERIFY(!h.action("addInput").isEmpty()); h.click(h.action("addInput")); QTRY_VERIFY(h.dialog());
        auto *popup = h.window.findChild<QDialog *>("dynamic-port-dialog"); QVERIFY(popup);
        QVERIFY(QRect(h.window.mapToGlobal(QPoint()), h.window.size()).contains(popup->geometry()));
        const auto path = qEnvironmentVariable("NODETOOL_DYNAMIC_CARD_CAPTURE");
        const auto tag = QString::fromLatin1(QTest::currentDataTag());
        if (!path.isEmpty()) {
            QVERIFY(QDir().mkpath(path));
            QVERIFY(h.window.grab().save(path + "/" + tag + ".png"));
            QVERIFY(popup->grab().save(path + "/" + tag + "-form.png"));
        }
        type(h.dialog(), "1invalid"); QTest::keyClick(h.dialog(), Qt::Key_Return); QTest::qWait(40);
        const auto *error = find(h.dialog()->rootObject(), "dynamic-port-error"); QVERIFY(error); QVERIFY(error->isVisible());
        QVERIFY(error->height() > 0);
        const auto errorRect = error->mapRectToItem(h.dialog()->rootObject(), error->boundingRect());
        QVERIFY(h.dialog()->rootObject()->boundingRect().contains(errorRect));
        QVERIFY(QRect(h.window.mapToGlobal(QPoint()), h.window.size()).contains(popup->geometry()));
        if (!path.isEmpty()) {
            QVERIFY(popup->grab().save(path + "/" + tag + "-error.png"));
        }
    }
    void contentFooterLabels_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<QString>("label");
        QTest::newRow("image") << QString("image") << QString("Add another image input");
        QTest::newRow("mask") << QString("mask") << QString("Add another image input");
        QTest::newRow("image-mask") << QString("image_mask") << QString("Add another image input");
        QTest::newRow("list-image") << QString("list") << QString("Add another image input");
        QTest::newRow("video") << QString("video") << QString("Add another video input");
        QTest::newRow("audio") << QString("audio") << QString("Add another audio input");
        QTest::newRow("str") << QString("str") << QString("Add another text input");
        QTest::newRow("text") << QString("text") << QString("Add another text input");
        QTest::newRow("asset-3d") << QString("asset_3d") << QString("Add another input");
        QTest::newRow("generic") << QString("any") << QString("Add another input");
        QTest::newRow("template") << QString("template") << QString("Add another variable");
    }
    void contentFooterLabels() {
        QFETCH(QString, type); QFETCH(QString, label);
        auto meta = catalog()[1].toObject();
        auto declared = QJsonObject{{"type", type}};
        if (type == "list") { declared["type_args"] = QJsonArray{QJsonObject{{"type", "image"}}}; }
        if (type == "template") { meta["node_type"] = "nodetool.agents.Agent"; declared["type"] = "str"; }
        meta["primary_output"] = "chosen";
        meta["outputs"] = QJsonArray{portProperty("fallback"), QJsonObject{{"name", "chosen"}, {"type", declared}}};
        WorkflowGraphModel model;
        model.project({{"graph", QJsonObject{{"nodes", QJsonArray{node("n", meta["node_type"].toString())}}, {"edges", QJsonArray{}}}}}, QJsonArray{meta});
        bool input = false, output = false;
        for (const auto &row : model.layout(*model.allNodeIds().begin()).rows) {
            if (row.action == "addContentInput") { QCOMPARE(row.label, label); input = true; }
            else if (row.action == "addOutput") { output = true; }
            else { continue; }
            QCOMPARE(row.rect.left(), double(node_metrics::borderWidth + node_metrics::padding));
        }
        QVERIFY(input); QVERIFY(output);
    }
    void cardTypeChipRetypesInOneStep() {
        Host h;
        auto typed = node("n", "test.Dynamic");
        typed["dynamic_inputs"] = QJsonObject{{"typed", QJsonObject{{"type", QJsonObject{{"type", "str"}, {"type_args", QJsonArray{}}, {"optional", false}}}}}};
        typed["dynamic_properties"] = QJsonObject{{"extra", "keep"}, {"typed", "hello"}};
        QVERIFY(h.window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{typed, node("source", "test.Dynamic", 500)}}, {"edges", QJsonArray{}}}}}));
        QTest::qWait(30); h.window.fit(); QTest::qWait(30);
        const auto before = h.window.document()->snapshot();
        auto row = dynamicRow(*h.model, h.id(), "typed");
        QVERIFY2(!row.typeChipRect.isEmpty(), "An unconnected dynamic input of a user-owned node shows a type chip");
        QCOMPARE(row.typeChip, QString("str"));
        QVERIFY(!row.removeButtonRect.isEmpty());
        // An undeclared slot reads as any, as slotType(normalizeDynamicSlot(undefined)) does.
        QCOMPARE(dynamicRow(*h.model, h.id(), "extra").typeChip, QString("any"));
        // The chip, rename and remove controls share the label row without overlapping.
        QVERIFY(!row.typeChipRect.intersects(row.renameButtonRect));
        QVERIFY(!row.typeChipRect.intersects(row.removeButtonRect));
        QVERIFY(row.typeChipRect.right() <= h.model->layout(h.id()).size.width());
        h.click(row.typeChipRect);
        QMenu *menu = nullptr;
        QTRY_VERIFY((menu = typeMenu(h.window)));
        QAction *current = nullptr, *integer = nullptr;
        for (auto *action : menu->actions()) {
            if (action->isChecked()) { current = action; }
            if (action->text() == "int") { integer = action; }
        }
        QVERIFY(current); QCOMPARE(current->text(), QString("str"));
        QVERIFY(integer);
        QTest::mouseClick(menu, Qt::LeftButton, {}, menu->actionGeometry(integer).center());
        QTRY_COMPARE(h.window.document()->node("n")["dynamic_inputs"].toObject()["typed"].toObject()["type"].toObject()["type"].toString(), QString("int"));
        QVERIFY(h.window.document()->node("n")["dynamic_properties"].toObject()["typed"].isDouble());
        QCOMPARE(h.window.document()->undoStack()->count(), 1);
        QTRY_COMPARE(dynamicRow(*h.model, h.id(), "typed").typeChip, QString("int"));
        h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(), before);
    }
    void cardTypeChipHiddenForConnectedAndSchemaDrivenSlots() {
        const QJsonObject edge{{"id", "e"}, {"source", "source"}, {"sourceHandle", "out"}, {"target", "n"}, {"targetHandle", "extra"}};
        Host h("test.Dynamic", QJsonArray{edge});
        const auto connected = dynamicRow(*h.model, h.id(), "extra");
        QVERIFY(!connected.renameLabelRect.isEmpty());
        QVERIFY(connected.typeChipRect.isEmpty());
        QVERIFY(!connected.removeButtonRect.isEmpty());
        auto meta = catalog()[0].toObject(); meta["node_type"] = "fal.Dynamic";
        WorkflowGraphModel model;
        model.project({{"graph", QJsonObject{{"nodes", QJsonArray{node("n", "fal.Dynamic")}}, {"edges", QJsonArray{}}}}}, QJsonArray{meta});
        const auto schemaDriven = dynamicRow(model, *model.allNodeIds().begin(), "extra");
        QVERIFY(!schemaDriven.renameLabelRect.isEmpty());
        QVERIFY(schemaDriven.typeChipRect.isEmpty());
        model.project({{"graph", QJsonObject{{"nodes", QJsonArray{node("n", "test.Dynamic")}}, {"edges", QJsonArray{}}}}}, catalog(), true);
        QVERIFY(dynamicRow(model, *model.allNodeIds().begin(), "extra").typeChipRect.isEmpty());
        QVERIFY(dynamicRow(model, *model.allNodeIds().begin(), "extra").removeButtonRect.isEmpty());
    }
    void cardRemoveControlDeletesSlotAndWires() {
        const QJsonObject edge{{"id", "e"}, {"source", "source"}, {"sourceHandle", "out"}, {"target", "n"}, {"targetHandle", "extra"}};
        Host h("test.Dynamic", QJsonArray{edge});
        const auto before = h.window.document()->snapshot();
        const auto remove = dynamicRow(*h.model, h.id(), "extra").removeButtonRect;
        QVERIFY2(!remove.isEmpty(), "A dynamic input shows the web's remove control on the card");
        h.click(remove);
        QTRY_VERIFY(!h.window.document()->node("n")["dynamic_properties"].toObject().contains("extra"));
        QVERIFY(h.window.document()->edges().isEmpty());
        QCOMPARE(h.window.document()->undoStack()->count(), 1);
        QVERIFY(!h.dialog());
        h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(), before);
    }
    void contentFooterSkipsStaticNamesAndUndoes() {
        Host h("test.Content"); const auto before = h.window.document()->snapshot();
        QVERIFY2(!h.action("addContentInput").isEmpty(), "Content footer must expose Add input");
        h.click(h.action("addContentInput"));
        QTRY_VERIFY(h.window.document()->node("n")["dynamic_properties"].toObject().contains("input_2"));
        QVERIFY(!h.dialog()); QCOMPARE(h.window.document()->undoStack()->count(), 1);
        h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(), before);
        h.window.action("Redo"); QVERIFY(h.window.document()->node("n")["dynamic_properties"].toObject().contains("input_2"));
    }
};
QTEST_MAIN(DynamicCardTest)
#include "DynamicCardTest.moc"
