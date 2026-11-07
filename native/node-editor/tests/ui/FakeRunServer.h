#pragma once
#include "server/MsgPack.h"
#include <QJsonArray>
#include <utility>
#include <QJsonDocument>
#include <QJsonObject>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QUrl>
#include <QWebSocket>
#include <QWebSocketServer>

// A local server for window tests that need a run the session submitted itself
// or a reply to a workflow save. It serves the node metadata, one workflow and
// its saves. Every other request answers with an empty object.
class FakeRunServer final : public QObject {
public:
    QTcpServer http;
    QWebSocketServer websocket{QStringLiteral("fake-run"), QWebSocketServer::NonSecureMode};
    QPointer<QWebSocket> peer;
    QList<QJsonObject> commands;
    QJsonArray metadata;
    QJsonObject workflow;
    // The HTTP status of the next saves. 409 reports a revision conflict.
    int saveStatus = 200;
    // Saves wait for releaseSaves() while this is set.
    bool holdSaves = false;
    int saves = 0;
    // The summary that POST /api/sdk/v1/preflight returns, and the request bodies it received.
    QJsonObject preflight;
    QList<QJsonObject> preflights;
    // The rows of the settings.secrets.list tRPC query.
    QJsonArray secrets;

    FakeRunServer() {
        http.listen(QHostAddress::LocalHost);
        connect(&websocket, &QWebSocketServer::newConnection, this, [this] {
            peer = websocket.nextPendingConnection();
            peer->setParent(this);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [this](const QByteArray &bytes) {
                commands.append(nodetool::node_editor::decodeMsgPack(bytes)->toObject());
            });
        });
        connect(&http, &QTcpServer::newConnection, this, [this] {
            while (http.hasPendingConnections()) {
                auto *socket = http.nextPendingConnection();
                socket->setParent(this);
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                    receive(socket);
                });
            }
        });
    }

    QUrl url() const {
        return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(http.serverPort()));
    }

    void update(const QString &job, const QString &status) {
        if (!peer) {
            return;
        }
        const QJsonObject message{{"type", "job_update"}, {"job_id", job}, {"status", status}};
        peer->sendBinaryMessage(nodetool::node_editor::encodeMsgPack(message));
    }

    void releaseSaves() {
        holdSaves = false;
        const auto pending = std::exchange(held_, {});
        for (const auto &entry : pending) {
            if (entry.socket) {
                finishSave(entry.socket, entry.trpc);
            }
        }
    }

private:
    struct HeldSave {
        QPointer<QTcpSocket> socket;
        bool trpc = false;
    };
    QList<HeldSave> held_;

    void receive(QTcpSocket *socket) {
        if (socket->peek(32).startsWith("GET /ws ")) {
            socket->disconnect(this);
            websocket.handleConnection(socket);
            return;
        }
        const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", bytes);
        const auto end = bytes.indexOf("\r\n\r\n");
        if (end < 0 || socket->property("done").toBool()) {
            return;
        }
        int length = 0;
        for (const auto &line : bytes.left(end).split('\n')) {
            if (line.toLower().startsWith("content-length:")) {
                length = line.mid(15).trimmed().toInt();
            }
        }
        if (bytes.size() < end + 4 + length) {
            return;
        }
        socket->setProperty("done", true);
        const auto path = QString::fromLatin1(bytes.split(' ').value(1));
        const auto workflowPath = QStringLiteral("/api/workflows/") + workflow["id"].toString();
        const bool trpcSave = path == QStringLiteral("/trpc/workflows.autosave");
        const bool restSave = bytes.startsWith("PUT") && path == workflowPath;
        if (trpcSave || restSave) {
            ++saves;
            if (holdSaves) {
                held_.append({socket, trpcSave});
                return;
            }
            finishSave(socket, trpcSave);
            return;
        }
        if (path == QStringLiteral("/api/sdk/v1/preflight")) {
            preflights.append(QJsonDocument::fromJson(bytes.mid(end + 4, length)).object());
            reply(socket, preflight);
        } else if (path.startsWith(QStringLiteral("/trpc/settings.secrets.list"))) {
            reply(socket, QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"secrets", secrets}}}}}});
        } else if (path.startsWith(QStringLiteral("/api/nodes/metadata"))) {
            reply(socket, QJsonObject{{"nodes", metadata}});
        } else if (!workflow.isEmpty() && path == workflowPath) {
            reply(socket, workflow);
        } else {
            reply(socket, {});
        }
    }

    void finishSave(QTcpSocket *socket, bool trpc) {
        if (saveStatus != 200) {
            // The server keeps another revision, so the conflict check finds it.
            workflow["updated_at"] = QStringLiteral("remote");
            reply(socket, {}, saveStatus);
            return;
        }
        workflow["updated_at"] = QStringLiteral("r%1").arg(saves + 1);
        if (trpc) {
            reply(socket, QJsonObject{{"result", QJsonObject{{"data", QJsonObject{
                {"updated_at", workflow["updated_at"]}, {"skipped", false}}}}}});
        } else {
            reply(socket, workflow);
        }
    }

    static void reply(QTcpSocket *socket, const QJsonObject &value, int status = 200) {
        const auto data = QJsonDocument(value).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " Response\r\nConnection: close\r\nContent-Length: "
            + QByteArray::number(data.size()) + "\r\n\r\n" + data);
        socket->disconnectFromHost();
    }
};
