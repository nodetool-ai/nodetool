#include "ai/GenerationTransport.h"

#include <QJsonDocument>
#include <QSignalSpy>
#include <QTest>
#include <QWebSocket>
#include <QWebSocketServer>

class GenerationTransportTest : public QObject {
    Q_OBJECT
private slots:
    void readiness_data() {
        QTest::addColumn<QByteArray>("ack");
        QTest::addColumn<bool>("binary");
        QTest::newRow("text") << QByteArray(R"({"message":"Mode set to text"})") << false;
        QTest::newRow("fixmap") << QByteArray::fromHex("81a76d657373616765b04d6f64652073657420746f2074657874") << true;
        QTest::newRow("map16") << QByteArray::fromHex("de0001a76d657373616765b04d6f64652073657420746f2074657874") << true;
    }

    void readiness() {
        QFETCH(QByteArray, ack);
        QFETCH(bool, binary);
        QWebSocketServer server("generation-test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        nt::ai::GenerationTransport transport;
        QWebSocket* peer = nullptr;
        QList<QJsonObject> frames;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, this, [&](const QString& frame) {
                frames.append(QJsonDocument::fromJson(frame.toUtf8()).object());
            });
        });
        auto base = server.serverUrl();
        base.setScheme("http");
        transport.configure(base, "test-token");
        QVERIFY(!transport.send("generate_media", {{"prompt", "must not submit"}}, "early"));
        QSignalSpy connections(&server, &QWebSocketServer::newConnection);
        transport.open();
        QTRY_COMPARE(connections.size(), 1);
        QVERIFY(peer);
        QCOMPARE(peer->request().rawHeader("Authorization"), QByteArray("Bearer test-token"));
        QCOMPARE(peer->requestUrl().path(), QString("/ws"));
        QTRY_COMPARE(frames.size(), 1);
        const auto mode = frames[0];
        QCOMPARE(mode["command"].toString(), QString("set_mode"));
        QCOMPARE(mode["data"].toObject()["mode"].toString(), QString("text"));
        QVERIFY(!transport.ready());
        QVERIFY(!transport.send("generate_media", {}, "before-ack"));
        if (binary) {
            peer->sendBinaryMessage(ack.chopped(1));
            QTest::qWait(20);
            QVERIFY(!transport.ready());
            peer->sendBinaryMessage(ack);
        } else {
            peer->sendTextMessage(QString::fromUtf8(ack));
        }
        QTRY_VERIFY(transport.ready());
        QVERIFY(transport.send("generate_media", {{"prompt", "fixture"}}, "request-one"));
        QTRY_COMPARE(frames.size(), 2);
        const auto submitted = frames[1];
        QCOMPARE(submitted["request_id"].toString(), QString("request-one"));
        QCOMPARE(submitted["command"].toString(), QString("generate_media"));
        QCOMPARE(submitted["data"].toObject()["prompt"].toString(), QString("fixture"));
        QSignalSpy responses(&transport, &nt::ai::GenerationTransport::response);
        peer->sendTextMessage(R"({"type":"rpc_response","request_id":"request-one","success":true,"data":{"asset_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}})");
        QTRY_COMPARE(responses.size(), 1);
        QCOMPARE(responses[0][0].toJsonObject()["request_id"].toString(), QString("request-one"));
        peer->close();
        QTRY_VERIFY(!transport.ready());
        QVERIFY(!transport.send("generate_media", {}, "after-close"));
        QTest::qWait(50);
        QCOMPARE(connections.size(), 1);
        transport.close();
    }
};

QTEST_GUILESS_MAIN(GenerationTransportTest)
#include "tst_generationtransport.moc"
