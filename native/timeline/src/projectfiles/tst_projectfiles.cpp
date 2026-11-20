// The Files dock in the production timeline editor: it registers in the left
// slot, shows the shared FilesPanel without its own close button, and follows
// the editor's project folder.
#include "projectfiles/TimelineProjectFiles.h"
#include "server/ServerSource.h"
#include "server/TimelineList/TimelineSession.h"
#include "server/projectfolder/ProjectFolderState.h"
#include "model/TimelineJson.h"
#include "wiring/WiringFixture.h"
#include "aiassist/CandidatePreview.h"
#include "TestHttpServer.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMutex>
#include <QMutexLocker>
#include <QQmlComponent>
#include <QQmlContext>
#include <QScopeGuard>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QtEndian>

class TestProjectFiles : public WiringFixture {
    Q_OBJECT
    // Shows the Files tab in its left group. The dock places a registered left
    // panel there, so the reveal needs no layout of its own.
    static void reveal(DockLayoutStore* dock) {
        dock->dispatch({{"type", "reveal"}, {"panelId", "files"}});  // false when the layout already shows it
        QCoreApplication::processEvents();
        const auto layout = dock->layout();
        QVERIFY(!layout.value("hidden").toStringList().contains("files"));
        bool active = false;
        for (const auto& group : layout.value("regions").toMap().value("left").toList()) {
            active = active || group.toMap().value("activePanelId").toString() == "files";
        }
        QVERIFY(active);
    }
    void clickItem(QQuickItem* target) {
        QVERIFY(target);
        QList<QQuickItem*> ancestors;
        for (auto* p = target; p; p = p->parentItem()) { ancestors.prepend(p); }
        for (auto* p : ancestors) { p->ensurePolished(); }
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier,
                          target->mapToScene({target->width() / 2, target->height() / 2}).toPoint());
    }
private slots:
    void init() { open(); }
    void cleanup() { view.reset(); }
    void theFilesDockOpensFromTheLeftSlot() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        auto* host = item("projectFilesDock");
        QVERIFY(host);
        QTRY_VERIFY(host->isVisible());
        QVERIFY(host->width() > 0 && host->height() > 0);
        QVERIFY(item("files-header"));
        // The dock tab closes the panel, so the panel has no close button.
        auto* close = item("files-close");
        QVERIFY(close);
        QVERIFY(!close->isVisible());
        // A local timeline has no project folder.
        QTRY_VERIFY(item("files-no-folder") && item("files-no-folder")->isVisible());
        QVERIFY(!item("files-refresh")->isVisible());
    }
    void theDockFollowsTheEditorsProjectFolder() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        // The dock host owns the panel, so it is found under the panel item.
        auto* source = item("projectFilesDock")->findChild<TimelineProjectFiles*>();
        QVERIFY(source);
        QTRY_VERIFY(source->folder());
        QCOMPARE(source->folder(), view->rootObject()->property("projectFolder").value<ProjectFolderState*>());
        QVERIFY(!source->model().hasFolder());
    }
    void theDockGivesThePanelThePreviewPlayer() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        QQuickItem* panel = nullptr;
        for (auto* child : item("projectFilesDock")->childItems()) {
            if (child->property("previewDelegate").isValid()) { panel = child; }
        }
        QVERIFY(panel);
        QVERIFY(panel->property("previewDelegate").value<QObject*>());
        QCOMPARE(panel->property("previewDelegateKinds").toStringList(), (QStringList{"video", "audio"}));
    }
    // The preview plays a project folder file through the timeline decoder.
    void aReviewPlaysALocalFile() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        // One second of 16-bit mono silence at 8 kHz.
        const int rate = 8000, samples = rate;
        QByteArray wav("RIFF");
        const auto u32 = [&wav](quint32 v) { char b[4]; qToLittleEndian(v, b); wav.append(b, 4); };
        const auto u16 = [&wav](quint16 v) { char b[2]; qToLittleEndian(v, b); wav.append(b, 2); };
        u32(36 + samples * 2); wav.append("WAVEfmt "); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16);
        wav.append("data"); u32(samples * 2); wav.append(QByteArray(samples * 2, '\0'));
        QFile file(dir.filePath("tone.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(wav);
        file.close();
        CandidatePreview review(m_testCache.root());
        review.setTimeline(view->rootObject()->property("timeline").value<TimelineModel*>());
        QVERIFY(review.timeline());
        QVERIFY(!review.previewFile(dir.filePath("missing.wav"), "audio"));
        QVERIFY(review.previewFile(file.fileName(), "audio"));
        QTRY_VERIFY2_WITH_TIMEOUT(review.ready() || !review.error().isEmpty(), "no result", 10000);
        QVERIFY2(review.ready(), qPrintable(review.error()));
        QVERIFY(review.previewClock()->durationMs() > 900);
        review.close();
    }
    // Selecting a local file in FilesDock's previewDelegate must settle ready
    // without re-triggering load() via CandidatePreview::timelineChanged.
    void theDockPreviewDelegateLoadsALocalFileWithoutLooping() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        auto* host = item("projectFilesDock");
        QTRY_VERIFY(host->property("editor").value<QObject*>());
        QQuickItem* panel = nullptr;
        for (auto* child : host->childItems()) {
            if (child->property("previewDelegate").isValid()) { panel = child; }
        }
        QVERIFY(panel);
        auto* delegate = qobject_cast<QQmlComponent*>(panel->property("previewDelegate").value<QObject*>());
        QVERIFY(delegate);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const int rate = 8000, samples = rate;
        QByteArray wav("RIFF");
        const auto u32 = [&wav](quint32 v) { char b[4]; qToLittleEndian(v, b); wav.append(b, 4); };
        const auto u16 = [&wav](quint16 v) { char b[2]; qToLittleEndian(v, b); wav.append(b, 2); };
        u32(36 + samples * 2); wav.append("WAVEfmt "); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16);
        wav.append("data"); u32(samples * 2); wav.append(QByteArray(samples * 2, '\0'));
        QFile file(dir.filePath("01a-Caf\xC3\xA9-(LTX-2.3).wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(wav);
        file.close();
        std::unique_ptr<QObject> instance(delegate->create(delegate->creationContext()));
        QVERIFY2(instance, qPrintable(delegate->errorString()));
        auto* review = instance->findChild<CandidatePreview*>("files-preview-review");
        QVERIFY(review);
        QTRY_VERIFY(review->timeline());
        QSignalSpy timelineChanges(review, &CandidatePreview::timelineChanged);
        instance->setProperty("source", QUrl::fromLocalFile(file.fileName()));
        instance->setProperty("kind", QStringLiteral("audio"));
        QTRY_VERIFY2_WITH_TIMEOUT(review->ready() && !review->busy(), qPrintable(review->error()), 10000);
        QVERIFY(review->error().isEmpty());
        QVERIFY(review->previewClock()->durationMs() > 900);
        QCOMPARE(timelineChanges.count(), 0);
        review->close();
    }
    void localProjectTimelineShowsOnlyItsProjectFolder() {
        QTemporaryDir parentDir;
        QVERIFY(parentDir.isValid());
        QDir root(parentDir.path());
        QVERIFY(root.mkpath("myproj/.nodetool"));
        QVERIFY(root.mkpath("myproj/Timelines"));
        QVERIFY(root.mkpath("myproj/nested/.nodetool"));
        const auto writeFile = [&](const QString& rel, const QByteArray& bytes) {
            QFile f(root.filePath(rel));
            QVERIFY(f.open(QIODevice::WriteOnly));
            QCOMPARE(f.write(bytes), bytes.size());
        };
        writeFile("sibling.txt", "outside");
        writeFile("myproj/.nodetool/project.json",
                  R"({"format":"nodetool.project","version":1,"id":"local-p1","name":"Short Film"})");
        writeFile("myproj/notes.md", "# shot notes\n");
        writeFile("myproj/nested/.nodetool/project.json",
                  R"({"format":"nodetool.project","version":1,"id":"nested-p2","name":"Other"})");
        writeFile("myproj/nested/other.txt", "nested");
        writeFile("myproj/Timelines/edit.timeline.json",
                  R"({"format":"nodetool.timeline","version":1,"id":"t-local","fps":30,"width":640,"height":360,"document":{"tracks":[],"clips":[]}})");

        auto* model = view->rootObject()->property("timeline").value<TimelineModel*>();
        QVERIFY(model);
        const auto loaded = nt::loadTimelineFile(root.filePath("myproj/Timelines/edit.timeline.json"));
        QVERIFY2(loaded.timeline.has_value(), qPrintable(loaded.error));
        model->setTimeline(*loaded.timeline);

        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        auto* filesDock = item("projectFilesDock");
        auto* source = filesDock->findChild<TimelineProjectFiles*>();
        QVERIFY(source);
        auto* folder = view->rootObject()->property("projectFolder").value<ProjectFolderState*>();
        QVERIFY(folder);
        QTRY_VERIFY(folder->isLocalFolder());
        QCOMPARE(folder->projectName(), QString("Short Film"));

        // DocumentBar shows the local project badge.
        auto* badge = item("documentProjectButton");
        QVERIFY(badge);
        QTRY_VERIFY(badge->isVisible());
        QCOMPARE(badge->property("text").toString(), QString("Short Film"));
        QCOMPARE(badge->property("trailingIconName").toString(), QString());

        // FilesPanel header and notice match the local project, and only its folder entries appear.
        QTRY_COMPARE(named(filesDock, "files-header")->property("text").toString(), QString("Files · Short Film"));
        QVERIFY(named(filesDock, "files-header-reveal")->isVisible());
        QTRY_VERIFY(named(filesDock, "projectFolderPath") && named(filesDock, "projectFolderPath")->isVisible());
        QCOMPARE(named(filesDock, "projectFolderPath")->property("text").toString(),
                 QFileInfo(root.filePath("myproj")).canonicalFilePath());
        QVERIFY(!named(filesDock, "projectFolderReveal")->isVisible());
        QTRY_COMPARE(source->model().rowCount(), 2);
        QStringList listed;
        for (int i = 0; i < source->model().rowCount(); ++i) {
            listed.append(source->model().index(i).data(nodetool::files::ProjectFiles::NameRole).toString());
        }
        QCOMPARE(listed, (QStringList{"Timelines", "notes.md"}));
    }
    void inaccessibleFolderShowsNoticeWithoutListingWorkspace() {
        TestHttpServer server;
        server.setJson([](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/projects.list") {
                const QJsonObject project{
                    {"id", "p1"}, {"name", "Remote Cut"}, {"kind", "general"}, {"isPersonal", false},
                    {"folder", QJsonObject{{"workspace_id", "ws-p1"}, {"path", "/definitely-missing/folder"},
                                           {"origin", "created"}, {"is_accessible", false}, {"on_delete", "trash"}}}};
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonArray{project}}}}})
                    .toJson(QJsonDocument::Compact);
            }
            if (path == "/trpc/projects.documents") {
                return QByteArray(R"({"result":{"data":[]}})");
            }
            return QByteArray(R"({"result":{"data":[]}})");
        });

        auto* model = view->rootObject()->property("timeline").value<TimelineModel*>();
        QVERIFY(model);
        auto parsed = nt::parseTimeline(QJsonObject{{"id", "seq"}, {"projectId", "p1"}, {"name", "Cut"},
            {"fps", 30}, {"width", 640}, {"height", 360}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}});
        QVERIFY(parsed.timeline.has_value());
        model->setTimeline(*parsed.timeline);

        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        auto* filesDock = item("projectFilesDock");
        auto* source = filesDock->findChild<TimelineProjectFiles*>();
        QVERIFY(source);
        auto* folder = view->rootObject()->property("projectFolder").value<ProjectFolderState*>();
        QVERIFY(folder);
        folder->setTarget({server.base(), {}, "seq", {}, {}});
        folder->refresh();
        // While ProjectFolderState is resolving projects.list, Files shows a spinner instead of "No project folder".
        QVERIFY(source->model().folderResolving());
        QVERIFY(source->model().loading());
        QVERIFY(named(filesDock, "files-loading")->isVisible());
        QVERIFY(!named(filesDock, "files-no-folder")->isVisible());
        QTRY_VERIFY(folder->loaded());

        QTRY_COMPARE(named(filesDock, "files-header")->property("text").toString(), QString("Files · Remote Cut"));
        QTRY_VERIFY(named(filesDock, "projectFolderNotFound") && named(filesDock, "projectFolderNotFound")->isVisible());
        QVERIFY(!named(filesDock, "files-no-folder")->isVisible());
        QVERIFY(!named(filesDock, "files-error")->isVisible());
        QTRY_VERIFY(!source->model().hasFolder());
        QCOMPARE(server.countRequests("GET", "/trpc/workspace.listFiles"), 0);
    }
    void clickingServerTimelineFileOpensItInPlace() {
        QTemporaryDir tempDir;
        QVERIFY(tempDir.isValid());
        const auto savedPrefs = qgetenv("NODETOOL_TIMELINE_PREFERENCES");
        const auto hadPrefs = qEnvironmentVariableIsSet("NODETOOL_TIMELINE_PREFERENCES");
        qputenv("NODETOOL_TIMELINE_PREFERENCES", tempDir.filePath("prefs.ini").toUtf8());
        const auto restoreEnv = qScopeGuard([savedPrefs, hadPrefs] {
            nt::server::clearActiveServerTarget();
            if (hadPrefs) { qputenv("NODETOOL_TIMELINE_PREFERENCES", savedPrefs); }
            else { qunsetenv("NODETOOL_TIMELINE_PREFERENCES"); }
        });

        QMutex mutex;
        QString lookupPath;
        QString flushedId;
        int flushedWidth = 0;

        TestHttpServer server;
        server.setJson([&](const QByteArray& path, const QUrl& url) -> QByteArray {
            const auto rawInput = QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8();
            const auto input = QJsonDocument::fromJson(rawInput).object();
            if (path == "/trpc/projects.list") {
                const QJsonObject project{
                    {"id", "p1"}, {"name", "Alpha"}, {"kind", "general"}, {"isPersonal", false},
                    {"folder", QJsonObject{{"workspace_id", "ws-p1"}, {"path", tempDir.path()},
                                           {"origin", "created"}, {"is_accessible", true}, {"on_delete", "trash"}}}};
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonArray{project}}}}})
                    .toJson(QJsonDocument::Compact);
            }
            if (path == "/trpc/projects.documents") {
                return R"({"result":{"data":[]}})";
            }
            if (path == "/trpc/workspace.listFiles") {
                const QJsonArray entries{
                    QJsonObject{{"name", "Second.timeline.json"}, {"path", "Second.timeline.json"}, {"is_dir", false}, {"size", 120}},
                    QJsonObject{{"name", "Stray.timeline.json"}, {"path", "Stray.timeline.json"}, {"is_dir", false}, {"size", 80}},
                };
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", entries}}}}).toJson(QJsonDocument::Compact);
            }
            if (path == "/trpc/projects.documentByFile") {
                const auto filePath = input.value("path").toString();
                {
                    QMutexLocker lock(&mutex);
                    lookupPath = filePath;
                }
                if (filePath == "Second.timeline.json") {
                    return R"({"result":{"data":{"type":"timeline","ref":"t2","name":"Second Cut","updatedAt":"2026-01-02T00:00:00.000Z","file":{"path":"Second.timeline.json","state":"ok","error":null}}}})";
                }
                return R"({"result":{"data":null}})";
            }
            if (path == "/trpc/timeline.get") {
                const auto id = input.value("id").toString();
                if (id == "t2") {
                    return R"({"result":{"data":{"id":"t2","name":"Second Cut","projectId":"p1","width":1920,"height":1080,"fps":24,"durationMs":4000,"updatedAt":"2026-01-02T00:00:00.000Z","tracks":[],"clips":[],"markers":[]}}})";
                }
                return R"({"result":{"data":{"id":"t1","name":"First Cut","projectId":"p1","width":640,"height":360,"fps":30,"durationMs":6000,"updatedAt":"2026-01-01T00:00:00.000Z","tracks":[],"clips":[],"markers":[]}}})";
            }
            return R"({"result":{"data":{}}})";
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) -> QByteArray {
            if (path == "/trpc/timeline.update") {
                const auto obj = QJsonDocument::fromJson(body).object();
                QMutexLocker lock(&mutex);
                flushedId = obj.value("id").toString();
                flushedWidth = obj.value("width").toInt();
                return R"({"result":{"data":{"updatedAt":"2026-01-01T00:01:00.000Z"}}})";
            }
            return R"({"result":{"data":{}}})";
        });

        const nt::server::AssetCacheRoot cacheRoot(tempDir.filePath("cache"));
        nt::server::setActiveServerTarget(server.base(), QStringLiteral("t1"), {}, cacheRoot.path());

        auto* model = view->rootObject()->property("timeline").value<TimelineModel*>();
        auto* clock = view->rootObject()->property("clock").value<PlaybackClock*>();
        QVERIFY(model && clock);
        auto parsed = nt::parseTimelineJson(
            R"({"id":"t1","name":"First Cut","projectId":"p1","width":640,"height":360,"fps":30,"durationMs":6000,"updatedAt":"2026-01-01T00:00:00.000Z","tracks":[],"clips":[],"markers":[]})");
        QVERIFY(parsed.timeline);
        model->setTimeline(std::move(*parsed.timeline));

        nt::server::TimelineSession session(*model, *clock, cacheRoot);
        session.attachInitialServer(QStringLiteral("2026-01-01T00:00:00.000Z"));
        QVERIFY(session.autosaveController());
        session.autosaveController()->setExternalSync(false);
        session.autosaveController()->setAutosave(false);

        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        auto* filesDock = item("projectFilesDock");
        auto* source = filesDock->findChild<TimelineProjectFiles*>();
        QVERIFY(source);
        source->setSession(&session);

        auto* folder = view->rootObject()->property("projectFolder").value<ProjectFolderState*>();
        QVERIFY(folder);
        folder->setTarget({server.base(), {}, "t1", cacheRoot.path(), {}});
        folder->refresh();
        QTRY_VERIFY(folder->loaded());
        QTRY_COMPARE(source->model().rowCount(), 2);

        QVERIFY(model->applyEdit("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 24}}));
        QVERIFY(session.autosaveController()->dirty());

        auto* list = named(filesDock, "files-list");
        QVERIFY(list);
        const auto rowFor = [&](const QString& path) -> QQuickItem* {
            auto* content = qobject_cast<QQuickItem*>(list->property("contentItem").value<QObject*>());
            if (!content) { return nullptr; }
            for (auto* child : content->childItems()) {
                if (child->objectName() == u"files-row" && child->property("path").toString() == path) { return child; }
            }
            return nullptr;
        };
        QTRY_VERIFY(rowFor("Second.timeline.json"));
        clickItem(rowFor("Second.timeline.json"));

        QTRY_COMPARE(model->timelineId(), QStringLiteral("t2"));
        QTRY_VERIFY(!session.switching());
        QCOMPARE(model->name(), QStringLiteral("Second Cut"));
        QCOMPARE(model->canvasWidth(), 1920);
        {
            QMutexLocker lock(&mutex);
            QCOMPARE(lookupPath, QStringLiteral("Second.timeline.json"));
            QCOMPARE(flushedId, QStringLiteral("t1"));
            QCOMPARE(flushedWidth, 1280);
        }
        auto* errorBanner = named(filesDock, "files-open-error");
        QVERIFY(errorBanner);
        QVERIFY(!errorBanner->isVisible());

        // Clicking an unlinked timeline file keeps the current timeline open and shows an error banner.
        QTRY_VERIFY(rowFor("Stray.timeline.json"));
        clickItem(rowFor("Stray.timeline.json"));
        QTRY_VERIFY(errorBanner->isVisible());
        QCOMPARE(model->timelineId(), QStringLiteral("t2"));
        QVERIFY(source->openError().contains(QStringLiteral("not linked")));
    }
    void clickingLocalTimelineFileOpensItInPlace() {
        QTemporaryDir parentDir;
        QVERIFY(parentDir.isValid());
        QDir root(parentDir.path());
        QVERIFY(root.mkpath("myproj/.nodetool"));
        QVERIFY(root.mkpath("myproj/Timelines"));
        const auto writeFile = [&](const QString& rel, const QByteArray& bytes) {
            QFile f(root.filePath(rel));
            QVERIFY(f.open(QIODevice::WriteOnly));
            QCOMPARE(f.write(bytes), bytes.size());
        };
        writeFile("myproj/.nodetool/project.json",
                  R"({"format":"nodetool.project","version":1,"id":"local-p1","name":"Short Film"})");
        writeFile("myproj/Timelines/first.timeline.json",
                  R"({"format":"nodetool.timeline","version":1,"id":"t-first","fps":30,"width":640,"height":360,"document":{"tracks":[],"clips":[]}})");
        writeFile("myproj/Timelines/second.timeline.json",
                  R"({"format":"nodetool.timeline","version":1,"id":"t-second","fps":24,"width":1920,"height":1080,"document":{"tracks":[],"clips":[]}})");
        writeFile("myproj/Timelines/broken.timeline.json", "{not json");

        auto* model = view->rootObject()->property("timeline").value<TimelineModel*>();
        auto* clock = view->rootObject()->property("clock").value<PlaybackClock*>();
        QVERIFY(model && clock);
        const auto loaded = nt::loadTimelineFile(root.filePath("myproj/Timelines/first.timeline.json"));
        QVERIFY2(loaded.timeline.has_value(), qPrintable(loaded.error));
        model->setTimeline(*loaded.timeline);

        nt::server::TimelineSession session(*model, *clock, m_testCache.root());

        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        auto* filesDock = item("projectFilesDock");
        auto* source = filesDock->findChild<TimelineProjectFiles*>();
        QVERIFY(source);
        source->setSession(&session);

        auto* folder = view->rootObject()->property("projectFolder").value<ProjectFolderState*>();
        QVERIFY(folder);
        QTRY_VERIFY(folder->isLocalFolder());
        QTRY_COMPARE(source->model().rowCount(), 1);

        auto* list = named(filesDock, "files-list");
        QVERIFY(list);
        const auto rowFor = [&](const QString& path) -> QQuickItem* {
            auto* content = qobject_cast<QQuickItem*>(list->property("contentItem").value<QObject*>());
            if (!content) { return nullptr; }
            for (auto* child : content->childItems()) {
                if (child->objectName() == u"files-row" && child->property("path").toString() == path) { return child; }
            }
            return nullptr;
        };
        QTRY_VERIFY(rowFor("Timelines"));
        clickItem(rowFor("Timelines"));
        QTRY_VERIFY(rowFor("Timelines/second.timeline.json"));
        clickItem(rowFor("Timelines/second.timeline.json"));

        QTRY_COMPARE(model->timelineId(), QStringLiteral("t-second"));
        QCOMPARE(model->canvasWidth(), 1920);
        QCOMPARE(model->fps(), 24.0);
        QVERIFY(model->sourcePath().endsWith(QStringLiteral("/Timelines/second.timeline.json")));
        auto* errorBanner = named(filesDock, "files-open-error");
        QVERIFY(errorBanner);
        QVERIFY(!errorBanner->isVisible());

        // Clicking a malformed timeline file keeps t-second open and displays the error.
        QTRY_VERIFY(rowFor("Timelines/broken.timeline.json"));
        clickItem(rowFor("Timelines/broken.timeline.json"));
        QTRY_VERIFY(errorBanner->isVisible());
        QCOMPARE(model->timelineId(), QStringLiteral("t-second"));
    }
};
QTEST_MAIN(TestProjectFiles)
#include "tst_projectfiles.moc"
