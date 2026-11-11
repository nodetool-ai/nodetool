#include "ui/EditorWindow.h"
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QJsonDocument>
#include <QDir>
#include <QCryptographicHash>
#include <QPainter>
#include <QWheelEvent>
#include <QtTest>
using namespace nodetool;
namespace {
class Server final : public QTcpServer {
public:
    bool enabled = false;
    bool required = false;
    bool keySet = false;
    bool reject = false;
    bool delay = false;
    int mutations = 0;
    int metadataReads = 0;
    QList<QPointer<QTcpSocket>> pending;
    Server() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto *socket = nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                    const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
                    socket->setProperty("bytes", bytes);
                    const auto split = bytes.indexOf("\r\n\r\n");
                    if (split < 0 || socket->property("done").toBool()) {
                        return;
                    }
                    int contentLength = 0;
                    for (const auto &line : bytes.left(split).split('\n')) {
                        if (line.toLower().startsWith("content-length:")) {
                            contentLength = line.mid(15).trimmed().toInt();
                        }
                    }
                    if (bytes.size() < split + 4 + contentLength) {
                        return;
                    }
                    socket->setProperty("done", true);
                    if (bytes.toLower().contains("upgrade: websocket")) {
                        QByteArray key;
                        for (const auto &line : bytes.left(split).split('\n')) {
                            if (line.toLower().startsWith("sec-websocket-key:")) {
                                key = line.mid(18).trimmed();
                            }
                        }
                        const auto accept = QCryptographicHash::hash(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", QCryptographicHash::Sha1).toBase64();
                        socket->write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
                        return;
                    }
                    const auto route = bytes.split(' ').value(1);
                    QJsonObject data;
                    if (route.startsWith("/trpc/packs.setBuiltinEnabled")) {
                        ++mutations;
                        const auto body = QJsonDocument::fromJson(bytes.mid(split + 4)).object();
                        Q_ASSERT(body["id"].isString() && body["enabled"].isBool());
                        if (delay) {
                            pending.append(socket);
                            return;
                        }
                        if (reject) {
                            send(socket, {{"error", QJsonObject{{"message", "Changing packs is disabled in production"}, {"code", -32003}, {"data", QJsonObject{{"code", "FORBIDDEN"}, {"httpStatus", 403}, {"path", "packs.setBuiltinEnabled"}}}}}}, 403);
                            return;
                        }
                        enabled = body["enabled"].toBool();
                        data = packs();
                    } else if (route.startsWith("/trpc/packs.listBuiltins")) {
                        data = packs();
                    } else if (route.startsWith("/trpc/packs.runtimeStatuses")) {
                        data = {{"statuses", QJsonArray{}}};
                    } else if (route.startsWith("/trpc/settings.secrets.list")) {
                        data = {{"secrets", QJsonArray{QJsonObject{{"key", "FAL_API_KEY"}, {"user_id", "1"}, {"is_configured", keySet}, {"is_unreadable", false}, {"description", "FAL"}}}}, {"next_key", QJsonValue::Null}};
                    } else if (route.startsWith("/api/nodes/metadata")) {
                        ++metadataReads;
                        send(socket, {{"nodes", QJsonArray{QJsonObject{{"node_type", "fal.image.Test"}, {"title", enabled ? "Enabled node" : "Before enable"}}}}});
                        return;
                    }
                    send(socket, {{"result", QJsonObject{{"data", data}}}});
                });
            }
        });
    }
    QJsonObject packs() const {
        return {{"packs", QJsonArray{
            QJsonObject{{"id", "fal"}, {"name", "FAL"}, {"description", "Hosted image generation"}, {"enabled", enabled}, {"required", required}},
            QJsonObject{{"id", "transformers-js"}, {"name", "Transformers.js"}, {"description", "Run models locally"}, {"enabled", enabled}, {"required", false}}
        }}};
    }
    static void send(QTcpSocket *socket, const QJsonObject &body, int status = 200) {
        const auto payload = QJsonDocument(body).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " OK\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(payload.size()) + "\r\nConnection: close\r\n\r\n" + payload);
        socket->disconnectFromHost();
    }
    void release() {
        enabled = true;
        for (auto socket : pending) {
            if (socket) {
                send(socket, {{"result", QJsonObject{{"data", packs()}}}});
            }
        }
        pending.clear();
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};
QQuickItem *find(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) {
        return item;
    }
    for (auto *child : item->childItems()) {
        if (auto *result = find(child, name)) {
            return result;
        }
    }
    return nullptr;
}
bool click(EditorWindow &window, const QString &name) {
    QCoreApplication::processEvents();
    for (auto *host : window.findChildren<QQuickWidget *>()) {
        if (!host->isVisible() || !host->rootObject() || host->quickWindow()->height() <= 0) {
            continue;
        }
        auto *item = find(host->rootObject(), name);
        if (!item || !item->isVisible() || !item->isEnabled()) {
            continue;
        }
        QTest::mouseClick(host->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                          item->mapToScene({item->width() / 2, item->height() / 2}).toPoint());
        QCoreApplication::processEvents();
        return true;
    }
    for (auto *top : QGuiApplication::topLevelWindows()) {
        auto *quick = qobject_cast<QQuickWindow *>(top);
        if (!quick || !quick->isVisible()) {
            continue;
        }
        auto *item = find(quick->contentItem(), name);
        if (item && item->isVisible() && item->isEnabled()) {
            QTest::mouseClick(quick, Qt::LeftButton, Qt::NoModifier,
                              item->mapToScene({item->width() / 2, item->height() / 2}).toPoint());
            return true;
        }
    }
    return false;
}
QJsonObject workflow(const QString &type = "fal.image.Test") {
    return {{"name", "Pack workflow"}, {"graph", QJsonObject{
        {"nodes", QJsonArray{QJsonObject{{"id", "node"}, {"type", type}, {"data", QJsonObject{}}}}},
        {"edges", QJsonArray{}}}}};
}
}
class PackSetupHostTest final : public QObject {
    Q_OBJECT
    QTemporaryDir settings_;
private slots:
    void initTestCase() {
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings_.path());
    }
    void workflowLoadPreservesDocumentAndRefreshesCatalog() {
        Server server;
        EditorWindow window;
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_COMPARE(window.packSetup()->packs().size(), 2);
        const auto reads = server.metadataReads;
        QVERIFY(window.document()->load(workflow()));
        const auto graph = window.document()->snapshot();
        const auto undo = window.document()->undoStack()->count();
        QTRY_COMPARE(server.mutations, 1);
        QTRY_VERIFY(server.enabled);
        QTRY_VERIFY(server.metadataReads > reads);
        QTRY_VERIFY(window.catalog().first().toMap()["label"].toString() == "Enabled node");
        QCOMPARE(window.document()->snapshot(), graph);
        QCOMPARE(window.document()->undoStack()->count(), undo);
        QVERIFY(window.document()->undoStack()->isClean());
        QVERIFY(!window.activeEditor()->isWindowModified());
    }
    void configuredKeyAndNoEnabledOrRequiredMutation() {
        for (int mode = 0; mode < 3; ++mode) {
            Server server;
            server.enabled = mode == 1;
            server.required = mode == 2;
            EditorWindow window;
            window.session()->connectToServer(server.url(), {}, "one");
            QTRY_COMPARE(window.packSetup()->packs().size(), 2);
            QCOMPARE(server.mutations, 0);
            server.keySet = true;
            window.packSetup()->refreshSecrets();
            QTRY_VERIFY(window.packSetup()->packs().first().toMap()["keySet"].toBool());
            if (mode == 0) {
                QTRY_COMPARE(server.mutations, 1);
            } else {
                QTest::qWait(100);
                QCOMPARE(server.mutations, 0);
            }
        }
    }
    void twoTabsDeduplicateAndInactiveDoesNotDrive() {
        Server server;
        server.delay = true;
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        auto *first = window.activeEditor();
        QTRY_COMPARE(window.packSetup()->packs().size(), 2);
        QTRY_VERIFY(click(window, "new-workflow-tab"));
        auto *second = window.activeEditor();
        QVERIFY(second != first);
        QVERIFY(first->document()->load(workflow()));
        QTest::qWait(100);
        QCOMPARE(server.mutations, 0);
        QTRY_VERIFY(click(window, "activate-tab-0"));
        QTRY_COMPARE(server.mutations, 1);
        QTRY_VERIFY(click(window, "activate-tab-1"));
        QVERIFY(second->document()->load(workflow()));
        QTest::qWait(100);
        QCOMPARE(server.mutations, 1);
        server.release();
        QTRY_VERIFY(window.packSetup()->packs().first().toMap()["enabled"].toBool());
        QCOMPARE(server.mutations, 1);
    }
    void rejectionDoesNotLoopAndAccountDiscardsStaleResponse() {
        Server server;
        server.reject = true;
        EditorWindow window;
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_COMPARE(window.packSetup()->packs().size(), 2);
        QVERIFY(window.document()->load(workflow()));
        QTRY_COMPARE(server.mutations, 1);
        QTRY_VERIFY(!window.packSetup()->error().isEmpty());
        for (int i = 0; i < 3; ++i) {
            window.packSetup()->refreshSecrets();
            window.activeEditor()->syncPackSetup();
            QTest::qWait(50);
        }
        QCOMPARE(server.mutations, 1);
        server.reject = false;
        server.delay = true;
        window.packSetup()->setEnabled("fal", true);
        QTRY_COMPARE(server.mutations, 2);
        QVERIFY(window.document()->load(workflow("nodetool.test.Test")));
        window.session()->connectToServer(server.url(), {}, "two");
        QTRY_COMPARE(window.packSetup()->packs().size(), 2);
        server.release();
        QTest::qWait(100);
        QVERIFY(!window.packSetup()->packs().first().toMap()["enabled"].toBool());
    }
    void catalogCaptures() {
        Server server;
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_COMPARE(window.packSetup()->packs().size(), 2);
        window.activeEditor()->setupAction("choose");
        QTest::qWait(100);
        const auto directory = qEnvironmentVariable("NODETOOL_PACK_SETUP_CAPTURE_DIR");
        for (bool dark : {true, false}) {
            window.setDarkTheme(dark);
            for (const auto &state : {QString("disabled"), QString("enabling"), QString("enabled")}) {
                server.enabled = state == "enabled";
                server.delay = state == "enabling";
                window.packSetup()->refresh();
                QTest::qWait(100);
                QVERIFY(click(window, "catalog-optional-packs"));
                QTest::qWait(100);
                for (auto *top : QGuiApplication::topLevelWindows()) {
                    auto *quick = qobject_cast<QQuickWindow *>(top);
                    if (quick && quick->isVisible() && quick->flags().testFlag(Qt::Popup)) {
                        const QPointF point(quick->width() / 2, quick->height() / 2);
                        QWheelEvent event(point, quick->mapToGlobal(point.toPoint()), QPoint(0, -1000), QPoint(0, -1200),
                                          Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
                        QCoreApplication::sendEvent(quick, &event);
                    }
                }
                QTest::qWait(500);
                if (state == "enabling") {
                    QVERIFY(click(window, "optional-pack-transformers-js"));
                    QTRY_COMPARE(server.pending.size(), 1);
                }
                if (!directory.isEmpty()) {
                    QVERIFY(QDir().mkpath(directory));
                    auto capture = window.grab();
                    QPainter painter(&capture);
                    for (auto *top : QGuiApplication::topLevelWindows()) {
                        auto *quick = qobject_cast<QQuickWindow *>(top);
                        if (quick && quick->isVisible() && quick->flags().testFlag(Qt::Popup)) {
                            painter.drawImage(window.mapFromGlobal(quick->position()), quick->grabWindow());
                        }
                    }
                    painter.end();
                    QVERIFY(capture.save(QDir(directory).filePath((dark ? "dark-" : "light-") + state + ".png")));
                }
                QTest::keyClick(window.activeEditor(), Qt::Key_Escape);
                // Closing the popup through its Quick window restores trigger focus.
                for (auto *host : window.findChildren<QQuickWidget *>()) {
                    if (host->isVisible()) {
                        QTest::keyClick(host->quickWindow(), Qt::Key_Escape);
                    }
                }
                for (auto *top : QGuiApplication::topLevelWindows()) {
                    if (top->isVisible() && top->flags().testFlag(Qt::Popup)) {
                        QTest::keyClick(top, Qt::Key_Escape);
                    }
                }
                if (state == "enabling") {
                    server.release();
                    QTest::qWait(50);
                }
            }
        }
    }
};
QTEST_MAIN(PackSetupHostTest)
#include "PackSetupHostTest.moc"
