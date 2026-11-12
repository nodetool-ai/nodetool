#include "properties/DynamicPortsController.h"
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtQuickTest/quicktest.h>
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
QQuickItem* findItem(QQuickItem* parent, const QString& name) {
    if (parent->objectName() == name) { return parent; }
    for (auto* child : parent->childItems()) { if (auto* result = findItem(child,name)) { return result; } }
    return nullptr;
}
void typeText(QQuickWindow& window, const QByteArray& text) {
    for (const auto c : text) { QTest::keyClick(&window, c); }
}
}
class DynamicPortsTest final : public QObject {
    Q_OBJECT
private slots:
    void selectionAndErrors() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"}],"edges":[]}})"));
        const QJsonArray metadata{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true}}};
        d.setNodeMetadata(metadata); DynamicPortsController bridge(&d); bridge.setNodeMetadata(metadata); bridge.setSelectedNode("a");
        QVERIFY(bridge.supportsInputs()); QCOMPARE(bridge.inputTypes().size(), 19); QCOMPARE(bridge.outputTypes().size(), 4); QVERIFY(bridge.addPort(false,"image","image"));
        QCOMPARE(bridge.inputs().size(), 1); QVERIFY(!bridge.addPort(false,"image","str")); QVERIFY(!bridge.error().isEmpty());
        bridge.setSelectedNode("b"); QVERIFY(bridge.error().isEmpty()); QVERIFY(bridge.inputs().isEmpty());
        QVERIFY(!bridge.renamePort(false,"image","other")); QCOMPARE(d.node("a")["dynamic_properties"].toObject().size(), 1);
        QVERIFY(!bridge.addPort(true,"out","image"));
    }
    void metadataTypeRestriction() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"}],"edges":[]}})"));
        const QJsonArray metadata{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_inputs", true}, {"allowed_dynamic_slot_types", QJsonArray{QJsonObject{{"type", "image"}}}}}};
        d.setNodeMetadata(metadata); DynamicPortsController bridge(&d); bridge.setNodeMetadata(metadata); bridge.setSelectedNode("a");
        QCOMPARE(bridge.inputTypes().size(),1); QVERIFY(!bridge.addPort(false,"text","str"));
        QVERIFY(!d.applyCommand({{"op","addDynamicInput"},{"id","a"},{"name","text"},{"type",QJsonObject{{"type","str"}}}}));
        QCOMPARE(d.undoStack()->count(),0); QVERIFY(bridge.addPort(false,"picture","image"));
    }
    void qmlAuthoring() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"}],"edges":[]}})"));
        const QJsonArray metadata{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true}}};
        d.setNodeMetadata(metadata); DynamicPortsController bridge(&d); bridge.setNodeMetadata(metadata); bridge.setSelectedNode("a");
        QQmlEngine engine; QQmlComponent component(&engine, QUrl::fromLocalFile(QString(DYNAMIC_QML_DIR) + "/DynamicPorts.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> root(component.createWithInitialProperties({{"controller", QVariant::fromValue(&bridge)}}));
        QVERIFY2(root, qPrintable(component.errorString()));
        QQuickWindow window; auto* item = qobject_cast<QQuickItem*>(root.get()); QVERIFY(item); item->setParentItem(window.contentItem()); item->setWidth(360); window.resize(400,1000); window.show();
        QTest::qWait(50);
        auto* name = root->findChild<QQuickItem*>("new-input-name"); auto* add = root->findChild<QQuickItem*>("add-input"); QVERIFY(name); QVERIFY(add);
        name->forceActiveFocus(); for (const auto c : QByteArray("draft")) { QTest::keyClick(&window,c); }
        QCOMPARE(d.undoStack()->count(),0);
        bridge.setSelectedNode("b"); QTest::qWait(10); QCOMPARE(name->property("text").toString(),QString());
        name->forceActiveFocus(); for (const auto c : QByteArray("prompt")) { QTest::keyClick(&window,c); }
        QTest::mouseClick(&window,Qt::LeftButton,Qt::NoModifier,add->mapToScene(QPointF(add->width()/2,add->height()/2)).toPoint());
        QTRY_COMPARE(bridge.inputs().size(),1); QVERIFY(d.node("a")["dynamic_properties"].toObject().isEmpty());
        QCOMPARE(d.node("b")["dynamic_properties"].toObject()["prompt"].toString(),QString());
        QCOMPARE(d.undoStack()->count(),1);
        d.undo(); QVERIFY(bridge.inputs().isEmpty()); d.redo(); QCOMPARE(bridge.inputs().size(),1);
        QTRY_VERIFY(findItem(item,"input-name-prompt"));
        // The redo creates the row again. Clicks need the positions of the next layout pass.
        QVERIFY(QQuickTest::qWaitForPolish(&window));
        auto* rename = findItem(item,"input-name-prompt"); rename->forceActiveFocus();
        QTest::keyClick(&window,Qt::Key_A,Qt::ControlModifier);
        for (const auto c : QByteArray("renamed")) { QTest::keyClick(&window,c); }
        auto* renameButton = findItem(item,"rename-input-prompt"); QVERIFY(renameButton);
        QTest::mouseClick(&window,Qt::LeftButton,Qt::NoModifier,renameButton->mapToScene(QPointF(renameButton->width()/2,renameButton->height()/2)).toPoint());
        QTRY_VERIFY(d.node("b")["dynamic_properties"].toObject().contains("renamed"));
        QTRY_VERIFY(findItem(item,"delete-input-renamed"));
        auto* remove = findItem(item,"delete-input-renamed");
        QTest::mouseClick(&window,Qt::LeftButton,Qt::NoModifier,remove->mapToScene(QPointF(remove->width()/2,remove->height()/2)).toPoint());
        QTRY_VERIFY(bridge.inputs().isEmpty());
        item->setParentItem(nullptr);
    }
    // F04 keyboard paths and the type chip: Enter adds and renames, Escape
    // restores a rename draft, and a retype keeps a fitting value or reseeds
    // the default (NodePropertyForm.tsx:163-168, useDynamicProperty.ts:175-197).
    void keyboardAddRenameAndRetype() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","dynamic_inputs":{"legacy":"str"},"dynamic_properties":{"legacy":"kept"}},{"id":"src","type":"Node"}],"edges":[]}})"));
        const QJsonArray metadata{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true},
                                              {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", "any"}}}}}}}};
        d.setNodeMetadata(metadata);
        DynamicPortsController bridge(&d);
        bridge.setNodeMetadata(metadata);
        bridge.setSelectedNode("a");
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl::fromLocalFile(QString(DYNAMIC_QML_DIR) + "/DynamicPorts.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> root(component.createWithInitialProperties({{"controller", QVariant::fromValue(&bridge)}}));
        QVERIFY2(root, qPrintable(component.errorString()));
        QQuickWindow window;
        auto* item = qobject_cast<QQuickItem*>(root.get());
        QVERIFY(item);
        item->setParentItem(window.contentItem());
        item->setWidth(360);
        window.resize(400, 1200);
        window.show();
        QTest::qWait(50);
        // A legacy string declaration reads as its type and can be retyped.
        QTRY_VERIFY(findItem(item, "input-type-legacy"));
        QCOMPARE(findItem(item, "input-type-legacy")->property("value").toString(), QString("str"));
        auto* name = findItem(item, "new-input-name");
        QVERIFY(name);
        name->forceActiveFocus();
        typeText(window, "prompt");
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_VERIFY(d.node("a")["dynamic_properties"].toObject().contains("prompt"));
        QCOMPARE(d.undoStack()->count(), 1);
        QCOMPARE(name->property("text").toString(), QString());
        // "i" picks int. The empty string does not fit, so the value becomes 0.
        QQuickItem* type = nullptr;
        QTRY_VERIFY((type = findItem(item, "input-type-prompt")));
        QVERIFY(type->isVisible());
        type->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_I);
        QTRY_COMPARE(d.node("a")["dynamic_inputs"].toObject()["prompt"].toObject()["type"].toObject()["type"].toString(), QString("int"));
        QCOMPARE(d.node("a")["dynamic_properties"].toObject()["prompt"], QJsonValue(0));
        QCOMPARE(d.undoStack()->count(), 2);
        QVERIFY(d.applyCommand({{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"storage", "dynamic_properties"}, {"value", 5}}));
        // "f" picks float, and 5 still fits.
        QTRY_VERIFY((type = findItem(item, "input-type-prompt")));
        type->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_F);
        QTRY_COMPARE(d.node("a")["dynamic_inputs"].toObject()["prompt"].toObject()["type"].toObject()["type"].toString(), QString("float"));
        QCOMPARE(d.node("a")["dynamic_properties"].toObject()["prompt"], QJsonValue(5));
        d.undo();
        QCOMPARE(d.node("a")["dynamic_inputs"].toObject()["prompt"].toObject()["type"].toObject()["type"].toString(), QString("int"));
        d.redo();
        // Escape restores a rename draft. Enter commits one.
        QQuickItem* rename = nullptr;
        QTRY_VERIFY((rename = findItem(item, "input-name-prompt")));
        rename->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        typeText(window, "draft");
        QTest::keyClick(&window, Qt::Key_Escape);
        QCOMPARE(rename->property("text").toString(), QString("prompt"));
        const auto count = d.undoStack()->count();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        typeText(window, "renamed");
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_VERIFY(d.node("a")["dynamic_properties"].toObject().contains("renamed"));
        QCOMPARE(d.node("a")["dynamic_properties"].toObject()["renamed"], QJsonValue(5));
        QCOMPARE(d.undoStack()->count(), count + 1);
        // A connected input shows no type chip, and the document refuses a retype.
        QVERIFY(d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"id", "e"}, {"source", "src"}, {"sourceHandle", "output"}, {"target", "a"}, {"targetHandle", "renamed"}}}}));
        QTRY_VERIFY(findItem(item, "input-type-renamed"));
        QTRY_VERIFY(!findItem(item, "input-type-renamed")->isVisible());
        QVERIFY(!bridge.setPortType("renamed", "str"));
        QCOMPARE(bridge.error(), QString("Disconnect the input before changing its type"));
        // Leaving a rename field keeps its draft for the Rename and Cancel buttons.
        QQuickItem* legacy = nullptr;
        QTRY_VERIFY((legacy = findItem(item, "input-name-legacy")));
        legacy->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        typeText(window, "draft");
        // Enter adds an output, which starts as str.
        auto* outputName = findItem(item, "new-output-name");
        QVERIFY(outputName);
        outputName->forceActiveFocus();
        QCOMPARE(legacy->property("text").toString(), QString("draft"));
        QVERIFY(d.node("a")["dynamic_properties"].toObject().contains("legacy"));
        typeText(window, "result");
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_VERIFY(d.node("a")["dynamic_outputs"].toObject().contains("result"));
        QCOMPARE(d.node("a")["dynamic_outputs"].toObject()["result"].toObject()["type"].toString(), QString("str"));
        item->setParentItem(nullptr);
    }
};
QTEST_MAIN(DynamicPortsTest)
#include "DynamicPortsTest.moc"
