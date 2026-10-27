#include "server/ServerSource.h"
#include "TestHttpServer.h"

#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QtTest>
#include <array>

namespace {
constexpr auto DOCUMENT = R"({"id":"label-cut","name":"Label cut","fps":30,"width":1920,"height":1080,"tracks":[],"clips":[]})";

void serveTimeline(TestHttpServer& server) {
    server.setJson([](const QByteArray&, const QUrl&) {
        return QByteArray("{\"result\":{\"data\":") + DOCUMENT + "}}";
    });
}
}

class TestTimelineListSource : public QObject {
    Q_OBJECT
private slots:
    void initTestCase() {
        QVERIFY(m_cache.isValid());
        m_oldCache = qgetenv("NODETOOL_TIMELINE_CACHE_DIR");
        m_oldToken = qgetenv("NODETOOL_API_TOKEN");
        m_oldInstance = qgetenv("NODETOOL_TIMELINE_EXPECT_INSTANCE");
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", m_cache.path().toUtf8());
        qputenv("NODETOOL_API_TOKEN", "label-token");
        qputenv("NODETOOL_TIMELINE_EXPECT_INSTANCE", "label-instance");
    }

    void localFileWithHash() {
        const auto path = m_cache.filePath("local#timeline=cut.json");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(DOCUMENT);
        file.close();
        const auto loaded = nt::server::loadTimelineSource(path);
        QVERIFY2(loaded.timeline.has_value(), qPrintable(loaded.error));
        QCOMPARE(loaded.timeline->name, std::string("Label cut"));
        QVERIFY(!nt::server::serverSaveTarget());
    }

    void malformedLabels_data() {
        QTest::addColumn<QString>("suffix");
        QTest::newRow("empty-id") << QStringLiteral("#timeline=");
        QTest::newRow("extra-key") << QStringLiteral("#timeline=cut&other=value");
        QTest::newRow("duplicate-key") << QStringLiteral("#timeline=cut&timeline=other");
        QTest::newRow("wrong-key") << QStringLiteral("#other=cut");
        QTest::newRow("ftp") << QStringLiteral("ftp://127.0.0.1:1#timeline=cut");
        QTest::newRow("missing-host") << QStringLiteral("http:///path#timeline=cut");
    }

    void malformedLabels() {
        QFETCH(QString, suffix);
        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        QVERIFY(server.base().port() != 7777);
        const auto source = suffix.startsWith('#') ? server.base().toString() + suffix : suffix;
        const auto loaded = nt::server::loadTimelineSource(source);
        QVERIFY(!loaded.timeline);
        QVERIFY2(loaded.error.startsWith("cannot open "), qPrintable(loaded.error));
        QVERIFY(server.requests().empty());
        QVERIFY(!nt::server::serverSaveTarget());
    }

    void labelSaveTarget() {
        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        QVERIFY(server.base().port() != 7777);
        serveTimeline(server);
        const auto loaded = nt::server::loadTimelineSource(server.base().toString() + "#timeline=label-cut");
        const auto target = nt::server::serverSaveTarget();
        QVERIFY(target.has_value());
        QCOMPARE(target->server, server.base());
        QCOMPARE(target->timelineId, QString("label-cut"));
        QCOMPARE(target->token, QString("label-token"));
        QCOMPARE(target->expectedInstance, QString("label-instance"));
        QVERIFY(target->backupDir.startsWith(m_cache.path() + '/'));
        QVERIFY(target->backupDir.endsWith("/timelines"));
        QVERIFY2(loaded.timeline.has_value(), qPrintable(loaded.error));
    }

    void labelOpenAndReport() {
        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        QVERIFY(server.base().port() != 7777);
        serveTimeline(server);
        const auto loaded = nt::server::loadTimelineSource(server.base().toString() + "/path#timeline=label-cut");
        QVERIFY2(loaded.timeline.has_value(), qPrintable(loaded.error));
        QCOMPARE(loaded.timeline->id, std::string("label-cut"));
        const auto target = nt::server::serverSaveTarget();
        QVERIFY(target.has_value());
        QCOMPARE(target->server.path(), QString("/path"));
        QVERIFY(QFile::exists(QDir(target->backupDir).filePath("label-cut.json")));
        QFile report(QDir(target->backupDir).filePath("label-cut.report.json"));
        QVERIFY(report.open(QIODevice::ReadOnly));
        const auto json = QJsonDocument::fromJson(report.readAll()).object();
        QCOMPARE(json.value("source").toObject().value("timelineId").toString(), QString("label-cut"));
        QCOMPARE(server.countRequests("GET", "/trpc/timeline.get"), 1);
        const auto request = server.requests().front();
        QCOMPARE(request.headers.value("authorization"), QByteArray("Bearer label-token"));
        const auto input = QUrlQuery(QUrl(QString::fromLatin1(request.target))).queryItemValue("input", QUrl::FullyDecoded);
        QCOMPARE(QJsonDocument::fromJson(input.toUtf8()).object().value("id").toString(), QString("label-cut"));
    }

    void differentLabelOverridesServerArgs() {
        TestHttpServer original;
        TestHttpServer selected;
        QVERIFY(original.base().port() > 0);
        QVERIFY(selected.base().port() > 0);
        QVERIFY(original.base().port() != 7777);
        QVERIFY(selected.base().port() != 7777);
        serveTimeline(original);
        serveTimeline(selected);
        QByteArray program("test"), serverFlag("--server"), serverUrl(original.base().toEncoded());
        QByteArray timelineFlag("--timeline"), id("original"), tokenFlag("--token"), token("explicit-token");
        QByteArray cacheFlag("--cache-dir"), cache(m_cache.filePath("explicit").toUtf8());
        QByteArray reportFlag("--loader-report"), reportPath(m_cache.filePath("explicit-report.json").toUtf8());
        std::array<char*, 12> argv = {program.data(), serverFlag.data(), serverUrl.data(), timelineFlag.data(), id.data(),
                        tokenFlag.data(), token.data(), cacheFlag.data(), cache.data(),
                        reportFlag.data(), reportPath.data(), nullptr};
        int argc = static_cast<int>(argv.size() - 1);
        QCOMPARE(nt::server::takeServerArgs(argc, argv.data()), 0);
        QCOMPARE(argc, 2);
        const auto commandLineLabel = QString::fromUtf8(argv[1]);
        const auto explicitOpen = nt::server::loadTimelineSource(QString::fromUtf8(argv[1]));
        QVERIFY2(explicitOpen.timeline.has_value(), qPrintable(explicitOpen.error));
        const auto explicitTarget = nt::server::serverSaveTarget();
        QVERIFY(explicitTarget.has_value());
        QCOMPARE(explicitTarget->token, QString("explicit-token"));
        QVERIFY(explicitTarget->backupDir.startsWith(QString::fromUtf8(cache) + '/'));
        const auto loaded = nt::server::loadTimelineSource(selected.base().toString() + "#timeline=chosen");
        QVERIFY2(loaded.timeline.has_value(), qPrintable(loaded.error));
        QCOMPARE(QString::fromUtf8(argv[1]), commandLineLabel);
        const auto target = nt::server::serverSaveTarget();
        QVERIFY(target.has_value());
        QCOMPARE(target->server, selected.base());
        QCOMPARE(target->timelineId, QString("chosen"));
        QCOMPARE(target->token, QString("label-token"));
        QVERIFY(!target->backupDir.startsWith(QString::fromUtf8(cache) + '/'));
        QVERIFY(target->backupDir.startsWith(m_cache.path() + '/'));
        QFile report(QString::fromUtf8(reportPath));
        QVERIFY(report.open(QIODevice::ReadOnly));
        const auto json = QJsonDocument::fromJson(report.readAll()).object();
        QCOMPARE(json.value("source").toObject().value("timelineId").toString(), QString("original"));
        QCOMPARE(original.countRequests("GET", "/trpc/timeline.get"), 1);
        QCOMPARE(selected.countRequests("GET", "/trpc/timeline.get"), 1);
    }

    void cleanupTestCase() {
        const auto restore = [](const char* name, const QByteArray& value) {
            if (value.isNull()) {
                qunsetenv(name);
            } else {
                qputenv(name, value);
            }
        };
        restore("NODETOOL_TIMELINE_CACHE_DIR", m_oldCache);
        restore("NODETOOL_API_TOKEN", m_oldToken);
        restore("NODETOOL_TIMELINE_EXPECT_INSTANCE", m_oldInstance);
    }

private:
    QTemporaryDir m_cache;
    QByteArray m_oldCache, m_oldToken, m_oldInstance;
};

QTEST_GUILESS_MAIN(TestTimelineListSource)
#include "tst_timelinelistsource.moc"
