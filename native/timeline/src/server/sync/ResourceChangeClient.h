#pragma once

#include <QJsonArray>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QWebSocket>

#include <functional>
#include <optional>

namespace nt::server::sync {

// The open server timeline's /ws connection. UI thread only.
//
// It reports changes of its one resource (`changed`), and the project
// folder pushes of the project it has open: `workspacefile` (files of a
// workspace changed) and `documentfile` (the file of a workflow or timeline
// became invalid, missing or fine again). After set_mode, and whenever the
// project changes while connected, it sends `set_open_project`, so the
// server watches that project's folder for this connection.
class ResourceChangeClient : public QObject {
    Q_OBJECT
public:
    explicit ResourceChangeClient(const QUrl& base, const QString& id,
                                  const QString& token = {},
                                  const QString& resourceType = QStringLiteral("timelinesequence"),
                                  QObject* parent = nullptr);
    ~ResourceChangeClient() override;
    enum class State { Stopped, Connecting, Connected, Reconnecting, Failed };
    Q_ENUM(State)
    State state() const { return m_state; }
    QString reason() const { return m_reason; }
    bool connected() const { return m_state == State::Connected; }

    void setRandomSource(std::function<double()> source);
    void setReconnectRefreshDelay(std::function<int()> source);
    void setBackoffBase(int ms);
    void setHeartbeatTimings(int intervalMs, int timeoutMs);
    void start();
    void stop();
    // The project this connection has open. An empty id or a Personal id
    // (`personal:<user>`) names Personal, sent as the loose bucket "default".
    void setOpenProject(const QString& projectId);
    QString openProject() const { return m_openProject.value_or(QString()); }
    static QString openProjectCommandId(const QString& projectId);

signals:
    void changed(QString event, QString updatedAt, QJsonArray ops, bool hasOps);
    void refreshNeeded();
    void stateChanged();
    void reconnectScheduled(int delayMs);
    // Files in workspace `workspaceId` changed (coalesced by the server).
    void workspaceFilesChanged(const QString& workspaceId);
    // `resource` carries id, type, project_id, file_path and file_error.
    void documentFileChanged(const QJsonObject& resource);

private:
    void open();
    void receivedInbound();
    void modeAcknowledged();
    void scheduleRefresh();
    void disconnected(int code, const QString& reason);
    void setState(State state, const QString& reason = {});
    void sendOpenProject();

    QUrl m_base;
    QString m_id;
    QString m_token;
    QString m_resourceType;
    QWebSocket m_socket;
    QTimer m_reconnectTimer;
    QTimer m_refreshTimer;
    QTimer m_modeAckTimer;
    QTimer m_heartbeatTimer;
    QTimer m_heartbeatDeadline;
    State m_state = State::Stopped;
    QString m_reason;
    bool m_running = false;
    bool m_everConnected = false;
    bool m_modeAcknowledged = false;
    bool m_reconnectRefresh = false;
    bool m_handshakeUnauthorized = false;
    int m_heartbeatInterval = 45000;
    int m_heartbeatTimeout = 10000;
    int m_backoffBase = 1000;
    double m_backoff = 1000;
    std::function<double()> m_random;
    std::function<int()> m_refreshDelay;
    // Unset until a caller names a project: then nothing is sent.
    std::optional<QString> m_openProject;
};

} // namespace nt::server::sync
