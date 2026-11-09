#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QtTest>
#include <memory>

class EntitiesTest : public QObject {
    Q_OBJECT
private slots:
    void entityQmlComponentsLoadWithoutTimeline() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Entities
Item {
    width: 320; height: 240
    property string kindLabel: EntityKind.label("location")
    EntityCard { objectName: "card"; width: 160; entity: ({ id: "e1", name: "Ada", kind: "character" }) }
    EntityImagePickerDialog { objectName: "picker" }
})", QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        QCOMPARE(root->property("kindLabel").toString(), QStringLiteral("Location"));
        QVERIFY(root->findChild<QObject*>("card"));
        QVERIFY(root->findChild<QObject*>("picker"));
    }
};

QTEST_MAIN(EntitiesTest)
#include "tst_entities.moc"
