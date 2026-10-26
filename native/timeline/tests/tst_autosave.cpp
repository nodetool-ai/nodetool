// Saving a server timeline (M5b) against an in-process tRPC server: the
// request, dirty from the undo stack's clean index, the conflict path, the
// strip warning, the base rule, and the 750 ms autosave debounce.

#include "server/AutosaveController.h"
#include "server/AssetCache.h"
#include "server/sync/DocumentApplier.h"
#include "TestHttpServer.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPointer>
#include <QProcess>
#include <QProcessEnvironment>
#include <QWebSocketServer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QThread>
#include <QUndoStack>
#include <QtTest>

#include <atomic>
#include <cstdio>
#include <future>
#include <memory>

using namespace nt::server;

namespace {

class Bump : public QUndoCommand {
public:
    explicit Bump(int* value) : m_value(value) {}
    void redo() override { ++*m_value; }
    void undo() override { --*m_value; }

private:
    int* m_value;
};

// A command that merges into the previous one of its kind (a held key):
// the content changes, the undo index does not.
class Nudge : public QUndoCommand {
public:
    explicit Nudge(int* value) : m_value(value) {}
    void redo() override { *m_value += 10; m_applied += 10; }
    void undo() override { *m_value -= m_applied; m_applied = 0; }
    int id() const override { return 7; }
    bool mergeWith(const QUndoCommand* other) override {
        if (other->id() != id()) return false;
        m_applied += static_cast<const Nudge*>(other)->m_applied;
        return true;
    }

private:
    int* m_value;
    int m_applied = 0;
};

QByteArray failure(int status, const QString& code) {
    return QJsonDocument(QJsonObject{{QStringLiteral("error"),
                                      QJsonObject{{QStringLiteral("message"), QStringLiteral("boom")},
                                                  {QStringLiteral("data"), QJsonObject{{QStringLiteral("code"), code},
                                                                                       {QStringLiteral("httpStatus"), status}}}}}})
        .toJson(QJsonDocument::Compact);
}

QByteArray ok(const QString& updatedAt, const QJsonArray& stripped = {}) {
    QJsonObject data{{QStringLiteral("id"), QStringLiteral("seq")}, {QStringLiteral("updatedAt"), updatedAt}};
    if (!stripped.isEmpty()) data.insert(QStringLiteral("stripped"), stripped);
    return QJsonDocument(QJsonObject{{QStringLiteral("result"), QJsonObject{{QStringLiteral("data"), data}}}})
        .toJson(QJsonDocument::Compact);
}

QByteArray conflict() {
    return QJsonDocument(QJsonObject{{QStringLiteral("error"),
                                      QJsonObject{{QStringLiteral("message"), QStringLiteral("Timeline has been modified since last load")},
                                                  {QStringLiteral("data"), QJsonObject{{QStringLiteral("code"), QStringLiteral("CONFLICT")},
                                                                                       {QStringLiteral("httpStatus"), 409},
                                                                                       {QStringLiteral("apiCode"), QStringLiteral("ALREADY_EXISTS")}}}}}})
        .toJson(QJsonDocument::Compact);
}

// Answers every request with `body`, one byte every `delayMs`: a response
// that never goes quiet long enough for an inactivity timeout.
class TrickleServer : public QObject {
public:
    TrickleServer(QByteArray body, int delayMs) : m_body(std::move(body)), m_delayMs(delayMs) {
        connect(&m_server, &QTcpServer::newConnection, this, [this]() {
            while (QTcpSocket* s = m_server.nextPendingConnection()) {
                connect(s, &QTcpSocket::readyRead, s, [this, s]() {
                    if (s->property("answered").toBool()) return;
                    s->setProperty("answered", true);
                    ++m_requests;
                    s->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " +
                             QByteArray::number(m_body.size()) + "\r\n\r\n");
                    auto* timer = new QTimer(s);
                    auto offset = std::make_shared<int>(0);
                    QPointer<QTcpSocket> guard(s);
                    connect(timer, &QTimer::timeout, s, [this, guard, timer, offset]() {
                        if (!guard || *offset >= m_body.size()) {
                            timer->stop();
                            return;
                        }
                        guard->write(m_body.mid((*offset)++, 1));
                    });
                    timer->start(m_delayMs);
                });
                connect(s, &QTcpSocket::disconnected, s, &QObject::deleteLater);
            }
        });
        m_server.listen(QHostAddress::LocalHost, 0);
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(m_server.serverPort())); }
    int requests() const { return m_requests; }

private:
    QTcpServer m_server;
    QByteArray m_body;
    int m_delayMs;
    int m_requests = 0;
};

// What QML sees at each `stateChanged`.
struct StateSnap {
    bool saving;
    bool dirty;
    bool conflict;
    QString keptCopy;
    QString recoveryError;
    QString lastError;
};

QJsonObject rawDoc(int value) {
    return QJsonObject{{QStringLiteral("id"), QStringLiteral("seq")},
                       {QStringLiteral("projectId"), QStringLiteral("p")},
                       {QStringLiteral("name"), QStringLiteral("n")},
                       {QStringLiteral("fps"), 30},
                       {QStringLiteral("width"), 1920},
                       {QStringLiteral("height"), 1080},
                       {QStringLiteral("durationMs"), 1000},
                       {QStringLiteral("createdAt"), QStringLiteral("c")},
                       {QStringLiteral("updatedAt"), QStringLiteral("u0")},
                       {QStringLiteral("tracks"), QJsonArray{}},
                       {QStringLiteral("clips"), QJsonArray{QJsonObject{{QStringLiteral("id"), QStringLiteral("a")},
                                                                        {QStringLiteral("startMs"), value}}}},
                       {QStringLiteral("markers"), QJsonArray{}},
                       {QStringLiteral("tempo"), QJsonObject{{QStringLiteral("bpm"), 120}}}};
}

QJsonObject syncDoc(int a, int b, const QString& revision) {
    return {{"id", "seq"}, {"name", "Sync"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
        {"updatedAt", revision}, {"tracks", QJsonArray{QJsonObject{{"id", "t"}, {"type", "video"}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "a"}, {"trackId", "t"}, {"mediaType", "shape"}, {"startMs", a}, {"durationMs", 1000}},
                              QJsonObject{{"id", "b"}, {"trackId", "t"}, {"mediaType", "shape"}, {"startMs", b}, {"durationMs", 1000}}}}};
}

}  // namespace

class RestoreTarget : public QObject {
    Q_OBJECT
public:
    QUndoStack* undo = nullptr;
    int* value = nullptr;
    QString editName;
    QJsonObject payload;
    Q_INVOKABLE bool applyEdit(const QString& name, const QJsonObject& input) {
        editName = name;
        payload = input;
        class Restore : public QUndoCommand {
        public:
            Restore(int* value, int next) : m_value(value), m_before(*value), m_after(next) {}
            void redo() override { *m_value = m_after; }
            void undo() override { *m_value = m_before; }
        private:
            int* m_value;
            int m_before;
            int m_after;
        };
        const int next = input.value("document").toObject().value("clips").toArray().at(0).toObject().value("startMs").toInt();
        auto command = std::make_unique<Restore>(value, next);
        undo->push(command.release());
        return true;
    }
};

// A test adapter for the registered edit boundary. The real adapter is
// exercised separately by tst_syncmodel, with TimelineModel and QML.
class SyncEditTarget : public QObject {
    Q_OBJECT
public:
    QUndoStack* undo = nullptr;
    QJsonObject* document = nullptr;
    Q_INVOKABLE bool applyEdit(const QString& name, const QJsonObject& payload) {
        if (name != u"acceptExternalUnit") return false;
        const auto next = sync::applyAcceptedUnit(*document, payload);
        if (next == *document) return false;
        class Write : public QUndoCommand {
        public:
            Write(QJsonObject* target, QJsonObject next) : m_target(target), m_before(*target), m_after(std::move(next)) {}
            void redo() override { *m_target = m_after; }
            void undo() override { *m_target = m_before; }
        private:
            QJsonObject* m_target;
            QJsonObject m_before;
            QJsonObject m_after;
        };
        undo->push(new Write(document, next));
        return true;
    }
};

class TestAutosave : public QObject {
    Q_OBJECT

    QTemporaryDir m_dir{QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX")};
    std::unique_ptr<TestHttpServer> m_http;
    std::unique_ptr<QUndoStack> m_undo;
    int m_value = 0;
    std::unique_ptr<AutosaveController> m_save;

    void make(const QString& base = QStringLiteral("u0"), const QString& folder = {}) {
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), folder.isEmpty() ? m_dir.path() : folder, QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, base);
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
    }
    int posts() const { return m_http->countRequests("POST", "/trpc/timeline.update"); }
    // Records the properties at every notification, so a test can check the
    // last one QML received.
    std::shared_ptr<std::vector<StateSnap>> recordStates() {
        auto snaps = std::make_shared<std::vector<StateSnap>>();
        AutosaveController* a = m_save.get();
        QObject::connect(a, &AutosaveController::stateChanged, a, [a, snaps]() {
            snaps->push_back({a->saving(), a->dirty(), a->conflict(), a->keptCopy(), a->recoveryError(), a->lastError()});
        });
        return snaps;
    }

private slots:
    void init() {
        QVERIFY(m_dir.isValid());
        m_http = std::make_unique<TestHttpServer>();
        m_undo = std::make_unique<QUndoStack>();
        m_value = 0;
    }
    void cleanup() {
        // Most fixtures serve HTTP on this thread. Let them answer before
        // controller destruction blocks. The lifetime test uses a separate
        // server thread and destroys the controller with its fetch in flight.
        const bool idle = QTest::currentTestFailed() || QTest::qWaitFor([] {
            return AutosaveController::liveFetchWorkers() == 0;
        }, 2000);
        m_save.reset();
        sync::setDocumentApplier({});
        m_undo.reset();
        QVERIFY2(idle, "the in-process server did not finish the pending fetch");
    }

    void externalSync_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"echo", "clean", "equal", "older", "dirty", "conflict", "accept", "refresh", "preview", "preview-cancel", "deleted", "deleted-no-copy", "no-applier", "invalid-camera", "canonical-cache"}) {
            QTest::newRow(mode) << QString(mode);
        }
    }

    void externalSync() {
        QFETCH(QString, mode);
        QJsonObject raw = syncDoc(0, 0, "2026-10-26T14:00:00.000Z");
        const auto loaded = raw;
        const QString newer = "2026-10-26T14:00:01.000Z";
        const auto server = syncDoc(500, 0, mode == "equal" ? loaded["updatedAt"].toString()
            : mode == "older" ? "2026-10-26T13:59:59.000Z" : newer);
        int applied = 0;
        sync::setDocumentApplier([&](QUndoStack* undo, const QJsonObject& next, const nt::Timeline&) {
            if (QThread::currentThread() != QCoreApplication::instance()->thread()) return false;
            raw = next;
            undo->clear();
            ++applied;
            return true;
        });
        if (mode == "no-applier") sync::setDocumentApplier({});
        m_http->setJson([&](const QByteArray& path, const QUrl&) {
            if (path != "/trpc/timeline.get") return failure(404, "NOT_FOUND");
            auto fetched = server;
            if (mode == "invalid-camera") fetched["camera2d"] = false;
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", fetched}}}}).toJson();
        });
        m_http->setPost([&](const QByteArray&, const QByteArray&) { return ok("2026-10-26T14:00:02.000Z"); });
        m_save = std::make_unique<AutosaveController>(SaveTarget{m_http->base(), {}, "seq", mode == "canonical-cache" ? m_dir.filePath("cache/server/user/timelines") : mode == "deleted-no-copy" ? QString("/dev/null/sync") : m_dir.filePath(mode), {}},
            m_undo.get(), [&] { return raw; }, loaded["updatedAt"].toString());
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_save->setQuitFallbackDirs({});
        // Use meta calls so these tests run red against the old controller.
        const bool disabled = QMetaObject::invokeMethod(m_save.get(), "setExternalSync", Q_ARG(bool, false));
        QVERIFY(disabled);
        if (mode == "dirty" || mode == "conflict" || mode == "accept" || mode == "invalid-camera") {
            raw = syncDoc(mode == "conflict" || mode == "accept" ? 100 : 0, 200, loaded["updatedAt"].toString());
            m_save->documentChanged();
        }
        if (mode == "preview" || mode == "preview-cancel") raw = syncDoc(0, 200, loaded["updatedAt"].toString());
        const QJsonArray ops{QJsonObject{{"tool", "ui_timeline_move_clip"}, {"input", QJsonObject{{"id", "a"}}}}};
        if (mode == "refresh") {
            QVERIFY(QMetaObject::invokeMethod(m_save.get(), "refreshExternal"));
        } else {
            QVERIFY(QMetaObject::invokeMethod(m_save.get(), "externalChanged", Q_ARG(QString, mode.startsWith("deleted") ? "deleted" : "updated"),
                Q_ARG(QString, mode == "echo" ? loaded["updatedAt"].toString() : newer),
                Q_ARG(QJsonArray, ops), Q_ARG(bool, true)));
        }
        if (mode == "echo" || mode.startsWith("deleted")) {
            QTest::qWait(100);
            QCOMPARE(m_http->countRequests("GET", "/trpc/timeline.get"), 0);
            QCOMPARE(applied, 0);
            if (mode.startsWith("deleted")) {
                QCOMPARE(m_save->property("externalState").toString(), QString("deleted"));
                if (mode == "deleted-no-copy") {
                    QVERIFY(m_save->keptCopy().isEmpty());
                    QVERIFY(!m_save->flushBeforeQuit(100));
                    QVERIFY(m_save->lastError().contains("could not"));
                } else {
                    QVERIFY(QFile::exists(m_save->keptCopy()));
                }
                QVERIFY(!m_save->saveNow().ok);
                QCOMPARE(posts(), 0);
            }
        } else if (mode == "preview" || mode == "preview-cancel") {
            QTest::qWait(100);
            QCOMPARE(applied, 0);
            if (mode == "preview-cancel") raw = loaded;
            else m_save->documentChanged();
            QTRY_COMPARE(applied, 1);
            QCOMPARE(raw["clips"], syncDoc(500, mode == "preview-cancel" ? 0 : 200, newer)["clips"]);
        } else if (mode == "equal" || mode == "older") {
            QTRY_COMPARE(m_http->countRequests("GET", "/trpc/timeline.get"), 1);
            QTRY_COMPARE(m_save->property("externalState").toString(), QString("idle"));
            QCOMPARE(applied, 0);
            QCOMPARE(raw, loaded);
        } else if (mode == "no-applier" || mode == "invalid-camera") {
            QTRY_VERIFY(!m_save->lastError().isEmpty());
            QCOMPARE(applied, 0);
            QCOMPARE(m_save->baseUpdatedAt(), loaded["updatedAt"].toString());
            QVERIFY(QFile::exists(m_save->keptCopy()));
        } else {
            QTRY_COMPARE(applied, 1);
            QCOMPARE(m_save->baseUpdatedAt(), newer);
            QCOMPARE(m_http->countRequests("GET", "/trpc/timeline.get"), 1);
            if (mode == "dirty") {
                QCOMPARE(raw["clips"], syncDoc(500, 200, newer)["clips"]);
                QVERIFY(m_save->dirty());
                QVERIFY(m_save->saveNow().ok);
                const auto sent = QJsonDocument::fromJson(m_http->requests().back().body).object();
                QCOMPARE(sent["baseUpdatedAt"].toString(), newer);
                QCOMPARE(sent["document"].toObject()["clips"], raw["clips"]);
                QVERIFY(!sent["document"].toObject().contains("setup"));
            } else if (mode == "conflict" || mode == "accept") {
                QCOMPARE(m_save->property("externalConflicts").toList().size(), 1);
                const auto unit = m_save->property("externalConflicts").toList().first().toMap();
                QCOMPARE(unit["id"].toString(), QString("a"));
                QCOMPARE(unit["kind"].toString(), QString("clip"));
                if (mode == "accept") {
                    SyncEditTarget edit;
                    edit.undo = m_undo.get();
                    edit.document = &raw;
                    QVERIFY(m_save->acceptExternalConflict("a", &edit));
                    QCOMPARE(raw["clips"], syncDoc(500, 200, newer)["clips"]);
                    QCOMPARE(m_undo->count(), 1);
                    m_undo->undo();
                    QCOMPARE(raw["clips"], syncDoc(100, 200, newer)["clips"]);
                } else {
                    QVERIFY(QMetaObject::invokeMethod(m_save.get(), "discardExternalConflicts"));
                    QCOMPARE(raw["clips"], syncDoc(100, 200, newer)["clips"]);
                }
                QCOMPARE(m_save->property("externalConflicts").toList().size(), 0);
            } else {
                QCOMPARE(raw, server);
                QVERIFY(!m_save->dirty());
                QCOMPARE(posts(), 0);
                if (mode == "canonical-cache") {
                    ServerClient client(m_http->base());
                    QVERIFY(QFile::exists(m_dir.filePath("cache/" + safePathPart(client.serverKey()) + "/" +
                        safePathPart(client.userKey()) + "/timelines/seq.json")));
                }
            }
        }
        m_save.reset();
        sync::setDocumentApplier({});
    }

    void failedRecoveryStartsANewChain_data() {
        QTest::addColumn<QString>("trigger");
        for (const auto* trigger : {"retry", "edit", "notice", "refresh"}) {
            QTest::newRow(trigger) << QString(trigger);
        }
    }
    void failedRecoveryStartsANewChain() {
        QFETCH(QString, trigger);
        auto raw = sync::applyMergeDocument(syncDoc(0, 0, "u0"), sync::mergeDocumentOf(syncDoc(0, 0, "u0")));
        sync::setDocumentApplier([&](QUndoStack* undo, const QJsonObject& next, const nt::Timeline&) {
            raw = next;
            undo->clear();
            return true;
        });
        int gets = 0;
        QElapsedTimer clock;
        clock.start();
        QList<qint64> attempts;
        m_http->setJson([&](const QByteArray&, const QUrl&) {
            // All recovery fetch failures retry, including a rejected request.
            attempts.append(clock.elapsed());
            if (++gets <= (trigger == "retry" ? 3 : 1)) return failure(400, "BAD_REQUEST");
            const auto server = syncDoc(500, 0, "u1");
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", server}}}}).toJson();
        });
        int writes = 0;
        m_http->setPost([&](const QByteArray&, const QByteArray& body) {
            ++writes;
            return QJsonDocument::fromJson(body).object()["baseUpdatedAt"] == "u0" ? conflict() : ok("u2");
        });
        m_save = std::make_unique<AutosaveController>(SaveTarget{m_http->base(), {}, "seq", m_dir.path(), {}},
            m_undo.get(), [&] { return raw; }, "u0");
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_save->setDebounceMs(10);
        m_save->setRetryBaseMs(trigger == "retry" ? 100 : 10000);
        auto clips = raw["clips"].toArray();
        auto clip = clips[1].toObject();
        clip["startMs"] = 200;
        clips[1] = clip;
        raw["clips"] = clips;
        m_save->documentChanged();
        QVERIFY(m_save->saveNow().conflict);
        QTRY_VERIFY(m_save->conflict());
        QVERIFY(QFile::exists(m_save->keptCopy()));
        m_save->setAutosave(true);
        if (trigger == "edit") {
            clip["startMs"] = 300;
            clips[1] = clip;
            raw["clips"] = clips;
            m_save->documentChanged();
        } else if (trigger == "notice") {
            m_save->externalChanged("updated", "u1", QJsonArray{QJsonObject{{"tool", "ui_timeline_move_clip"},
                {"input", QJsonObject{{"id", "a"}}}}}, true);
        } else if (trigger == "refresh") {
            m_save->refreshExternal();
        }
        QTRY_VERIFY_WITH_TIMEOUT(!m_save->dirty(), 2000);
        QVERIFY(!m_save->conflict());
        QVERIFY(m_save->lastError().isEmpty());
        QCOMPARE(writes, trigger == "edit" ? 3 : 2);
        QCOMPARE(gets, trigger == "retry" ? 4 : 2);
        if (trigger == "retry") {
            QVERIFY(attempts[1] - attempts[0] >= 90);
            QVERIFY(attempts[2] - attempts[1] >= 180);
            QVERIFY(attempts[3] - attempts[2] >= 360);
        }
        const auto saved = QJsonDocument::fromJson(m_http->requests().back().body).object()["document"].toObject();
        QCOMPARE(saved["clips"].toArray()[0].toObject()["startMs"].toInt(), 500);
        QCOMPARE(saved["clips"].toArray()[1].toObject()["startMs"].toInt(), trigger == "edit" ? 300 : 200);
        QVERIFY(!QFile::exists(m_dir.filePath("seq.local.json")));
    }

    void stoppedChainCounterResets_data() {
        QTest::addColumn<QString>("trigger");
        QTest::addColumn<bool>("limit");
        for (const auto* trigger : {"edit", "notice", "refresh"}) {
            QTest::newRow(qPrintable(QString(trigger) + "-limit")) << QString(trigger) << true;
            QTest::newRow(qPrintable(QString(trigger) + "-no-advance")) << QString(trigger) << false;
        }
    }
    void stoppedChainCounterResets() {
        QFETCH(QString, trigger);
        QFETCH(bool, limit);
        auto raw = sync::applyMergeDocument(syncDoc(0, 0, "u0"), sync::mergeDocumentOf(syncDoc(0, 0, "u0")));
        sync::setDocumentApplier([&](QUndoStack* undo, const QJsonObject& next, const nt::Timeline&) {
            raw = next;
            undo->clear();
            return true;
        });
        int gets = 0;
        bool resume = false;
        m_http->setJson([&](const QByteArray&, const QUrl&) {
            ++gets;
            const auto revision = !limit && !resume ? QString("u0") : "u" + QString::number(gets);
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", syncDoc(500, 0, revision)}}}}).toJson();
        });
        m_http->setPost([&](const QByteArray&, const QByteArray& bytes) {
            const auto base = QJsonDocument::fromJson(bytes).object()["baseUpdatedAt"].toString();
            return resume && base == "u" + QString::number(limit ? 6 : 2) ? ok("saved") : conflict();
        });
        m_save = std::make_unique<AutosaveController>(SaveTarget{m_http->base(), {}, "seq", m_dir.path(), {}},
            m_undo.get(), [&] { return raw; }, "u0");
        m_save->setExternalSync(false);
        m_save->setDebounceMs(10);
        auto clips = raw["clips"].toArray();
        auto clip = clips[1].toObject();
        clip["startMs"] = 200;
        clips[1] = clip;
        raw["clips"] = clips;
        m_save->documentChanged();
        QTRY_VERIFY(m_save->conflict());
        QCOMPARE(gets, limit ? 5 : 1);
        resume = true;
        if (trigger == "edit") {
            clips = raw["clips"].toArray();
            clip = clips[1].toObject();
            clip["startMs"] = 300;
            clips[1] = clip;
            raw["clips"] = clips;
            m_save->documentChanged();
        } else if (trigger == "notice") {
            m_save->externalChanged("updated", "new", QJsonArray{QJsonObject{{"tool", "ui_timeline_move_clip"},
                {"input", QJsonObject{{"id", "a"}}}}}, true);
        } else {
            m_save->refreshExternal();
        }
        QTRY_VERIFY_WITH_TIMEOUT(!m_save->dirty(), 2000);
        QCOMPARE(gets, limit ? 6 : 2);
        QVERIFY(!m_save->conflict());
        QVERIFY(m_save->lastError().isEmpty());
    }

    void eachWebSocketConnectIsLogged() {
        if (!qEnvironmentVariableIsSet("NT_SYNC_LOG_CHILD")) {
            QProcess child;
            auto env = QProcessEnvironment::systemEnvironment();
            env.insert("NT_SYNC_LOG_CHILD", "1");
            child.setProcessEnvironment(env);
            child.start(QCoreApplication::applicationFilePath(), {"eachWebSocketConnectIsLogged"});
            QVERIFY(child.waitForFinished(10000));
            QCOMPARE(child.exitCode(), 0);
            const auto log = child.readAllStandardError();
            QCOMPARE(log.count("sync: listening for seq\n"), 2);
            return;
        }
        QWebSocketServer socket("sync-test", QWebSocketServer::NonSecureMode);
        QVERIFY(socket.listen(QHostAddress::LocalHost, 0));
        int connects = 0;
        connect(&socket, &QWebSocketServer::newConnection, this, [&] {
            auto* peer = socket.nextPendingConnection();
            peer->setParent(&socket);
            if (++connects == 1) QTimer::singleShot(20, peer, [peer] { peer->close(); });
        });
        make();
        m_save->setExternalSyncUrl(QUrl(QString("http://127.0.0.1:%1").arg(socket.serverPort())));
        m_save->setExternalSync(true);
        QTRY_COMPARE_WITH_TIMEOUT(connects, 2, 5000);
        QTest::qWait(20);
        QTRY_COMPARE_WITH_TIMEOUT(AutosaveController::liveFetchWorkers(), 0, 2000);
        m_save.reset();
    }

    void destructionWaitsForFetchWorker() {
        int applies = 0;
        sync::setDocumentApplier([&](QUndoStack*, const QJsonObject&, const nt::Timeline&) {
            ++applies;
            return true;
        });
        // Serve on another event loop: the GUI thread must be able to wait
        // without preventing the delayed HTTP response from being sent.
        class SlowServer : public QThread {
        public:
            std::promise<QUrl> address;
            std::atomic<bool> received{false};
            ~SlowServer() override { quit(); wait(); }
            void run() override {
                TestHttpServer http;
                http.setJson([this](const QByteArray&, const QUrl&) {
                    received = true;
                    QThread::msleep(300);
                    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", syncDoc(500, 0, "u1")}}}}).toJson();
                });
                address.set_value(http.base());
                exec();
            }
        } server;
        auto address = server.address.get_future();
        server.start();
        m_save = std::make_unique<AutosaveController>(SaveTarget{address.get(), {}, "seq", m_dir.path(), {}},
            m_undo.get(), [] { return syncDoc(0, 0, "u0"); }, "u0");
        m_save->setExternalSync(false);
        m_save->refreshExternal();
        QTRY_VERIFY_WITH_TIMEOUT(server.received.load(), 1000);
        QCOMPARE(AutosaveController::liveFetchWorkers(), 1);
        QElapsedTimer elapsed;
        elapsed.start();
        m_save.reset();
        const int remaining = AutosaveController::liveFetchWorkers();
        const auto waited = elapsed.elapsed();
        // Finish even on red, before destroying the test's other fixtures.
        QTRY_COMPARE_WITH_TIMEOUT(AutosaveController::liveFetchWorkers(), 0, 2000);
        QCOMPARE(remaining, 0);
        QVERIFY(waited >= 150);
        QTest::qWait(20);
        QCOMPARE(applies, 0);
    }

    void casRecovery_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"success", "stripped", "get-fails", "no-advance", "limit", "quit", "quit-clean", "quit-limited"}) QTest::newRow(mode) << QString(mode);
    }
    void casRecovery() {
        QFETCH(QString, mode);
        auto raw = syncDoc(0, 0, "u0");
        const auto canonical = [](const QJsonObject& value) {
            return sync::applyMergeDocument(value, sync::mergeDocumentOfSequence(value, sync::mergeDocumentOf(value)));
        };
        raw = canonical(raw);
        sync::setDocumentApplier([&](QUndoStack* undo, const QJsonObject& next, const nt::Timeline&) {
            raw = next;
            undo->clear();
            return true;
        });
        int gets = 0;
        bool copyDuringRecovery = false;
        const QString folder = m_dir.filePath("cas-" + mode);
        m_http->setJson([&](const QByteArray&, const QUrl&) {
            ++gets;
            copyDuringRecovery = QFile::exists(QDir(folder).filePath("seq.local.json"));
            if (mode == "get-fails") return failure(503, "INTERNAL_SERVER_ERROR");
            const auto server = canonical(syncDoc(mode == "quit-clean" ? 0 : 500, mode == "quit-clean" ? 200 : 0, mode == "no-advance" ? "u0" : "u" + QString::number(gets)));
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", server}}}}).toJson();
        });
        int writes = 0;
        m_http->setPost([&](const QByteArray&, const QByteArray&) {
            return ++writes == 1 || mode == "limit" || mode == "quit-limited" ? conflict() : ok("saved", mode == "stripped" ? QJsonArray{"unsupported"} : QJsonArray{});
        });
        m_save = std::make_unique<AutosaveController>(SaveTarget{m_http->base(), {}, "seq", folder, {}}, m_undo.get(), [&] { return raw; }, "u0");
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        QVERIFY(QMetaObject::invokeMethod(m_save.get(), "setExternalSync", Q_ARG(bool, false)));
        m_save->setQuitFallbackDirs({});
        m_save->setDebounceMs(10);
        raw = canonical(syncDoc(0, 200, "u0"));
        m_save->documentChanged();
        if (mode.startsWith("quit")) {
            QCOMPARE(m_save->flushBeforeQuit(2000), mode != "quit-limited");
        } else {
            m_save->saveNow();
            if (mode == "success" || mode == "stripped" || mode == "limit") {
                QTRY_VERIFY(m_save->baseUpdatedAt() != "u0");
                m_save->setAutosave(true);
            }
        }
        if (mode == "success" || mode == "stripped" || mode == "quit" || mode == "quit-clean") {
            QTRY_VERIFY(!m_save->dirty());
            QCOMPARE(writes, mode == "quit-clean" ? 1 : 2);
            QVERIFY(!m_save->conflict());
            QVERIFY(copyDuringRecovery);
            QVERIFY(!QFile::exists(QDir(folder).filePath("seq.local.json")));
            if (mode != "quit-clean") {
                const auto sent = QJsonDocument::fromJson(m_http->requests().back().body).object();
                QCOMPARE(sent["baseUpdatedAt"].toString(), QString("u1"));
                QCOMPARE(sent["document"].toObject()["clips"], syncDoc(500, 200, "u1")["clips"]);
            }
        } else {
            QTRY_VERIFY(m_save->conflict());
            QVERIFY(copyDuringRecovery);
            QVERIFY(QFile::exists(m_save->keptCopy()));
            QCOMPARE(gets, mode == "limit" ? 5 : 1);
            const int previous = writes;
            m_save->saveNow();
            QCOMPARE(writes, previous);
        }
        m_save.reset();
        sync::setDocumentApplier({});
    }

    void queuedNotices_data() {
        QTest::addColumn<QString>("mode");
        for (const auto* mode : {"save", "fetch", "missing-ops", "clean-during-fetch", "preview-during-fetch"})
            QTest::newRow(mode) << QString(mode);
    }
    void queuedNotices() {
        QFETCH(QString, mode);
        auto raw = syncDoc(0, 0, "u0");
        auto server = syncDoc(500, 0, "u1");
        int applies = 0;
        sync::setDocumentApplier([&](QUndoStack* undo, const QJsonObject& next, const nt::Timeline&) {
            raw = next;
            undo->clear();
            ++applies;
            return true;
        });
        SaveTarget target{m_http->base(), "sync-token", "seq", m_dir.filePath("queued-" + mode), {}};
        m_save = std::make_unique<AutosaveController>(target, m_undo.get(), [&] { return raw; }, "u0");
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_save->setQuitFallbackDirs({});
        const QJsonArray ops{QJsonObject{{"tool", "ui_timeline_move_clip"}, {"input", QJsonObject{{"id", "a"}}}}};
        m_http->setJson([&](const QByteArray&, const QUrl&) {
            if (m_http->countRequests("GET", "/trpc/timeline.get") == 1) {
                if (mode == "fetch" || mode == "missing-ops") {
                    m_save->externalChanged("updated", "u1", ops, mode != "missing-ops");
                } else if (mode == "clean-during-fetch") {
                    raw = syncDoc(0, 0, "u0");
                    m_save->documentChanged();
                } else if (mode == "preview-during-fetch") {
                    raw = syncDoc(0, 200, "u0");
                    QTimer::singleShot(100, m_save.get(), [&] { m_save->documentChanged(); });
                }
            }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", server}}}}).toJson();
        });
        if (mode != "preview-during-fetch") {
            raw = syncDoc(100, 200, "u0");
            m_save->documentChanged();
        }
        if (mode == "save") {
            m_http->setPost([&](const QByteArray&, const QByteArray&) {
                m_save->externalChanged("updated", "u1", ops, true);
                return ok("saved-base");
            });
            QVERIFY(m_save->saveNow().ok);
        } else {
            m_save->externalChanged("updated", "u1", ops, true);
        }
        QTRY_COMPARE(m_save->baseUpdatedAt(), QString("u1"));
        if (mode == "fetch" || mode == "missing-ops") {
            QTRY_COMPARE(m_http->countRequests("GET", "/trpc/timeline.get"), 2);
            QTRY_COMPARE(m_save->externalState(), QString("idle"));
            QCOMPARE(m_save->externalConflicts().size(), 1);
            QCOMPARE(m_save->externalConflicts()[0].toMap()["kind"].toString(), mode == "missing-ops" ? QString("document") : QString("clip"));
            QCOMPARE(raw["clips"], syncDoc(100, 200, "u1")["clips"]);
        } else if (mode == "clean-during-fetch") {
            QCOMPARE(raw, server);
            QVERIFY(!m_save->dirty());
        } else if (mode == "preview-during-fetch") {
            QCOMPARE(raw["clips"], syncDoc(500, 200, "u1")["clips"]);
        } else {
            QCOMPARE(raw["clips"], server["clips"]);
        }
        QCOMPARE(applies, 1);
        for (const auto& request : m_http->requests()) {
            if (request.method == "GET") QCOMPARE(request.headers.value("authorization"), QByteArray("Bearer sync-token"));
            QVERIFY(!request.target.startsWith("/ws"));
        }
        m_save.reset();
        sync::setDocumentApplier({});
    }

    void earlierRecoverySurvivesANewSessionSave() {
        const QString folder = m_dir.filePath("earlier-recovery");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(400, "BAD_REQUEST"); });
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        const QString oldPath = m_save->saveNow().keptCopy;
        QVERIFY(QFileInfo::exists(oldPath));
        m_save.reset();
        make("u0", folder);
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok("u1"); });
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        // Enumerate the files, so this fails on the old deletion before
        // requiring the new earlierCopy property.
        const QStringList copies = QDir(folder).entryList({"seq.recovery*.json"}, QDir::Files);
        QCOMPARE(copies.size(), 1);
        const QString earlier = m_save->property("earlierCopy").toString();
        QVERIFY(!earlier.isEmpty());
        QVERIFY(earlier != oldPath);
        QVERIFY(!QFileInfo::exists(oldPath));
        QFile copy(earlier);
        QVERIFY(copy.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(copy.readAll()).object(), rawDoc(1));
    }

    void secondConflictPreservesTheFirstSessionsCopy() {
        const QString folder = m_dir.filePath("second-conflict");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
        QTRY_VERIFY(m_save->conflict());
        m_save.reset();
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
        const QStringList copies = QDir(folder).entryList({"seq.local*.json"}, QDir::Files);
        QCOMPARE(copies.size(), 2);
        QFile earlier(m_save->property("earlierCopy").toString());
        QVERIFY(earlier.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(earlier.readAll()).object(), rawDoc(1));
        QFile current(m_save->keptCopy());
        QVERIFY(current.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(current.readAll()).object(), rawDoc(2));
    }

    void restoreEarlierCopyIsOneEditAndAutosaves() {
        const QString folder = m_dir.filePath("restore-earlier");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
        QTRY_VERIFY(m_save->conflict());
        m_save.reset();
        m_undo->clear();
        m_value = 0;
        make("u0", folder);
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok("u1"); });
        m_save->setAutosave(true);
        m_save->setDebounceMs(25);
        RestoreTarget model;
        model.undo = m_undo.get();
        model.value = &m_value;
        bool restored = false;
        QVERIFY(QMetaObject::invokeMethod(m_save.get(), "restoreEarlierCopy", Q_RETURN_ARG(bool, restored),
                                         Q_ARG(QObject*, &model)));
        QVERIFY(restored);
        QCOMPARE(model.editName, QString("restoreDocument"));
        QCOMPARE(model.payload.value("document").toObject(), documentForSave(rawDoc(1)));
        QCOMPARE(m_undo->count(), 1);
        QCOMPARE(m_value, 1);
        QTRY_VERIFY_WITH_TIMEOUT(!m_save->dirty(), 2000);
        QCOMPARE(posts(), 2);
        const auto sent = QJsonDocument::fromJson(m_http->requests().back().body).object();
        QCOMPARE(sent.value("document").toObject(), documentForSave(rawDoc(1)));
        QVERIFY(QFileInfo::exists(m_save->property("earlierCopy").toString()));
        m_undo->undo();
        QCOMPARE(m_value, 0);
        QVERIFY(m_save->dirty());
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
    }

    void discardEarlierCopyDeletesOnlyThatCopy() {
        const QString folder = m_dir.filePath("discard-earlier");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
        QTRY_VERIFY(m_save->conflict());
        m_save.reset();
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
        const QString earlier = m_save->property("earlierCopy").toString();
        bool discarded = false;
        QVERIFY(QMetaObject::invokeMethod(m_save.get(), "discardEarlierCopy", Q_RETURN_ARG(bool, discarded)));
        QVERIFY(discarded);
        QVERIFY(!QFileInfo::exists(earlier));
        QCOMPARE(m_save->property("earlierCopy").toString(), QString());
        QVERIFY(QFileInfo::exists(m_save->keptCopy()));
        QCOMPARE(m_undo->count(), 2);
    }

    void fallbackAndArchivedCopiesAreOfferedAcrossLaunches() {
        QTemporaryDir folder;
        QVERIFY(folder.isValid());
        SaveTarget target{m_http->base(), {}, "seq", folder.filePath("backup"), {}};
        ServerClient client(target.server);
        const QString fallback = folder.filePath("fallback");
        const QString namespaceDir = QDir(fallback).filePath(safePathPart(client.serverKey()) + u'/' +
                                                           safePathPart(client.userKey()));
        QVERIFY(QDir().mkpath(namespaceDir));
        const QString fixed = QDir(namespaceDir).filePath("seq.recovery.json");
        QFile copy(fixed);
        QVERIFY(copy.open(QIODevice::WriteOnly));
        copy.write(QJsonDocument(rawDoc(7)).toJson());
        copy.close();
        QString earlier;
        {
            AutosaveController first(target, m_undo.get(), [this] { return rawDoc(m_value); }, "u0");
            first.setExternalSync(false);
            first.setQuitFallbackDirs({fallback});
            earlier = first.property("earlierCopy").toString();
            QVERIFY(!earlier.isEmpty());
            QVERIFY(earlier != fixed);
            QVERIFY(QFileInfo::exists(earlier));
        }
        AutosaveController next(target, m_undo.get(), [this] { return rawDoc(m_value); }, "u0");
        next.setExternalSync(false);
        next.setQuitFallbackDirs({fallback});
        QCOMPARE(next.property("earlierCopy").toString(), earlier);
        QVERIFY(QMetaObject::invokeMethod(&next, "discardEarlierCopy"));
        QVERIFY(!QFileInfo::exists(earlier));
    }

    void multipleEarlierCopiesAreOfferedOneAtATime() {
        QTemporaryDir folder;
        QVERIFY(folder.isValid());
        for (const auto& name : {"seq.recovery.json", "seq.local.json", "seq.local.older.json"}) {
            QFile copy(folder.filePath(name));
            QVERIFY(copy.open(QIODevice::WriteOnly));
            copy.write(QJsonDocument(rawDoc(3)).toJson());
        }
        make("u0", folder.path());
        QSet<QString> offered;
        while (!m_save->property("earlierCopy").toString().isEmpty()) {
            const auto path = m_save->property("earlierCopy").toString();
            QVERIFY(!offered.contains(path));
            offered.insert(path);
            QVERIFY(QMetaObject::invokeMethod(m_save.get(), "discardEarlierCopy"));
            QVERIFY(!QFileInfo::exists(path));
        }
        QCOMPARE(offered.size(), 3);
    }

    void invalidEarlierCopyIsKeptAndReported() {
        QTemporaryDir folder;
        QVERIFY(folder.isValid());
        QFile copy(folder.filePath("seq.recovery.json"));
        QVERIFY(copy.open(QIODevice::WriteOnly));
        copy.write("not json");
        copy.close();
        make("u0", folder.path());
        RestoreTarget model;
        model.undo = m_undo.get();
        model.value = &m_value;
        bool restored = true;
        QVERIFY(QMetaObject::invokeMethod(m_save.get(), "restoreEarlierCopy", Q_RETURN_ARG(bool, restored),
                                         Q_ARG(QObject*, &model)));
        QVERIFY(!restored);
        QVERIFY(!m_save->property("earlierCopyError").toString().isEmpty());
        QVERIFY(QFileInfo::exists(m_save->property("earlierCopy").toString()));
        QCOMPARE(m_undo->count(), 0);
    }

    void laterConflictEditsUpdateTheLocalCopy() {
        const QString folder = m_dir.filePath("later-conflict");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make("u0", folder);
        m_save->setAutosave(true);
        m_save->setDebounceMs(25);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
        const QString path = m_save->keptCopy();
        m_undo->push(new Bump(&m_value));
        QTRY_VERIFY_WITH_TIMEOUT(!m_save->keptCopy().isEmpty(), 2000);
        QFile copy(path);
        QVERIFY(copy.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(copy.readAll()).object(), rawDoc(2));
        QCOMPARE(posts(), 1);
        copy.close();
        m_undo->undo();
        m_undo->undo();
        QTRY_VERIFY_WITH_TIMEOUT(!m_save->keptCopy().isEmpty(), 2000);
        QVERIFY(copy.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(copy.readAll()).object(), rawDoc(0));
        QCOMPARE(posts(), 1);
    }

    void autosaveWaitsForPreviewCancellation_data() {
        QTest::addColumn<bool>("acknowledged");
        QTest::newRow("cancel-to-dirty-commit") << false;
        QTest::newRow("cancel-to-acknowledged-commit") << true;
    }

    void autosaveWaitsForPreviewCancellation() {
        QFETCH(bool, acknowledged);
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok("u1"); });
        make("u0", m_dir.filePath(QString::fromLatin1(QTest::currentDataTag())));
        m_save->setAutosave(true);
        m_save->setDebounceMs(25);
        m_undo->push(new Bump(&m_value));
        if (acknowledged) {
            QVERIFY(m_save->saveNow().ok);
            // A pending debounce can also follow a no-op committed change.
            m_save->documentChanged();
        }
        const int before = posts();
        m_value = 99;  // replaceClips preview, no undo-stack signal
        QTest::qWait(150);
        QCOMPARE(posts(), before);
        m_value = 1;  // Escape returns to the committed document, no signal
        if (acknowledged) {
            QTest::qWait(150);
            QCOMPARE(posts(), before);
            QVERIFY(!m_save->dirty());
        } else {
            QTRY_COMPARE_WITH_TIMEOUT(posts(), before + 1, 2000);
            QTRY_VERIFY_WITH_TIMEOUT(!m_save->dirty(), 2000);
            const auto sent = QJsonDocument::fromJson(m_http->requests().back().body).object();
            QCOMPARE(sent.value("document").toObject(), documentForSave(rawDoc(1)));
        }
    }

    void documentDropsTheSequenceRow() {
        const QJsonObject doc = documentForSave(rawDoc(3));
        for (const char* key : {"id", "projectId", "name", "fps", "width", "height", "durationMs", "createdAt", "updatedAt"}) {
            QVERIFY2(!doc.contains(QLatin1String(key)), key);
        }
        QVERIFY(doc.contains(QStringLiteral("tempo")));
        QCOMPARE(doc.value(u"clips").toArray().at(0).toObject().value(u"startMs").toInt(), 3);
    }

    void saveSendsTheBaseAndCleansTheStack() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        make();
        QVERIFY(!m_save->dirty());
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->dirty());
        const SaveResult r = m_save->saveNow();
        QVERIFY2(r.ok, qPrintable(r.error));
        QVERIFY(!m_save->dirty());
        QVERIFY(m_undo->isClean());
        QCOMPARE(m_save->baseUpdatedAt(), QStringLiteral("u1"));
        const QJsonObject sent = QJsonDocument::fromJson(m_http->requests().back().body).object();
        QCOMPARE(sent.value(u"id").toString(), QStringLiteral("seq"));
        QCOMPARE(sent.value(u"baseUpdatedAt").toString(), QStringLiteral("u0"));
        QCOMPARE(sent.value(u"document").toObject().value(u"clips").toArray().at(0).toObject().value(u"startMs").toInt(), 1);
        QVERIFY(!sent.value(u"document").toObject().contains(QStringLiteral("updatedAt")));
        // The next save uses the new base.
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        QCOMPARE(QJsonDocument::fromJson(m_http->requests().back().body).object().value(u"baseUpdatedAt").toString(),
                 QStringLiteral("u1"));
        // Undo past the clean index is dirty again.
        m_undo->undo();
        QVERIFY(m_save->dirty());
    }

    void anEditDuringTheSaveStaysDirty() {
        m_http->setPost([this](const QByteArray&, const QByteArray&) {
            m_undo->push(new Bump(&m_value));  // the user edits while the request is out
            return ok(QStringLiteral("u1"));
        });
        make();
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        QVERIFY2(m_save->dirty(), "the edit made during the save is not on the server");
    }

    void conflictKeepsTheLocalDocument() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make();
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(!r.ok);
        QVERIFY(r.conflict);
        QTRY_VERIFY(m_save->conflict());
        QVERIFY(m_save->dirty());
        QVERIFY(QFileInfo::exists(r.keptCopy));
        QFile f(r.keptCopy);
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(1));
        // Recovery failed (timeline.get is unavailable). Explicit saves stay
        // local until a retry succeeds or a new edit/notice starts a chain.
        const int before = posts();
        QVERIFY(m_save->saveNow().conflict);
        QCOMPARE(posts(), before);
    }

    void strippedFieldsAreAWarning() {
        m_http->setPost([](const QByteArray&, const QByteArray&) {
            return ok(QStringLiteral("u1"), QJsonArray{QStringLiteral("clips.0.invented")});
        });
        make();
        QSignalSpy spy(m_save.get(), &AutosaveController::strippedWarning);
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(r.ok);
        QCOMPARE(r.stripped, QStringList{QStringLiteral("clips.0.invented")});
        QCOMPARE(spy.count(), 1);
        QCOMPARE(m_save->stripped(), r.stripped);
        QVERIFY(QFileInfo::exists(r.keptCopy));
    }

    void noBaseNoSave() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        make(QString());
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(!r.ok);
        QCOMPARE(posts(), 0);
    }

    // ── Codex review F1 (M5b): dirty follows the saved content, not the index ──

    void anEditMergedDuringTheSaveIsDirty() {
        m_http->setPost([this](const QByteArray&, const QByteArray&) {
            m_undo->push(new Nudge(&m_value));  // merges into the command being saved
            return ok(QStringLiteral("u1"));
        });
        make();
        m_undo->push(new Nudge(&m_value));
        const int index = m_undo->index();
        QVERIFY(m_save->saveNow().ok);
        QCOMPARE(m_undo->index(), index);  // the merge kept the index
        QCOMPARE(m_value, 20);
        QVERIFY2(m_save->dirty(), "the server holds 10, the editor 20");
    }

    void anUndoDuringTheSaveIsDirty() {
        m_http->setPost([this](const QByteArray&, const QByteArray&) {
            m_undo->undo();  // back to the load's index while the server takes index 1
            return ok(QStringLiteral("u1"));
        });
        make();
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        QCOMPARE(m_value, 0);
        QVERIFY2(m_save->dirty(), "the server holds the edit, the editor does not");
    }

    void aRedoBackToTheSavedContentIsClean() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        make();
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        m_undo->undo();
        QVERIFY(m_save->dirty());
        m_undo->redo();
        QVERIFY(!m_save->dirty());
    }

    // ── Codex review F2 (M5b): failures retry, and unsaved edits survive ──

    void aTransientFailureRetriesAndKeepsARecoveryFile() {
        int calls = 0;
        m_http->setPost([&calls](const QByteArray&, const QByteArray&) {
            return ++calls == 1 ? failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")) : ok(QStringLiteral("u1"));
        });
        make();
        m_save->setRetryBaseMs(100);
        m_save->setAutosave(true);
        m_save->setDebounceMs(50);
        m_undo->push(new Bump(&m_value));
        QTRY_COMPARE_WITH_TIMEOUT(posts(), 1, 3000);
        const QString recovery = QDir(m_dir.path()).filePath(QStringLiteral("seq.recovery.json"));
        QTRY_VERIFY_WITH_TIMEOUT(QFileInfo::exists(recovery), 2000);
        QTRY_COMPARE_WITH_TIMEOUT(posts(), 2, 5000);
        QTRY_VERIFY_WITH_TIMEOUT(!m_save->dirty(), 2000);
    }

    void aFailedRecoveryDoesNotRetryTheSave() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make();
        m_save->setRetryBaseMs(50);
        m_save->setAutosave(true);
        m_save->setDebounceMs(50);
        m_undo->push(new Bump(&m_value));
        QTRY_COMPARE_WITH_TIMEOUT(posts(), 1, 3000);
        QTest::qWait(600);
        QCOMPARE(posts(), 1);
    }

    void theConflictCopyHoldsTheCurrentDocument() {
        m_http->setPost([this](const QByteArray&, const QByteArray&) {
            m_undo->push(new Bump(&m_value));  // an edit made while the request was out
            return conflict();
        });
        make();
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(r.conflict);
        QFile f(r.keptCopy);
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(2));
    }

    void aFailedRecoveryWriteIsReported() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(400, QStringLiteral("BAD_REQUEST")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), QStringLiteral("/dev/null/no-such-folder"), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(!r.ok);
        QVERIFY2(!r.recoveryError.isEmpty(), "a lost recovery file must be reported");
        QVERIFY(m_save->lastError().contains(QStringLiteral("recovery")));
    }

    // ── UI review F3: the banners show the kept copy and why one is missing ──

    void theConflictCopyIsAProperty() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make();
        QCOMPARE(m_save->keptCopy(), QString());
        m_undo->push(new Bump(&m_value));
        const auto states = recordStates();
        const SaveResult r = m_save->saveNow();
        QVERIFY(r.conflict);
        QCOMPARE(m_save->keptCopy(), r.keptCopy);
        QVERIFY(m_save->keptCopy().endsWith(QStringLiteral("seq.local.json")));
        QCOMPARE(m_save->recoveryError(), QString());
        QCOMPARE(m_save->property("keptCopy").toString(), r.keptCopy);  // the QML property
        QTRY_VERIFY(m_save->conflict()); // only stop after timeline.get fails
        // The last notification carries the finished save: QML must not keep
        // "Saving..." or miss the conflict copy.
        QVERIFY(!states->empty());
        const StateSnap& last = states->back();
        QVERIFY2(!last.saving, "the last notification still says saving");
        QVERIFY(last.conflict);
        QCOMPARE(last.keptCopy, r.keptCopy);
        QCOMPARE(last.recoveryError, QString());
        QVERIFY(last.lastError.startsWith(QStringLiteral("conflict")));
    }

    void theStripCopyIsAProperty() {
        m_http->setPost([](const QByteArray&, const QByteArray&) {
            return ok(QStringLiteral("u1"), QJsonArray{QStringLiteral("clips.0.invented")});
        });
        make();
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(r.ok);
        QVERIFY(m_save->keptCopy().endsWith(QStringLiteral("seq.stripped.json")));
        QCOMPARE(m_save->keptCopy(), r.keptCopy);
        QCOMPARE(m_save->recoveryError(), QString());
    }

    void aFailedCopyWriteIsAProperty() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(400, QStringLiteral("BAD_REQUEST")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), QStringLiteral("/dev/null/no-such-folder"), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(!r.recoveryError.isEmpty());
        QCOMPARE(m_save->recoveryError(), r.recoveryError);
        QCOMPARE(m_save->keptCopy(), QString());
        QCOMPARE(m_save->property("recoveryError").toString(), r.recoveryError);
    }

    void aSuccessfulSaveClearsTheCopy() {
        int calls = 0;
        m_http->setPost([&calls](const QByteArray&, const QByteArray&) {
            return ++calls == 1 ? failure(400, QStringLiteral("BAD_REQUEST")) : ok(QStringLiteral("u1"));
        });
        make();
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->saveNow().ok);
        const QString recovery = m_save->keptCopy();
        QVERIFY(recovery.endsWith(QStringLiteral("seq.recovery.json")));
        QVERIFY(QFileInfo::exists(recovery));
        const auto states = recordStates();
        QVERIFY(m_save->saveNow().ok);
        QCOMPARE(m_save->keptCopy(), QString());
        QCOMPARE(m_save->recoveryError(), QString());
        QVERIFY(!QFileInfo::exists(recovery));
        // The last notification carries the cleared copy, not the stale one.
        QVERIFY(!states->empty());
        const StateSnap& last = states->back();
        QVERIFY2(!last.saving, "the last notification still says saving");
        QVERIFY(!last.dirty);
        QCOMPARE(last.keptCopy, QString());
        QCOMPARE(last.recoveryError, QString());
        QCOMPARE(last.lastError, QString());
    }

    void quitFlushesPendingEdits() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        make();
        m_save->setAutosave(true);  // 750 ms debounce, not elapsed at quit
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->flushBeforeQuit(5000));
        QCOMPARE(posts(), 1);
        QVERIFY(!m_save->dirty());
    }

    void quitWithAFailedSaveKeepsARecoveryFile() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")); });
        make();
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->flushBeforeQuit(2000));
        QFile f(QDir(m_dir.path()).filePath(QStringLiteral("seq.recovery.json")));
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(1));
    }

    // ── Review F1 (save): a retry that strips must not delete the only copy ──

    void aRetryWithAFailedStripCopyKeepsTheRecoveryFile() {
        int calls = 0;
        m_http->setPost([&calls](const QByteArray&, const QByteArray&) {
            return ++calls == 1 ? failure(503, QStringLiteral("INTERNAL_SERVER_ERROR"))
                                : ok(QStringLiteral("u1"), QJsonArray{QStringLiteral("clips.0.startMs")});
        });
        make();
        const QString fallback = m_dir.filePath(QStringLiteral("strip-fallback"));
        m_save->setQuitFallbackDirs({fallback});
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->saveNow().ok);
        const QString recovery = m_dir.filePath(QStringLiteral("seq.recovery.json"));
        QVERIFY(QFileInfo::exists(recovery));
        m_undo->push(new Bump(&m_value));  // v2 differs from the recovery v1
        QFile::remove(m_dir.filePath(QStringLiteral("seq.stripped.json")));
        QVERIFY(QDir(m_dir.path()).mkpath(QStringLiteral("seq.stripped.json")));
        const SaveResult r = m_save->saveNow();
        QVERIFY(r.ok);
        QFile f(m_save->keptCopy());
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(2));
        QCOMPARE(m_save->keptCopy(), r.keptCopy);
        ServerClient client(m_http->base(), QString());
        QCOMPARE(m_save->keptCopy(), QDir(fallback).filePath(safePathPart(client.serverKey()) + u'/' +
            safePathPart(client.userKey()) + QStringLiteral("/seq.stripped.json")));
        QCOMPARE(m_save->recoveryError(), QString());
        QVERIFY(!QFileInfo::exists(recovery));  // the replacement was written
        const int beforeQuit = posts();
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), 7);
        QCOMPARE(posts(), beforeQuit);
        // A later strip written in the backup folder also replaces recovery.
        QVERIFY(QDir(m_dir.path()).rmdir(QStringLiteral("seq.stripped.json")));
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        QCOMPARE(m_save->keptCopy(), m_dir.filePath(QStringLiteral("seq.stripped.json")));
    }

    void aFailedStripCopyRetainsACurrentRecovery() {
        int calls = 0;
        m_http->setPost([&calls](const QByteArray&, const QByteArray&) {
            return ++calls == 1 ? failure(503, QStringLiteral("INTERNAL_SERVER_ERROR"))
                                : ok(QStringLiteral("u1"), QJsonArray{QStringLiteral("clips.0.startMs")});
        });
        make();
        const QString blocked = m_dir.filePath(QStringLiteral("no-strip-fallback"));
        QFile blocker(blocked);
        QVERIFY(blocker.open(QIODevice::WriteOnly));
        blocker.close();
        m_save->setQuitFallbackDirs({blocked});
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->saveNow().ok);
        const QString recovery = m_save->keptCopy();
        QFile::remove(m_dir.filePath(QStringLiteral("seq.stripped.json")));
        QVERIFY(QDir(m_dir.path()).mkpath(QStringLiteral("seq.stripped.json")));
        QVERIFY(m_save->saveNow().ok);  // no edit: recovery already holds this document
        QCOMPARE(m_save->keptCopy(), recovery);
        QFile file(recovery);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(file.readAll()).object(), rawDoc(1));
        const int beforeQuit = posts();
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), 7);
        QCOMPARE(posts(), beforeQuit);
        QVERIFY(QDir(m_dir.path()).rmdir(QStringLiteral("seq.stripped.json")));
    }

    void aCleanButUnpreservedStripFailsQuitWithoutResaving() {
        int calls = 0;
        m_http->setPost([&calls](const QByteArray&, const QByteArray&) {
            return ++calls == 1 ? failure(503, QStringLiteral("INTERNAL_SERVER_ERROR"))
                                : ok(QStringLiteral("u1"), QJsonArray{QStringLiteral("clips.0.startMs")});
        });
        const QString backup = m_dir.filePath(QStringLiteral("blocked-backup"));
        const QString oldBackup = backup + QStringLiteral("-old");
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), backup, QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("blocked-fallback"))});
        QFile blockedFallback(m_dir.filePath(QStringLiteral("blocked-fallback")));
        QVERIFY(blockedFallback.open(QIODevice::WriteOnly));
        blockedFallback.close();
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->saveNow().ok);
        m_undo->push(new Bump(&m_value));
        // Keep v1 on disk while making every primary copy path unwritable.
        QVERIFY(QDir().rename(backup, oldBackup));
        QFile blockedBackup(backup);
        QVERIFY(blockedBackup.open(QIODevice::WriteOnly));
        blockedBackup.close();
        QVERIFY(m_save->saveNow().ok);
        QVERIFY(!m_save->dirty());
        const int beforeQuit = posts();
        QVERIFY(!m_save->flushBeforeQuit(2000));
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), kExitUnsavedEditsLost);
        QCOMPARE(posts(), beforeQuit);
        QCOMPARE(m_save->keptCopy(), QString());
        QVERIFY(!m_save->recoveryError().isEmpty());
        QFile oldRecovery(QDir(oldBackup).filePath(QStringLiteral("seq.recovery.json")));
        QVERIFY(oldRecovery.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(oldRecovery.readAll()).object(), rawDoc(1));
    }

    // ── Review F2 (save): the quit timeout is a deadline, not inactivity ──

    void quitIsBoundedByAnElapsedDeadline() {
        // 60 bytes, one every 100 ms: 6 s, never 1 s quiet.
        TrickleServer slow(ok(QStringLiteral("u1")).leftJustified(60, ' '), 100);
        SaveTarget t{slow.base(), QString(), QStringLiteral("seq"), m_dir.path(), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_undo->push(new Bump(&m_value));
        QElapsedTimer clock;
        clock.start();
        const bool flushed = m_save->flushBeforeQuit(1000);
        const qint64 took = clock.elapsed();
        QVERIFY2(took < 2500, qPrintable(QStringLiteral("quit took %1 ms for a 1000 ms deadline").arg(took)));
        QVERIFY(!flushed);
        QCOMPARE(slow.requests(), 1);
        QFile f(QDir(m_dir.path()).filePath(QStringLiteral("seq.recovery.json")));
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(1));
    }

    // ── m5b F2: an offline quit with an unwritable folder keeps the edits ──

    void quitWithAnUnwritableFolderUsesAFallback() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), QStringLiteral("/dev/null/no-such-folder"), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        const QString fallback = m_dir.filePath(QStringLiteral("fallback"));
        m_save->setQuitFallbackDirs({QStringLiteral("/dev/null/also-not"), fallback});
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->flushBeforeQuit(2000));
        QVERIFY2(m_save->keptCopy().startsWith(fallback), qPrintable(m_save->keptCopy()));
        QFile f(m_save->keptCopy());
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(1));
    }

    void fallbackCopiesAreNamespaced_data() {
        QTest::addColumn<bool>("differentServer");
        QTest::newRow("servers") << true;
        QTest::newRow("accounts") << false;
    }

    void fallbackCopiesAreNamespaced() {
        QFETCH(bool, differentServer);
        TestHttpServer otherHttp;
        const auto offline = [](const QByteArray&, const QByteArray&) {
            return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR"));
        };
        m_http->setPost(offline);
        otherHttp.setPost(offline);
        SaveTarget first{m_http->base(), QStringLiteral("first"), QStringLiteral("seq"),
                         QStringLiteral("/dev/null/backup"), QString()};
        SaveTarget second{differentServer ? otherHttp.base() : m_http->base(),
                          differentServer ? first.token : QStringLiteral("second"), first.timelineId,
                          first.backupDir, QString()};
        int firstValue = 0;
        int secondValue = 0;
        QUndoStack firstUndo;
        QUndoStack secondUndo;
        AutosaveController firstSave(first, &firstUndo, [&]() { return rawDoc(firstValue); }, QStringLiteral("u0"));
        AutosaveController secondSave(second, &secondUndo, [&]() { return rawDoc(secondValue); }, QStringLiteral("u0"));
        const QString fallback = m_dir.filePath(QStringLiteral("shared-fallback"));
        firstSave.setExternalSync(false);
        firstSave.setAutosave(false);
        secondSave.setExternalSync(false);
        secondSave.setAutosave(false);
        firstSave.setQuitFallbackDirs({fallback});
        secondSave.setQuitFallbackDirs({fallback});
        firstUndo.push(new Bump(&firstValue));
        secondUndo.push(new Bump(&secondValue));
        secondUndo.push(new Bump(&secondValue));
        QVERIFY(!firstSave.flushBeforeQuit(2000));
        QVERIFY(!secondSave.flushBeforeQuit(2000));
        QVERIFY(firstSave.keptCopy() != secondSave.keptCopy());
        for (const auto& entry : {std::pair{&first, &firstSave}, std::pair{&second, &secondSave}}) {
            ServerClient client(entry.first->server, entry.first->token);
            const QString expected = QDir(fallback).filePath(safePathPart(client.serverKey()) + u'/' +
                safePathPart(client.userKey()) + QStringLiteral("/seq.recovery.json"));
            QCOMPARE(entry.second->keptCopy(), expected);
            QFile file(expected);
            QVERIFY(file.open(QIODevice::ReadOnly));
            QCOMPARE(QJsonDocument::fromJson(file.readAll()).object(), rawDoc(entry.first == &first ? 1 : 2));
        }
    }

    void quitWithNoWritableFolderLogsTheFullDocument() {
        const auto closeFile = [](FILE* file) { std::fclose(file); };
        const QByteArray logPath = QFile::encodeName(m_dir.filePath(QStringLiteral("last-resort.log")));
        const std::unique_ptr<FILE, decltype(closeFile)> stream(std::fopen(logPath.constData(), "w+b"), closeFile);
        QVERIFY(stream);
        m_http->setPost([](const QByteArray&, const QByteArray&) {
            return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR"));
        });
        const QString blocked = m_dir.filePath(QStringLiteral("no-copy"));
        QFile blocker(blocked);
        QVERIFY(blocker.open(QIODevice::WriteOnly));
        blocker.close();
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), blocked, QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_save->setQuitFallbackDirs({blocked});
        m_save->setLastResortStream(stream.get());
        m_undo->push(new Bump(&m_value));
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), kExitUnsavedEditsLost);
        QCOMPARE(m_save->keptCopy(), QString());
        QVERIFY(!m_save->recoveryError().isEmpty());
        QCOMPARE(std::fflush(stream.get()), 0);
        std::rewind(stream.get());
        QByteArray log;
        char buffer[1024];
        while (const auto n = std::fread(buffer, 1, sizeof(buffer), stream.get())) {
            log.append(buffer, static_cast<qsizetype>(n));
        }
        QCOMPARE(std::ferror(stream.get()), 0);
        const QByteArray begin = "save: BEGIN unsaved document seq\n";
        const QByteArray end = "\nsave: END unsaved document seq\n";
        const auto start = log.indexOf(begin);
        QVERIFY2(start >= 0, log.constData());
        const auto finish = log.indexOf(end, start + begin.size());
        QVERIFY2(finish > start, log.constData());
        const QByteArray json = log.mid(start + begin.size(), finish - start - begin.size());
        QCOMPARE(QJsonDocument::fromJson(json).object(), rawDoc(m_value));
        QCOMPARE(json, QJsonDocument(rawDoc(m_value)).toJson(QJsonDocument::Compact));
        m_save.reset();  // the borrowed stream outlives the controller
    }

    // The exit code main() returns after the window closes.
    void quitExitCodeReportsLostEdits() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), QStringLiteral("/dev/null/no-such-folder"), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_save->setQuitFallbackDirs({QStringLiteral("/dev/null/also-not")});
        m_undo->push(new Bump(&m_value));
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), kExitUnsavedEditsLost);
        QCOMPARE(m_save->keptCopy(), QString());
    }

    void quitExitCodeKeepsTheRunsCodeWhenClean() {
        make();
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), 7);
        QCOMPARE(posts(), 0);
    }

    void quitExitCodeKeepsTheRunsCodeWithoutAController() {
        QCOMPARE(exitCodeAfterQuit(nullptr, 7, 2000), 7);
    }

    void quitExitCodeKeepsTheRunsCodeWhenACopyIsKept() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")); });
        make();
        m_undo->push(new Bump(&m_value));
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 7, 2000), 7);
        QVERIFY(QFileInfo::exists(m_save->keptCopy()));
    }

    // ── m5b F4: a save goes only to the expected server instance ──

    void theExpectedServerInstanceSaves() {
        m_http->setFile("/ready", ServedFile("{}"));
        m_http->setInstanceSecret("mine");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        SaveTarget target{m_http->base(), QString(), QStringLiteral("seq"), m_dir.path(), QString()};
        target.expectedInstance = QStringLiteral("mine");
        m_save = std::make_unique<AutosaveController>(target, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_undo->push(new Bump(&m_value));
        const auto result = m_save->saveNow();
        QVERIFY2(result.ok, qPrintable(result.error));
        QCOMPARE(posts(), 1);
        QCOMPARE(m_http->countRequests("GET", "/ready"), 1);
        QVERIFY(!m_save->dirty());
    }

    void aWrongServerInstanceIsNeverWritten() {
        ServedFile ready(QByteArray("{\"status\":\"ok\"}"));
        ready.status = 503;
        m_http->setInstanceSecret("someone-else");
        m_http->setFile("/ready", ready);
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), m_dir.path(), QString()};
        t.expectedInstance = QStringLiteral("mine");
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
        m_save->setRetryBaseMs(50);
        m_save->setExternalSync(false);
        m_save->setAutosave(false);
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(!r.ok);
        QCOMPARE(posts(), 0);
        QVERIFY2(r.error.contains(QStringLiteral("instance")), qPrintable(r.error));
        QVERIFY(QFileInfo::exists(r.keptCopy));
        QCOMPARE(m_http->countRequests("GET", "/ready"), 1);
        QTest::qWait(300);  // a refusal is not retried
        QCOMPARE(m_http->countRequests("GET", "/ready"), 1);
        QCOMPARE(posts(), 0);
        QVERIFY(!m_save->flushBeforeQuit(1000));
        QCOMPARE(m_http->countRequests("GET", "/ready"), 2);
        QCOMPARE(posts(), 0);
    }

    void autosaveDebouncesToOneSave() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        make();
        m_save->setAutosave(true);
        QElapsedTimer t;
        t.start();
        for (int i = 0; i < 3; ++i) {
            if (i > 0) QTest::qWait(200);
            m_undo->push(new Bump(&m_value));
        }
        const qint64 lastEdit = t.elapsed();
        QCOMPARE(posts(), 0);
        QTRY_COMPARE_WITH_TIMEOUT(posts(), 1, 3000);
        QVERIFY2(t.elapsed() - lastEdit >= 700, "the save waits 750 ms after the last edit");
        QTest::qWait(1000);
        QCOMPARE(posts(), 1);
        QVERIFY(!m_save->dirty());
    }
};

QTEST_GUILESS_MAIN(TestAutosave)
#include "tst_autosave.moc"
