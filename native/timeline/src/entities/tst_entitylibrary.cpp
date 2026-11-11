#include "entities/EntityLibrary.h"
#include "TestHttpServer.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QJsonArray>
#include <QEventLoop>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTest>
#include <QUrlQuery>
#include <QFile>
#include <QTemporaryDir>

namespace {
const auto pngBytes = QByteArray::fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==");
QByteArray answer(const QJsonValue& value) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", value}}}}).toJson();
}
QByteArray failure(const QString& code, const QString& message = "test failure") {
    return QJsonDocument(QJsonObject{{"error", QJsonObject{{"message", message},
        {"data", QJsonObject{{"code", code}, {"apiCode", code == "CONFLICT" ? "ALREADY_EXISTS" : "TEST_ERROR"}}}}}}).toJson();
}
struct Fake {
    TestHttpServer server;
    QJsonObject marker{{"kind", "character"}, {"name", "Alice"}, {"descriptor", "Hero"},
        {"lora", QJsonObject{{"id", "lora"}}}, {"palette", QJsonArray{"red"}},
        {"description", "Keep"}, {"unknown", 42}};
    QJsonObject asset{{"id", "a"}, {"name", "Picture"}, {"content_type", "image/png"},
        {"project_id", QJsonValue::Null}, {"thumb_url", "/thumb"}, {"get_url", "/full"}};
    QList<QJsonObject> writes, filings, searches;
    QJsonObject extraAsset;
    bool searchFails = false, getFails = false, writeFails = false, referenceFails = false;
    QString failureMessage = "test failure";
    std::function<void(const QJsonObject&)> beforeWrite;
    int gets = 0, conflicts = 0;
    bool changeMarker = false, filingFails = false, hide = false;
    Fake() {
        server.setJson([this](const QByteArray& path, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            if (path.endsWith("assets.get")) {
                ++gets;
                if (getFails) return failure("NOT_FOUND", failureMessage);
                if (input.value("id") == "outside" && referenceFails) return failure("NOT_FOUND");
                if (input.value("id") == "b") return answer(extraAsset);
                if (input.value("id") == "outside") return answer(QJsonObject{{"id", "outside"}, {"get_url", "/outside"}});
                return answer(asset);
            }
            searches.append(input);
            if (searchFails) return failure("BAD_REQUEST", failureMessage);
            QJsonArray rows;
            if (!hide) rows.append(asset);
            if (!extraAsset.isEmpty()) rows.append(extraAsset);
            rows.append(QJsonObject{{"id", "sound"}, {"content_type", "audio/wav"}});
            return answer(QJsonObject{{"assets", rows}});
        });
        server.setPost([this](const QByteArray& path, const QByteArray& body) {
            const auto input = QJsonDocument::fromJson(body).object();
            if (path.endsWith("assignDocument")) {
                filings.append(input);
                if (filingFails) return failure("BAD_REQUEST");
                asset.insert("project_id", input.value("projectId"));
                return answer(QJsonObject{{"ok", true}});
            }
            writes.append(input);
            if (writeFails) return failure("BAD_REQUEST", failureMessage);
            if (beforeWrite) beforeWrite(input);
            auto& asset = input.value("id") == "b" ? extraAsset : this->asset;
            if (conflicts-- > 0) {
                auto meta = asset.value("metadata").toObject();
                meta.insert("other", "concurrent");
                if (changeMarker) {
                    auto next = marker;
                    next.insert("name", "Changed");
                    meta.insert("nodetool_entity", next);
                }
                asset.insert("metadata", meta);
                return failure("CONFLICT");
            }
            asset.insert("metadata", input.value("metadata"));
            return answer(asset);
        });
    }
    void tagged() { asset.insert("metadata", QJsonObject{{"keep", 7}, {"nodetool_entity", marker}}); }
    QVariantMap draft(QString id = {}) const {
        return {{"id", id}, {"referenceAssetId", "a"}, {"kind", "character"}, {"name", " New "},
            {"descriptor", " Desc "}, {"voiceId", " voice "}, {"tags", QStringList{" one ", "", "one", "two"}}};
    }
    void open(EntityLibrary& library) {
        library.setProjectId("p");
        library.configure(server.base());
    }
};
}
class EntityLibraryTest : public QObject {
    Q_OBJECT
private slots:
    void resolveImages() {
        Fake f; EntityLibrary lib; f.open(lib);
        QTRY_VERIFY(!lib.loading());
        QSignalSpy changed(&lib, &EntityLibrary::imageUrlsChanged);
        const auto before = f.gets;
        // Listed images and empty ids need no request. Duplicates ask once.
        lib.resolveImages({"a", "", "outside", "outside"});
        QTRY_COMPARE(changed.size(), 1);
        QCOMPARE(lib.imageUrls().value("outside").toString(), f.server.base().resolved(QUrl("/outside")).toString());
        QCOMPARE(f.gets, before + 1);
        // A resolved image is not asked for again, and nothing changes.
        lib.resolveImages({"outside"});
        QTest::qWait(100);
        QCOMPARE(f.gets, before + 1);
        QCOMPARE(changed.size(), 1);
        // A missing image leaves the map alone.
        f.getFails = true;
        lib.resolveImages({"missing"});
        QTRY_COMPARE(f.gets, before + 2);
        QTest::qWait(50);
        QVERIFY(!lib.imageUrls().contains("missing"));
        QCOMPARE(changed.size(), 1);
    }
    void resolvedImagesSurviveReload() {
        Fake f; f.tagged(); EntityLibrary lib; f.open(lib);
        QTRY_VERIFY(!lib.loading());
        lib.resolveImages({"outside"});
        QTRY_VERIFY(lib.imageUrls().contains("outside"));
        const auto urls = lib.imageUrls();
        QSignalSpy changed(&lib, &EntityLibrary::imageUrlsChanged);
        lib.reload(); QTRY_VERIFY(!lib.loading());
        QCOMPARE(lib.imageUrls(), urls); QCOMPARE(changed.size(), 0);
        lib.loadImages(); QTRY_VERIFY(!lib.imagesLoading());
        QCOMPARE(lib.imageUrls(), urls); QCOMPARE(changed.size(), 0);
        lib.configure({});
        QVERIFY(lib.imageUrls().isEmpty()); QCOMPARE(changed.size(), 1);
    }
    void upload() {
        Fake f; EntityLibrary lib; f.open(lib);
        QTRY_VERIFY(!lib.loading());
        QTemporaryDir dir;
        const auto png = dir.filePath("picture.png");
        QFile file(png); QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(pngBytes); file.close();
        const auto text = dir.filePath("notes.txt");
        QFile notes(text); QVERIFY(notes.open(QIODevice::WriteOnly)); notes.write("notes"); notes.close();
        const auto disguised = dir.filePath("text.png");
        QFile disguisedFile(disguised); QVERIFY(disguisedFile.open(QIODevice::WriteOnly)); disguisedFile.write("plain text"); disguisedFile.close();
        int uploads = 0;
        bool projectSeen = false;
        f.server.setPost([&](const QByteArray&, const QByteArray& body) {
            ++uploads;
            projectSeen = body.contains("\"project_id\":\"p\"");
            f.extraAsset = QJsonObject{{"id", "uploaded"}, {"name", "picture.png"}, {"content_type", "image/png"}};
            return QJsonDocument(f.extraAsset).toJson();
        });
        QSignalSpy uploaded(&lib, &EntityLibrary::imagesUploaded);
        const auto searches = f.searches.size();
        lib.uploadImages({QUrl::fromLocalFile(text), QUrl::fromLocalFile(disguised), QUrl::fromLocalFile(png), QUrl::fromLocalFile(dir.filePath("missing.png"))});
        lib.uploadImages({QUrl::fromLocalFile(png)});
        QVERIFY(lib.uploading());
        QTRY_COMPARE(uploaded.size(), 1);
        QVERIFY(!lib.uploading());
        QCOMPARE(uploads, 1);
        QCOMPARE(uploaded[0][0].toStringList(), QStringList{"uploaded"});
        QCOMPARE(lib.uploadError(), QString("“notes.txt” is not an image.\n“text.png” is not an image.\n“missing.png” is not an image."));
        QVERIFY(f.searches.size() > searches);
        QCOMPARE(lib.images().size(), 2);
        QVERIFY(projectSeen);
    }
    void uploadServerFailureAndReset() {
        TestHttpServer server;
        server.setJson([](const QByteArray&, const QUrl&) { return answer(QJsonObject{{"assets", QJsonArray{}}}); });
        ServedFile failureFile(R"({"detail":"The image was refused.","code":"SECRET_CODE"})"); failureFile.status = 400;
        server.setFile("/api/assets", failureFile);
        EntityLibrary lib; lib.configure(server.base());
        QTemporaryDir dir; const auto png = dir.filePath("image.png");
        QFile file(png); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(pngBytes); file.close();
        QSignalSpy uploaded(&lib, &EntityLibrary::imagesUploaded);
        lib.uploadImages({QUrl::fromLocalFile(png)});
        QTRY_COMPARE(uploaded.size(), 1);
        QCOMPARE(lib.uploadError(), QString("Could not upload “image.png”. The image was refused."));
        QVERIFY(uploaded[0][0].toStringList().isEmpty());
        server.setPost([&](const QByteArray&, const QByteArray&) {
            lib.setProjectId("new");
            return QJsonDocument(QJsonObject{{"id", "late"}}).toJson();
        });
        lib.uploadImages({QUrl::fromLocalFile(png)});
        QTRY_COMPARE(lib.projectId(), QString("new"));
        QTRY_VERIFY(!lib.loading()); QTest::qWait(30);
        QCOMPARE(uploaded.size(), 1); QVERIFY(!lib.uploading()); QVERIFY(lib.uploadError().isEmpty());
    }
    void listAndImages() {
        Fake f;
        f.marker.insert("reference_asset_id", "outside");
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading() && lib.entities().size() == 1);
        QCOMPARE(lib.entities().first().toMap().value("referenceAssetId").toString(), QString("outside"));
        QCOMPARE(lib.imageUrls().value("a").toString(), f.server.base().resolved(QUrl("/thumb")).toString());
        QCOMPARE(lib.imageUrls().value("outside").toString(), f.server.base().resolved(QUrl("/outside")).toString());
        QVERIFY(f.gets > 0);
        QCOMPARE(f.searches.last().value("page_size").toInt(), 1000);
        QCOMPARE(f.searches.last().value("project_id").toString(), QString("p"));
        lib.loadImages();
        QTRY_VERIFY(!lib.imagesLoading());
        QCOMPARE(lib.images().size(), 1);
        QCOMPARE(lib.images().first().toMap().value("isEntity").toBool(), true);
        QCOMPARE(lib.images().first().toMap().value("url"), lib.imageUrls().value("a"));
        QCOMPARE(f.searches.last().value("page_size").toInt(), 500);
    }
    void createAndRemove() {
        Fake f;
        f.asset.insert("metadata", QJsonObject{{"keep", 7}});
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        QSignalSpy saved(&lib, &EntityLibrary::saved);
        lib.save(f.draft());
        QTRY_COMPARE(saved.size(), 1);
        QTRY_COMPARE(lib.entities().size(), 1);
        QCOMPARE(f.writes.first().value("expected_metadata").toObject(), QJsonObject({{"keep", 7}}));
        const auto marker = f.writes.first().value("metadata").toObject().value("nodetool_entity").toObject();
        QCOMPARE(marker.value("name").toString(), QString("New"));
        QCOMPARE(marker.value("descriptor").toString(), QString("Desc"));
        QCOMPARE(marker.value("voice_id").toString(), QString("voice"));
        QCOMPARE(marker.value("tags").toArray(), QJsonArray({"one", "two"}));
        QVERIFY(!marker.contains("reference_asset_id"));
        QCOMPARE(f.filings.first(), QJsonObject({{"projectId", "p"}, {"type", "entity"}, {"ref", "a"}}));
        QCOMPARE(saved.first().first().toMap().value("id").toString(), QString("a"));
        QSignalSpy removed(&lib, &EntityLibrary::removed);
        lib.remove("a");
        lib.remove("a");
        QTRY_COMPARE(removed.size(), 1);
        QCOMPARE(f.asset.value("metadata").toObject(), QJsonObject({{"keep", 7}}));
        QCOMPARE(f.writes.last().value("expected_metadata").toObject().value("nodetool_entity").toObject(), marker);
        QCOMPARE(f.server.countRequests("POST", "/trpc/assets.delete"), 0);
        QCOMPARE(lib.removedName(), QString("New"));
        const auto beforeUndo = f.writes.size();
        lib.undoRemove();
        QTRY_VERIFY(lib.removedName().isEmpty());
        QCOMPARE(f.writes.size(), beforeUndo + 1);
        QCOMPARE(f.asset.value("metadata").toObject().value("nodetool_entity").toObject(), marker);
        QCOMPARE(f.asset.value("metadata").toObject().value("keep").toInt(), 7);
        lib.remove("a");
        QTRY_COMPARE(removed.size(), 2);
        f.tagged();
        lib.undoRemove();
        QTRY_VERIFY(!lib.actionError().isEmpty());
        QCOMPARE(lib.removedName(), QString("New"));
        lib.dismissRemoved();
        QVERIFY(lib.removedName().isEmpty());
    }
    void createRefusedAndRollback() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        lib.save(f.draft());
        QTRY_VERIFY(!lib.saving());
        QCOMPARE(lib.saveError(), QString("That image is already used by another entity."));
        QVERIFY(f.writes.isEmpty());
        const QJsonObject prior{{"keep", 7}};
        f.asset.insert("metadata", prior);
        f.filingFails = true;
        lib.save(f.draft());
        QTRY_VERIFY(!lib.saving());
        QVERIFY(!lib.saveError().isEmpty());
        QCOMPARE(f.writes.size(), 2);
        QCOMPARE(f.writes.last().value("expected_metadata"), f.writes.first().value("metadata"));
        QCOMPARE(f.writes.last().value("metadata").toObject(), prior);
        QCOMPARE(f.asset.value("metadata").toObject(), prior);
    }
    void editMergeAndSwap() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        auto draft = f.draft("a");
        draft.insert("referenceAssetId", "outside");
        draft.insert("kind", "prop");
        lib.save(draft);
        QTRY_VERIFY(!lib.saving());
        QVERIFY(lib.saveError().isEmpty());
        auto meta = f.asset.value("metadata").toObject();
        QCOMPARE(meta.value("keep").toInt(), 7);
        auto marker = meta.value("nodetool_entity").toObject();
        for (const auto& key : {"lora", "palette", "description", "unknown"}) QCOMPARE(marker.value(key), f.marker.value(key));
        QCOMPARE(marker.value("reference_asset_id").toString(), QString("outside"));
        QVERIFY(marker.value("voice_id").isNull());
        QVERIFY(f.filings.isEmpty());
        draft.insert("referenceAssetId", "a");
        lib.save(draft);
        QTRY_VERIFY(!lib.saving());
        QVERIFY(!f.asset.value("metadata").toObject().value("nodetool_entity").toObject().contains("reference_asset_id"));
        QVERIFY(f.filings.isEmpty());
    }
    void conflicts_data() {
        QTest::addColumn<bool>("changed");
        QTest::newRow("unrelated") << false;
        QTest::newRow("marker") << true;
    }
    void conflicts() {
        QFETCH(bool, changed);
        Fake f;
        f.tagged();
        f.conflicts = 1;
        f.changeMarker = changed;
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        lib.save(f.draft("a"));
        QTRY_VERIFY(!lib.saving());
        QCOMPARE(f.writes.size(), changed ? 1 : 2);
        if (changed) QCOMPARE(lib.saveError(), QString("This entity changed elsewhere. Reload it and try again."));
        else {
            QVERIFY(lib.saveError().isEmpty());
            QCOMPARE(f.writes.last().value("expected_metadata").toObject().value("other").toString(), QString("concurrent"));
            QCOMPARE(f.asset.value("metadata").toObject().value("other").toString(), QString("concurrent"));
        }
    }
    void removedAndValidation() {
        Fake f;
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        lib.save(f.draft("a"));
        QTRY_VERIFY(!lib.saving());
        QCOMPARE(lib.saveError(), QString("This entity was removed. Reload and try again."));
        QVERIFY(f.writes.isEmpty());
        f.server.clearRequests();
        for (const auto& key : {"name", "descriptor", "kind", "referenceAssetId"}) {
            auto draft = f.draft();
            draft.insert(key, "");
            lib.save(draft);
            QVERIFY(!lib.saveError().isEmpty());
        }
        QVERIFY(f.server.requests().empty());
    }
    void staleReload() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        bool switched = false;
        f.server.setJson([&](const QByteArray&, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            if (input.value("project_id") == "p") {
                switched = true;
                lib.setProjectId("new");
                return answer(QJsonObject{{"assets", QJsonArray{f.asset}}});
            }
            return answer(QJsonObject{{"assets", QJsonArray{}}});
        });
        lib.reload();
        QTRY_VERIFY(switched && !lib.loading());
        QVERIFY(lib.entities().isEmpty());
        QCOMPARE(lib.projectId(), QString("new"));
    }
    void lazyLoadAndNotifications() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        QSignalSpy changed(&lib, &EntityLibrary::changed);
        QSignalSpy entities(&lib, &EntityLibrary::entitiesChanged);
        QSignalSpy images(&lib, &EntityLibrary::imagesChanged);
        QSignalSpy urls(&lib, &EntityLibrary::imageUrlsChanged);
        QTest::qWait(20);
        QCOMPARE(changed.size(), 0);
        lib.ensureLoaded();
        QVERIFY(!lib.error().isEmpty());
        changed.clear();
        lib.ensureLoaded();
        QCOMPARE(changed.size(), 0);
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        QCOMPARE(entities.size(), 1);
        QCOMPARE(urls.size(), 1);
        lib.loadImages();
        QTRY_VERIFY(!lib.imagesLoading());
        QCOMPARE(images.size(), 1);
        entities.clear(); images.clear(); urls.clear();
        const auto searches = f.searches.size();
        lib.ensureLoaded();
        QTest::qWait(20);
        QCOMPARE(f.searches.size(), searches);
        lib.reload(); lib.loadImages();
        QTRY_VERIFY(!lib.loading() && !lib.imagesLoading());
        QCOMPARE(entities.size(), 0);
        QCOMPARE(images.size(), 0);
        QCOMPARE(urls.size(), 0);
        lib.save(f.draft("a"));
        QVERIFY(lib.saving());
        QCOMPARE(entities.size(), 0);
        QTRY_VERIFY(!lib.saving() && !lib.loading());
        QCOMPARE(entities.size(), 1);
        lib.setProjectId("next");
        QTRY_VERIFY(!lib.loading());
        const auto scopedSearches = f.searches.size();
        lib.ensureLoaded();
        QTest::qWait(20);
        QCOMPARE(f.searches.size(), scopedSearches);
    }
    void failedReferenceAndReload() {
        Fake f;
        f.marker.insert("reference_asset_id", "outside");
        f.referenceFails = true;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        QCOMPARE(lib.entities().size(), 1);
        QVERIFY(lib.error().isEmpty());
        QVERIFY(lib.imageUrls().value("outside").toString().isEmpty());
        lib.loadImages();
        QTRY_VERIFY(!lib.imagesLoading());
        const auto entities = lib.entities();
        const auto images = lib.images();
        const auto urls = lib.imageUrls();
        QSignalSpy entityChanges(&lib, &EntityLibrary::entitiesChanged);
        QSignalSpy imageChanges(&lib, &EntityLibrary::imagesChanged);
        f.searchFails = true;
        lib.reload(); lib.loadImages();
        QTRY_VERIFY(!lib.loading() && !lib.imagesLoading());
        QCOMPARE(lib.entities(), entities);
        QCOMPARE(lib.images(), images);
        QCOMPARE(lib.imageUrls(), urls);
        QCOMPARE(entityChanges.size(), 0);
        QCOMPARE(imageChanges.size(), 0);
        QCOMPARE(lib.error(), QString("Could not load entities. test failure"));
        QCOMPARE(lib.imagesError(), QString("Could not load images. test failure"));
        f.failureMessage.clear();
        lib.reload();
        QTRY_VERIFY(!lib.loading());
        QCOMPARE(lib.error(), QString("Could not load entities. The server did not answer."));
    }
    void staleEditor() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        f.marker.insert("name", "Elsewhere");
        f.tagged();
        lib.save(f.draft("a"));
        QTRY_VERIFY(!lib.saving() && !lib.loading());
        QCOMPARE(lib.saveError(), QString("This entity changed elsewhere. Reload it and try again."));
        QVERIFY(f.writes.isEmpty());
        QCOMPARE(lib.entities().first().toMap().value("name").toString(), QString("Elsewhere"));
        lib.save(f.draft("a"));
        QTRY_VERIFY(!lib.saving());
        QVERIFY(lib.saveError().isEmpty());
        lib.save(f.draft("a"));
        QTRY_VERIFY(!lib.saving() && !lib.loading());
        QVERIFY(lib.saveError().isEmpty());
    }
    void actionErrors() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        f.searchFails = true;
        lib.reload();
        QTRY_VERIFY(!lib.loading());
        const auto listError = lib.error();
        f.writeFails = true;
        lib.remove("a");
        QTRY_VERIFY(!lib.actionError().isEmpty());
        QCOMPARE(lib.actionError(), QString("Could not remove this entity. test failure"));
        QCOMPARE(lib.error(), listError);
        lib.clearActionError();
        QVERIFY(lib.actionError().isEmpty());
        f.writeFails = false;
        lib.remove("a");
        QTRY_VERIFY(lib.canUndo());
        f.getFails = true;
        lib.undoRemove();
        QVERIFY(lib.actionError().isEmpty());
        QTRY_VERIFY(!lib.actionError().isEmpty());
        QCOMPARE(lib.actionError(), QString("Could not restore this entity. test failure"));
        QVERIFY(lib.canUndo());
        f.failureMessage.clear();
        lib.undoRemove();
        QTRY_VERIFY(!lib.actionError().isEmpty());
        QCOMPARE(lib.actionError(), QString("Could not restore this entity. The server did not answer."));
        lib.save(f.draft("a"));
        QTRY_VERIFY(!lib.saving());
        QCOMPARE(lib.saveError(), QString("Could not save this entity. The server did not answer."));
        lib.remove("a");
        QVERIFY(lib.actionError().isEmpty());
        QTRY_VERIFY(!lib.actionError().isEmpty());
        QCOMPARE(lib.actionError(), QString("Could not remove this entity. The server did not answer."));
    }
    void undoStack() {
        Fake f;
        f.tagged();
        f.extraAsset = f.asset;
        f.extraAsset.insert("id", "b");
        auto secondMarker = f.marker;
        secondMarker.insert("name", "Bob");
        f.extraAsset.insert("metadata", QJsonObject{{"nodetool_entity", secondMarker}});
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        lib.remove("a");
        QTRY_VERIFY(lib.canUndo());
        lib.remove("b");
        QTRY_COMPARE(lib.removedName(), QString("Bob"));
        lib.undoRemove();
        QTRY_COMPARE(lib.removedName(), QString("Alice"));
        QCOMPARE(f.writes.last().value("id").toString(), QString("b"));
        QVERIFY(lib.canUndo());
        lib.undoRemove();
        QTRY_VERIFY(!lib.canUndo());
        QCOMPARE(f.writes.last().value("id").toString(), QString("a"));
        f.marker.insert("name", "");
        f.tagged();
        lib.remove("a");
        QTRY_VERIFY(lib.canUndo());
        QCOMPARE(lib.removedName(), QString("Untitled"));
        lib.dismissRemoved();
        QVERIFY(!lib.canUndo());
        QVERIFY(lib.removedName().isEmpty());
        lib.remove("b");
        QTRY_VERIFY(lib.canUndo());
        lib.setProjectId("new");
        QVERIFY(!lib.canUndo());
        QTRY_VERIFY(!lib.loading());
    }
    void restoreWhileRemoving() {
        Fake f;
        f.tagged();
        f.extraAsset = f.asset;
        f.extraAsset.insert("id", "b");
        auto secondMarker = f.marker;
        secondMarker.insert("name", "Bob");
        f.extraAsset.insert("metadata", QJsonObject{{"nodetool_entity", secondMarker}});
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        lib.remove("a");
        QTRY_VERIFY(lib.canUndo() && !lib.loading());
        bool concurrentRemoved = false;
        f.beforeWrite = [&](const QJsonObject& input) {
            if (input.value("id") != "a") return;
            QEventLoop loop;
            const auto connection = connect(&lib, &EntityLibrary::removed, &loop, [&](const QString& id) {
                if (id == "b") { concurrentRemoved = true; loop.quit(); }
            });
            QTimer::singleShot(5000, &loop, &QEventLoop::quit);
            lib.remove("b");
            loop.exec();
            disconnect(connection);
        };
        lib.undoRemove();
        QTRY_VERIFY(concurrentRemoved && !lib.loading());
        QTRY_VERIFY(f.asset.value("metadata").toObject().contains("nodetool_entity"));
        QVERIFY(lib.canUndo());
        lib.undoRemove();
        QTRY_VERIFY(!lib.canUndo());
        QCOMPARE(f.writes.last().value("id").toString(), QString("b"));
    }
    void writeAfterReset() {
        Fake f;
        f.tagged();
        EntityLibrary lib;
        f.open(lib);
        QTRY_VERIFY(!lib.loading());
        f.beforeWrite = [&](const QJsonObject&) { lib.setProjectId("new"); };
        QSignalSpy removed(&lib, &EntityLibrary::removed);
        lib.remove("a");
        QTRY_COMPARE(f.writes.size(), 1);
        QTRY_VERIFY(!lib.loading());
        QTest::qWait(20);
        QVERIFY(!lib.canUndo());
        QVERIFY(lib.removedName().isEmpty());
        QCOMPARE(removed.size(), 0);
    }
    // Run by server.test.mjs, which starts the scratch server and checks the final asset.
    void realServer() {
        const auto base = qEnvironmentVariable("NT_ENTITY_SERVER");
        if (base.isEmpty()) QSKIP("NT_ENTITY_SERVER is not set");
        const auto project = qEnvironmentVariable("NT_ENTITY_PROJECT");
        const auto first = qEnvironmentVariable("NT_ENTITY_FIRST");
        const auto second = qEnvironmentVariable("NT_ENTITY_SECOND");
        const auto rowFor = [](const QVariantList& rows, const QString& id) {
            for (const auto& row : rows) if (row.toMap().value("id") == id) return row.toMap();
            return QVariantMap{};
        };
        nt::server::ServerClient client{QUrl(base)};
        const auto metadata = [&] { return client.getAsset(first).data.toObject().value("metadata").toObject(); };
        EntityLibrary lib;
        // Creating a project moves loose assets to the personal project, so start where the image is.
        lib.setProjectId(client.getAsset(first).data.toObject().value("project_id").toString());
        lib.configure(QUrl(base));
        lib.loadImages();
        QTRY_VERIFY_WITH_TIMEOUT(!lib.imagesLoading(), 10000);
        QVERIFY2(lib.imagesError().isEmpty(), qPrintable(lib.imagesError()));
        const auto picture = rowFor(lib.images(), first);
        QVERIFY2(!picture.isEmpty(), qPrintable(QJsonDocument(QJsonArray::fromVariantList(lib.images())).toJson()));
        QCOMPARE(picture.value("isEntity").toBool(), false);
        QVERIFY(!picture.value("url").toString().isEmpty());

        lib.setProjectId(project);
        QTRY_VERIFY_WITH_TIMEOUT(!lib.loading(), 10000);
        QSignalSpy uploaded(&lib, &EntityLibrary::imagesUploaded);
        lib.uploadImages({QUrl::fromLocalFile(qEnvironmentVariable("NT_ENTITY_PNG"))});
        QTRY_COMPARE_WITH_TIMEOUT(uploaded.size(), 1, 10000);
        QVERIFY2(lib.uploadError().isEmpty(), qPrintable(lib.uploadError()));
        const auto ids = uploaded[0][0].toStringList(); QCOMPARE(ids.size(), 1);
        QCOMPARE(client.getAsset(ids.first()).data.toObject().value("project_id").toString(), project);
        QVERIFY(!rowFor(lib.images(), ids.first()).isEmpty());
        QFile report(qEnvironmentVariable("NT_ENTITY_UPLOAD_REPORT"));
        QVERIFY(report.open(QIODevice::WriteOnly)); report.write(ids.first().toUtf8()); report.close();
        QSignalSpy saved(&lib, &EntityLibrary::saved);
        lib.save({{"referenceAssetId", first}, {"kind", "character"}, {"name", "Mara"}, {"descriptor", "Red coat"},
            {"voiceId", "voice"}, {"tags", QStringList{"lead"}}});
        QTRY_VERIFY2_WITH_TIMEOUT(saved.size() == 1 || !lib.saveError().isEmpty(), qPrintable(lib.saveError()), 10000);
        QVERIFY2(lib.saveError().isEmpty(), qPrintable(lib.saveError()));
        QTRY_VERIFY_WITH_TIMEOUT(!rowFor(lib.entities(), first).isEmpty(), 10000);
        QCOMPARE(rowFor(lib.entities(), first).value("name").toString(), QString("Mara"));
        QVERIFY(!lib.imageUrls().value(first).toString().isEmpty());
        QCOMPARE(client.getAsset(first).data.toObject().value("project_id").toString(), project);

        lib.save({{"referenceAssetId", first}, {"kind", "prop"}, {"name", "Other"}, {"descriptor", "Other"}});
        QTRY_VERIFY_WITH_TIMEOUT(!lib.saving(), 10000);
        QVERIFY2(lib.saveError().contains("already used"), qPrintable(lib.saveError()));

        auto current = metadata();
        auto marker = current.value("nodetool_entity").toObject();
        marker.insert("lora", QJsonObject{{"id", "kept"}});
        auto next = current;
        next.insert("nodetool_entity", marker);
        QVERIFY(client.mutate("assets.update", {{"id", first}, {"metadata", next}}).ok());
        // The stale write the save loop retries must fail with the code it matches.
        const auto stale = client.mutate("assets.update", {{"id", first}, {"expected_metadata", current}, {"metadata", next}});
        QVERIFY(!stale.ok());
        QVERIFY2(stale.error.code == "CONFLICT" || stale.error.apiCode == "ALREADY_EXISTS", qPrintable(stale.describe()));

        lib.reload();
        QTRY_VERIFY_WITH_TIMEOUT(!lib.loading(), 10000);
        lib.save({{"id", first}, {"referenceAssetId", second}, {"kind", "character"}, {"name", "Mara"}, {"descriptor", "Blue coat"}});
        QTRY_COMPARE_WITH_TIMEOUT(saved.size(), 2, 10000);
        QVERIFY2(lib.saveError().isEmpty(), qPrintable(lib.saveError()));
        QTRY_COMPARE_WITH_TIMEOUT(rowFor(lib.entities(), first).value("referenceAssetId").toString(), second, 10000);
        QCOMPARE(metadata().value("nodetool_entity").toObject().value("descriptor").toString(), QString("Blue coat"));
        QCOMPARE(metadata().value("nodetool_entity").toObject().value("lora").toObject().value("id").toString(), QString("kept"));
        QVERIFY(metadata().value("nodetool_entity").toObject().value("voice_id").isNull());

        const auto third = qEnvironmentVariable("NT_ENTITY_THIRD");
        lib.save({{"id", third}, {"referenceAssetId", third}, {"kind", "prop"}, {"name", "Edited web entity"}, {"descriptor", "Edited web image"}});
        QTRY_VERIFY_WITH_TIMEOUT(!lib.saving(), 10000);
        QVERIFY2(lib.saveError().isEmpty(), qPrintable(lib.saveError()));
        QCOMPARE(client.getAsset(third).data.toObject().value("metadata").toObject().value("nodetool_entity").toObject().value("name").toString(), QString("Edited web entity"));
        QSignalSpy webRemoved(&lib, &EntityLibrary::removed);
        lib.remove(third);
        QTRY_COMPARE_WITH_TIMEOUT(webRemoved.size(), 1, 10000);
        QVERIFY2(lib.actionError().isEmpty(), qPrintable(lib.actionError()));
        QVERIFY(!client.getAsset(third).data.toObject().value("metadata").toObject().contains("nodetool_entity"));
        lib.dismissRemoved();

        QSignalSpy removed(&lib, &EntityLibrary::removed);
        lib.remove(first);
        QTRY_COMPARE_WITH_TIMEOUT(removed.size(), 1, 10000);
        QVERIFY(!metadata().contains("nodetool_entity"));
        QTRY_VERIFY_WITH_TIMEOUT(rowFor(lib.entities(), first).isEmpty() && !lib.loading(), 10000);
        lib.undoRemove();
        QTRY_VERIFY_WITH_TIMEOUT(lib.removedName().isEmpty(), 10000);
        QVERIFY2(lib.actionError().isEmpty(), qPrintable(lib.actionError()));
        QTRY_VERIFY_WITH_TIMEOUT(!rowFor(lib.entities(), first).isEmpty(), 10000);
    }
    void uploadTargetDisappears() {
        Fake f;
        QList<QByteArray> args{"test", "--server", f.server.base().toString().toUtf8(), "--timeline", "entities"};
        QList<char*> argv;
        for (auto& arg : args) argv.append(arg.data());
        argv.append(nullptr); int argc = args.size();
        QCOMPARE(nt::server::takeServerArgs(argc, argv.data()), 0);
        EntityLibrary lib; lib.setProjectId("p"); lib.configure({});
        QTRY_VERIFY(!lib.loading());
        QTemporaryDir dir; const auto png = dir.filePath("image.png");
        QFile file(png); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(pngBytes); file.close();
        bool disappeared = false;
        f.server.setPost([&](const QByteArray&, const QByteArray&) {
            QByteArray program("test"), list("--list-timelines");
            char* argv[]{program.data(), list.data(), nullptr}; int argc = 2;
            disappeared = nt::server::takeServerArgs(argc, argv) == 0;
            return QJsonDocument(QJsonObject{{"id", "uploaded"}}).toJson();
        });
        QSignalSpy uploaded(&lib, &EntityLibrary::imagesUploaded);
        lib.uploadImages({QUrl::fromLocalFile(png)});
        QTRY_VERIFY(disappeared);
        QTRY_VERIFY(!lib.uploading());
        QVERIFY(!lib.imagesLoading());
        QCOMPARE(uploaded.size(), 1);
        QCOMPARE(uploaded[0][0].toStringList(), QStringList{"uploaded"});
        QVERIFY(!lib.imagesError().isEmpty());
    }

};
QTEST_GUILESS_MAIN(EntityLibraryTest)
#include "tst_entitylibrary.moc"
