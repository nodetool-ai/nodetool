#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include "TestHttpServer.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QTemporaryDir>
#include <QtTest>

using namespace nt::server;

namespace {
QJsonObject document(int startMs) {
    return {{"id", "seq"}, {"name", "Loaded name"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
            {"updatedAt", "u0"}, {"tracks", QJsonArray{QJsonObject{{"id", "v1"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "a"}, {"trackId", "v1"}, {"mediaType", "video"},
                                           {"startMs", startMs}, {"durationMs", 1000}}}},
            {"markers", QJsonArray{}}, {"unknownLoaded", true}};
}

bool load(TimelineModel& model, const QJsonObject& raw) {
    auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
    if (!parsed.timeline) {
        return false;
    }
    model.setTimeline(std::move(*parsed.timeline));
    return true;
}

bool write(const QString& path, const QJsonObject& raw) {
    QFile file(path);
    return file.open(QIODevice::WriteOnly) && file.write(QJsonDocument(raw).toJson()) > 0;
}
} // namespace

class TestRecovery : public QObject {
    Q_OBJECT
private slots:
    void registeredRestoreReplacesOnlyDocumentContent() {
        TimelineModel model;
        const auto original = document(0);
        QVERIFY(load(model, original));
        auto copy = document(200);
        copy.insert("id", "another-sequence");
        copy.insert("name", "Old name");
        copy.insert("fps", 60);
        copy.insert("updatedAt", "old-token");
        copy.remove("unknownLoaded");
        copy.insert("unknownRecovered", QJsonObject{{"kept", true}});
        QVERIFY(model.applyEdit("restoreDocument", {{"document", copy}}));
        QCOMPARE(model.undoStack()->count(), 1);
        auto expected = original;
        expected.remove("unknownLoaded");
        expected.insert("unknownRecovered", QJsonObject{{"kept", true}});
        expected.insert("clips", copy.value("clips"));
        QCOMPARE(model.timeline().raw, expected);
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, original);
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw, expected);
    }

    void bannerRestoresAndDiscardsWithTheRealModel() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QVERIFY(write(dir.filePath("seq.recovery.json"), document(200)));
        TestHttpServer http;
        http.setPost([](const QByteArray&, const QByteArray&) {
            return QByteArray(R"({"result":{"data":{"updatedAt":"u1"}}})");
        });
        TimelineModel model;
        QVERIFY(load(model, document(0)));
        AutosaveController save({http.base(), {}, "seq", dir.path(), {}}, model.undoStack(),
                                [&model] { return model.timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setQuitFallbackDirs({});
        save.setDebounceMs(25);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import NodeTool.Timeline
            Item {
                property QtObject timeline
                property QtObject clock: null
                width: 640
                height: 400
                SaveBanners { objectName: "bannersUnderTest"; width: parent.width }
            }
        )", QUrl("file:///recovery-test.qml"));
        const auto root = std::unique_ptr<QObject>(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(root, qPrintable(component.errorString()));
        auto* banners = root->findChild<QObject*>("bannersUnderTest");
        QVERIFY(banners);
        banners->setProperty("autosave", QVariant::fromValue(&save));
        auto* restore = banners->findChild<QQuickItem*>("restoreEarlierCopyButton");
        auto* discard = banners->findChild<QQuickItem*>("discardEarlierCopyButton");
        QVERIFY2(restore, "SaveBanners must offer Restore");
        QVERIFY2(discard, "SaveBanners must offer Discard");
        QVERIFY(restore->isVisible());
        QVERIFY(discard->isVisible());
        const QString earlier = save.property("earlierCopy").toString();
        QVERIFY(QFile::exists(earlier));
        QVERIFY(QMetaObject::invokeMethod(restore, "clicked"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.timeline().raw.value("clips"), document(200).value("clips"));
        QTRY_COMPARE_WITH_TIMEOUT(http.countRequests("POST", "/trpc/timeline.update"), 1, 2000);
        QTRY_VERIFY_WITH_TIMEOUT(!save.dirty(), 2000);
        QCOMPARE(QJsonDocument::fromJson(http.requests().back().body).object().value("document").toObject(),
                 documentForSave(model.timeline().raw));
        QVERIFY(QFile::exists(earlier));
        QVERIFY(QMetaObject::invokeMethod(discard, "clicked"));
        QVERIFY(!QFile::exists(earlier));
        QCOMPARE(save.property("earlierCopy").toString(), QString());
        QVERIFY(!restore->isVisible());
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, document(0));
        save.setAutosave(false);
    }
};

QTEST_MAIN(TestRecovery)
#include "tst_recovery.moc"
