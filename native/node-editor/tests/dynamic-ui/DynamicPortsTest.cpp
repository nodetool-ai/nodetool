#include "properties/DynamicPortsController.h"
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
QQuickItem* findItem(QQuickItem* parent, const QString& name) {
    if (parent->objectName() == name) { return parent; }
    for (auto* child : parent->childItems()) { if (auto* result = findItem(child,name)) { return result; } }
    return nullptr;
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
};
QTEST_MAIN(DynamicPortsTest)
#include "DynamicPortsTest.moc"
