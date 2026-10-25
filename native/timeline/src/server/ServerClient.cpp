#include "server/ServerClient.h"

#include <QCryptographicHash>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QHttpMultiPart>
#include <QJsonDocument>
#include <QNetworkProxy>
#include <QNetworkReply>
#include <QTimer>

#include <algorithm>
#include <utility>

namespace nt::server {

QString QueryResult::describe() const {
    if (ok()) return QStringLiteral("ok");
    QString s = error.message.isEmpty() ? QStringLiteral("request failed") : error.message;
    if (!error.code.isEmpty()) s += QStringLiteral(" (%1)").arg(error.code);
    return s;
}

QueryResult parseTrpcResponse(const HttpResponse& response) {
    QueryResult result;
    if (!response.networkError.isEmpty() && response.status == 0) {
        result.error.message = response.networkError;
        result.error.code = QStringLiteral("NETWORK");
        return result;
    }
    QJsonParseError err{};
    const QJsonDocument doc = QJsonDocument::fromJson(response.body, &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject()) {
        result.error.message = QStringLiteral("HTTP %1: the response is not tRPC JSON").arg(response.status);
        result.error.code = QStringLiteral("BAD_RESPONSE");
        result.error.httpStatus = response.status;
        return result;
    }
    const QJsonObject root = doc.object();
    if (root.contains(u"error")) {
        const QJsonObject e = root.value(u"error").toObject();
        const QJsonObject data = e.value(u"data").toObject();
        result.error.message = e.value(u"message").toString();
        result.error.code = data.value(u"code").toString(QStringLiteral("UNKNOWN"));
        result.error.apiCode = data.value(u"apiCode").toString();
        result.error.httpStatus = data.value(u"httpStatus").toInt(response.status);
        return result;
    }
    if (!root.value(u"result").isObject() || !root.value(u"result").toObject().contains(u"data")) {
        result.error.message = QStringLiteral("HTTP %1: no result.data in the response").arg(response.status);
        result.error.code = QStringLiteral("BAD_RESPONSE");
        result.error.httpStatus = response.status;
        return result;
    }
    result.data = root.value(u"result").toObject().value(u"data");
    return result;
}

ServerClient::ServerClient(const QUrl& base, const QString& token, int timeoutMs)
    : m_base(base), m_token(token), m_timeoutMs(timeoutMs), m_nam(std::make_unique<QNetworkAccessManager>()) {
    // Loopback servers only: a system proxy must not see the requests.
    m_nam->setProxy(QNetworkProxy::NoProxy);
}

ServerClient::~ServerClient() = default;

QString ServerClient::serverKey() const {
    const int port = m_base.port(m_base.scheme() == u"https" ? 443 : 80);
    QString host = m_base.host();
    host.replace(QLatin1Char(':'), QLatin1Char('_'));  // IPv6
    const QString origin = QStringLiteral("%1://%2:%3").arg(m_base.scheme(), m_base.host().toLower()).arg(port);
    const QString hash = QString::fromLatin1(
        QCryptographicHash::hash(origin.toUtf8(), QCryptographicHash::Sha256).toHex().left(16));
    // A readable prefix, cut to fit the 64-character path part, and a hash of
    // the whole origin, so two servers never share a folder.
    return QStringLiteral("%1_%2_%3").arg(m_base.scheme(), host).arg(port).left(46) + u'-' + hash;
}

QString ServerClient::userKey() const {
    if (m_token.isEmpty()) return QStringLiteral("1");
    const QByteArray h = QCryptographicHash::hash(m_token.toUtf8(), QCryptographicHash::Sha256).toHex().left(12);
    return QStringLiteral("token-") + QString::fromLatin1(h);
}

QUrl ServerClient::resolve(const QString& urlOrPath) const {
    const QUrl u(urlOrPath);
    return u.isRelative() ? m_base.resolved(u) : u;
}

bool ServerClient::isServerOrigin(const QUrl& url) const {
    const auto port = [](const QUrl& u) { return u.port(u.scheme() == u"https" ? 443 : 80); };
    return url.scheme() == m_base.scheme() && url.host().compare(m_base.host(), Qt::CaseInsensitive) == 0 &&
           port(url) == port(m_base);
}

void ServerClient::decorate(QNetworkRequest& request) const {
    request.setTransferTimeout(m_timeoutMs);
    // The token and the client name go to the configured server only, never
    // to an external storage URL (signed S3 or Supabase).
    if (!isServerOrigin(request.url())) return;
    request.setRawHeader("X-Nodetool-Client", kClientHeader);
    if (!m_token.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
    }
}

std::vector<HttpResponse> ServerClient::sendAll(const std::vector<HttpRequest>& requests) {
    std::vector<HttpResponse> out(requests.size());
    std::vector<QNetworkReply*> replies;
    replies.reserve(requests.size());
    QEventLoop loop;
    int pending = static_cast<int>(requests.size());
    for (const HttpRequest& r : requests) {
        QNetworkRequest req(r.url);
        // tRPC and HEAD answers are read as they come: a redirect is a
        // response, never followed with the token.
        req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        decorate(req);
        QNetworkReply* reply = r.head ? m_nam->head(req) : m_nam->get(req);
        QObject::connect(reply, &QNetworkReply::finished, &loop, [&pending, &loop]() {
            if (--pending == 0) loop.quit();
        });
        replies.push_back(reply);
    }
    if (pending > 0) loop.exec();
    for (size_t i = 0; i < replies.size(); ++i) {
        QNetworkReply* reply = replies[i];
        HttpResponse& resp = out[i];
        resp.status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        resp.body = reply->readAll();
        for (const auto& pair : reply->rawHeaderPairs()) {
            resp.headers.insert(pair.first.toLower(), pair.second);
        }
        // An HTTP error status is a response, not a transport failure.
        if (reply->error() != QNetworkReply::NoError && resp.status == 0) {
            resp.networkError = reply->errorString();
        }
        reply->deleteLater();
    }
    return out;
}

std::vector<QueryResult> ServerClient::queryAll(const std::vector<std::pair<QString, QJsonObject>>& calls) {
    std::vector<HttpRequest> requests;
    requests.reserve(calls.size());
    for (const auto& [procedure, input] : calls) {
        QUrl url = m_base.resolved(QUrl(QStringLiteral("/trpc/") + procedure));
        // Percent-encode the whole JSON, so `&`, `+` and `#` in values survive.
        const QByteArray json = QJsonDocument(input).toJson(QJsonDocument::Compact);
        url.setQuery(QStringLiteral("input=") + QString::fromLatin1(QUrl::toPercentEncoding(QString::fromUtf8(json))),
                     QUrl::StrictMode);
        requests.push_back({url, false});
    }
    std::vector<QueryResult> results;
    results.reserve(calls.size());
    for (const HttpResponse& r : sendAll(requests)) results.push_back(parseTrpcResponse(r));
    return results;
}

QueryResult ServerClient::query(const QString& procedure, const QJsonObject& input) {
    return queryAll({{procedure, input}}).front();
}

namespace {

QueryResult failed(const QString& code, const QString& message, int status = 0) {
    QueryResult r;
    r.error.code = code;
    r.error.message = message;
    r.error.httpStatus = status;
    return r;
}

}  // namespace

QueryResult ServerClient::mutate(const QString& procedure, const QJsonObject& input) {
    QNetworkRequest request(m_base.resolved(QUrl(QStringLiteral("/trpc/") + procedure)));
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    const QByteArray body = QJsonDocument(input).toJson(QJsonDocument::Compact);
    return write(procedure, request, &body);
}

QueryResult ServerClient::upload(const QJsonObject& json, const QString& filePath, const QString& contentType) {
    auto multipart = std::make_unique<QHttpMultiPart>(QHttpMultiPart::FormDataType);
    auto* file = new QFile(filePath, multipart.get());
    if (!file->open(QIODevice::ReadOnly)) {
        return failed("FILE", file->errorString());
    }
    QHttpPart fields;
    fields.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"json\"");
    fields.setBody(QJsonDocument(json).toJson(QJsonDocument::Compact));
    multipart->append(fields);
    QHttpPart media;
    QString filename = QFileInfo(filePath).fileName();
    filename.replace('\\', "\\\\");
    filename.replace('"', "\\\"");
    filename.remove('\r');
    filename.remove('\n');
    media.setHeader(QNetworkRequest::ContentDispositionHeader,
                    QStringLiteral("form-data; name=\"file\"; filename=\"%1\"").arg(filename));
    media.setHeader(QNetworkRequest::ContentTypeHeader, contentType);
    media.setBodyDevice(file);
    multipart->append(media);
    return write("upload", QNetworkRequest(m_base.resolved(QUrl("/api/assets"))), nullptr, std::move(multipart));
}

QueryResult ServerClient::write(const QString& procedure, QNetworkRequest request, const QByteArray* json,
                                std::unique_ptr<QHttpMultiPart> multipart) {
    const bool isUpload = multipart != nullptr;
    QElapsedTimer clock;
    clock.start();
    // Sends one request, aborted at the deadline. Returns false on the abort.
    const auto send = [&](QNetworkRequest req, const QByteArray* body, QHttpMultiPart* parts, HttpResponse& resp) {
        req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        decorate(req);
        QEventLoop loop;
        QNetworkReply* reply = parts ? m_nam->post(req, parts) : body ? m_nam->post(req, *body) : m_nam->get(req);
        if (parts) {
            parts->setParent(reply);
            multipart.release();
        }
        QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
        bool aborted = false;
        QTimer deadline;
        if (m_deadlineMs > 0) {
            deadline.setSingleShot(true);
            QObject::connect(&deadline, &QTimer::timeout, reply, [reply, &aborted]() {
                aborted = true;
                reply->abort();
            });
            deadline.start(static_cast<int>(std::max<qint64>(0, m_deadlineMs - clock.elapsed())));
        }
        if (!reply->isFinished()) loop.exec();
        resp.status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        resp.body = reply->isOpen() ? reply->readAll() : QByteArray();
        for (const auto& pair : reply->rawHeaderPairs()) resp.headers.insert(pair.first.toLower(), pair.second);
        if (reply->error() != QNetworkReply::NoError && resp.status == 0) resp.networkError = reply->errorString();
        reply->deleteLater();
        return !aborted;
    };
    const auto timedOut = [&]() {
        return failed(QStringLiteral("TIMEOUT"),
                      QStringLiteral("%1: no answer within %2 ms").arg(procedure).arg(m_deadlineMs));
    };
    const auto wrongServer = [&](const char* when, const HttpResponse& resp) {
        const QByteArray got = resp.header(kInstanceHeader);
        return failed(QStringLiteral("WRONG_SERVER"),
                      QStringLiteral("%1 %2: %3 is not the expected server instance (it answered %4)")
                          .arg(QString::fromLatin1(when), procedure, m_base.toString(),
                               got.isEmpty() ? QStringLiteral("no instance") : QString::fromLatin1(got)),
                      resp.status);
    };

    if (!m_expectedInstance.isEmpty()) {
        HttpResponse check;
        if (!send(QNetworkRequest(m_base.resolved(QUrl(QStringLiteral("/ready")))), nullptr, nullptr, check)) return timedOut();
        if (check.status == 0) return parseTrpcResponse(check);  // no answer: a transient failure, nothing sent
        if (check.header(kInstanceHeader) != m_expectedInstance) return wrongServer("refusing to write", check);
    }

    if (m_deadlineMs > 0 && clock.elapsed() >= m_deadlineMs) {
        return timedOut();
    }
    HttpResponse resp;
    if (!send(request, json, multipart.get(), resp)) {
        return timedOut();
    }
    if (!m_expectedInstance.isEmpty() && resp.status != 0 && resp.header(kInstanceHeader) != m_expectedInstance) {
        return wrongServer("the answer to", resp);
    }
    if (resp.status >= 300 && resp.status < 400) {
        return failed(QStringLiteral("REDIRECT"), QStringLiteral("refusing a redirect from %1").arg(procedure), resp.status);
    }
    if (isUpload && resp.status != 0) {
        QJsonParseError error;
        const auto doc = QJsonDocument::fromJson(resp.body, &error);
        if (resp.status < 200 || resp.status >= 300) {
            return failed("HTTP", QStringLiteral("upload: HTTP %1: %2").arg(resp.status).arg(QString::fromUtf8(resp.body)), resp.status);
        }
        if (error.error != QJsonParseError::NoError || !doc.isObject()) {
            return failed("BAD_RESPONSE", "upload: response is not an asset JSON object", resp.status);
        }
        QueryResult result;
        result.data = doc.object();
        return result;
    }
    return parseTrpcResponse(resp);
}

QueryResult ServerClient::listTimelines(const QString& projectId) {
    QJsonObject input;
    if (!projectId.isEmpty()) input.insert(QStringLiteral("projectId"), projectId);
    return query(QStringLiteral("timeline.list"), input);
}

}  // namespace nt::server
