#include "ai/GenerationTransport.h"
#include "server/ServerClient.h"

#include <QJsonDocument>
#include <QNetworkProxy>
#include <QNetworkRequest>

namespace nt::ai {
namespace {
bool isModeAcknowledgment(const QByteArray& bytes) {
    // msgpackr uses map16 and compact encoders may use fixmap.
    static const auto fixmap = QByteArray::fromHex("81a76d657373616765b04d6f64652073657420746f2074657874");
    static const auto map16 = QByteArray::fromHex("de0001a76d657373616765b04d6f64652073657420746f2074657874");
    return bytes == fixmap || bytes == map16;
}
}

GenerationTransport::GenerationTransport(QObject* parent)
    : QObject(parent), m_socket(QString(), QWebSocketProtocol::VersionLatest, this), m_modeTimeout(this) {
    m_socket.setProxy(QNetworkProxy::NoProxy);
    m_modeTimeout.setSingleShot(true);
    m_modeTimeout.setInterval(5000);
    connect(&m_modeTimeout, &QTimer::timeout, this, [this] {
        emit error(QStringLiteral("Server did not acknowledge text mode."));
        m_socket.abort();
    });
    connect(&m_socket, &QWebSocket::connected, this, [this] {
        m_socket.sendTextMessage(QStringLiteral(R"({"command":"set_mode","data":{"mode":"text"}})"));
        m_modeTimeout.start();
    });
    connect(&m_socket, &QWebSocket::textMessageReceived, this, &GenerationTransport::receiveText);
    connect(&m_socket, &QWebSocket::binaryMessageReceived, this, [this](const QByteArray& bytes) {
        if (isModeAcknowledgment(bytes)) acknowledgeMode();
    });
    connect(&m_socket, &QWebSocket::disconnected, this, [this] {
        m_modeTimeout.stop();
        setReady(false);
        emit disconnected();
    });
    connect(&m_socket, &QWebSocket::errorOccurred, this, [this](QAbstractSocket::SocketError) {
        emit error(m_socket.errorString());
    });
}

GenerationTransport::~GenerationTransport() {
    m_socket.disconnect(this);
    m_socket.abort();
}

void GenerationTransport::configure(const QUrl& server, const QString& token) {
    close();
    m_server = server;
    m_token = token;
}

void GenerationTransport::open() {
    if (m_socket.state() != QAbstractSocket::UnconnectedState) return;
    if (!m_server.isValid() || m_server.host().isEmpty() ||
        (m_server.scheme() != u"http" && m_server.scheme() != u"https")) {
        emit error(QStringLiteral("Invalid server URL."));
        return;
    }
    auto url = m_server;
    url.setScheme(url.scheme() == u"https" ? QStringLiteral("wss") : QStringLiteral("ws"));
    url.setPath(QStringLiteral("/ws"));
    url.setQuery(QString());
    url.setFragment(QString());
    QNetworkRequest request(url);
    request.setRawHeader("X-Nodetool-Client", nt::server::kClientHeader);
    if (!m_token.isEmpty()) request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    m_socket.open(request);
}

void GenerationTransport::close() {
    m_modeTimeout.stop();
    setReady(false);
    m_socket.abort();
}

bool GenerationTransport::send(const QString& command, const QJsonObject& data, const QString& requestId) {
    if (!m_ready || m_socket.state() != QAbstractSocket::ConnectedState ||
        command.isEmpty() || requestId.isEmpty()) return false;
    const QJsonObject message{{QStringLiteral("command"), command},
                              {QStringLiteral("request_id"), requestId},
                              {QStringLiteral("data"), data}};
    return m_socket.sendTextMessage(QString::fromUtf8(QJsonDocument(message).toJson(QJsonDocument::Compact))) > 0;
}

void GenerationTransport::setReady(bool ready) {
    if (m_ready == ready) return;
    m_ready = ready;
    emit readyChanged();
}

void GenerationTransport::acknowledgeMode() {
    m_modeTimeout.stop();
    setReady(true);
}

void GenerationTransport::receiveText(const QString& text) {
    const auto document = QJsonDocument::fromJson(text.toUtf8());
    if (!document.isObject()) return;
    const auto message = document.object();
    if (message.value("message").toString() == u"Mode set to text") {
        acknowledgeMode();
    } else if (message.value("type").toString() == u"ping") {
        m_socket.sendTextMessage(QStringLiteral(R"({"type":"pong"})"));
    } else {
        emit this->message(message);
        if (message.value("type").toString() == u"rpc_response") emit response(message);
    }
}

} // namespace nt::ai
