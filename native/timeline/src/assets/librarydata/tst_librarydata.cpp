#include "assets/AssetBrowser.h"
#include "../../../tests/TestHttpServer.h"
#include <QJsonDocument>
#include <QUrlQuery>
#include <QtTest>

class TestLibraryData : public QObject {
    Q_OBJECT
private:
    static QJsonObject asset(const QString& id, const QString& parent, const QString& name = "Shot") {
        return {{"id", id}, {"parent_id", parent}, {"user_id", "legacy-user"}, {"name", name},
            {"content_type", "video/mp4"}, {"favorite", true},
            {"metadata", QJsonObject{{"tags", QJsonArray{"hero"}}}}};
    }
    static void attach(AssetBrowser& browser, TestHttpServer& http) {
        browser.m_target = nt::server::SaveTarget{http.base(), {}, {}, {}, {}};
    }
private slots:
    void paginatedFoldersAndGlobalFilters() {
        TestHttpServer http;
        QVERIFY(http.base().port() != 7777);
        QStringList cursors;
        http.setJson([&](const QByteArray& path, const QUrl& url) {
            if (path != "/trpc/assets.search") { return QByteArray(); }
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            const auto cursor = input.value("cursor").toString();
            cursors.append(cursor);
            const QJsonObject page = cursor.isEmpty()
                ? QJsonObject{{"assets", QJsonArray{asset("root-legacy", "legacy-user")}}, {"next_cursor", "page2"}}
                : QJsonObject{{"assets", QJsonArray{asset("0123456789abcdef0123456789abcdef", "nested", "Far shot")}}, {"next_cursor", QJsonValue::Null}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", page}}}}).toJson();
        });
        AssetBrowser browser;
        attach(browser, http);
        browser.refresh();
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(cursors, QStringList({"", "page2"}));
        QCOMPARE(browser.assets().size(), 1);
        QCOMPARE(browser.assets().first().toMap().value("id").toString(), QString("root-legacy"));
        browser.setSearchText("Far");
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(browser.assets().size(), 1);
        QCOMPARE(browser.assets().first().toMap().value("id").toString(), QString("0123456789abcdef0123456789abcdef"));
        browser.setSearchText("");
        browser.setFavoritesOnly(true);
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(browser.assets().size(), 2);
    }
    void emptyCollectionAndCrossFolderMembers() {
        TestHttpServer http;
        http.setJson([](const QByteArray& path, const QUrl&) {
            if (path != "/trpc/assets.get") { return QByteArray(); }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset("member", "elsewhere")}}}}).toJson();
        });
        AssetBrowser browser;
        attach(browser, http);
        browser.setCollectionActive(true);
        QTRY_VERIFY(!browser.busy());
        QVERIFY(browser.assets().isEmpty());
        browser.setCollectionAssetIds({"member"});
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(browser.assets().size(), 1);
        browser.setCollectionAssetIds({});
        QTRY_VERIFY(!browser.busy());
        QVERIFY(browser.assets().isEmpty());
    }
    void tagsRetryFromLatestMetadata() {
        TestHttpServer http;
        int reads = 0;
        QList<QJsonObject> writes;
        http.setJson([&](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/assets.get") {
                auto row = asset("legacy-id", "legacy-user");
                row.insert("metadata", QJsonObject{{"unrelated", ++reads}, {"tags", QJsonArray{"old"}}});
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", row}}}}).toJson();
            }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"assets", QJsonArray{}}}}}}}).toJson();
        });
        http.setPost([&](const QByteArray&, const QByteArray& bytes) {
            writes.append(QJsonDocument::fromJson(bytes).object());
            if (writes.size() == 1) {
                return QByteArray(R"({"error":{"message":"changed","data":{"code":"CONFLICT","apiCode":"ALREADY_EXISTS"}}})");
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
        AssetBrowser browser;
        attach(browser, http);
        browser.setAssetTags("legacy-id", {" hero ", "hero", ""});
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(writes.size(), 2);
        QCOMPARE(writes.last().value("id").toString(), QString("legacy-id"));
        QCOMPARE(writes.last().value("metadata").toObject().value("unrelated").toInt(), 2);
        QCOMPARE(writes.last().value("metadata").toObject().value("tags").toArray(), QJsonArray{"hero"});
        QCOMPARE(writes.last().value("expected_metadata").toObject().value("unrelated").toInt(), 2);
    }
    void writeActionsKeepFullIdsAndFolderParents() {
        TestHttpServer http;
        QList<QPair<QByteArray, QJsonObject>> writes;
        http.setJson([](const QByteArray&, const QUrl&) {
            return QByteArray(R"({"result":{"data":{"assets":[],"next_cursor":null}}})");
        });
        http.setPost([&](const QByteArray& path, const QByteArray& bytes) {
            writes.append({path, QJsonDocument::fromJson(bytes).object()});
            return path == "/api/assets" ? QByteArray(R"({"id":"new-folder"})") : QByteArray(R"({"result":{"data":{}}})");
        });
        AssetBrowser browser;
        attach(browser, http);
        const QString id = "0123456789abcdef0123456789abcdef";
        browser.renameAsset(id, " Name ");
        browser.moveAsset(id, "parent-legacy");
        browser.setFavorite(id, true);
        browser.deleteAsset(id);
        browser.createFolder(" New folder ");
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(writes.size(), 5);
        QCOMPARE(writes[0].second.value("id").toString(), id);
        QCOMPARE(writes[0].second.value("name").toString(), QString("Name"));
        QCOMPARE(writes[1].second.value("parent_id").toString(), QString("parent-legacy"));
        QCOMPARE(writes[2].second.value("favorite").toBool(), true);
        QCOMPARE(writes[3].first, QByteArray("/trpc/assets.delete"));
        QCOMPARE(writes[4].first, QByteArray("/api/assets"));
        QCOMPARE(writes[4].second.value("content_type").toString(), QString("folder"));
    }
    void moveToRootUsesAssetOwner() {
        TestHttpServer http;
        QList<QJsonObject> updates;
        http.setJson([](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/assets.get") {
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset("nested-legacy-asset", "nested")}}}}).toJson();
            }
            return QByteArray(R"({"result":{"data":{"assets":[],"next_cursor":null}}})");
        });
        http.setPost([&](const QByteArray&, const QByteArray& bytes) {
            const auto input = QJsonDocument::fromJson(bytes).object();
            updates.append(input);
            if (input.value("parent_id").toString().isEmpty()) {
                return QByteArray(R"({"error":{"message":"Parent not found","data":{"code":"NOT_FOUND"}}})");
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
        AssetBrowser browser;
        attach(browser, http);
        browser.moveAsset("nested-legacy-asset", "");
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(updates.size(), 1);
        QCOMPARE(updates.first().value("id").toString(), QString("nested-legacy-asset"));
        QCOMPARE(updates.first().value("parent_id").toString(), QString("legacy-user"));
        QVERIFY(browser.error().isEmpty());
    }
    void rapidFiltersCoalesceWhileReadIsPending() {
        TestHttpServer http;
        AssetBrowser browser;
        attach(browser, http);
        QStringList queries;
        http.setJson([&](const QByteArray&, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            queries.append(input.value("query").toString());
            if (queries.size() == 1) {
                for (int i = 0; i < 100; ++i) { browser.setSearchText(QString::number(i)); }
                return QByteArray(R"({"result":{"data":{"assets":[],"next_cursor":"obsolete-next-page"}}})");
            }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{
                {"assets", QJsonArray{asset("latest", "elsewhere", "99")}}, {"next_cursor", QJsonValue::Null}}}}}}).toJson();
        });
        browser.refresh();
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(queries, QStringList({"", "99"}));
        QVERIFY(browser.m_requests.empty());
        QCOMPARE(browser.assets().size(), 1);
        QCOMPARE(browser.assets().first().toMap().value("id").toString(), QString("latest"));
    }
    void pendingListingSurvivesSameProjectReplacement() {
        TestHttpServer http;
        AssetBrowser browser;
        attach(browser, http);
        TimelineModel timeline;
        nt::Timeline document;
        document.raw = {{"projectId", "same-project"}};
        timeline.setTimeline(document);
        browser.setTimeline(&timeline);
        int searches = 0;
        http.setJson([&](const QByteArray&, const QUrl&) {
            ++searches;
            timeline.setTimeline(document);
            auto row = asset("same-project-asset", "legacy-user");
            row.insert("project_id", "same-project");
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{
                {"assets", QJsonArray{row}}, {"next_cursor", QJsonValue::Null}}}}}}).toJson();
        });
        browser.refresh();
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(searches, 1);
        QCOMPARE(browser.assets().size(), 1);
        QCOMPARE(browser.assets().first().toMap().value("id").toString(), QString("same-project-asset"));
    }
    void queuedMutationDoesNotRunAfterDocumentSwitch() {
        TestHttpServer http;
        AssetBrowser browser;
        attach(browser, http);
        int writes = 0;
        http.setPost([&](const QByteArray&, const QByteArray&) { ++writes; return QByteArray(R"({"result":{"data":{}}})"); });
        http.setJson([&](const QByteArray&, const QUrl&) {
            browser.deleteAsset("old-project-asset");
            browser.resetDocumentState();
            return QByteArray(R"({"result":{"data":{"assets":[],"next_cursor":null}}})");
        });
        browser.refresh();
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(writes, 0);
        QVERIFY(browser.m_requests.empty());
    }
    void submittedMutationCompletionDoesNotAffectNewDocument() {
        TestHttpServer http;
        AssetBrowser browser;
        attach(browser, http);
        int reads = 0;
        http.setJson([&](const QByteArray&, const QUrl&) { ++reads; return QByteArray(R"({"result":{"data":{"assets":[]}}})"); });
        http.setPost([&](const QByteArray&, const QByteArray&) {
            browser.resetDocumentState();
            return QByteArray(R"({"error":{"message":"old project denied","data":{"code":"FORBIDDEN"}}})");
        });
        browser.deleteAsset("old-project-asset");
        QTRY_VERIFY(!browser.busy());
        QVERIFY(browser.error().isEmpty());
        QCOMPARE(reads, 0);
    }
    void emptyFolderIdOpensRoot() {
        AssetBrowser browser;
        browser.m_target.reset();
        browser.m_folderId = "nested";
        browser.m_folderPath = {"", "parent"};
        browser.openFolder("");
        QVERIFY(browser.folderId().isEmpty());
        QCOMPARE(browser.breadcrumbs().size(), 1);
    }
    void staleQueryCannotReplaceNewView() {
        AssetBrowser browser;
        browser.m_target.reset();
        browser.m_queryGeneration = 2;
        AssetBrowser::Result old;
        old.queryGeneration = 1;
        old.replace = true;
        old.assets = {asset("old", "legacy-user")};
        browser.receive(old);
        QVERIFY(browser.assets().isEmpty());
    }
    void scopeIncludesAuthenticationAndFullServer() {
        AssetBrowser browser;
        browser.m_target = nt::server::SaveTarget{QUrl("http://localhost:1234/one"), "token-a", {}, {}, {}};
        const auto scope = browser.libraryScope();
        QCOMPARE(scope.size(), 64);
        QVERIFY(!scope.contains("token"));
        browser.m_target->token = "token-b";
        QVERIFY(scope != browser.libraryScope());
        browser.m_target->token = "token-a";
        browser.m_target->server = QUrl("http://localhost:1234/two");
        QVERIFY(scope != browser.libraryScope());
    }
    void projectReplacementInvalidatesCollectionsAndQueries() {
        AssetBrowser browser;
        browser.m_target = nt::server::SaveTarget{QUrl("http://localhost:1234"), "token", {}, {}, {}};
        TimelineModel timeline;
        nt::Timeline first;
        first.raw = {{"projectId", "first-project"}};
        timeline.setTimeline(first);
        browser.setTimeline(&timeline);
        const auto firstScope = browser.libraryScope();
        browser.m_collectionActive = true;
        browser.m_collectionAssetIds = {"old-project-member"};
        browser.m_folderId = "old-project-folder";
        const auto generation = browser.m_queryGeneration;
        QSignalSpy scopeChanged(&browser, &AssetBrowser::libraryScopeChanged);
        nt::Timeline second;
        second.raw = {{"projectId", "second-project"}};
        timeline.setTimeline(second);
        QVERIFY(browser.libraryScope() != firstScope);
        QVERIFY(!scopeChanged.isEmpty());
        QVERIFY(browser.m_queryGeneration > generation);
        QVERIFY(!browser.collectionActive());
        QVERIFY(browser.collectionAssetIds().isEmpty());
        QVERIFY(browser.folderId().isEmpty());
    }
    void missingFileTransferFailsAndRetries() {
        TestHttpServer http;
        http.setJson([](const QByteArray&, const QUrl&) {
            return QByteArray(R"({"result":{"data":{"assets":[],"next_cursor":null}}})");
        });
        AssetBrowser browser;
        attach(browser, http);
        QStringList observed;
        connect(&browser, &AssetBrowser::transfersChanged, &browser, [&] {
            if (!browser.transfers().isEmpty()) {
                observed.append(browser.transfers().first().toMap().value("status").toString());
            }
        });
        browser.importFiles({QUrl::fromLocalFile("/nodetool-library-test/missing-file.mp4")});
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(browser.transfers().size(), 1);
        auto row = browser.transfers().first().toMap();
        QCOMPARE(row.value("id").toString().size(), 32);
        QVERIFY(!row.value("id").toString().contains('-'));
        QCOMPARE(row.value("status").toString(), QString("failed"));
        QVERIFY(!row.value("error").toString().isEmpty());
        QVERIFY(observed.contains("queued"));
        QVERIFY(observed.contains("running"));
        QVERIFY(observed.contains("failed"));
        QVERIFY(!row.contains("progress"));
        const auto failures = observed.count("failed");
        browser.retryImport(row.value("id").toString());
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(observed.count("failed"), failures + 1);
        browser.clearFinishedTransfers();
        QVERIFY(browser.transfers().isEmpty());
    }
    void importBatchRefreshesOnlyOnce() {
        TestHttpServer http;
        int searches = 0;
        http.setJson([&](const QByteArray&, const QUrl&) {
            ++searches;
            return QByteArray(R"({"result":{"data":{"assets":[],"next_cursor":null}}})");
        });
        AssetBrowser browser;
        attach(browser, http);
        browser.importFiles({QUrl::fromLocalFile("/nodetool-library-test/missing-one.mp4"),
            QUrl::fromLocalFile("/nodetool-library-test/missing-two.mp4"),
            QUrl::fromLocalFile("/nodetool-library-test/missing-three.mp4")});
        QTRY_VERIFY(!browser.busy());
        QCOMPARE(browser.transfers().size(), 3);
        for (const auto& value : browser.transfers()) {
            QCOMPARE(value.toMap().value("status").toString(), QString("failed"));
        }
        QCOMPARE(searches, 1);
    }
    void failedImportCanRetryAndClear() {
        AssetBrowser browser;
        browser.m_target.reset();
        const AssetBrowser::QueuedImport queued{"/missing", {}, {}, "transfer"};
        browser.m_imports.insert("transfer", queued);
        browser.m_transfers = {QVariantMap{{"id", "transfer"}, {"status", "failed"}, {"error", "missing"}}};
        browser.retryImport("transfer");
        QCOMPARE(browser.transfers().first().toMap().value("status").toString(), QString("queued"));
        browser.transferState("transfer", "failed", "missing");
        browser.clearFinishedTransfers();
        QVERIFY(browser.transfers().isEmpty());
    }
};
QTEST_GUILESS_MAIN(TestLibraryData)
#include "tst_librarydata.moc"
