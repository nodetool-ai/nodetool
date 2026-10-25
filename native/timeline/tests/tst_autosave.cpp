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
        SaveTarget t{m_http->base(), QString(), QStringLiteral("seq"), m_dir.path()};
        m_save = std::make_unique<AutosaveController>(t, m_undo.get(), [this]() { return rawDoc(m_value); }, base);
        m_save->setAutosave(false);
    }
    int posts() const { return m_http->countRequests("POST", "/trpc/timeline.update"); }

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
