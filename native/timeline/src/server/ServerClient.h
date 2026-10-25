#pragma once

// A read-only tRPC client for the NodeTool server (DESIGN.md D31, D32).
//
// tRPC over HTTP with plain JSON: `GET /trpc/<procedure>?input=<json>`
// answers `{"result":{"data":...}}` or `{"error":{"message","data":{"code",
// "apiCode",...}}}`. The client sends no `Origin` header, so a loopback
// request runs as local user "1" when the server trusts loopback. With a
// token it sends `Authorization: Bearer <token>`. Every request carries
// `X-Nodetool-Client: native-timeline/<version>` (D4).
//
// Reads are GET and HEAD. The one write is `timeline.update` (M5b, D34),
// a POST with the JSON input as the body; redirects are never followed.
// Calls block on a local event loop. Use one client per thread.

#include <QByteArray>
#include <QHash>
#include <QJsonObject>
#include <QJsonValue>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QString>
#include <QUrl>

#include <memory>
#include <vector>

namespace nt::server {

inline constexpr const char* kClientHeader = "native-timeline/0.1.0";

struct HttpResponse {
    int status = 0;            // 0 when the request did not get a response
    QString networkError;      // empty on success at the transport level
    QByteArray body;
    QHash<QByteArray, QByteArray> headers;  // lower-case names

    QByteArray header(const QByteArray& lowerName) const { return headers.value(lowerName); }
};

struct TrpcError {
    QString message;
    QString code;      // error.data.code, for example "NOT_FOUND" or "CONFLICT"
    QString apiCode;   // error.data.apiCode, for example "ALREADY_EXISTS"
    int httpStatus = 0;
};

struct QueryResult {
    QJsonValue data;
    TrpcError error;   // set when !ok()
    bool ok() const { return error.code.isEmpty() && error.message.isEmpty(); }
    QString describe() const;
};

struct HttpRequest {
    QUrl url;
    bool head = false;
};

class ServerClient {
public:
    explicit ServerClient(const QUrl& base, const QString& token = QString(), int timeoutMs = 30000);
    ~ServerClient();

    const QUrl& base() const { return m_base; }
    const QString& token() const { return m_token; }

    // A folder name for the server in the cache path: scheme, host and port,
    // cut to fit, then a hash of the whole canonical origin.
    QString serverKey() const;
    // The user part of the cache path: "1" on loopback (D32), else a short
    // hash of the token. The asset API does not say who the caller is.
    QString userKey() const;

    // `urlOrPath` is absolute, or a path such as `/api/storage/...` that
    // resolves against the server.
    QUrl resolve(const QString& urlOrPath) const;
    // True for a URL on the configured server: same scheme, host and port.
    bool isServerOrigin(const QUrl& url) const;
    // Adds the client and auth headers, only for a URL on the server origin.
    // Never an Origin header.
    void decorate(QNetworkRequest& request) const;

    QueryResult query(const QString& procedure, const QJsonObject& input);
    // The queries run at once; the results keep the order of `calls`.
    std::vector<QueryResult> queryAll(const std::vector<std::pair<QString, QJsonObject>>& calls);
    std::vector<HttpResponse> sendAll(const std::vector<HttpRequest>& requests);

    // POST /trpc/<procedure> with `input` as the JSON body.
    QueryResult mutate(const QString& procedure, const QJsonObject& input);

    QueryResult getTimeline(const QString& id) { return query(QStringLiteral("timeline.get"), {{QStringLiteral("id"), id}}); }
    QueryResult listTimelines(const QString& projectId = QString());
    QueryResult getAsset(const QString& id) { return query(QStringLiteral("assets.get"), {{QStringLiteral("id"), id}}); }

private:
    QUrl m_base;
    QString m_token;
    int m_timeoutMs;
    std::unique_ptr<QNetworkAccessManager> m_nam;
};

// Parses a tRPC response body (exposed for tests).
QueryResult parseTrpcResponse(const HttpResponse& response);

}  // namespace nt::server
