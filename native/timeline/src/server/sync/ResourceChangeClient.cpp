#include "ResourceChangeClient.h"
#include "server/ServerClient.h"

#include <QAuthenticator>
#include <QLoggingCategory>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkProxy>
#include <QNetworkRequest>
#include <QRandomGenerator>

#include <algorithm>
#include <utility>

namespace nt::server::sync {
Q_LOGGING_CATEGORY(resourceChangeLog, "nodetool.timeline.sync.transport", QtInfoMsg)

namespace {
bool isBinaryModeAcknowledgment(const QByteArray& bytes)
{
    // set_mode returns exactly {message:"Mode set to text"}. msgpackr with
    // useRecords:false writes map16; compact MsgPack encoders use fixmap.
    static const auto fixmap = QByteArray::fromHex("81a76d657373616765b04d6f64652073657420746f2074657874");
    static const auto map16 = QByteArray::fromHex("de0001a76d657373616765b04d6f64652073657420746f2074657874");
    return bytes == fixmap || bytes == map16;
}
}

ResourceChangeClient::ResourceChangeClient(const QUrl& base, const QString& id,
                                         const QString& token, const QString& resourceType,
                                         QObject* parent)
    : QObject(parent), m_base(base), m_id(id), m_token(token), m_resourceType(resourceType),
      m_socket(QString(), QWebSocketProtocol::VersionLatest, this),
      m_reconnectTimer(this), m_refreshTimer(this), m_modeAckTimer(this),
      m_heartbeatTimer(this), m_heartbeatDeadline(this),
      m_random([] { return QRandomGenerator::global()->generateDouble(); })
{
    m_reconnectTimer.setSingleShot(true);
    m_refreshTimer.setSingleShot(true);
    m_modeAckTimer.setSingleShot(true);
    m_modeAckTimer.setInterval(2000);
    // Older servers may never reply. Refresh once after the bounded wait,
    // and again if a late acknowledgment closes the subscription gap.
    connect(&m_modeAckTimer, &QTimer::timeout, this, &ResourceChangeClient::scheduleRefresh);
    m_heartbeatTimer.setSingleShot(true);
    m_heartbeatDeadline.setSingleShot(true);
    connect(&m_heartbeatTimer, &QTimer::timeout, this, [this] {
        m_socket.sendTextMessage(R"({"type":"ping"})");
        m_heartbeatDeadline.start(m_heartbeatTimeout);
    });
    connect(&m_heartbeatDeadline, &QTimer::timeout, this, [this] {
        disconnected(1006, QStringLiteral("Heartbeat timeout"));
    });
    connect(&m_socket, &QWebSocket::binaryMessageReceived, this, [this](const QByteArray& bytes) {
        receivedInbound();
        if (isBinaryModeAcknowledgment(bytes)) {
            modeAcknowledged();
        }
    });
    connect(&m_reconnectTimer, &QTimer::timeout, this, &ResourceChangeClient::open);
    connect(&m_refreshTimer, &QTimer::timeout, this, &ResourceChangeClient::refreshNeeded);
    connect(&m_socket, &QWebSocket::connected, this, [this] {
        m_backoff = m_backoffBase;
        m_socket.sendTextMessage(R"({"command":"set_mode","data":{"mode":"text"}})");
        m_modeAcknowledged = false;
        m_reconnectRefresh = m_everConnected;
        m_everConnected = true;
        m_modeAckTimer.start();
        receivedInbound();
        setState(State::Connected);
    });
    connect(&m_socket, &QWebSocket::disconnected, this, [this] {
        disconnected(m_socket.closeCode(), m_socket.closeReason());
    });
    connect(&m_socket, &QWebSocket::errorOccurred, this, [this](QAbstractSocket::SocketError) {
        // Qt 6.12 reports a bare 401 as unsupported WWW-Authenticate challenges.
        // QWebSocket exposes no HTTP response status getter.
        const auto error = m_socket.errorString();
        const bool unauthorized = m_handshakeUnauthorized
            || error == QWebSocket::tr("QWebSocket::processHandshake: Host requires authentication")
            || error == QWebSocket::tr("QWebSocketPrivate::processHandshake: Unsupported WWW-Authenticate challenge encountered.")
            || error == QWebSocket::tr("QWebSocketPrivate::processHandshake: Unsupported WWW-Authenticate challenges encountered.");
        disconnected(unauthorized ? 401 : 1006, unauthorized ? QStringLiteral("HTTP 401 Unauthorized") : error);
    });
    connect(&m_socket, &QWebSocket::authenticationRequired, this, [this](QAuthenticator*) {
        m_handshakeUnauthorized = true;
    });
    connect(&m_socket, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
        receivedInbound();
        const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
        if (message["message"] == "Mode set to text") {
            modeAcknowledged();
            return;
        }
        if (message["type"] == "ping") {
            m_socket.sendTextMessage(R"({"type":"pong"})");
            return;
        }
        if (message["type"] == "resource_resync") {
            emit refreshNeeded();
            return;
        }
        const auto resource = message["resource"].toObject();
        if (message["type"] == "resource_change" && message["resource_type"] == m_resourceType
            && resource["id"] == m_id) {
            emit changed(message["event"].toString(), resource["updated_at"].toString(),
                         message["ops"].toArray(), message["ops"].isArray());
        }
    });
    m_socket.setProxy(QNetworkProxy::NoProxy);
}

ResourceChangeClient::~ResourceChangeClient()
{
    m_socket.disconnect(this);
    m_socket.abort();
}

void ResourceChangeClient::setHeartbeatTimings(int intervalMs, int timeoutMs)
{
    m_heartbeatInterval = intervalMs;
    m_heartbeatTimeout = timeoutMs;
    if (connected()) {
        receivedInbound();
    }
}

void ResourceChangeClient::receivedInbound()
{
    m_heartbeatDeadline.stop();
    m_heartbeatTimer.stop();
    if (m_heartbeatInterval > 0) {
        m_heartbeatTimer.start(m_heartbeatInterval);
    }
}

void ResourceChangeClient::modeAcknowledged()
{
    if (!m_running || !connected() || m_modeAcknowledged) {
        return;
    }
    m_modeAcknowledged = true;
    m_modeAckTimer.stop();
    scheduleRefresh();
}

void ResourceChangeClient::scheduleRefresh()
{
    // Reconnects retain the web's jitter, starting at subscription readiness.
    m_refreshTimer.start(m_reconnectRefresh
        ? (m_refreshDelay ? m_refreshDelay() : static_cast<int>(m_random() * 3000)) : 0);
}

void ResourceChangeClient::setRandomSource(std::function<double()> source) { m_random = std::move(source); }
void ResourceChangeClient::setReconnectRefreshDelay(std::function<int()> source) { m_refreshDelay = std::move(source); }
void ResourceChangeClient::setBackoffBase(int ms)
{
    m_backoffBase = ms;
    m_backoff = ms;
}

void ResourceChangeClient::setState(State state, const QString& reason)
{
    if (m_state != state || m_reason != reason) {
        m_state = state;
        m_reason = reason;
        emit stateChanged();
    }
}

void ResourceChangeClient::start()
{
    if (m_running) {
        return;
    }
    m_running = true;
    m_everConnected = false;
    m_backoff = m_backoffBase;
    open();
}

void ResourceChangeClient::open()
{
    if (!m_running) {
        return;
    }
    m_handshakeUnauthorized = false;
    auto url = m_base;
    url.setScheme(url.scheme() == u"https" ? "wss" : "ws");
    url.setPath("/ws");
    url.setQuery(QString());
    url.setFragment({});
    QNetworkRequest request(url);
    request.setRawHeader("X-Nodetool-Client", kClientHeader);
    if (!m_token.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    }
    setState(State::Connecting);
    if (m_running) {
        m_socket.open(request);
    }
}

void ResourceChangeClient::disconnected(int code, const QString& reason)
{
    if (!m_running || m_state == State::Reconnecting || m_state == State::Failed) {
        return;
    }
    m_refreshTimer.stop();
    m_modeAckTimer.stop();
    m_heartbeatTimer.stop();
    m_heartbeatDeadline.stop();
    if (code == 401 || code == 1008 || code == 1009 || code == 1010
        || code == 4000 || code == 4001 || code == 4003) {
        setState(State::Failed, reason.isEmpty() ? QStringLiteral("WebSocket closed (%1)").arg(code) : reason);
        m_socket.abort();
        if (code == 401) {
            qCWarning(resourceChangeLog, "ResourceChangeClient: WebSocket authentication failed (HTTP 401)");
        }
        return;
    }
    const auto delay = static_cast<int>(std::min(m_backoff, 30000.0) * (0.5 + m_random() * 0.5));
    m_backoff = std::min(m_backoff * 1.5, 30000.0);
    setState(State::Reconnecting, reason);
    m_socket.abort();
    if (!m_running) {
        return;
    }
    m_reconnectTimer.start(delay);
    emit reconnectScheduled(delay);
}

void ResourceChangeClient::stop()
{
    m_running = false;
    m_reconnectTimer.stop();
    m_refreshTimer.stop();
    m_modeAckTimer.stop();
    m_heartbeatTimer.stop();
    m_heartbeatDeadline.stop();
    m_socket.abort();
    setState(State::Stopped);
}
} // namespace nt::server::sync
