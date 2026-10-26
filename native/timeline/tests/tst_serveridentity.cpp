#include "server/ServerClient.h"
#include "server/ServerIdentity/ServerIdentity.h"

#include <QFile>
#include <QMessageAuthenticationCode>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QTimer>

#include <type_traits>
#include <QtTest>

using namespace nt::server;

static_assert(
    std::is_same_v<decltype(&ServerClient::mutate), QueryResult (ServerClient::*)(const QString&, const QJsonObject&)>);
static_assert(std::is_same_v<decltype(&ServerClient::upload),
                             QueryResult (ServerClient::*)(const QJsonObject&, const QString&, const QString&)>);

class ProofServer : public QObject {
public:
    ProofServer() {
        connect(&listener, &QTcpServer::newConnection, this, [this]() {
            while (auto* socket = listener.nextPendingConnection()) {
                ++connections;
                sockets.append(socket);
                auto buffer = std::make_shared<QByteArray>();
                QPointer<QTcpSocket> guard(socket);
                connect(socket, &QTcpSocket::readyRead, this, [this, guard, buffer]() {
                    if (!guard) {
                        return;
                    }
                    const auto bytes = guard->readAll();
                    received += bytes;
                    *buffer += bytes;
                    const auto end = buffer->indexOf("\r\n\r\n");
                    if (end < 0) {
                        return;
                    }
                    const auto head = buffer->left(end);
                    qint64 length = 0;
                    QByteArray nonce;
                    for (const auto& line : head.split('\n')) {
                        if (line.toLower().startsWith("content-length:")) {
                            length = line.mid(15).trimmed().toLongLong();
                        }
                        if (line.toLower().startsWith("x-nodetool-instance-nonce:")) {
                            nonce = line.mid(line.indexOf(':') + 1).trimmed();
                        }
                    }
                    if (buffer->size() < end + 4 + length) {
                        return;
                    }
                    const bool ready = head.startsWith("GET /ready ");
                    if (ready) {
                        nonces.append(nonce);
                    } else {
                        ++writes;
                        lastWrite = *buffer;
                    }
                    buffer->remove(0, end + 4 + length);
                    const auto proof =
                        QMessageAuthenticationCode::hash(nonce, "mine", QCryptographicHash::Sha256).toHex();
                    const auto body = ready ? QByteArray("{}") : QByteArray("{\"result\":{\"data\":{\"saved\":true}}}");
                    const auto headers =
                        replay.isEmpty() ? QByteArray("x-nodetool-instance-proof: ") + proof + "\r\n" : replay;
                    if (ready) {
                        copiedHeaders = headers;
                    }
                    QByteArray out =
                        "HTTP/1.1 " + QByteArray::number(ready ? readyStatus : writeStatus) + " OK\r\n" + headers;
                    if (chunked) {
                        out += "Transfer-Encoding: chunked\r\n\r\n" + QByteArray::number(body.size(), 16) + "\r\n" +
                               body + "\r\n0\r\nX-Trailer: yes\r\n\r\n";
                    } else {
                        out += "Content-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body;
                    }
                    if (closeAfterProof && ready) {
                        out.insert(out.indexOf("\r\n") + 2, "Connection: close\r\n");
                    }
                    if (unframedProof && ready) {
                        out = "HTTP/1.1 200 OK\r\n" + headers + "\r\n{}";
                    }
                    QTimer::singleShot(ready ? readyDelayMs : writeDelayMs, this, [guard, out]() {
                        if (guard) {
                            guard->write(out);
                        }
                    });
                });
            }
        });
        if (!listener.listen(QHostAddress::LocalHost, 0)) {
            qFatal("listen failed");
        }
        if (listener.serverPort() == 7777) {
            qFatal("refusing port 7777");
        }
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(listener.serverPort())); }
    QTcpServer listener;
    QList<QPointer<QTcpSocket>> sockets;
    QByteArray received, lastWrite, copiedHeaders, replay;
    QList<QByteArray> nonces;
    int connections = 0, writes = 0, readyStatus = 200, writeStatus = 200;
    int readyDelayMs = 0, writeDelayMs = 0;
    bool closeAfterProof = false, unframedProof = false;
    bool chunked = false;
};

class TestServerIdentity : public QObject {
    Q_OBJECT
private slots:
    void cleanup() { identity::setBeforeWriteHook({}); }
    void replacementGetsNoWrite_data() {
        QTest::addColumn<bool>("upload");
        QTest::newRow("mutate") << false;
        QTest::newRow("multipart") << true;
    }
    void replacementGetsNoWrite() {
        QFETCH(bool, upload);
        ProofServer real;
        QTcpServer replacement;
        QByteArray recorded;
        int connections = 0;
        connect(&replacement, &QTcpServer::newConnection, this, [&]() {
            while (auto* socket = replacement.nextPendingConnection()) {
                ++connections;
                QPointer<QTcpSocket> guard(socket);
                connect(socket, &QTcpSocket::readyRead, &replacement, [guard, &recorded]() {
                    if (!guard) {
                        return;
                    }
                    recorded += guard->readAll();
                    guard->write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}");
                });
            }
        });
        const auto base = real.base();
        bool checked = false, rebound = false;
        identity::setBeforeWriteHook([&]() -> QString {
            checked = true;
            real.listener.close();
            for (auto& socket : real.sockets) {
                if (socket) {
                    socket->abort();
                }
            }
            rebound = replacement.listen(QHostAddress::LocalHost, static_cast<quint16>(base.port()));
            QTest::qWait(30);
            return {};
        });
        QTemporaryDir dir;
        QFile file(dir.filePath("test.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("PRIVATE-MULTIPART-BODY");
        file.close();
        ServerClient client(base, {}, 500);
        client.setExpectedInstance("mine");
        client.setDeadlineMs(1000);
        const auto result = upload ? client.upload({}, file.fileName(), "audio/wav")
                                   : client.mutate("timeline.update", {{"private", "PRIVATE-JSON-BODY"}});
        QVERIFY(checked);
        QVERIFY(rebound);
        QVERIFY2(recorded.isEmpty(), recorded.constData());
        QCOMPARE(connections, 0);
        QVERIFY(!real.received.contains("POST"));
        QCOMPARE(result.error.code, QString("NETWORK"));
    }
    void copiedHeadersNeverAuthorizeAWrite() {
        ProofServer real;
        ServerClient trusted(real.base());
        trusted.setExpectedInstance("mine");
        QVERIFY(trusted.mutate("timeline.update", {}).ok());
        ProofServer replay;
        replay.replay = real.copiedHeaders;
        ServerClient client(replay.base());
        client.setExpectedInstance("mine");
        const auto result = client.mutate("timeline.update", {{"private", "PRIVATE-JSON-BODY"}});
        QCOMPARE(replay.writes, 0);
        QVERIFY(!replay.received.contains("POST"));
        QCOMPARE(result.error.code, QString("WRONG_SERVER"));
        QVERIFY(real.nonces.front().size() >= 32);
        QVERIFY(real.nonces.front() != replay.nonces.front());
    }
    void aClosedProofConnectionIsNotUsed() {
        ProofServer real;
        real.closeAfterProof = true;
        ServerClient client(real.base());
        client.setExpectedInstance("mine");
        QCOMPARE(client.mutate("timeline.update", {}).error.code, QString("NETWORK"));
        QCOMPARE(real.writes, 0);
        QCOMPARE(real.connections, 1);
    }
    void anUnframedProofSendsNoWrite() {
        ProofServer real;
        real.unframedProof = true;
        ServerClient client(real.base());
        client.setExpectedInstance("mine");
        QCOMPARE(client.mutate("timeline.update", {}).error.code, QString("NETWORK"));
        QCOMPARE(real.writes, 0);
    }
    void aWrongUnframedProofIsStillWrongServer() {
        ProofServer real;
        real.unframedProof = true;
        real.replay = "x-nodetool-instance-proof: copied\r\n";
        ServerClient client(real.base());
        client.setExpectedInstance("mine");
        QCOMPARE(client.mutate("timeline.update", {}).error.code, QString("WRONG_SERVER"));
        QCOMPARE(real.writes, 0);
    }
    void redirectsAreRefused_data() {
        QTest::addColumn<bool>("ready");
        QTest::newRow("proof") << true;
        QTest::newRow("write") << false;
    }
    void redirectsAreRefused() {
        QFETCH(bool, ready);
        ProofServer real;
        if (ready) {
            real.readyStatus = 302;
        } else {
            real.writeStatus = 302;
        }
        ServerClient client(real.base());
        client.setExpectedInstance("mine");
        QCOMPARE(client.mutate("timeline.update", {}).error.code, QString("REDIRECT"));
        QCOMPARE(real.connections, 1);
        QCOMPARE(real.writes, ready ? 0 : 1);
    }
    void theElapsedDeadlineCoversProofAndWrite() {
        ProofServer real;
        real.readyDelayMs = 70;
        real.writeDelayMs = 70;
        ServerClient client(real.base(), {}, 1000);
        client.setExpectedInstance("mine");
        client.setDeadlineMs(110);
        QElapsedTimer elapsed;
        elapsed.start();
        QCOMPARE(client.mutate("timeline.update", {}).error.code, QString("TIMEOUT"));
        QVERIFY(elapsed.elapsed() < 500);
        QCOMPARE(real.writes, 1);
    }
    void theDeadlineStopsABlockedProof() {
        ProofServer real;
        real.readyDelayMs = 1000;
        ServerClient client(real.base());
        client.setExpectedInstance("mine");
        client.setDeadlineMs(30);
        QCOMPARE(client.mutate("timeline.update", {}).error.code, QString("TIMEOUT"));
        QCOMPARE(real.writes, 0);
    }
    void proofAndWriteShareOneConnection_data() {
        QTest::addColumn<bool>("chunked");
        QTest::newRow("length") << false;
        QTest::newRow("chunked") << true;
    }
    void proofAndWriteShareOneConnection() {
        QFETCH(bool, chunked);
        ProofServer real;
        real.chunked = chunked;
        ServerClient client(real.base(), "bearer");
        client.setExpectedInstance("mine");
        QVERIFY(client.mutate("timeline.update", {{"id", "seq"}}).ok());
        QCOMPARE(real.connections, 1);
        QCOMPARE(real.writes, 1);
        QVERIFY(real.nonces.front().size() >= 32);
        QVERIFY(real.lastWrite.toLower().contains("authorization: bearer bearer\r\n"));
        QVERIFY(real.lastWrite.toLower().contains("x-nodetool-client: native-timeline/0.1.0\r\n"));
        QVERIFY(!real.lastWrite.toLower().contains("\r\norigin:"));
    }
};
QTEST_GUILESS_MAIN(TestServerIdentity)
#include "tst_serveridentity.moc"
