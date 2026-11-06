#pragma once

// A small HTTP/1.1 server for the cache and client tests. It serves byte
// files with `Range` (like `/api/storage`), HEAD, and JSON answers for
// `/trpc/...`, and it can misbehave on purpose: drop the connection mid-body,
// send a wrong `Content-Range` total, ignore `Range`, or send slowly.
// It runs on the thread that creates it; that thread must spin its event loop.

#include <QByteArray>
#include <QHash>
#include <QMessageAuthenticationCode>
#include <QMutex>
#include <QMutexLocker>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QUrl>

#include <functional>
#include <memory>
#include <vector>

struct RecordedRequest {
    QByteArray body;
    QByteArray method;
    QByteArray target;  // path and query, as sent
    QHash<QByteArray, QByteArray> headers;  // lower-case names
};

struct ServedFile {
    ServedFile(QByteArray bytes = {}) : data(std::move(bytes)) {}
    QByteArray data;
    int status = 200;
    QHash<QByteArray, QByteArray> extraHeaders;
    int dropAfterBytes = -1;  // > 0: close the connection after this many body bytes
    int dropCount = 0;        // how many of the next GETs drop
    bool wrongTotal = false;  // 206 answers name total + 7
    bool closeDelimited = false; // finish the body by closing, without Content-Length
    bool ignoreRange = false; // answer 200 to a Range request
    int chunkDelayMs = 0;     // delay between 16 KiB chunks
    QByteArray redirectTo;    // non-empty: answer 302 with this Location
};

class TestHttpServer : public QObject {
public:
    using JsonHandler = std::function<QByteArray(const QByteArray& path, const QUrl& url)>;
    using PostHandler = std::function<QByteArray(const QByteArray& path, const QByteArray& body)>;

    TestHttpServer() {
        QObject::connect(&m_server, &QTcpServer::newConnection, this, [this]() {
            while (QTcpSocket* s = m_server.nextPendingConnection()) accept(s);
        });
        m_server.listen(QHostAddress::LocalHost, 0);
    }

    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(m_server.serverPort())); }

    void setFile(const QByteArray& path, ServedFile f) {
        QMutexLocker l(&m_mutex);
        m_files[path] = std::move(f);
    }
    ServedFile& file(const QByteArray& path) { return m_files[path]; }
    void setJson(JsonHandler h) { m_json = std::move(h); }
    void setPost(PostHandler h) { m_post = std::move(h); }
    void setInstanceSecret(QByteArray secret) { m_instanceSecret = std::move(secret); }
    void setResponseHeaders(QHash<QByteArray, QByteArray> headers) { m_headers = std::move(headers); }

    std::vector<RecordedRequest> requests() const {
        QMutexLocker l(&m_mutex);
        return m_requests;
    }
    int countRequests(const QByteArray& method, const QByteArray& pathPrefix) const {
        QMutexLocker l(&m_mutex);
        int n = 0;
        for (const auto& r : m_requests) {
            if (r.method == method && r.target.startsWith(pathPrefix)) ++n;
        }
        return n;
    }
    void clearRequests() {
        QMutexLocker l(&m_mutex);
        m_requests.clear();
    }

private:
    void accept(QTcpSocket* socket) {
        auto buffer = std::make_shared<QByteArray>();
        QObject::connect(socket, &QTcpSocket::readyRead, socket, [this, socket, buffer]() {
            buffer->append(socket->readAll());
            int end;
            while ((end = buffer->indexOf("\r\n\r\n")) >= 0) {
                const QByteArray head = buffer->left(end);
                qint64 length = 0;
                for (const QByteArray& line : head.split('\n')) {
                    if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toLongLong();
                }
                if (buffer->size() < end + 4 + length) return;  // wait for the whole body
                const QByteArray body = buffer->mid(end + 4, length);
                buffer->remove(0, end + 4 + length);
                handle(socket, head, body);
            }
        });
        QObject::connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
    }

    void writeHead(QTcpSocket* s, int status, const char* reason, const QHash<QByteArray, QByteArray>& headers) {
        QByteArray out = "HTTP/1.1 " + QByteArray::number(status) + ' ' + reason + "\r\n";
        auto combined = m_headers;
        if (!m_instanceProof.isEmpty()) {
            combined.insert("x-nodetool-instance-proof", m_instanceProof);
        }
        for (auto it = headers.begin(); it != headers.end(); ++it) combined.insert(it.key(), it.value());
        for (auto it = combined.begin(); it != combined.end(); ++it) out += it.key() + ": " + it.value() + "\r\n";
        out += "\r\n";
        s->write(out);
    }

    void handle(QTcpSocket* socket, const QByteArray& head, const QByteArray& requestBody = {}) {
        const QList<QByteArray> lines = head.split('\n');
        const QList<QByteArray> requestLine = lines.value(0).trimmed().split(' ');
        RecordedRequest req;
        req.body = requestBody;
        req.method = requestLine.value(0);
        req.target = requestLine.value(1);
        for (int i = 1; i < lines.size(); ++i) {
            const int colon = lines[i].indexOf(':');
            if (colon > 0) req.headers.insert(lines[i].left(colon).trimmed().toLower(), lines[i].mid(colon + 1).trimmed());
        }
        {
            QMutexLocker l(&m_mutex);
            m_requests.push_back(req);
        }
        const auto nonce = req.headers.value("x-nodetool-instance-nonce");
        m_instanceProof = nonce.isEmpty() || m_instanceSecret.isEmpty() ? QByteArray()
            : QMessageAuthenticationCode::hash(nonce, m_instanceSecret, QCryptographicHash::Sha256).toHex();
        const QUrl url(QString::fromLatin1(req.target));
        const QByteArray path = url.path(QUrl::FullyEncoded).toLatin1();

        if ((path.startsWith("/trpc/") || path == "/api/assets") && req.method == "POST" && m_post) {
            const QByteArray body = m_post(path, requestBody);
            writeHead(socket, 200, "OK",
                      {{"Content-Type", "application/json"}, {"Content-Length", QByteArray::number(body.size())}});
            socket->write(body);
            return;
        }
        if (path.startsWith("/trpc/") && m_json) {
            const QByteArray body = m_json(path, url);
            writeHead(socket, 200, "OK",
                      {{"Content-Type", "application/json"}, {"Content-Length", QByteArray::number(body.size())}});
            socket->write(body);
            return;
        }
        ServedFile* f = nullptr;
        {
            QMutexLocker l(&m_mutex);
            auto it = m_files.find(path);
            if (it != m_files.end()) f = &it.value();
        }
        if (!f) {
            const QByteArray body = "{\"detail\":\"Not found\"}";
            writeHead(socket, 404, "Not Found", {{"Content-Length", QByteArray::number(body.size())}});
            socket->write(body);
            return;
        }
        if (!f->redirectTo.isEmpty()) {
            writeHead(socket, 302, "Found", {{"Location", f->redirectTo}, {"Content-Length", "0"}});
            return;
        }
        const qint64 total = f->data.size();
        QHash<QByteArray, QByteArray> headers = f->extraHeaders;
        headers.insert("Accept-Ranges", "bytes");
        qint64 start = 0;
        int status = f->status;
        const QByteArray range = req.headers.value("range");
        if (!range.isEmpty() && !f->ignoreRange && range.startsWith("bytes=") && range.endsWith('-')) {
            start = range.mid(6, range.size() - 7).toLongLong();
            if (start >= total) {
                writeHead(socket, 416, "Range Not Satisfiable",
                          {{"Content-Range", "bytes */" + QByteArray::number(total)}, {"Content-Length", "0"}});
                return;
            }
            status = 206;
            headers.insert("Content-Range", "bytes " + QByteArray::number(start) + '-' + QByteArray::number(total - 1) +
                                                '/' + QByteArray::number(f->wrongTotal ? total + 7 : total));
        }
        const QByteArray body = f->data.mid(start);
        if (f->closeDelimited) { headers.insert("Connection", "close"); }
        else { headers.insert("Content-Length", QByteArray::number(body.size())); }
        writeHead(socket, status, status == 206 ? "Partial Content" : "OK", headers);
        if (req.method == "HEAD") return;

        qint64 limit = body.size();
        bool drop = f->closeDelimited;
        if (f->dropAfterBytes > 0 && f->dropCount > 0) {
            --f->dropCount;
            limit = std::min<qint64>(limit, f->dropAfterBytes);
            drop = true;
        }
        if (f->chunkDelayMs <= 0) {
            socket->write(body.left(limit));
            if (drop) {
                socket->disconnectFromHost();
            }
            return;
        }
        // Slow: 16 KiB per tick.
        auto offset = std::make_shared<qint64>(0);
        auto* timer = new QTimer(socket);
        QPointer<QTcpSocket> guard(socket);
        QObject::connect(timer, &QTimer::timeout, socket, [guard, timer, offset, body, limit, drop]() {
            if (!guard) return;
            const qint64 n = std::min<qint64>(16 * 1024, limit - *offset);
            guard->write(body.mid(*offset, n));
            *offset += n;
            if (*offset >= limit) {
                timer->stop();
                if (drop) {
                    guard->disconnectFromHost();
                }
            }
        });
        timer->start(f->chunkDelayMs);
    }

    QTcpServer m_server;
    mutable QMutex m_mutex;
    QHash<QByteArray, ServedFile> m_files;
    std::vector<RecordedRequest> m_requests;
    JsonHandler m_json;
    PostHandler m_post;
    QHash<QByteArray, QByteArray> m_headers;
    QByteArray m_instanceSecret, m_instanceProof;
};
