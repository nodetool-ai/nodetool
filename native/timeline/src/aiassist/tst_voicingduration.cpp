#include "aiassist/VoicingDuration.h"
#include "../../tests/TestHttpServer.h"
#include <QFile>
#include <QFileInfo>
#include <QtTest>
class VoicingDurationTest : public QObject {
    Q_OBJECT
private slots:
    void catalogMetadataAvoidsDownload() {
        TestHttpServer server;
        nt::server::ServerClient client(server.base());
        QCOMPARE(nt::aiassist::voicingDurationMs(client, {{"id", "asset"}, {"duration", 2.5}}), 2500.0);
        QCOMPARE(server.requests().size(), size_t(0));
    }
    void missingMetadataProbesKnownOneSecondMedia() {
        TestHttpServer server;
        QFile fixture(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../tests/fuzz/corpus/media_probe/tiny.mp4"));
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        const auto bytes = fixture.readAll();
        QVERIFY(!bytes.isEmpty());
        server.setFile("/generated.mp4", ServedFile(bytes));
        nt::server::ServerClient client(server.base());
        const QJsonObject asset{{"id", QString(32, QChar(u'a'))}, {"duration", QJsonValue::Null}, {"content_type", "video/mp4"}, {"get_url", "/generated.mp4"}, {"size", bytes.size()}};
        QCOMPARE(nt::aiassist::voicingDurationMs(client, asset), 1000.0);
        QVERIFY(server.countRequests("GET", "/generated.mp4") > 0);
    }
};
QTEST_GUILESS_MAIN(VoicingDurationTest)
#include "tst_voicingduration.moc"
