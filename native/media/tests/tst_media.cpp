#include "AssetListModel.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QtTest>
#include <memory>

class MediaTest : public QObject {
    Q_OBJECT
private slots:
    void assetListModelAppliesDiffs() {
        AssetListModel model;
        QVERIFY(model.apply(QJsonArray{
            QJsonObject{{"id", "a"}, {"name", "First"}, {"content_type", "image/png"}},
            QJsonObject{{"id", "b"}, {"name", "Second"}, {"content_type", "video/mp4"}}}));
        QCOMPARE(model.count(), 2);
        QCOMPARE(model.indexOf("b"), 1);
        QCOMPARE(model.get("a").value("name").toString(), QStringLiteral("First"));
        QVERIFY(!model.apply(QJsonArray{
            QJsonObject{{"id", "a"}, {"name", "First"}, {"content_type", "image/png"}},
            QJsonObject{{"id", "b"}, {"name", "Second"}, {"content_type", "video/mp4"}}}));
    }

    void mediaQmlComponentsLoadWithoutTimeline() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Media
Item {
    width: 320; height: 240
    SwipePager { objectName: "pager"; width: 200; height: 100; count: 3; index: 1 }
    AssetGallery { objectName: "gallery" }
})", QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        QVERIFY(root->findChild<QObject*>("pager"));
        QVERIFY(root->findChild<QObject*>("gallery"));
    }
};

QTEST_MAIN(MediaTest)
#include "tst_media.moc"
