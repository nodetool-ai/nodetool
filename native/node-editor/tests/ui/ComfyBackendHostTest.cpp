// The Comfy backend in the editor: the target control, the target's node
// catalog in a Comfy workflow and New Comfy Workflow, against a fake server.
#include "ui/EditorWindow.h"
#include <QCryptographicHash>
#include <QJsonDocument>
#include <QQuickItem>
#include <QQuickWidget>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool;
namespace {
QJsonObject record(const QString &className) {
    return {{"node_type", "comfy." + className}, {"title", className}, {"namespace", "comfy.sampling"},
            {"properties", QJsonArray{}}, {"outputs", QJsonArray{QJsonObject{{"name", "LATENT"}, {"type", QJsonObject{{"type", "comfy.LATENT"}}}}}}};
}

class Server final : public QTcpServer {
public:
    QString target = "server";
    QString serverUrl = "http://127.0.0.1:8188";
    QJsonObject lastUpdate, createdWorkflow, importedPrompt;
    int catalogReads = 0;
    Server() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto *socket = nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] { read(socket); });
            }
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
    QJsonObject workflow() const {
        return {{"id", "w1"}, {"name", "New Comfy Workflow"}, {"run_mode", "comfy"}, {"updated_at", "2026-11-13T00:00:00Z"},
                {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "3"}, {"type", "comfy.KSampler"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}};
    }
private:
    void read(QTcpSocket *socket) {
        const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", bytes);
        const auto split = bytes.indexOf("\r\n\r\n");
        if (split < 0 || socket->property("done").toBool()) { return; }
        int contentLength = 0;
        for (const auto &line : bytes.left(split).split('\n')) {
            if (line.toLower().startsWith("content-length:")) { contentLength = line.mid(15).trimmed().toInt(); }
        }
        if (bytes.size() < split + 4 + contentLength) { return; }
        socket->setProperty("done", true);
        if (bytes.toLower().contains("upgrade: websocket")) {
            QByteArray key;
            for (const auto &line : bytes.left(split).split('\n')) {
                if (line.toLower().startsWith("sec-websocket-key:")) { key = line.mid(18).trimmed(); }
            }
            const auto accept = QCryptographicHash::hash(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", QCryptographicHash::Sha1).toBase64();
            socket->write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
            return;
        }
        const auto method = bytes.split(' ').value(0);
        const auto route = bytes.split(' ').value(1);
        const auto body = QJsonDocument::fromJson(bytes.mid(split + 4)).object();
        if (route.startsWith("/api/nodes/metadata")) {
            send(socket, QJsonObject{{"nodes", QJsonArray{QJsonObject{{"node_type", "fal.image.Test"}, {"title", "Base node"}}}}});
        } else if (route.startsWith("/api/comfy/nodes")) {
            ++catalogReads;
            send(socket, target == "server" ? QJsonArray{record("KSampler"), record("CheckpointLoaderSimple")} : QJsonArray{record("KSampler")});
        } else if (route.startsWith("/api/comfy/server-status")) {
            send(socket, QJsonObject{{"url", serverUrl}, {"version", "0.3.68"}, {"device", "cuda:0 NVIDIA GeForce RTX 4070 : cudaMallocAsync"},
                                     {"models", QJsonObject{{"checkpoints", QJsonArray{"v1-5.safetensors", "sdxl_base.safetensors"}}, {"diffusion_models", QJsonValue::Null}, {"loras", QJsonArray{"a.safetensors"}}}}});
        } else if (route.startsWith("/api/comfy/import-graph")) {
            importedPrompt = body["workflow"].toObject();
            send(socket, workflow()["graph"].toObject());
        } else if (route == "/api/workflows" && method == "POST") {
            createdWorkflow = body;
            send(socket, workflow());
        } else if (route.startsWith("/api/workflows/w1")) {
            send(socket, workflow());
        } else if (route.startsWith("/trpc/settings.list")) {
            send(socket, trpc({{"settings", QJsonArray{
                QJsonObject{{"env_var", "COMFY_TARGET"}, {"value", target}},
                QJsonObject{{"env_var", "COMFY_SERVER_URL"}, {"value", serverUrl}},
                QJsonObject{{"env_var", "COMFY_WORKER_URL"}, {"value", QJsonValue::Null}}}}}));
        } else if (route.startsWith("/trpc/settings.update")) {
            lastUpdate = body;
            const auto settings = body["settings"].toObject();
            target = settings["COMFY_TARGET"].toString(target);
            serverUrl = settings["COMFY_SERVER_URL"].toString(serverUrl);
            send(socket, trpc({{"success", true}}));
        } else if (route.startsWith("/trpc/worker.instances.list")) {
            send(socket, QJsonObject{{"result", QJsonObject{{"data", QJsonArray{}}}}});
        } else if (route.startsWith("/trpc/settings.secrets.list")) {
            send(socket, trpc({{"secrets", QJsonArray{}}, {"next_key", QJsonValue::Null}}));
        } else if (route.startsWith("/trpc/packs.listBuiltins")) {
            send(socket, trpc({{"packs", QJsonArray{}}}));
        } else {
            send(socket, trpc({}));
        }
    }
    static QJsonObject trpc(const QJsonObject &data) { return {{"result", QJsonObject{{"data", data}}}}; }
    static void send(QTcpSocket *socket, const QJsonValue &body, int status = 200) {
        const auto payload = body.isArray() ? QJsonDocument(body.toArray()).toJson(QJsonDocument::Compact) : QJsonDocument(body.toObject()).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " OK\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(payload.size()) + "\r\nConnection: close\r\n\r\n" + payload);
        socket->disconnectFromHost();
    }
};

QStringList catalogTypes(EditorWindow &window) {
    QStringList types;
    for (const auto &entry : window.catalog()) { types.append(entry.toMap()["type"].toString()); }
    return types;
}

QJsonObject workflow(const QString &runMode) {
    return {{"name", "Comfy"}, {"run_mode", runMode}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
}

QQuickItem *find(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) { return item; }
    for (auto *child : item->childItems()) {
        if (auto *result = find(child, name)) { return result; }
    }
    return nullptr;
}

QQuickItem *visibleItem(EditorWindow &window, const QString &name) {
    for (auto *host : window.findChildren<QQuickWidget *>()) {
        if (!host->isVisible() || !host->rootObject()) { continue; }
        if (auto *item = find(host->rootObject(), name); item && item->isVisible()) { return item; }
    }
    return nullptr;
}
}  // namespace

class ComfyBackendHostTest final : public QObject {
    Q_OBJECT
    QTemporaryDir settings_;
private slots:
    void initTestCase() {
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings_.path());
    }
    void describesTargetsAndServers() {
        using namespace node_editor;
        QCOMPARE(comfyTargetLabel({}, {}, {}), QStringLiteral("Comfy Cloud"));
        QCOMPARE(comfyTargetLabel({}, "http://127.0.0.1:8188", {}), QStringLiteral("Server: 127.0.0.1:8188"));
        QCOMPARE(comfyTargetLabel("server", {}, {}), QStringLiteral("Server: not set"));
        QCOMPARE(comfyTargetLabel("worker", {}, "wss://pod.example:443/ws"), QStringLiteral("Worker: pod.example:443"));
        const QJsonObject status{{"version", "0.3.68"}, {"device", "cuda:0 NVIDIA GeForce RTX 4070 : cudaMallocAsync"},
                                 {"models", QJsonObject{{"checkpoints", QJsonArray{"a"}}, {"diffusion_models", QJsonArray{"b", "c"}}, {"loras", QJsonValue::Null}}}};
        QCOMPARE(describeComfyServer(status), QStringLiteral("ComfyUI 0.3.68 on NVIDIA GeForce RTX 4070"));
        QCOMPARE(describeComfyServer({}), QStringLiteral("ComfyUI"));
        QCOMPARE(describeComfyModels(status), QStringLiteral("1 checkpoint, 2 diffusion models"));
        QCOMPARE(pickStarterCheckpoint({"v1-5.safetensors", "sdxl_refiner.safetensors", "sdxl_base.safetensors"}), QStringLiteral("sdxl_base.safetensors"));
        QCOMPARE(pickStarterCheckpoint({"sdxl_refiner.safetensors", "v1-5.safetensors"}), QStringLiteral("v1-5.safetensors"));
        QCOMPARE(pickStarterCheckpoint({}), QString{});
        const auto prompt = comfyStarterPrompt("sdxl_base.safetensors", 7);
        QCOMPARE(prompt["4"].toObject()["inputs"].toObject()["ckpt_name"].toString(), QStringLiteral("sdxl_base.safetensors"));
        QCOMPARE(prompt["3"].toObject()["inputs"].toObject()["steps"].toInt(), 25);
        QCOMPARE(prompt["3"].toObject()["inputs"].toObject()["seed"].toInt(), 7);
        QCOMPARE(comfyStarterPrompt({}, 1)["4"].toObject()["inputs"].toObject()["ckpt_name"].toString(), QStringLiteral("flux1-schnell-fp8.safetensors"));
    }
    void mergesAndFiltersCatalogs() {
        using namespace node_editor;
        const auto next = nextComfyRecords({record("KSampler"), record("Old")}, {record("KSampler")});
        QCOMPARE(next.size(), 2);
        QVERIFY(!next[0].toObject()["hidden"].toBool());
        QCOMPARE(next[1].toObject()["node_type"].toString(), QStringLiteral("comfy.Old"));
        QVERIFY(next[1].toObject()["hidden"].toBool());
        const QJsonArray base{QJsonObject{{"node_type", "fal.image.Test"}}, record("KSampler")};
        QCOMPARE(mergeComfyCatalog(base, next).size(), 3);
        const auto comfyMenu = comfyMenuMetadata(mergeComfyCatalog(base, next), true);
        QVERIFY(comfyMenu[0].toObject()["hidden"].toBool());
        QVERIFY(!comfyMenu[1].toObject()["hidden"].toBool());
        QVERIFY(comfyMenuMetadata(base, false)[1].toObject()["hidden"].toBool());
    }
    void comfyWorkflowShowsTargetAndItsNodes() {
        Server server;
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_VERIFY(catalogTypes(window).contains("fal.image.Test"));
        QVERIFY(!visibleItem(window, "toolbar-comfy-target"));
        QVERIFY(window.document()->load(workflow("comfy")));
        QTRY_VERIFY(catalogTypes(window).contains("comfy.CheckpointLoaderSimple"));
        QVERIFY(!catalogTypes(window).contains("fal.image.Test"));
        QTRY_COMPARE(window.editorCommands()->comfyTarget(), QStringLiteral("Server: 127.0.0.1:8188"));
        QTRY_VERIFY(visibleItem(window, "toolbar-comfy-target"));
        QTRY_COMPARE(window.comfyBackend()->statusText(), QStringLiteral("Connected to ComfyUI 0.3.68 on NVIDIA GeForce RTX 4070"));
        QCOMPARE(window.comfyBackend()->modelsText(), QStringLiteral("2 checkpoints, 1 LoRA"));

        // Another target: its catalog replaces the old one, whose nodes stay but hide.
        const auto reads = server.catalogReads;
        window.comfyBackend()->selectCloud();
        QTRY_COMPARE(server.lastUpdate["settings"].toObject()["COMFY_TARGET"].toString(), QStringLiteral("cloud"));
        QTRY_COMPARE(window.editorCommands()->comfyTarget(), QStringLiteral("Comfy Cloud"));
        QTRY_VERIFY(server.catalogReads > reads);
        QTRY_VERIFY(!catalogTypes(window).contains("comfy.CheckpointLoaderSimple"));
        QVERIFY(catalogTypes(window).contains("comfy.KSampler"));

        // A plain workflow offers no ComfyUI nodes and hides the control.
        QVERIFY(window.document()->load(workflow("workflow")));
        QTRY_VERIFY(catalogTypes(window).contains("fal.image.Test"));
        QVERIFY(!catalogTypes(window).contains("comfy.KSampler"));
        QCOMPARE(window.editorCommands()->comfyTarget(), QString{});
    }
    void newComfyWorkflowStartsOnAServerCheckpoint() {
        Server server;
        EditorWindow window;
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_COMPARE(window.comfyBackend()->statusState(), QStringLiteral("connected"));
        window.newComfyWorkflow();
        QTRY_COMPARE(server.createdWorkflow["run_mode"].toString(), QStringLiteral("comfy"));
        QCOMPARE(server.importedPrompt["4"].toObject()["inputs"].toObject()["ckpt_name"].toString(), QStringLiteral("sdxl_base.safetensors"));
        QVERIFY(server.createdWorkflow["graph"].toObject()["nodes"].isArray());
        QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QStringLiteral("w1"));
        QTRY_VERIFY(window.activeEditor()->comfyWorkflowOpen());
        QTRY_VERIFY(catalogTypes(window).contains("comfy.KSampler"));
    }
};

QTEST_MAIN(ComfyBackendHostTest)
#include "ComfyBackendHostTest.moc"
