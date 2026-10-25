// Saving a server timeline (M5b) against an in-process tRPC server: the
// request, dirty from the undo stack's clean index, the conflict path, the
// strip warning, the base rule, and the 750 ms autosave debounce.

#include "server/AutosaveController.h"
#include "TestHttpServer.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QtTest>

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

}  // namespace

class TestAutosave : public QObject {
    Q_OBJECT

    QTemporaryDir m_dir{QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX")};
    std::unique_ptr<TestHttpServer> m_http;
    std::unique_ptr<QUndoStack> m_undo;
    int m_value = 0;
    std::unique_ptr<AutosaveController> m_save;

    void make(const QString& base = QStringLiteral("u0")) {
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), m_dir.path(), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, base);
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
        m_http = std::make_unique<TestHttpServer>();
        m_undo = std::make_unique<QUndoStack>();
        m_value = 0;
    }
    void cleanup() {
        m_save.reset();
        m_undo.reset();
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
        QVERIFY(m_save->conflict());
        QVERIFY(m_save->dirty());
        QVERIFY(QFileInfo::exists(r.keptCopy));
        QFile f(r.keptCopy);
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(1));
        // No later save overwrites the server copy.
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

    void aConflictIsNeverRetried() {
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
                                : ok(QStringLiteral("u1"), QJsonArray{QStringLiteral("clips.0.invented")});
        });
        make();
        m_undo->push(new Bump(&m_value));
        QVERIFY(!m_save->saveNow().ok);
        const QString recovery = QDir(m_dir.path()).filePath(QStringLiteral("seq.recovery.json"));
        QVERIFY(QFileInfo::exists(recovery));
        // The strip copy cannot be written: a folder holds its name.
        QFile::remove(QDir(m_dir.path()).filePath(QStringLiteral("seq.stripped.json")));
        QVERIFY(QDir(m_dir.path()).mkpath(QStringLiteral("seq.stripped.json")));
        const SaveResult r = m_save->saveNow();
        QVERIFY(r.ok);
        QVERIFY(!r.recoveryError.isEmpty());
        QVERIFY2(QFileInfo::exists(recovery), "the recovery copy is the only copy of the dropped fields");
        QFile f(recovery);
        QVERIFY(f.open(QIODevice::ReadOnly));
        QCOMPARE(QJsonDocument::fromJson(f.readAll()).object(), rawDoc(1));
        QCOMPARE(m_save->keptCopy(), recovery);
        QVERIFY(!m_save->recoveryError().isEmpty());
        // The next clean save with a written copy removes it.
        QVERIFY(QDir(m_dir.path()).rmdir(QStringLiteral("seq.stripped.json")));
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().ok);
        QVERIFY(!QFileInfo::exists(recovery));
        QVERIFY(m_save->keptCopy().endsWith(QStringLiteral("seq.stripped.json")));
    }

    // ── Review F2 (save): the quit timeout is a deadline, not inactivity ──

    void quitIsBoundedByAnElapsedDeadline() {
        // 60 bytes, one every 100 ms: 6 s, never 1 s quiet.
        TrickleServer slow(ok(QStringLiteral("u1")).leftJustified(60, ' '), 100);
        SaveTarget t{slow.base(), QString(), QStringLiteral("seq"), m_dir.path(), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
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

    // The exit code main() returns after the window closes.
    void quitExitCodeReportsLostEdits() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), QStringLiteral("/dev/null/no-such-folder"), QString()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setAutosave(false);
        m_save->setQuitFallbackDirs({QStringLiteral("/dev/null/also-not")});
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 0, 2000), 0);  // nothing to save
        QCOMPARE(exitCodeAfterQuit(nullptr, 0, 2000), 0);       // a fixture file
        m_undo->push(new Bump(&m_value));
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 0, 2000), kExitUnsavedEditsLost);
        QCOMPARE(m_save->keptCopy(), QString());
    }

    void quitExitCodeKeepsTheRunsCodeWhenACopyIsKept() {
        m_http->setPost([](const QByteArray&, const QByteArray&) { return failure(503, QStringLiteral("INTERNAL_SERVER_ERROR")); });
        make();
        m_undo->push(new Bump(&m_value));
        QCOMPARE(exitCodeAfterQuit(m_save.get(), 0, 2000), 0);
        QVERIFY(QFileInfo::exists(m_save->keptCopy()));
    }

    // ── m5b F4: a save goes only to the expected server instance ──

    void aWrongServerInstanceIsNeverWritten() {
        ServedFile ready(QByteArray("{\"status\":\"ok\"}"));
        ready.extraHeaders.insert("X-Nodetool-Instance", "someone-else");
        m_http->setFile("/ready", ready);
        m_http->setPost([](const QByteArray&, const QByteArray&) { return ok(QStringLiteral("u1")); });
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), m_dir.path(), QString()};
        t.expectedInstance = QStringLiteral("mine");
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, QStringLiteral("u0"));
        m_save->setRetryBaseMs(50);
        m_save->setAutosave(false);
        m_undo->push(new Bump(&m_value));
        const SaveResult r = m_save->saveNow();
        QVERIFY(!r.ok);
        QCOMPARE(posts(), 0);
        QVERIFY2(r.error.contains(QStringLiteral("instance")), qPrintable(r.error));
        QVERIFY(QFileInfo::exists(r.keptCopy));
        QTest::qWait(300);  // a refusal is not retried
        QCOMPARE(posts(), 0);
        QVERIFY(!m_save->flushBeforeQuit(1000));
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
