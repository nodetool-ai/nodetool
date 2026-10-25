#include "server/ServerClient.h"

#include <QCryptographicHash>
#include <QEventLoop>
#include <QJsonDocument>
#include <QNetworkProxy>
#include <QNetworkReply>
#include <QTimer>

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

QueryResult ServerClient::mutate(const QString& procedure, const QJsonObject& input) {
    QNetworkRequest req(m_base.resolved(QUrl(QStringLiteral("/trpc/") + procedure)));
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    decorate(req);
    QEventLoop loop;
    QNetworkReply* reply = m_nam->post(req, QJsonDocument(input).toJson(QJsonDocument::Compact));
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    loop.exec();
    HttpResponse resp;
    resp.status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    resp.body = reply->readAll();
    if (reply->error() != QNetworkReply::NoError && resp.status == 0) resp.networkError = reply->errorString();
    reply->deleteLater();
    if (resp.status >= 300 && resp.status < 400) {
        QueryResult r;
        r.error.message = QStringLiteral("refusing a redirect from %1").arg(procedure);
        r.error.code = QStringLiteral("REDIRECT");
        r.error.httpStatus = resp.status;
        return r;
    }
    return parseTrpcResponse(resp);
}

QueryResult ServerClient::listTimelines(const QString& projectId) {
    QJsonObject input;
    if (!projectId.isEmpty()) input.insert(QStringLiteral("projectId"), projectId);
    return query(QStringLiteral("timeline.list"), input);
}

}  // namespace nt::server
