#include "server/projectfolder/ProjectFolderState.h"
#include "model/TimelineJson.h"
#include "TestHttpServer.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QUrlQuery>
#include <QtTest>

namespace {
QByteArray answer(const QJsonValue& data) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
}
QByteArray failure(const QString& message) {
    return QJsonDocument(QJsonObject{{"error", QJsonObject{{"message", message},
        {"data", QJsonObject{{"code", "FORBIDDEN"}, {"httpStatus", 403}}}}}}).toJson(QJsonDocument::Compact);
}
QJsonObject project(const QString& id, const QString& path, bool accessible, bool personal = false) {
    return {{"id", id}, {"name", personal ? "Personal" : "Film"}, {"kind", "general"}, {"isPersonal", personal},
            {"archivedAt", QJsonValue::Null}, {"threadId", QJsonValue::Null},
            {"folder", QJsonObject{{"workspace_id", "ws-" + id}, {"path", path}, {"origin", "created"},
                                   {"is_accessible", accessible}, {"on_delete", "trash"}}},
            {"createdAt", "2026-01-01T00:00:00.000Z"}, {"updatedAt", "2026-01-01T00:00:00.000Z"}};
}
QJsonObject timelineFile(const QString& state, const QJsonValue& error = QJsonValue::Null) {
    return {{"path", "Timelines/Opening.timeline.json"}, {"state", state}, {"error", error}};
}
QString inputId(const QUrl& url) {
    const auto input = QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded);
    return QJsonDocument::fromJson(input.toUtf8()).object().value("id").toString();
}
// A server with one project folder and the open timeline's file.
struct Fixture {
    TestHttpServer http;
    QTemporaryDir folder;
    QJsonArray projects;
    QJsonObject file = timelineFile("ok");
    QStringList documentsAsked;
    QByteArray postAnswer;
    QList<QPair<QByteArray, QJsonObject>> posts;
    Fixture() {
        projects = {project("p1", folder.path(), true), project("personal:1", folder.path(), true, true)};
        http.setJson([this](const QByteArray& path, const QUrl& url) {
            if (path == "/trpc/projects.list") { return answer(projects); }
            if (path == "/trpc/projects.documents") {
                documentsAsked << inputId(url);
                return answer(QJsonArray{
                    QJsonObject{{"type", "workflow"}, {"ref", "seq"}, {"name", "Other"}, {"updatedAt", "x"}},
                    QJsonObject{{"type", "timeline"}, {"ref", "seq"}, {"name", "Opening"}, {"updatedAt", "x"}, {"file", file}}});
            }
            return QByteArray();
        });
        http.setPost([this](const QByteArray& path, const QByteArray& body) {
            posts.append({path, QJsonDocument::fromJson(body).object()});
            return postAnswer;
        });
    }
    int lists() const { return http.countRequests("GET", "/trpc/projects.list"); }
};
std::unique_ptr<TimelineModel> timelineIn(const QString& projectId) {
    QJsonObject raw{{"id", "seq"}, {"name", "Opening"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                    {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}};
    if (!projectId.isNull()) { raw.insert("projectId", projectId); }
    auto model = std::make_unique<TimelineModel>();
    model->setTimeline(*nt::parseTimeline(raw).timeline);
    return model;
}
}  // namespace

class TestProjectFolder : public QObject {
    Q_OBJECT
private slots:
    void folderAndFileState_data() {
        QTest::addColumn<QString>("state");
        QTest::addColumn<QString>("error");
        QTest::newRow("ok") << "ok" << "";
        QTest::newRow("invalid") << "invalid" << "\"document\" must be an object";
        QTest::newRow("missing") << "missing" << "";
    }
    void folderAndFileState() {
        QFETCH(QString, state);
        QFETCH(QString, error);
        Fixture server;
        server.file = timelineFile(state, error.isEmpty() ? QJsonValue::Null : QJsonValue(error));
        const auto model = timelineIn("p1");
        ProjectFolderState folder;
        folder.setTarget({server.http.base(), {}, "seq", {}, {}});
        folder.setTimeline(model.get());
        QTest::qWait(50);
        QCOMPARE(server.lists(), 0);  // nothing is asked before the view does
        folder.refresh();
        QTRY_VERIFY(folder.loaded());
        QVERIFY(folder.error().isEmpty());
        QCOMPARE(folder.projectId(), QString("p1"));
        QCOMPARE(folder.projectName(), QString("Film"));
        QVERIFY(folder.hasFolder());
        QCOMPARE(folder.folderPath(), server.folder.path());
        QVERIFY(folder.folderAccessible());
        QVERIFY(folder.canReveal());
        QCOMPARE(folder.workspaceId(), QString("ws-p1"));
        QCOMPARE(server.documentsAsked, QStringList{"p1"});
        QCOMPARE(folder.fileState(), state);
        QCOMPARE(folder.filePath(), QString("Timelines/Opening.timeline.json"));
        QCOMPARE(folder.fileError(), error);
        // An edit asks nothing again. A move to another project does.
        model->addMarker(10, "edit");
        QTest::qWait(50);
        QCOMPARE(server.lists(), 1);
        model->setProjectId("personal:1");
        QTRY_COMPARE(server.lists(), 2);
        QTRY_COMPARE(folder.projectId(), QString("personal:1"));
    }
    void looseTimelineIsInPersonal() {
        Fixture server;
        const auto model = timelineIn(QString());
        ProjectFolderState folder;
        folder.setTarget({server.http.base(), {}, "seq", {}, {}});
        folder.setTimeline(model.get());
        folder.refresh();
        QTRY_VERIFY(folder.loaded());
        QCOMPARE(folder.projectId(), QString("personal:1"));
        QCOMPARE(server.documentsAsked, QStringList{"personal:1"});
    }
    void folderNotFoundAndLocate() {
        Fixture server;
        const QString away = server.folder.filePath("moved-away");
        server.projects = {project("p1", away, false)};
        const auto model = timelineIn("p1");
        ProjectFolderState folder;
        folder.setTarget({server.http.base(), {}, "seq", {}, {}});
        folder.setTimeline(model.get());
        folder.refresh();
        QTRY_VERIFY(folder.loaded());
        QVERIFY(!folder.folderAccessible());
        QVERIFY2(!folder.canReveal(), "a folder that is not on this machine cannot be shown");
        QVERIFY(!folder.reveal());
        // A refused Locate shows the server's reason and keeps the state.
        server.postAnswer = failure("Opening a folder is available on local installs only");
        folder.locate(QUrl::fromLocalFile(server.folder.path()));
        QTRY_VERIFY(!folder.locateError().isEmpty());
        QCOMPARE(folder.locateError(), QString("Could not locate the folder: Opening a folder is available on local installs only"));
        QVERIFY(folder.error().isEmpty());
        QVERIFY(!folder.folderAccessible());
        QCOMPARE(server.posts.size(), 1);
        QCOMPARE(server.posts[0].first, QByteArray("/trpc/projects.relocate"));
        QCOMPARE(server.posts[0].second, (QJsonObject{{"project_id", "p1"}, {"path", server.folder.path()}}));
        // An accepted one takes the new place and refreshes the file state.
        const auto lists = server.lists();
        server.projects = {project("p1", server.folder.path(), true)};
        server.postAnswer = answer(server.projects[0]);
        folder.locate(QUrl::fromLocalFile(server.folder.path()));
        QTRY_COMPARE(server.lists(), lists + 1);
        QTRY_VERIFY(!folder.busy());
        QVERIFY(folder.locateError().isEmpty());
        QVERIFY(folder.folderAccessible());
        QVERIFY(folder.canReveal());
    }
    void restoreMissingFile() {
        Fixture server;
        server.file = timelineFile("missing");
        const auto model = timelineIn("p1");
        ProjectFolderState folder;
        folder.setTarget({server.http.base(), {}, "seq", {}, {}});
        folder.setTimeline(model.get());
        folder.refresh();
        QTRY_COMPARE(folder.fileState(), QString("missing"));
        server.postAnswer = failure("The project folder is not available");
        folder.restoreFile();
        QTRY_COMPARE(folder.restoreError(), QString("The file was not restored: The project folder is not available"));
        QCOMPARE(folder.fileState(), QString("missing"));
        QCOMPARE(server.posts.last().second, (QJsonObject{{"type", "timeline"}, {"ref", "seq"}}));
        server.postAnswer = answer(QJsonObject{{"type", "timeline"}, {"ref", "seq"}, {"name", "Opening"},
                                               {"updatedAt", "x"}, {"file", timelineFile("ok")}});
        folder.restoreFile();
        QTRY_COMPARE(folder.fileState(), QString("ok"));
        QVERIFY(folder.restoreError().isEmpty());
    }
    void documentFilePushRefreshes() {
        Fixture server;
        const auto model = timelineIn("p1");
        QTemporaryDir cache;
        QUndoStack undo;
        nt::server::AutosaveController save(nt::server::AssetCacheRoot(cache.path()), {server.http.base(), {}, "seq", cache.path(), {}}, &undo,
                                            [&] { return model->timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        ProjectFolderState folder;
        folder.setTarget({server.http.base(), {}, "seq", {}, {}});
        folder.setTimeline(model.get());
        folder.setAutosave(&save);
        folder.refresh();
        QTRY_VERIFY(folder.loaded());
        QCOMPARE(server.lists(), 1);
        server.file = timelineFile("invalid", "bad JSON");
        emit save.documentFileChanged(QJsonObject{{"id", "other"}, {"type", "timeline"}});
        QTest::qWait(50);
        QCOMPARE(server.lists(), 1);
        emit save.documentFileChanged(QJsonObject{{"id", "seq"}, {"type", "timeline"}, {"file_error", "bad JSON"}});
        // Pushes while a refresh runs fold into one more.
        emit save.documentFileChanged(QJsonObject{{"id", "seq"}, {"type", "timeline"}});
        emit save.documentFileChanged(QJsonObject{{"id", "seq"}, {"type", "timeline"}});
        QTRY_COMPARE(folder.fileState(), QString("invalid"));
        QTRY_VERIFY(!folder.busy());
        QCOMPARE(folder.fileError(), QString("bad JSON"));
        QCOMPARE(server.lists(), 3);
    }
};

QTEST_MAIN(TestProjectFolder)
#include "tst_projectfolder.moc"
