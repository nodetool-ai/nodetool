// The tRPC client, the field audit, the proxy-or-original choice, and a whole
// server open against an in-process HTTP server that answers like NodeTool.

#include "server/AssetCache.h"
#include "server/FieldAudit.h"
#include "server/ServerClient.h"
#include "server/ServerTimeline.h"
#include "TestHttpServer.h"

#include <QCoreApplication>
#include <QChildEvent>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QHttpMultiPart>
#include <QNetworkReply>
#include <QMessageAuthenticationCode>
#include <QPointer>
#include <QProcess>
#include <QProcessEnvironment>
#include <QStandardPaths>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QtTest>

using namespace nt::server;

namespace {

class UploadLifetimeProbe : public QObject {
public:
    UploadLifetimeProbe() { qApp->installEventFilter(this); }

    QPointer<QNetworkReply> reply;
    QPointer<QHttpMultiPart> multipart;
    QPointer<QFile> file;

protected:
    bool eventFilter(QObject* watched, QEvent* event) override {
        if (event->type() == QEvent::ChildAdded) {
            auto* networkReply = qobject_cast<QNetworkReply*>(watched);
            auto* parts = qobject_cast<QHttpMultiPart*>(static_cast<QChildEvent*>(event)->child());
            if (networkReply && parts) {
                reply = networkReply;
                multipart = parts;
                file = parts->findChild<QFile*>();
            }
        }
        return false;
    }
};

QByteArray envelope(const QJsonValue& data) {
    return QJsonDocument(QJsonObject{{QStringLiteral("result"), QJsonObject{{QStringLiteral("data"), data}}}})
        .toJson(QJsonDocument::Compact);
}

QByteArray trpcError(const QString& code, const QString& apiCode, int status) {
    return QJsonDocument(QJsonObject{
                             {QStringLiteral("error"),
                              QJsonObject{{QStringLiteral("message"), QStringLiteral("nope")},
                                          {QStringLiteral("code"), -32004},
                                          {QStringLiteral("data"), QJsonObject{{QStringLiteral("code"), code},
                                                                               {QStringLiteral("httpStatus"), status},
                                                                               {QStringLiteral("apiCode"), apiCode}}}}}})
        .toJson(QJsonDocument::Compact);
}

QJsonObject inputOf(const QUrl& url) {
    const QString raw = QUrlQuery(url).queryItemValue(QStringLiteral("input"), QUrl::FullyDecoded);
    return QJsonDocument::fromJson(raw.toUtf8()).object();
}

QJsonObject assetJson(const QString& id, const QString& type, qint64 size, const QString& proxyStatus,
                      const QString& proxyUrl) {
    QJsonObject a{{QStringLiteral("id"), id},
                  {QStringLiteral("user_id"), QStringLiteral("1")},
                  {QStringLiteral("content_type"), type},
                  {QStringLiteral("size"), static_cast<double>(size)},
                  {QStringLiteral("updated_at"), QStringLiteral("2026-10-24T10:00:00.000Z")},
                  {QStringLiteral("get_url"), QStringLiteral("/api/storage/1/%1.%2").arg(id, type == u"video/mp4" ? u"mp4" : u"wav")}};
    if (!proxyStatus.isEmpty()) {
        a.insert(QStringLiteral("proxy_status"), proxyStatus);
        a.insert(QStringLiteral("proxy_url"), proxyUrl.isEmpty() ? QJsonValue() : QJsonValue(proxyUrl));
    }
    return a;
}

QJsonObject clipJson(const QString& id, const QString& mediaType, double startMs, const QString& assetId) {
    return QJsonObject{{QStringLiteral("id"), id},
                       {QStringLiteral("trackId"), QStringLiteral("t1")},
                       {QStringLiteral("name"), id},
                       {QStringLiteral("startMs"), startMs},
                       {QStringLiteral("durationMs"), 1000},
                       {QStringLiteral("mediaType"), mediaType},
                       {QStringLiteral("sourceType"), QStringLiteral("imported")},
                       {QStringLiteral("status"), QStringLiteral("generated")},
                       {QStringLiteral("locked"), false},
                       {QStringLiteral("versions"), QJsonArray{}},
                       {QStringLiteral("currentAssetId"), assetId}};
}

const QString kReady = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1");
const QString kPending = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2");
const QString kFailed = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3");
const QString kNone = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa4");
const QString kMissing = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5");
const QString kAudio = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa6");

// Proves the nonce with the selected secret and records the methods.
class InstanceServer : public QObject {
public:
    InstanceServer() {
        connect(&m_server, &QTcpServer::newConnection, this, [this]() {
            while (QTcpSocket* s = m_server.nextPendingConnection()) {
                auto buffer = std::make_shared<QByteArray>();
                connect(s, &QTcpSocket::readyRead, s, [this, s, buffer]() {
                    buffer->append(s->readAll());
                    const int end = buffer->indexOf("\r\n\r\n");
                    if (end < 0) return;
                    qint64 length = 0;
                    QByteArray nonce;
                    for (const QByteArray& line : buffer->left(end).split('\n')) {
                        if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toLongLong();
                        if (line.toLower().startsWith("x-nodetool-instance-nonce:")) {
                            nonce = line.mid(line.indexOf(':') + 1).trimmed();
                        }
                    }
                    if (buffer->size() < end + 4 + length) return;
                    const QByteArray method = buffer->left(buffer->indexOf(' '));
                    buffer->remove(0, end + 4 + length);
                    methods << method;
                    const QByteArray instance = method == "POST" ? postInstance : getInstance;
                    const QByteArray body = envelope(QJsonObject{{QStringLiteral("updatedAt"), QStringLiteral("u1")}});
                    QByteArray out = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " +
                                     QByteArray::number(body.size()) + "\r\n";
                    if (!instance.isEmpty() && !nonce.isEmpty()) {
                        out += "x-nodetool-instance-proof: " +
                            QMessageAuthenticationCode::hash(nonce, instance, QCryptographicHash::Sha256).toHex() + "\r\n";
                    }
                    s->write(out + "\r\n" + body);
                });
                connect(s, &QTcpSocket::disconnected, s, &QObject::deleteLater);
            }
        });
        m_server.listen(QHostAddress::LocalHost, 0);
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(m_server.serverPort())); }
    int count(const QByteArray& method) const { return static_cast<int>(methods.count(method)); }

    QByteArray getInstance;
    QByteArray postInstance;
    QList<QByteArray> methods;

private:
    QTcpServer m_server;
};

QJsonObject saveInput() {
    return QJsonObject{{QStringLiteral("id"), QStringLiteral("seq")}, {QStringLiteral("baseUpdatedAt"), QStringLiteral("u0")}};
}

}  // namespace

class TestServerClient : public QObject {
    Q_OBJECT

private slots:
    void createFolderJson_data() {
        QTest::addColumn<bool>("proveInstance");
        QTest::newRow("authenticated") << false;
        QTest::newRow("pinned-instance") << true;
    }
    void createFolderJson() {
        QFETCH(bool, proveInstance);
        TestHttpServer http;
        QVERIFY(http.base().port() != 7777);
        const QByteArray secret("library-instance");
        http.setInstanceSecret(secret);
        http.setFile("/ready", ServedFile("{}"));
        const QJsonObject fields{{"name", "References"}, {"content_type", "folder"}, {"parent_id", "legacy-home"}};
        auto asset = fields;
        asset.insert("id", "0123456789abcdef0123456789abcdef");
        http.setPost([&](const QByteArray& path, const QByteArray& body) {
            if (path != "/api/assets" || QJsonDocument::fromJson(body).object() != fields) { return QByteArray("{}"); }
            return QJsonDocument(asset).toJson(QJsonDocument::Compact);
        });
        ServerClient client(http.base(), "library-token");
        if (proveInstance) { client.setExpectedInstance(QString::fromUtf8(secret)); }
        const auto result = client.createAsset(fields);
        QVERIFY2(result.ok(), qPrintable(result.describe()));
        QCOMPARE(result.data.toObject(), asset);
        QCOMPARE(http.countRequests("POST", "/api/assets"), 1);
        const auto request = http.requests().back();
        QCOMPARE(request.headers.value("content-type"), QByteArray("application/json"));
        QCOMPARE(request.headers.value("authorization"), QByteArray("Bearer library-token"));
        QCOMPARE(QJsonDocument::fromJson(request.body).object(), fields);
    }
    void createFolderRefusesUnprovedServer() {
        TestHttpServer http;
        ServerClient client(http.base());
        client.setExpectedInstance("expected-library-instance");
        QCOMPARE(client.createAsset({{"name", "Private folder"}, {"content_type", "folder"}, {"parent_id", ""}}).error.code,
                 QString("WRONG_SERVER"));
        QCOMPARE(http.countRequests("POST", "/api/assets"), 0);
    }

    void uploadMultipartAndReadBack_data() {
        QTest::addColumn<bool>("expected");
        QTest::newRow("direct") << false;
        QTest::newRow("expected-instance") << true;
    }
    void uploadMultipartAndReadBack() {
        QFETCH(bool, expected);
        TestHttpServer http;
        QTemporaryDir dir;
        const QString path = dir.filePath("sample.wav");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        const QByteArray bytes("RIFF\0test\r\n", 11);
        QCOMPARE(file.write(bytes), bytes.size());
        file.close();
        const QJsonObject asset{{"id", kReady}, {"name", "sample.wav"}, {"content_type", "audio/wav"}};
        http.setPost([&](const QByteArray&, const QByteArray&) {
            return QJsonDocument(asset).toJson(QJsonDocument::Compact);
        });
        http.setJson([&](const QByteArray&, const QUrl&) { return envelope(asset); });
        ServerClient client(http.base(), "secret");
        if (expected) {
            http.setFile("/ready", ServedFile("{}"));
            http.setInstanceSecret("mine");
            client.setExpectedInstance("mine");
        }
        const auto result = client.upload(asset, path, "audio/wav");
        QVERIFY2(result.ok(), qPrintable(result.describe()));
        QCOMPARE(result.data.toObject(), asset);
        QCOMPARE(client.getAsset(result.data.toObject().value("id").toString()).data.toObject(), asset);
        const auto request = http.requests().at(expected ? 1 : 0);
        QCOMPARE(request.method, QByteArray("POST"));
        QCOMPARE(request.target, QByteArray("/api/assets"));
        QVERIFY(!request.headers.contains("origin"));
        QCOMPARE(request.headers.value("x-nodetool-client"), QByteArray(kClientHeader));
        QCOMPARE(request.headers.value("authorization"), QByteArray("Bearer secret"));
        const auto contentType = request.headers.value("content-type");
        QVERIFY(contentType.startsWith("multipart/form-data; boundary="));
        auto boundary = contentType.mid(contentType.indexOf("boundary=") + 9);
        if (boundary.startsWith('"')) {
            boundary = boundary.mid(1, boundary.size() - 2);
        }
        QVERIFY(request.body.startsWith("--" + boundary + "\r\n"));
        QVERIFY(request.body.endsWith("--" + boundary + "--\r\n"));
        QVERIFY(request.body.toLower().contains("content-disposition: form-data; name=\"json\"\r\n"));
        QVERIFY(request.body.contains(QJsonDocument(asset).toJson(QJsonDocument::Compact)));
        QVERIFY(request.body.contains("name=\"file\"; filename=\"sample.wav\""));
        QVERIFY(request.body.toLower().contains("content-type: audio/wav\r\n"));
        QVERIFY(request.body.contains(bytes));
        QVERIFY(!request.body.contains(dir.path().toUtf8()));
    }

    void uploadRefusesMissingInstanceBeforeBody() {
        TestHttpServer http;
        http.setFile("/ready", ServedFile("{}"));
        QTemporaryDir dir;
        QFile file(dir.filePath("sample.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("RIFF");
        file.close();
        ServerClient client(http.base());
        client.setExpectedInstance("mine");
        const auto result = client.upload({}, file.fileName(), "audio/wav");
        QCOMPARE(result.error.code, QString("WRONG_SERVER"));
        QCOMPARE(http.countRequests("GET", "/ready"), 1);
        QCOMPARE(http.countRequests("POST", "/"), 0);
        QCOMPARE(http.requests().size(), size_t(1));
        QVERIFY(http.requests().front().body.isEmpty());
    }

    void uploadRejectsRedirectsAndChangedInstance() {
        TestHttpServer http;
        TestHttpServer other;
        QTemporaryDir dir;
        QFile file(dir.filePath("sample.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("RIFF");
        file.close();
        ServedFile redirect;
        redirect.redirectTo = other.base().toEncoded() + "/api/assets";
        http.setFile("/api/assets", redirect);
        ServerClient client(http.base());
        QCOMPARE(client.upload({}, file.fileName(), "audio/wav").error.code, QString("REDIRECT"));
        QCOMPARE(other.requests().size(), size_t(0));
        http.setFile("/ready", ServedFile("{}"));
        http.file("/ready").extraHeaders.insert("X-Nodetool-Instance", "mine");
        http.setPost([](const QByteArray&, const QByteArray&) { return QByteArray("{\"id\":\"asset\"}"); });
        client.setExpectedInstance("mine");
        QCOMPARE(client.upload({}, file.fileName(), "audio/wav").error.code, QString("WRONG_SERVER"));
    }

    void uploadHasAnElapsedDeadline() {
        TestHttpServer http;
        ServedFile slow(QByteArray(32768, ' '));
        slow.chunkDelayMs = 100;
        http.setFile("/api/assets", slow);
        QTemporaryDir dir;
        QFile file(dir.filePath("sample.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("RIFF");
        file.close();
        ServerClient client(http.base());
        client.setDeadlineMs(20);
        const auto result = client.upload({}, file.fileName(), "audio/wav");
        QCOMPARE(result.error.code, QString("TIMEOUT"));
    }

    void uploadDevicesLiveUntilReplyDeletion_data() {
        QTest::addColumn<bool>("abort");
        QTest::newRow("finished") << false;
        QTest::newRow("deadline-abort") << true;
    }

    void uploadDevicesLiveUntilReplyDeletion() {
        QFETCH(bool, abort);
        TestHttpServer http;
        ServedFile response(abort ? QByteArray(32768, ' ') : QByteArray("{\"id\":\"asset\"}"));
        response.chunkDelayMs = abort ? 100 : 0;
        http.setFile("/api/assets", response);
        QTemporaryDir dir;
        QFile file(dir.filePath("sample.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("RIFF");
        file.close();
        ServerClient client(http.base());
        if (abort) {
            client.setDeadlineMs(20);
        }
        UploadLifetimeProbe lifetime;
        const auto result = client.upload({}, file.fileName(), "audio/wav");
        if (abort) {
            QCOMPARE(result.error.code, QString("TIMEOUT"));
        } else {
            QVERIFY2(result.ok(), qPrintable(result.describe()));
        }
        QVERIFY(lifetime.reply);
        QVERIFY(lifetime.multipart);
        QVERIFY(lifetime.file);
        QCOMPARE(lifetime.multipart->parent(), lifetime.reply.data());
        QCOMPARE(lifetime.file->parent(), lifetime.multipart.data());
        QVERIFY(lifetime.file->isOpen());
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        QVERIFY(lifetime.reply.isNull());
        QVERIFY(lifetime.multipart.isNull());
        QVERIFY(lifetime.file.isNull());
    }

    void uploadCliUsesRegistryAndReadsTheAsset() {
        TestHttpServer http;
        http.setFile("/ready", ServedFile("{}"));
        http.setInstanceSecret("mine");
        const QJsonObject asset{{"id", kReady}, {"name", "sample.wav"}, {"content_type", "audio/wav"}};
        http.setPost([&](const QByteArray&, const QByteArray&) { return QJsonDocument(asset).toJson(QJsonDocument::Compact); });
        QJsonObject seen;
        QByteArray getPath;
        http.setJson([&](const QByteArray& path, const QUrl& url) { seen = inputOf(url); getPath = path; return envelope(asset); });
        QTemporaryDir dir;
        QFile file(dir.filePath("sample.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("RIFF");
        file.close();
        const auto binary = QStandardPaths::findExecutable("nodetool-timeline", {QCoreApplication::applicationDirPath()});
        QVERIFY(!binary.isEmpty());
        QProcess child;
        auto environment = QProcessEnvironment::systemEnvironment();
        environment.insert("QT_QPA_PLATFORM", "offscreen");
        environment.insert("NODETOOL_TIMELINE_EXPECT_INSTANCE", "mine");
        child.setProcessEnvironment(environment);
        child.start(binary, {"--upload-asset", "--server", http.base().toString(), "--file", file.fileName(), "--content-type", "audio/wav"});
        QVERIFY(child.waitForStarted());
        QTRY_VERIFY_WITH_TIMEOUT(child.state() == QProcess::NotRunning, 10000);
        QCOMPARE(child.exitStatus(), QProcess::NormalExit);
        const auto errors = child.readAllStandardError();
        QVERIFY2(child.exitCode() == 0, errors.constData());
        const auto result = QJsonDocument::fromJson(child.readAllStandardOutput()).object();
        QCOMPARE(result, (QJsonObject{{"uploaded", asset}, {"get", asset}}));
        QCOMPARE(getPath, QByteArray("/trpc/assets.get"));
        QCOMPARE(seen.value("id").toString(), kReady);
        QCOMPARE(http.countRequests("GET", "/ready"), 1);
        QCOMPARE(http.countRequests("POST", "/api/assets"), 1);
    }

    void parsesResultEnvelope() {
        HttpResponse r;
        r.status = 200;
        r.body = envelope(QJsonObject{{QStringLiteral("id"), QStringLiteral("x")}});
        const QueryResult q = parseTrpcResponse(r);
        QVERIFY(q.ok());
        QCOMPARE(q.data.toObject().value(u"id").toString(), QStringLiteral("x"));
    }

    void parsesErrorCodes() {
        HttpResponse r;
        r.status = 409;
        r.body = trpcError(QStringLiteral("CONFLICT"), QStringLiteral("ALREADY_EXISTS"), 409);
        const QueryResult q = parseTrpcResponse(r);
        QVERIFY(!q.ok());
        QCOMPARE(q.error.code, QStringLiteral("CONFLICT"));
        QCOMPARE(q.error.apiCode, QStringLiteral("ALREADY_EXISTS"));
        QCOMPARE(q.error.httpStatus, 409);
    }

    void rejectsNonTrpcBodies() {
        HttpResponse r;
        r.status = 502;
        r.body = "<html>bad gateway</html>";
        QVERIFY(!parseTrpcResponse(r).ok());
        r.body = "{\"something\":1}";
        QVERIFY(!parseTrpcResponse(r).ok());
    }

    void sendsInputHeadersAndNoOrigin() {
        TestHttpServer http;
        QJsonObject seen;
        http.setJson([&](const QByteArray& path, const QUrl& url) {
            seen = inputOf(url);
            seen.insert(QStringLiteral("_path"), QString::fromLatin1(path));
            return envelope(QJsonObject{});
        });
        ServerClient anon(http.base());
        // Characters that a plain query string would break.
        QVERIFY(anon.query(QStringLiteral("timeline.get"), {{QStringLiteral("id"), QStringLiteral("a&b+c#d é")}}).ok());
        QCOMPARE(seen.value(u"id").toString(), QStringLiteral("a&b+c#d é"));
        QCOMPARE(seen.value(u"_path").toString(), QStringLiteral("/trpc/timeline.get"));
        const RecordedRequest r = http.requests().back();
        QCOMPARE(r.method, QByteArray("GET"));
        QVERIFY2(!r.headers.contains("origin"), "a loopback request must not carry Origin (D32)");
        QVERIFY(!r.headers.contains("authorization"));
        QCOMPARE(r.headers.value("x-nodetool-client"), QByteArray(kClientHeader));
        QCOMPARE(anon.userKey(), QStringLiteral("1"));

        ServerClient withToken(http.base(), QStringLiteral("secret"));
        QVERIFY(withToken.listTimelines().ok());
        QCOMPARE(http.requests().back().headers.value("authorization"), QByteArray("Bearer secret"));
        QVERIFY(withToken.userKey().startsWith(QStringLiteral("token-")));
        QVERIFY(!withToken.userKey().contains(QStringLiteral("secret")));
    }

    // ── m5b F4: a write goes only to the expected server instance ──

    void mutateWithoutAnExpectationSendsDirectly() {
        InstanceServer http;
        ServerClient client(http.base());
        QVERIFY(client.mutate(QStringLiteral("timeline.update"), saveInput()).ok());
        QCOMPARE(http.count("POST"), 1);
        QCOMPARE(http.count("GET"), 0);
    }

    void mutateRefusesAnotherInstance() {
        InstanceServer http;
        http.getInstance = "someone-else";
        http.postInstance = "someone-else";
        ServerClient client(http.base());
        client.setExpectedInstance(QStringLiteral("mine"));
        const QueryResult r = client.mutate(QStringLiteral("timeline.update"), saveInput());
        QVERIFY(!r.ok());
        QCOMPARE(r.error.code, QStringLiteral("WRONG_SERVER"));
        QCOMPARE(http.count("POST"), 0);
        QCOMPARE(http.count("GET"), 1);
    }

    void mutateRefusesAServerWithoutAnInstance() {
        InstanceServer http;
        ServerClient client(http.base());
        client.setExpectedInstance(QStringLiteral("mine"));
        QCOMPARE(client.mutate(QStringLiteral("timeline.update"), saveInput()).error.code, QStringLiteral("WRONG_SERVER"));
        QCOMPARE(http.count("POST"), 0);
    }

    void mutateWritesToTheExpectedInstance() {
        InstanceServer http;
        http.getInstance = "mine";
        http.postInstance = "mine";
        ServerClient client(http.base());
        client.setExpectedInstance(QStringLiteral("mine"));
        const QueryResult r = client.mutate(QStringLiteral("timeline.update"), saveInput());
        QVERIFY2(r.ok(), qPrintable(r.describe()));
        QCOMPARE(r.data.toObject().value(u"updatedAt").toString(), QStringLiteral("u1"));
        QCOMPARE(http.methods, (QList<QByteArray>{"GET", "POST"}));
    }

    void mutateTrustsTheProvenConnection() {
        InstanceServer http;
        http.getInstance = "mine";
        http.postInstance = "someone-else";
        ServerClient client(http.base());
        client.setExpectedInstance(QStringLiteral("mine"));
        const QueryResult r = client.mutate(QStringLiteral("timeline.update"), saveInput());
        QVERIFY2(r.ok(), qPrintable(r.describe()));
        QCOMPARE(http.methods, (QList<QByteArray>{"GET", "POST"}));
    }

    // Codex review F5: the cache folder must tell apart servers whose
    // readable names share a long prefix.
    void serverKeyHashesTheWholeOrigin() {
        const QString longHost = QStringLiteral("media-server-with-a-very-long-name-that-goes-on-and-on.example.internal");
        ServerClient a(QUrl(QStringLiteral("http://%1:7001").arg(longHost)));
        ServerClient b(QUrl(QStringLiteral("http://%1:7002").arg(longHost)));
        ServerClient c(QUrl(QStringLiteral("https://%1:7001").arg(longHost)));
        QVERIFY(a.serverKey() != b.serverKey());
        QVERIFY(a.serverKey() != c.serverKey());
        QVERIFY(safePathPart(a.serverKey()) != safePathPart(b.serverKey()));
        QVERIFY(safePathPart(a.serverKey()).size() <= 64);
    }

    void auditListsOnlyUnsupportedFields() {
        QJsonObject clip = clipJson(QStringLiteral("c1"), QStringLiteral("video"), 0, kReady);
        // Every supported field set: nothing to report.
        clip.insert(QStringLiteral("opacity"), 0.5);
        clip.insert(QStringLiteral("fadeInMs"), 100);
        clip.insert(QStringLiteral("blendMode"), QStringLiteral("normal"));
        clip.insert(QStringLiteral("transform"),
                    QJsonObject{{QStringLiteral("position"), QJsonObject{{QStringLiteral("x"), 1}, {QStringLiteral("y"), 2}}},
                                {QStringLiteral("scale"), QJsonObject{{QStringLiteral("x"), 1}, {QStringLiteral("y"), 1}}},
                                {QStringLiteral("rotation"), 0.1},
                                {QStringLiteral("anchor"), QJsonObject{{QStringLiteral("x"), 0.5}, {QStringLiteral("y"), 0.5}}},
                                {QStringLiteral("depthPx"), 0}});
        clip.insert(QStringLiteral("transitionIn"),
                    QJsonObject{{QStringLiteral("type"), QStringLiteral("crossfade")}, {QStringLiteral("durationMs"), 300}});
        clip.insert(QStringLiteral("effects"), QJsonArray{});  // empty: no effect
        clip.insert(QStringLiteral("prompt"), QStringLiteral("a dog"));  // generation metadata
        QJsonObject seq{{QStringLiteral("id"), QStringLiteral("s")},
                        {QStringLiteral("tracks"), QJsonArray{QJsonObject{{QStringLiteral("id"), QStringLiteral("t1")},
                                                                          {QStringLiteral("type"), QStringLiteral("video")},
                                                                          {QStringLiteral("volumeDb"), -3}}}},
                        {QStringLiteral("clips"), QJsonArray{clip}},
                        {QStringLiteral("markers"), QJsonArray{QJsonObject{}}},
                        {QStringLiteral("master"), QJsonObject{{QStringLiteral("volumeDb"), -1}}}};
        QJsonObject audit = auditTimelineFields(seq);
        QCOMPARE(audit.value(u"fields").toObject().size(), 0);

        // Read by SceneEval since M1e: no entry.
        QJsonObject xf = clip.value(u"transform").toObject();
        xf.insert(QStringLiteral("rotationX"), 20);
        clip.insert(QStringLiteral("transform"), xf);
        clip.insert(QStringLiteral("parentId"), QStringLiteral("g"));
        seq.insert(QStringLiteral("camera2d"), QJsonObject{{QStringLiteral("depthPx"), 1}});
        // Follow-path animation is supported in the plan.
        clip.insert(QStringLiteral("animations"),
                    QJsonArray{QJsonObject{{QStringLiteral("id"), QStringLiteral("a")}, {QStringLiteral("role"), QStringLiteral("loop")},
                                           {QStringLiteral("preset"), QStringLiteral("followPath")}, {QStringLiteral("durationMs"), 500}}});
        clip.insert(QStringLiteral("mask"), QJsonObject{{QStringLiteral("x"), 1}});
        clip.insert(QStringLiteral("audioEffects"), QJsonArray{QJsonObject{}});
        clip.insert(QStringLiteral("inventedField"), 3);
        clip.insert(QStringLiteral("blendMode"), QStringLiteral("multiply"));
        // A group that lays its children out with flex, and a grandchild.
        QJsonObject g = clipJson(QStringLiteral("g"), QStringLiteral("group"), 0, QString());
        g.insert(QStringLiteral("layout"), QJsonObject{{QStringLiteral("display"), QStringLiteral("flex")}});
        g.remove(QStringLiteral("currentAssetId"));
        QJsonObject h = clipJson(QStringLiteral("h"), QStringLiteral("group"), 0, QString());
        h.insert(QStringLiteral("parentId"), QStringLiteral("c1"));
        h.remove(QStringLiteral("currentAssetId"));
        seq.insert(QStringLiteral("clips"), QJsonArray{g, clip, h});
        audit = auditTimelineFields(seq);
        const QJsonObject fields = audit.value(u"fields").toObject();
        auto effect = [&](const char* name) { return fields.value(QLatin1String(name)).toObject().value(u"effect").toString(); };
        QVERIFY(!fields.contains(QStringLiteral("clip.animations.preset=followPath")));
        // Flex layout is in the plan (scene/FlexLayout.h): no entry.
        QVERIFY(!fields.contains(QStringLiteral("clip.flexLayout")));
        QVERIFY(!fields.contains(QStringLiteral("clip.layout.flex")));
        QVERIFY(!fields.contains(QStringLiteral("clip.parent")));  // h inherits from c1
        QCOMPARE(effect("clip.mask"), QStringLiteral("pixels"));
        QCOMPARE(effect("clip.blendMode=multiply"), QStringLiteral("pixels"));
        QCOMPARE(effect("clip.audioEffects"), QStringLiteral("audio"));
        QCOMPARE(effect("clip.inventedField"), QStringLiteral("unknown"));
        QVERIFY(!fields.contains(QStringLiteral("clip.transform.rotationX")));
        QVERIFY(!fields.contains(QStringLiteral("sequence.camera2d")));
        QCOMPARE(fields.size(), 4);
        QVERIFY(audit.value(u"planUnsupported").toArray().isEmpty());
        QCOMPARE(audit.value(u"tracks").toArray().size(), 0);
    }

    // A text clip whose animations change its text moves its flex tree every
    // frame. The layout reads the animated style (scene/TextAnimation.h), so
    // the audit puts no clip of the tree out of the plan. The animated layout
    // itself is tested in tst_flexlayout (kFlexDoc's ticker).
    void auditKeepsFlexTreesWithAnimatedText() {
        const auto group = [](const char* id, const char* parent, bool flex) {
            QJsonObject g = clipJson(QLatin1String(id), QStringLiteral("group"), 0, QString());
            g.remove(QStringLiteral("currentAssetId"));
            if (parent) g.insert(QStringLiteral("parentId"), QLatin1String(parent));
            if (flex) g.insert(QStringLiteral("layout"), QJsonObject{{QStringLiteral("display"), QStringLiteral("flex")}});
            return g;
        };
        const auto text = [](const char* id, const char* parent, bool animated) {
            QJsonObject t = clipJson(QLatin1String(id), QStringLiteral("text"), 0, QString());
            t.remove(QStringLiteral("currentAssetId"));
            t.insert(QStringLiteral("parentId"), QLatin1String(parent));
            t.insert(QStringLiteral("textStyle"), QJsonObject{{QStringLiteral("text"), QStringLiteral("12")}, {QStringLiteral("fontSizePx"), 40}});
            QJsonObject a{{QStringLiteral("id"), QStringLiteral("a")}, {QStringLiteral("role"), QStringLiteral("in")},
                          {QStringLiteral("durationMs"), 500}};
            if (animated) a.insert(QStringLiteral("textAnimator"), QJsonObject{{QStringLiteral("kind"), QStringLiteral("ticker")},
                                                                               {QStringLiteral("from"), 0}, {QStringLiteral("to"), 12}});
            t.insert(QStringLiteral("animations"), QJsonArray{a});
            return t;
        };
        // Root r (flex) > nested n (flex) > plain group p > animated text t1;
        // r > static text t2. A second root s has only a static text t3.
        QJsonObject seq{{QStringLiteral("id"), QStringLiteral("s")}};
        seq.insert(QStringLiteral("clips"), QJsonArray{group("r", nullptr, true), group("n", "r", true), group("p", "n", false),
                                                       text("t1", "p", true), text("t2", "r", false), group("s", nullptr, true),
                                                       text("t3", "s", false)});
        const QJsonObject audit = auditTimelineFields(seq);
        // The whole report is there: a missing key must not pass as empty.
        for (const char* key : {"planUnsupported", "sequence", "tracks", "clips", "fields"}) {
            QVERIFY2(audit.value(QLatin1String(key)).isArray() || audit.value(QLatin1String(key)).isObject(), key);
        }
        QCOMPARE(audit.value(u"planUnsupported").toArray(), QJsonArray{});
        // The audit saw t1's animated text: drawn (pixels), not a plan gap.
        const QJsonObject fields = audit.value(u"fields").toObject();
        QVERIFY2(fields.contains(QStringLiteral("clip.animations.styleTracks")),
                 QJsonDocument(fields).toJson(QJsonDocument::Compact).constData());
        QCOMPARE(fields.value(u"clip.animations.styleTracks").toObject(),
                 (QJsonObject{{QStringLiteral("effect"), QStringLiteral("pixels")}, {QStringLiteral("count"), 1}}));
        // No plan entry, no flex field (`layout`, `flexItem`), nothing inherited.
        for (auto it = fields.begin(); it != fields.end(); ++it) {
            QVERIFY2(it.value().toObject().value(u"effect").toString() != u"plan", qPrintable(it.key()));
            for (const char* prefix : {"clip.layout", "clip.flexItem", "clip.parent"}) {
                QVERIFY2(!it.key().startsWith(QLatin1String(prefix)), qPrintable(it.key()));
            }
        }
        // Only text clips have entries (text is drawn as pixels); no group does.
        const QJsonArray clips = audit.value(u"clips").toArray();
        QStringList ids;
        for (const QJsonValue& c : clips) ids << c.toObject().value(u"id").toString();
        QVERIFY2(ids.contains(QStringLiteral("t1")), qPrintable(ids.join(u',')));
        for (const QString& id : ids) QVERIFY2(id.startsWith(u't'), qPrintable(id));
    }

    // Codex review F2 (M1e): what a group surface does not draw is reported.
    void auditReportsFlattenedGroupSurfaces() {
        QJsonObject g = clipJson(QStringLiteral("g"), QStringLiteral("group"), 0, QString());
        g.remove(QStringLiteral("currentAssetId"));
        g.insert(QStringLiteral("blendMode"), QStringLiteral("multiply"));
        g.insert(QStringLiteral("opacity"), 0.5);
        g.insert(QStringLiteral("transitionIn"), QJsonObject{{QStringLiteral("type"), QStringLiteral("wipe")},
                                                             {QStringLiteral("durationMs"), 300},
                                                             {QStringLiteral("direction"), QStringLiteral("up")}});
        QJsonObject a = clipJson(QStringLiteral("a"), QStringLiteral("video"), 0, kReady);
        a.insert(QStringLiteral("parentId"), QStringLiteral("g"));
        a.insert(QStringLiteral("trackId"), QStringLiteral("t2"));
        QJsonObject b = a;
        b.insert(QStringLiteral("id"), QStringLiteral("b"));
        QJsonObject plain = clipJson(QStringLiteral("plain"), QStringLiteral("group"), 2000, QString());
        plain.remove(QStringLiteral("currentAssetId"));
        // A cut the surface draws (offset, scale, opacity) is not reported.
        plain.insert(QStringLiteral("transitionIn"), QJsonObject{{QStringLiteral("type"), QStringLiteral("push")},
                                                                 {QStringLiteral("durationMs"), 300},
                                                                 {QStringLiteral("direction"), QStringLiteral("left")}});
        const QJsonObject seq{{QStringLiteral("id"), QStringLiteral("s")}, {QStringLiteral("clips"), QJsonArray{g, a, b, plain}}};
        const QJsonObject fields = auditTimelineFields(seq).value(u"fields").toObject();
        for (const char* name : {"clip.precomposite.blendMode", "clip.precomposite.cut=wipe", "clip.transitionIn.type=wipe"}) {
            QVERIFY2(fields.value(QLatin1String(name)).toObject().value(u"effect").toString() == u"pixels", name);
        }
        QCOMPARE(fields.value(u"clip.precomposite.blendMode").toObject().value(u"count").toInt(), 1);  // not `plain`
        // Drawn by the surface (D35): opacity over overlapping children, stacking.
        QVERIFY(!fields.contains(QStringLiteral("clip.precomposite.opacityOverlap")));
        QVERIFY(!fields.contains(QStringLiteral("clip.precomposite.stacking")));
        QVERIFY(!fields.contains(QStringLiteral("clip.precomposite.cut=push")));
        QVERIFY(!fields.contains(QStringLiteral("clip.transitionIn.type=push")));
    }

    void proxyOrOriginal() {
        ServerClient client(QUrl(QStringLiteral("http://127.0.0.1:1")));
        QString why;
        const auto ready = proxyFile(client, assetJson(kReady, QStringLiteral("video/mp4"), 10, QStringLiteral("ready"),
                                                       QStringLiteral("/api/storage/1/x_proxy.webm?v=abc123")), &why);
        QVERIFY(ready);
        QCOMPARE(ready->version, QStringLiteral("abc123"));
        QCOMPARE(ready->ext, QStringLiteral("webm"));
        QCOMPARE(ready->expectedSize, qint64(-1));
        QVERIFY(!proxyFile(client, assetJson(kReady, QStringLiteral("video/mp4"), 10, QStringLiteral("running"), {}), &why));
        QCOMPARE(why, QStringLiteral("proxy pending (running)"));
        QVERIFY(!proxyFile(client, assetJson(kReady, QStringLiteral("video/mp4"), 10, QStringLiteral("failed"), {}), &why));
        QCOMPARE(why, QStringLiteral("proxy failed"));
        QVERIFY(!proxyFile(client, assetJson(kReady, QStringLiteral("video/mp4"), 10, QStringLiteral("none"), {}), &why));
        QVERIFY(!proxyFile(client, assetJson(kReady, QStringLiteral("video/mp4"), 10, QString(), {}), &why));
        QCOMPARE(why, QStringLiteral("no proxy on this server"));
        QVERIFY(!proxyFile(client, assetJson(kReady, QStringLiteral("video/mp4"), 10, QStringLiteral("ready"),
                                             QStringLiteral("/api/storage/1/x_proxy.mp4")), &why));
        QCOMPARE(why, QStringLiteral("proxy_url has no ?v= version"));
    }

    void originalVersionFollowsApiFields() {
        QJsonObject a = assetJson(kReady, QStringLiteral("video/mp4"), 10, {}, {});
        const QString v = originalVersion(a);
        QCOMPARE(originalVersion(a), v);
        a.insert(QStringLiteral("size"), 11);
        QVERIFY(originalVersion(a) != v);
        a = assetJson(kReady, QStringLiteral("video/mp4"), 10, {}, {});
        a.insert(QStringLiteral("updated_at"), QStringLiteral("2026-10-25T00:00:00.000Z"));
        QVERIFY(originalVersion(a) != v);
        a = assetJson(kReady, QStringLiteral("video/mp4"), 10, {}, {});
        a.insert(QStringLiteral("content_type"), QStringLiteral("video/webm"));
        QVERIFY(originalVersion(a) != v);
        // Other fields, such as the name, do not change the version.
        a = assetJson(kReady, QStringLiteral("video/mp4"), 10, {}, {});
        a.insert(QStringLiteral("name"), QStringLiteral("renamed"));
        QCOMPARE(originalVersion(a), v);
    }

    void matteReferenceMatchesServerParser() {
        const QString full = "cccccccccccccccccccccccccccccccc";
        QCOMPARE(assetIdForReference(full), full);
        QCOMPARE(assetIdForReference("asset://" + full), full);
        QVERIFY(assetIdForReference(full.left(12)).isEmpty());
        QVERIFY(assetIdForReference("asset://" + full.left(12)).isEmpty());
    }
    void opensATimelineFromTheServer_data() {
        QTest::addColumn<QString>("matteReference");
        QTest::addColumn<bool>("resolves");
        const QString full = "cccccccccccccccccccccccccccccccc";
        QTest::newRow("full") << full << true;
        QTest::newRow("asset-uri") << "asset://" + full << true;
        QTest::newRow("prefix") << full.left(12) << false;
        QTest::newRow("asset-uri-prefix") << "asset://" + full.left(12) << false;
        QTest::newRow("missing") << QString("dddddddddddddddddddddddddddddddd") << false;
        QTest::newRow("ambiguous") << QString("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") << false;
    }
    void opensATimelineFromTheServer() {
        QFETCH(QString, matteReference);
        QFETCH(bool, resolves);
        const QString kMatte = QStringLiteral("cccccccccccccccccccccccccccccccc");
        TestHttpServer http;
        const QByteArray original(3000, 'o');
        const QByteArray proxy(1000, 'p');
        for (const QString& id : {kReady, kPending, kFailed, kNone}) {
            http.setFile(QStringLiteral("/api/storage/1/%1.mp4").arg(id).toLatin1(), ServedFile{original});
        }
        http.setFile(QStringLiteral("/api/storage/1/%1.mp4").arg(kMatte).toLatin1(), ServedFile{original});
        http.setFile(QStringLiteral("/api/storage/1/%1.wav").arg(kAudio).toLatin1(), ServedFile{original});
        http.setFile(QStringLiteral("/api/storage/1/%1_proxy.mp4").arg(kReady).toLatin1(), ServedFile{proxy});
        ServedFile pkg{QByteArray(500, 'k')};
        pkg.extraHeaders.insert("ETag", "\"pkg-1\"");
        http.setFile("/api/assets/packages/nodetool-base/timelines/demo/still%20one.jpg", pkg);

        QJsonArray clips{clipJson(QStringLiteral("ready"), QStringLiteral("video"), 0, kReady),
                         clipJson(QStringLiteral("pending"), QStringLiteral("video"), 1000, kPending),
                         clipJson(QStringLiteral("failed"), QStringLiteral("video"), 2000, kFailed),
                         clipJson(QStringLiteral("none"), QStringLiteral("video"), 3000, kNone),
                         clipJson(QStringLiteral("missing"), QStringLiteral("video"), 4000, kMissing),
                         clipJson(QStringLiteral("pkg"), QStringLiteral("image"), 5000,
                                  QStringLiteral("package://nodetool-base/timelines/demo/still one.jpg")),
                         clipJson(QStringLiteral("music"), QStringLiteral("audio"), 0, kAudio),
                         clipJson(QStringLiteral("again"), QStringLiteral("video"), 6000, kReady)};
        auto readyClip = clips[0].toObject();
        const QJsonObject matte{{"assetId", matteReference}, {"status", "ready"}, {"strength", 0.4},
                                {"invert", true}, {"featherPx", 12}, {"unknown", "preserve"}};
        readyClip.insert("generatedMatte", matte);
        clips[0] = readyClip;
        QJsonObject text = clipJson(QStringLiteral("title"), QStringLiteral("text"), 0, QString());
        text.remove(QStringLiteral("currentAssetId"));
        clips.append(text);
        const QJsonObject doc{{QStringLiteral("id"), QStringLiteral("seq1")},
                              {QStringLiteral("projectId"), QStringLiteral("p")},
                              {QStringLiteral("name"), QStringLiteral("Seq")},
                              {QStringLiteral("fps"), 30},
                              {QStringLiteral("width"), 1920},
                              {QStringLiteral("height"), 1080},
                              {QStringLiteral("durationMs"), 7000},
                              {QStringLiteral("tracks"), QJsonArray{QJsonObject{{QStringLiteral("id"), QStringLiteral("t1")},
                                                                                {QStringLiteral("name"), QStringLiteral("V")},
                                                                                {QStringLiteral("type"), QStringLiteral("video")},
                                                                                {QStringLiteral("index"), 0},
                                                                                {QStringLiteral("visible"), true},
                                                                                {QStringLiteral("locked"), false}}}},
                              {QStringLiteral("clips"), clips},
                              {QStringLiteral("markers"), QJsonArray{}},
                              {QStringLiteral("createdAt"), QStringLiteral("x")},
                              {QStringLiteral("updatedAt"), QStringLiteral("y")}};
        http.setJson([&](const QByteArray& path, const QUrl& url) -> QByteArray {
            const QString id = inputOf(url).value(u"id").toString();
            if (path == "/trpc/timeline.get") {
                return id == u"seq1" ? envelope(doc) : trpcError(QStringLiteral("NOT_FOUND"), QStringLiteral("NOT_FOUND"), 404);
            }
            if (path == "/trpc/assets.get") {
                if (id == kReady) {
                    return envelope(assetJson(id, QStringLiteral("video/mp4"), original.size(), QStringLiteral("ready"),
                                              QStringLiteral("/api/storage/1/%1_proxy.mp4?v=p1").arg(id)));
                }
                if (id == kMatte) return envelope(assetJson(id, QStringLiteral("video/mp4"), original.size(), {}, {}));
                if (id == kPending) return envelope(assetJson(id, QStringLiteral("video/mp4"), original.size(), QStringLiteral("queued"), {}));
                if (id == kFailed) return envelope(assetJson(id, QStringLiteral("video/mp4"), original.size(), QStringLiteral("failed"), {}));
                if (id == kNone) return envelope(assetJson(id, QStringLiteral("video/mp4"), original.size(), QStringLiteral("none"), {}));
                if (id == kAudio) return envelope(assetJson(id, QStringLiteral("audio/wav"), original.size(), {}, {}));
                if (id == QString(32, QLatin1Char('e'))) return trpcError(QStringLiteral("FORBIDDEN"), QStringLiteral("FORBIDDEN"), 403);
            }
            return trpcError(QStringLiteral("NOT_FOUND"), QStringLiteral("NOT_FOUND"), 404);
        });

        QTemporaryDir dir(QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX"));
        ServerOpenOptions options;
        options.server = http.base();
        options.timelineId = QStringLiteral("seq1");
        options.cacheRoot = dir.path();
        const ServerOpenResult r = openServerTimeline(options);
        QVERIFY2(r.timeline, qPrintable(r.error));
        auto clip = [&](const char* id) -> const nt::Clip& {
            for (const nt::Clip& c : r.timeline->clips) {
                if (c.id == id) return c;
            }
            static nt::Clip none;
            return none;
        };
        auto variantOf = [](const std::string& path) { return QFileInfo(QFileInfo(QString::fromStdString(path)).absolutePath()).fileName(); };
        QCOMPARE(variantOf(clip("ready").mediaPath), QStringLiteral("proxy"));
        QCOMPARE(variantOf(clip("ready").audioPath), QStringLiteral("original"));  // a proxy has no audio
        if (resolves) {
            QVERIFY(QFileInfo::exists(QString::fromStdString(clip("ready").generatedMattePath)));
            QCOMPARE(variantOf(clip("ready").generatedMattePath), QStringLiteral("original"));
        } else {
            QVERIFY(clip("ready").generatedMattePath.empty());
        }
        QCOMPARE(clip("ready").raw.value("generatedMatte").toObject(), matte);
        QCOMPARE(variantOf(clip("pending").mediaPath), QStringLiteral("original"));
        QCOMPARE(variantOf(clip("failed").mediaPath), QStringLiteral("original"));
        QCOMPARE(variantOf(clip("none").mediaPath), QStringLiteral("original"));
        QCOMPARE(variantOf(clip("pkg").mediaPath), QStringLiteral("package"));
        QCOMPARE(variantOf(clip("music").audioPath), QStringLiteral("original"));
        QVERIFY(clip("music").mediaPath.empty());
        QCOMPARE(clip("again").mediaPath, clip("ready").mediaPath);
        QVERIFY(!clip("missing").mediaPath.empty());
        QVERIFY(!QFileInfo::exists(QString::fromStdString(clip("missing").mediaPath)));
        QVERIFY(clip("title").mediaPath.empty());
        // Raw JSON per entity is kept (D4).
        QCOMPARE(clip("ready").raw.value(u"currentAssetId").toString(), kReady);

        const QJsonObject report = r.report;
        const QJsonArray missing = report.value(u"missingAssets").toArray();
        QCOMPARE(missing.size(), 1);
        QCOMPARE(missing[0].toObject().value(u"clipId").toString(), QStringLiteral("missing"));
        QVERIFY(missing[0].toObject().value(u"reason").toString().contains(QStringLiteral("NOT_FOUND")));
        // The fake bytes are not media: every picture file is rejected and named.
        QJsonArray rejected = report.value(u"rejectedMedia").toArray();
        QVERIFY(rejected.size() >= 5);
        QStringList pendingReasons;
        for (const QJsonValue& a : report.value(u"assets").toArray()) {
            const QJsonObject o = a.toObject();
            if (o.value(u"assetId").toString() == kPending) pendingReasons << o.value(u"picture").toObject().value(u"reason").toString();
        }
        QCOMPARE(pendingReasons, QStringList{QStringLiteral("proxy pending (queued)")});
        QCOMPARE(report.value(u"fields").toObject().value(u"fields").toObject().value(u"clip.mediaType=text").toObject().value(u"count").toInt(), 1);
        QVERIFY(QFileInfo::exists(report.value(u"rawDocument").toString()));
        // Two files for the ready asset, one for each other: the proxy is fetched once for two clips.
        QCOMPARE(report.value(u"summary").toObject().value(u"downloads").toInt(), resolves ? 8 : 7);
        QCOMPARE(http.countRequests("GET", QStringLiteral("/api/storage/1/%1_proxy.mp4").arg(kReady).toLatin1()), 1);

        // Warm cache: no byte is downloaded again.
        http.clearRequests();
        const ServerOpenResult warm = openServerTimeline(options);
        QVERIFY(warm.timeline);
        QCOMPARE(warm.report.value(u"summary").toObject().value(u"downloads").toInt(), 0);
        QCOMPARE(http.countRequests("GET", "/api/storage/"), 0);
        QCOMPARE(http.countRequests("GET", "/api/assets/packages/"), 0);
    }

    // Credentials go only to the configured server origin (Codex review F2).
    void credentialsStayOnTheServerOrigin() {
        TestHttpServer server;
        TestHttpServer storage;  // another origin, like a signed S3 URL
        server.setFile("/api/storage/1/a.mp4", ServedFile(QByteArray(100, 'a')));
        storage.setFile("/bucket/b.mp4", ServedFile(QByteArray(200, 'b')));
        ServedFile hop;
        hop.redirectTo = storage.base().toString().toLatin1() + "/bucket/b.mp4";
        server.setFile("/api/storage/1/r.mp4", hop);
        ServedFile local;
        local.redirectTo = "/api/storage/1/a.mp4";
        server.setFile("/api/storage/1/same.mp4", local);

        ServerClient client(server.base(), QStringLiteral("secret"));
        QTemporaryDir dir(QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX"));
        AssetCache cache(dir.path(), QStringLiteral("s"), QStringLiteral("u"),
                         [&client](QNetworkRequest& r) { client.decorate(r); });
        auto fetch = [&](const QString& id, const QUrl& url, qint64 size) {
            return cache.fetch(id, QStringLiteral("original"), RemoteFile{url, QStringLiteral("v"), size, QStringLiteral("mp4")});
        };

        FetchResult own = fetch(QStringLiteral("a"), server.base().resolved(QUrl(QStringLiteral("/api/storage/1/a.mp4"))), 100);
        QVERIFY2(own.ok(), qPrintable(own.error));
        QCOMPARE(server.requests().back().headers.value("authorization"), QByteArray("Bearer secret"));

        // An absolute URL on another origin gets no token.
        FetchResult external = fetch(QStringLiteral("b"), storage.base().resolved(QUrl(QStringLiteral("/bucket/b.mp4"))), 200);
        QVERIFY2(external.ok(), qPrintable(external.error));
        QVERIFY2(!storage.requests().back().headers.contains("authorization"), "the token leaked to another origin");
        QVERIFY(!storage.requests().back().headers.contains("x-nodetool-client"));

        // A redirect from the server to another origin drops the token there.
        storage.clearRequests();
        FetchResult hopped = fetch(QStringLiteral("c"), server.base().resolved(QUrl(QStringLiteral("/api/storage/1/r.mp4"))), 200);
        QVERIFY2(hopped.ok(), qPrintable(hopped.error));
        QCOMPARE(storage.requests().size(), size_t(1));
        QVERIFY2(!storage.requests().back().headers.contains("authorization"), "the token followed a redirect off the origin");

        // A redirect inside the origin keeps it.
        server.clearRequests();
        FetchResult same = fetch(QStringLiteral("d"), server.base().resolved(QUrl(QStringLiteral("/api/storage/1/same.mp4"))), 100);
        QVERIFY2(same.ok(), qPrintable(same.error));
        QCOMPARE(server.requests().back().headers.value("authorization"), QByteArray("Bearer secret"));
    }

    void redirectLoopsFail() {
        TestHttpServer server;
        ServedFile loop;
        loop.redirectTo = "/loop.mp4";
        server.setFile("/loop.mp4", loop);
        QTemporaryDir dir(QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX"));
        AssetCache cache(dir.path(), QStringLiteral("s"), QStringLiteral("u"));
        const FetchResult r = cache.fetch(QStringLiteral("a"), QStringLiteral("original"),
                                          RemoteFile{server.base().resolved(QUrl(QStringLiteral("/loop.mp4"))), QStringLiteral("v"), 10, QStringLiteral("mp4")});
        QVERIFY(!r.ok());
        QVERIFY2(r.error.contains(QStringLiteral("redirect")), qPrintable(r.error));
    }

    // Codex review F6: a failed backup write keeps the previous backup and
    // is reported, never claimed.
    void rawBackupFailureKeepsThePreviousOne() {
        TestHttpServer http;
        QJsonObject doc{{QStringLiteral("id"), QStringLiteral("s1")}, {QStringLiteral("projectId"), QStringLiteral("p")},
                        {QStringLiteral("name"), QStringLiteral("n")}, {QStringLiteral("fps"), 30},
                        {QStringLiteral("width"), 64}, {QStringLiteral("height"), 64}, {QStringLiteral("durationMs"), 0},
                        {QStringLiteral("tracks"), QJsonArray{}}, {QStringLiteral("clips"), QJsonArray{}},
                        {QStringLiteral("markers"), QJsonArray{}}, {QStringLiteral("updatedAt"), QStringLiteral("v1")}};
        http.setJson([&](const QByteArray&, const QUrl&) { return envelope(doc); });
        QTemporaryDir dir(QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX"));
        ServerOpenOptions options;
        options.server = http.base();
        options.timelineId = QStringLiteral("s1");
        options.cacheRoot = dir.path();
        const ServerOpenResult first = openServerTimeline(options);
        const QString backup = first.report.value(u"rawDocument").toString();
        QVERIFY(QFileInfo::exists(backup));
        const QByteArray before = [&] { QFile f(backup); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray(); }();
        QVERIFY(before.contains("\"v1\""));

        doc.insert(QStringLiteral("updatedAt"), QStringLiteral("v2"));
        const QString folder = QFileInfo(backup).absolutePath();
        QVERIFY(QFile::setPermissions(folder, QFileDevice::ReadOwner | QFileDevice::ExeOwner));
        const ServerOpenResult second = openServerTimeline(options);
        QFile::setPermissions(folder, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
        QVERIFY(second.timeline);  // a backup failure is not a load error
        QVERIFY2(!second.report.contains(QStringLiteral("rawDocument")), "a failed backup must not be reported as saved");
        QVERIFY(!second.report.value(u"rawDocumentError").toString().isEmpty());
        const QByteArray after = [&] { QFile f(backup); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray(); }();
        QCOMPARE(after, before);
    }

    void loadErrorsFailTheOpen() {
        TestHttpServer http;
        http.setJson([](const QByteArray&, const QUrl&) {
            return trpcError(QStringLiteral("NOT_FOUND"), QStringLiteral("NOT_FOUND"), 404);
        });
        QTemporaryDir dir(QCoreApplication::applicationDirPath() + QStringLiteral("/test-cache-XXXXXX"));
        ServerOpenOptions options;
        options.server = http.base();
        options.timelineId = QStringLiteral("nope");
        options.cacheRoot = dir.path();
        const ServerOpenResult r = openServerTimeline(options);
        QVERIFY(!r.timeline);
        QVERIFY2(r.error.contains(QStringLiteral("NOT_FOUND")), qPrintable(r.error));
        QVERIFY(r.report.contains(QStringLiteral("error")));
    }
};

QTEST_GUILESS_MAIN(TestServerClient)
#include "tst_serverclient.moc"
