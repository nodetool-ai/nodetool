#include "ChatClient.h"
#include <QBuffer>
#include <QFile>
#include <QFileInfo>
#include <QHttpMultiPart>
#include <QImageReader>
#include <QJsonDocument>
#include <QMimeDatabase>
#include <QNetworkCookieJar>
#include <QNetworkProxy>
#include <QNetworkReply>
#include <QNetworkRequest>
namespace nt::chat {
ChatClient::ChatClient(QObject *parent)
    : QObject(parent), m_network(this),
      m_socket(QString(), QWebSocketProtocol::VersionLatest, this) {
  m_socket.setMaxAllowedIncomingMessageSize(8 * 1024 * 1024);
  connect(&m_socket, &QWebSocket::connected, this, [this] {
    m_socket.sendTextMessage(
        R"({"command":"set_mode","data":{"mode":"text"}})");
  });
  connect(&m_socket, &QWebSocket::textMessageReceived, this,
          [this](const QString &text) { receive(text.toUtf8()); });
  connect(&m_socket, &QWebSocket::binaryMessageReceived, this,
          [this](const QByteArray &bytes) {
            const auto fix = QByteArray::fromHex(
                "81a76d657373616765b04d6f64652073657420746f2074657874");
            const auto map = QByteArray::fromHex(
                "de0001a76d657373616765b04d6f64652073657420746f2074657874");
            if (bytes == fix || bytes == map) {
              m_ready = true;
              emit statusChanged("connected");
            } else {
              emit errorOccurred(
                  "Unexpected binary chat frame after text-mode negotiation");
            }
          });
  connect(&m_socket, &QWebSocket::disconnected, this, [this] {
    m_ready = false;
    emit statusChanged("disconnected");
  });
  connect(&m_socket, &QWebSocket::errorOccurred, this,
          [this](QAbstractSocket::SocketError) {
            emit errorOccurred(m_socket.errorString());
          });
}
void ChatClient::connectToServer(const QUrl &base, const QString &token) {
  disconnectFromServer();
  if ((base.scheme() != "http" && base.scheme() != "https") ||
      base.host().isEmpty() || !base.userInfo().isEmpty()) {
    emit errorOccurred("Enter an HTTP or HTTPS server URL without credentials");
    return;
  }
  if (base.scheme() == "http" && !token.isEmpty() &&
      base.host() != "localhost" && base.host() != "127.0.0.1" &&
      base.host() != "::1") {
    emit errorOccurred("Authentication requires HTTPS for remote servers");
    return;
  }
  m_base = base;
  m_token = token;
  emit statusChanged("connecting");
  auto url = base;
  url.setScheme(base.scheme() == "https" ? "wss" : "ws");
  url.setPath("/ws");
  url.setQuery({});
  url.setFragment({});
  QNetworkRequest request(url);
  request.setRawHeader("X-Nodetool-Client", "native-chat");
  if (!token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + token.toUtf8());
  }
  m_socket.open(request);
}
void ChatClient::disconnectFromServer() {
  ++m_epoch;
  for (auto *reply : m_network.findChildren<QNetworkReply *>()) {
    reply->abort();
  }
  m_network.clearAccessCache();
  m_network.setCookieJar(new QNetworkCookieJar(&m_network));
  m_ready = false;
  m_socket.abort();
  m_token.clear();
  emit statusChanged("disconnected");
}
void ChatClient::receive(const QByteArray &bytes) {
  if (bytes.size() > 8 * 1024 * 1024) {
    emit errorOccurred("Chat frame exceeds 8 MiB");
    return;
  }
  QJsonParseError error;
  auto doc = QJsonDocument::fromJson(bytes, &error);
  if (error.error != QJsonParseError::NoError || !doc.isObject()) {
    emit errorOccurred("Invalid chat JSON frame");
    return;
  }
  const auto event = doc.object();
  if (event["message"] == "Mode set to text") {
    m_ready = true;
    emit statusChanged("connected");
    return;
  }
  if (event["type"] == "ping") {
    send({{"type", "pong"}});
    return;
  }
  emit eventReceived(event);
}
bool ChatClient::send(const QJsonObject &object) {
  if (!m_ready) {
    emit errorOccurred("Connect before sending. The prompt was not resent.");
    return false;
  }
  return m_socket.sendTextMessage(QString::fromUtf8(
             QJsonDocument(object).toJson(QJsonDocument::Compact))) >= 0;
}
void ChatClient::cancelUpload(const QString &id) {
  for (auto *reply : m_network.findChildren<QNetworkReply *>()) {
    if (reply->property("uploadId").toString() == id) {
      reply->abort();
    }
  }
}
void ChatClient::upload(const QString &id, const QUrl &local, Callback callback,
                        std::function<void(qint64, qint64)> progress) {
  if (!local.isLocalFile()) {
    callback({}, "Choose a local file");
    return;
  }
  auto *multipart = new QHttpMultiPart(QHttpMultiPart::FormDataType);
  auto *file = new QFile(local.toLocalFile(), multipart);
  if (!file->open(QIODevice::ReadOnly) || file->size() > 32 * 1024 * 1024) {
    delete multipart;
    callback({}, "File is unreadable or exceeds 32 MiB");
    return;
  }
  const auto name = QFileInfo(file->fileName()).fileName();
  QHttpPart part;
  part.setHeader(
      QNetworkRequest::ContentDispositionHeader,
      QString("form-data; name=\"file\"; filename=\"%1\"")
          .arg(QString(name).replace('"', '_').replace('\r', '_').replace(
              '\n', '_')));
  part.setHeader(QNetworkRequest::ContentTypeHeader,
                 QMimeDatabase().mimeTypeForFile(file->fileName()).name());
  part.setBodyDevice(file);
  multipart->append(part);
  QNetworkRequest request(m_base.resolved(QUrl("/api/assets")));
  request.setTransferTimeout(60000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                       QNetworkRequest::ManualRedirectPolicy);
  if (!m_token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  }
  auto *reply = m_network.post(request, multipart);
  reply->setProperty("uploadId", id);
  multipart->setParent(reply);
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > 1024 * 1024) {
      reply->abort();
    }
  });
  connect(reply, &QNetworkReply::uploadProgress, this,
          [this, epoch, progress](qint64 done, qint64 total) {
            if (epoch == m_epoch) {
              progress(done, total);
            }
          });
  connect(reply, &QNetworkReply::finished, this,
          [this, reply, epoch, callback = std::move(callback)] {
            auto body = reply->readAll();
            auto error = reply->error();
            auto text = reply->errorString();
            reply->deleteLater();
            if (epoch != m_epoch) {
              return;
            }
            if (error != QNetworkReply::NoError || body.size() > 1024 * 1024) {
              callback({}, text);
              return;
            }
            callback(QJsonDocument::fromJson(body).object(), {});
          });
}
void ChatClient::fetchMedia(const QUrl &input, Callback callback) {
  if (m_mediaRequests >= 4) {
    callback({}, "Too many image previews in flight");
    return;
  }
  const auto url = m_base.resolved(input);
  if (url.scheme() != "https" && url.scheme() != "http") {
    callback({}, "Unsupported media URL");
    return;
  }
  if (url.scheme() != m_base.scheme() || url.host() != m_base.host() ||
      url.port() != m_base.port()) {
    callback({}, "External media requires opening an explicit link");
    return;
  }
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                       QNetworkRequest::ManualRedirectPolicy);
  if (url.scheme() == m_base.scheme() && url.host() == m_base.host() &&
      url.port() == m_base.port() && !m_token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  }
  auto *reply = m_network.get(request);
  ++m_mediaRequests;
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > 16 * 1024 * 1024) {
      reply->abort();
    }
  });
  connect(reply, &QNetworkReply::finished, this,
          [this, reply, epoch, callback = std::move(callback)] {
            --m_mediaRequests;
            const auto bytes = reply->readAll();
            const auto mime =
                reply->header(QNetworkRequest::ContentTypeHeader).toString();
            const auto error = reply->error();
            reply->deleteLater();
            if (epoch != m_epoch) {
              return;
            }
            QBuffer buffer;
            buffer.setData(bytes);
            buffer.open(QIODevice::ReadOnly);
            QImageReader reader(&buffer);
            const auto dimensions = reader.size();
            if (error != QNetworkReply::NoError ||
                bytes.size() > 16 * 1024 * 1024 || !mime.startsWith("image/") ||
                mime.contains("svg") || !dimensions.isValid() ||
                qint64(dimensions.width()) * dimensions.height() > 16000000) {
              callback({}, "Image preview unavailable");
              return;
            }
            callback(QString("data:%1;base64,%2")
                         .arg(mime, QString::fromLatin1(bytes.toBase64())),
                     {});
          });
}
void ChatClient::call(const QString &procedure, QJsonObject input,
                      bool mutation, Callback callback) {
  const auto epoch = m_epoch;
  auto url = m_base;
  url.setPath("/trpc/" + procedure);
  url.setQuery({});
  url.setFragment({});
  const auto body = QJsonDocument(input).toJson(QJsonDocument::Compact);
  if (!mutation) {
    url.setQuery("input=" + QString::fromLatin1(QUrl::toPercentEncoding(
                                QString::fromUtf8(body))),
                 QUrl::StrictMode);
  }
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                       QNetworkRequest::ManualRedirectPolicy);
  request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  request.setRawHeader("X-Nodetool-Client", "native-chat");
  if (!m_token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  }
  auto *reply =
      mutation ? m_network.post(request, body) : m_network.get(request);
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > 8 * 1024 * 1024) {
      reply->abort();
    }
  });
  connect(reply, &QNetworkReply::finished, this,
          [this, reply, epoch, callback = std::move(callback)] {
            const auto bytes = reply->readAll();
            const auto error = reply->error();
            const auto errorText = reply->errorString();
            reply->deleteLater();
            if (epoch != m_epoch) {
              return;
            }
            if (bytes.size() > 8 * 1024 * 1024) {
              callback({}, "Server response exceeds 8 MiB");
              return;
            }
            const auto root = QJsonDocument::fromJson(bytes).object();
            if (root.contains("error")) {
              callback({}, root["error"].toObject()["message"].toString(
                               "Server rejected request"));
              return;
            }
            if (error != QNetworkReply::NoError) {
              callback({}, errorText);
              return;
            }
            if (!root["result"].toObject().contains("data")) {
              callback({}, "Invalid tRPC response");
              return;
            }
            callback(root["result"].toObject()["data"], {});
          });
}
} // namespace nt::chat
