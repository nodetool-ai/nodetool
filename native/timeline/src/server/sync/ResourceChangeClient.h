#pragma once

#include <QJsonArray>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QWebSocket>

#include <functional>

namespace nt::server::sync {

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

signals:
    void changed(QString event, QString updatedAt, QJsonArray ops, bool hasOps);
    void refreshNeeded();
    void stateChanged();
    void reconnectScheduled(int delayMs);

private:
    void open();
    void receivedInbound();
    void modeAcknowledged();
    void scheduleRefresh();
    void disconnected(int code, const QString& reason);
    void setState(State state, const QString& reason = {});

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
};

} // namespace nt::server::sync
