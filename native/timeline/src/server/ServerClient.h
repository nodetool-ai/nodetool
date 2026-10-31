#pragma once

// A tRPC and asset upload client for the NodeTool server (DESIGN.md D31, D32).
//
// tRPC over HTTP with plain JSON: `GET /trpc/<procedure>?input=<json>`
// answers `{"result":{"data":...}}` or `{"error":{"message","data":{"code",
// "apiCode",...}}}`. The client sends no `Origin` header, so a loopback
// request runs as local user "1" when the server trusts loopback. With a
// token it sends `Authorization: Bearer <token>`. Every request carries
// `X-Nodetool-Client: native-timeline/<version>` (D4).
//
// Reads are GET and HEAD. Writes use tRPC JSON or multipart asset upload.
// Redirects are never followed.
// Calls block on a local event loop. Use one client per thread.
//
// With an expected instance, a fresh nonce HMAC-SHA256 proves /ready before
// JSON or multipart bytes leave on that same HTTP/1.1 connection. The secret
// never goes over the wire. A closed connection fails without reconnecting.
// This works with scratch HTTP servers without provisioning pinned TLS or a
// private Unix socket, and QTcpSocket guarantees the write uses the proven peer.

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

class QHttpMultiPart;

namespace nt::server {

inline constexpr const char* kClientHeader = "native-timeline/0.1.0";
inline constexpr const char* kInstanceHeader = "x-nodetool-instance";

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
    // Refused (code WRONG_SERVER) when an expected instance is set and the
    // server does not prove knowledge of its secret.
    QueryResult mutate(const QString& procedure, const QJsonObject& input);
    // JSON-only asset creation (folders and metadata), through the same write proof.
    QueryResult createAsset(const QJsonObject& fields);
    // Side-effect-free SDK static preflight; pins the same server as writes.
    QueryResult preflightWorkflow(const QString& workflowId, const QJsonObject& inputs = {});
    QueryResult upload(const QJsonObject& json, const QString& filePath, const QString& contentType);
    // Empty: no instance check.
    void setExpectedInstance(const QString& instance) { m_expectedInstance = instance.toUtf8(); }
    // A bound on the private write path, check included, in elapsed time; the
    // transfer timeout only bounds silence. 0: none. Aborted calls fail with
    // code TIMEOUT.
    void setDeadlineMs(int ms) { m_deadlineMs = ms; }

    QueryResult getTimeline(const QString& id) { return query(QStringLiteral("timeline.get"), {{QStringLiteral("id"), id}}); }
    QueryResult listTimelines(const QString& projectId = QString());
    QueryResult getAsset(const QString& id) { return query(QStringLiteral("assets.get"), {{QStringLiteral("id"), id}}); }

private:
    QueryResult write(const QString& operation, QNetworkRequest request, const QByteArray* json,
                      std::unique_ptr<QHttpMultiPart> multipart = nullptr, const QString& contentType = {},
                      bool plainJson = false);
    QUrl m_base;
    QString m_token;
    int m_timeoutMs;
    QByteArray m_expectedInstance;
    int m_deadlineMs = 0;
    std::unique_ptr<QNetworkAccessManager> m_nam;
};

// Parses a tRPC response body (exposed for tests).
QueryResult parseTrpcResponse(const HttpResponse& response);

}  // namespace nt::server
