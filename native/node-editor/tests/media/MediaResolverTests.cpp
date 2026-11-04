#include "../../src/media/MediaResolver.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QSignalSpy>
#include <QFile>
using namespace nodetool::node_editor;
class Tests : public QObject {
 Q_OBJECT
private slots:
 void inlineAndReject() {
  MediaResolver resolver;
  QSignalSpy loaded(&resolver, &MediaResolver::resolved), failed(&resolver, &MediaResolver::failed);
  resolver.resolve("inline", "data:image/png;base64,aGVsbG8=");
  QCOMPARE(loaded.size(), 1);
  QFile file(loaded[0][1].toUrl().toLocalFile());
  QVERIFY(file.open(QIODevice::ReadOnly));
  QCOMPARE(file.readAll(), QByteArray("hello"));
  const auto path = file.fileName(); file.close();
  resolver.resolve("bad", "s3://private/file");
  QCOMPARE(failed.size(), 1);
  resolver.resolve("bytes", QVariantMap{{"type", "audio"}, {"data", QByteArray("sound")}});
  QCOMPARE(loaded.size(), 2);
  resolver.resolve("encoded", QVariantMap{{"type", "image"}, {"data", "aGVsbG8="}});
  QCOMPARE(loaded.size(), 3);
  resolver.resolve("array", QVariantMap{{"type", "video"}, {"data", QVariantList{1, 2, 3}}});
  QCOMPARE(loaded.size(), 4);
  resolver.clear();
  QVERIFY(!QFile::exists(path));
 }
 void leasedCacheAndLongSession() {
  MediaResolver resolver;
  QSignalSpy loaded(&resolver, &MediaResolver::resolved), failed(&resolver, &MediaResolver::failed);
  resolver.resolve("playing", "data:audio/wav;base64,cGxheWluZw==");
  const auto playing = loaded.takeFirst()[1].toUrl();
  resolver.resolve("same", "data:audio/wav;base64,cGxheWluZw==");
  QCOMPARE(loaded.takeFirst()[1].toUrl(), playing);
  resolver.release("same");
  QUrl oldest;
  for (int frame = 0; frame < 400; ++frame) {
   resolver.cancel("frame");
   resolver.release("frame");
   resolver.resolve("frame", QVariantMap{{"data", QByteArray::number(frame)}});
   QCOMPARE(loaded.size(), 1);
   const auto url = loaded.takeFirst()[1].toUrl();
   if (frame == 0) { oldest = url; }
  }
  QCOMPARE(failed.size(), 0);
  QVERIFY(QFile::exists(playing.toLocalFile()));
  QVERIFY(!QFile::exists(oldest.toLocalFile()));
 }
 void redirectDropsCredentialsAndErrors() {
  QTcpServer origin, external;
  QVERIFY(origin.listen(QHostAddress::LocalHost));
  QVERIFY(external.listen(QHostAddress::LocalHost));
  QByteArray externalRequest;
  connect(&external, &QTcpServer::newConnection, this, [&] {
   auto *socket = external.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    externalRequest = socket->readAll();
    socket->write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
    socket->disconnectFromHost();
   });
   connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
  });
  connect(&origin, &QTcpServer::newConnection, this, [&] {
   auto *socket = origin.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    const auto request = socket->readAll();
    if (request.contains("/error")) {
     socket->write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    } else {
     socket->write("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:" + QByteArray::number(external.serverPort()) + "/bytes\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    }
    socket->disconnectFromHost();
   });
   connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
  });
  MediaResolver resolver;
  const QUrl base(QString("http://127.0.0.1:%1").arg(origin.serverPort()));
  resolver.configure(base, "secret");
  QSignalSpy loaded(&resolver, &MediaResolver::resolved), failed(&resolver, &MediaResolver::failed);
  resolver.resolve("redirect", base.resolved(QUrl("/redirect")).toString());
  QTRY_COMPARE(loaded.size(), 1);
  QVERIFY(!externalRequest.contains("Authorization"));
  resolver.resolve("error", base.resolved(QUrl("/error")).toString());
  QTRY_COMPARE(failed.size(), 1);
  QVERIFY(failed[0][1].toString().contains("403"));
 }
 void authenticatedAssetAndStale() {
  QTcpServer server;
  QVERIFY(server.listen(QHostAddress::LocalHost));
  QList<QByteArray> requests;
  connect(&server, &QTcpServer::newConnection, this, [&] {
   auto *socket = server.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    const auto request = socket->readAll();
    requests.append(request);
    if (request.contains("/slow")) { return; }
    const auto body = request.contains("/trpc/assets.get") ? QByteArray("{\"result\":{\"data\":{\"get_url\":\"/api/storage/test.png\"}}}") : QByteArray("image-bytes");
    socket->write("HTTP/1.1 200 OK\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\nConnection: close\r\n\r\n" + body);
    socket->disconnectFromHost();
   });
   connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
  });
  MediaResolver resolver;
  const QUrl base(QString("http://127.0.0.1:%1").arg(server.serverPort()));
  resolver.configure(base, "fixture-secret");
  QSignalSpy loaded(&resolver, &MediaResolver::resolved);
  resolver.resolve("asset", QVariantMap{{"type", "image"}, {"asset_id", "0123456789ab"}});
  QTRY_COMPARE(loaded.size(), 1);
  QCOMPARE(requests.size(), 2);
  QVERIFY(requests[0].contains("Authorization: Bearer fixture-secret"));
  QVERIFY(requests[1].contains("Authorization: Bearer fixture-secret"));
  QVERIFY(requests[0].contains("input="));
  const auto firstUrl = loaded[0][1].toUrl();
  resolver.resolve("asset", QVariantMap{{"asset_id", "0123456789ab"}});
  QCOMPARE(loaded.size(), 2);
  QCOMPARE(loaded[1][1].toUrl(), firstUrl);
  QCOMPARE(requests.size(), 2);
  resolver.resolve("changing", base.resolved(QUrl("/slow")).toString());
  QTRY_COMPARE(requests.size(), 3);
  resolver.resolve("changing", "data:image/png;base64,bmV3");
  QCOMPARE(loaded.size(), 3);
  resolver.clear();
  QTest::qWait(30);
  QCOMPARE(loaded.size(), 3);
 }
};
QTEST_GUILESS_MAIN(Tests)
#include "MediaResolverTests.moc"
