// Saving a server timeline (M5b) against an in-process tRPC server: the
// request, dirty from the undo stack's clean index, the conflict path, the
// strip warning, the base rule, and the 750 ms autosave debounce.

#include "server/AutosaveController.h"
#include "server/AssetCache.h"
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

#include <cstdio>
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

}  // namespace

class RestoreTarget : public QObject {
    Q_OBJECT
public:
    QUndoStack* undo = nullptr;
    int* value = nullptr;
    QString editName;
    QJsonObject payload;
    Q_INVOKABLE quint64 applyEdit(const QString& name, const QJsonObject& input) {
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
        return static_cast<quint64>(undo->count());
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
        m_save.reset();
        m_undo.reset();
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
        m_save->setAutosave(false);
    }

    void discardEarlierCopyDeletesOnlyThatCopy() {
        const QString folder = m_dir.filePath("discard-earlier");
        m_http->setPost([](const QByteArray&, const QByteArray&) { return conflict(); });
        make("u0", folder);
        m_undo->push(new Bump(&m_value));
        QVERIFY(m_save->saveNow().conflict);
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
            first.setQuitFallbackDirs({fallback});
            earlier = first.property("earlierCopy").toString();
            QVERIFY(!earlier.isEmpty());
            QVERIFY(earlier != fixed);
            QVERIFY(QFileInfo::exists(earlier));
        }
        AutosaveController next(target, m_undo.get(), [this] { return rawDoc(m_value); }, "u0");
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
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
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
        m_save->setQuitFallbackDirs({m_dir.filePath(QStringLiteral("fallback"))});
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
        firstSave.setAutosave(false);
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
