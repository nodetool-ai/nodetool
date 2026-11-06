#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include "TestHttpServer.h"

#include <QFile>
#include <QBuffer>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QUrlQuery>
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
    void restoredCopyResolvesBackupOnlyMediaAndMatte() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString pictureId(32, u'a');
        const QString matteId(32, u'b');
        auto backup = document(200);
        auto clip = backup.value("clips").toArray().first().toObject();
        clip.insert("mediaType", "image");
        clip.insert("status", "generated");
        clip.insert("currentAssetId", pictureId);
        clip.insert("generatedMatte", QJsonObject{{"assetId", matteId}, {"status", "ready"}});
        backup.insert("clips", QJsonArray{clip});
        QVERIFY(write(dir.filePath("seq.recovery.json"), backup));

        QImage image(8, 8, QImage::Format_RGBA8888);
        image.fill(Qt::red);
        QByteArray png;
        QBuffer buffer(&png);
        QVERIFY(buffer.open(QIODevice::WriteOnly));
        QVERIFY(image.save(&buffer, "PNG"));
        TestHttpServer http;
        http.setFile("/picture.png", ServedFile{png});
        http.setFile("/matte.png", ServedFile{png});
        http.setJson([&](const QByteArray& path, const QUrl& url) {
            if (path != "/trpc/assets.get") return QByteArray();
            const auto query = QUrlQuery(url).queryItemValue("input");
            const auto id = QJsonDocument::fromJson(query.toUtf8()).object().value("id").toString();
            const QJsonObject asset{{"get_url", id == pictureId ? "/picture.png" : "/matte.png"},
                {"content_type", "image/png"}, {"size", png.size()}, {"updated_at", "u1"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson();
        });

        TimelineModel model;
        QVERIFY(load(model, document(0)));
        AutosaveController save({http.base(), {}, "seq", dir.path(), {}}, model.undoStack(),
                                [&model] { return model.timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        save.setQuitFallbackDirs({});
        QVERIFY(save.restoreEarlierCopy(&model));
        QVERIFY(save.restoringEarlier());
        QVERIFY(!save.discardEarlierCopy());
        QTRY_COMPARE_WITH_TIMEOUT(model.undoStack()->count(), 1, 5000);
        QVERIFY(!save.restoringEarlier());
        QCOMPARE(model.timeline().raw.value("clips"), backup.value("clips"));
        QTRY_VERIFY_WITH_TIMEOUT(!model.timeline().clips.front().mediaPath.empty(), 3000);
        QTRY_VERIFY_WITH_TIMEOUT(!model.timeline().clips.front().generatedMattePath.empty(), 3000);
        QVERIFY(QFile::exists(QString::fromStdString(model.timeline().clips.front().mediaPath)));
        QVERIFY(QFile::exists(QString::fromStdString(model.timeline().clips.front().generatedMattePath)));
        QVERIFY(model.resolvedMediaPaths().contains(QString::fromStdString(model.timeline().clips.front().mediaPath)));
        QVERIFY(model.resolvedMediaPaths().contains(QString::fromStdString(model.timeline().clips.front().generatedMattePath)));
        QCOMPARE(http.countRequests("GET", "/trpc/timeline.get"), 0);
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw.value("clips"), document(0).value("clips"));
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw.value("clips"), backup.value("clips"));
        QVERIFY(!model.timeline().clips.front().mediaPath.empty());
        QVERIFY(!model.timeline().clips.front().generatedMattePath.empty());
    }
    void restoredDocumentReportsUnavailableMediaSeparately() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto backup = document(200);
        auto clip = backup.value("clips").toArray().first().toObject();
        clip.insert("mediaType", "image");
        clip.insert("status", "generated");
        clip.insert("currentAssetId", QString(32, u'c'));
        backup.insert("clips", QJsonArray{clip});
        QVERIFY(write(dir.filePath("seq.recovery.json"), backup));
        TestHttpServer http;
        TimelineModel model;
        QVERIFY(load(model, document(0)));
        AutosaveController save({http.base(), {}, "seq", dir.path(), {}}, model.undoStack(),
                                [&model] { return model.timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        save.setQuitFallbackDirs({});
        QVERIFY(save.restoreEarlierCopy(&model));
        QTRY_COMPARE_WITH_TIMEOUT(model.undoStack()->count(), 1, 5000);
        QCOMPARE(model.timeline().raw.value("clips"), backup.value("clips"));
        QVERIFY(save.earlierCopyError().contains("document was restored"));
        QVERIFY(!QFile::exists(QString::fromStdString(model.timeline().clips.front().mediaPath)));
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw.value("clips"), document(0).value("clips"));
    }
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
