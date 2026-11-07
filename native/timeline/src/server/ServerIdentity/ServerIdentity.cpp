#include "server/ServerIdentity/ServerIdentity.h"

#include <QElapsedTimer>
#include <QEventLoop>
#include <QMessageAuthenticationCode>
#include <QNetworkProxy>
#include <QRandomGenerator>
#include <QSslSocket>
#include <QTcpSocket>
#include <QTimer>
#include <QThread>

#include <algorithm>
#include <limits>
#include <utility>

namespace nt::server::identity {
namespace {
thread_local BeforeWriteHook hook;

constexpr qsizetype maxResponse = 64 * 1024 * 1024;

class Connection {
public:
    Connection(int timeout, int deadline, bool tls)
        : socket(tls ? std::make_unique<QSslSocket>() : std::make_unique<QTcpSocket>()),
          timeoutMs(timeout),
          deadlineMs(deadline) {
        socket->setProxy(QNetworkProxy::NoProxy);
        socket->setReadBufferSize(64 * 1024);
        elapsed.start();
        idle.start();
        QObject::connect(socket.get(), &QTcpSocket::readyRead, &loop, [this]() {
            idle.restart();
            loop.quit();
        });
        QObject::connect(socket.get(), &QTcpSocket::bytesWritten, &loop, [this]() {
            idle.restart();
            loop.quit();
        });
        QObject::connect(socket.get(), &QTcpSocket::connected, &loop, &QEventLoop::quit);
        QObject::connect(socket.get(), &QTcpSocket::disconnected, &loop, &QEventLoop::quit);
        QObject::connect(socket.get(), &QTcpSocket::errorOccurred, &loop, &QEventLoop::quit);
        if (auto* ssl = qobject_cast<QSslSocket*>(socket.get())) {
            QObject::connect(ssl, &QSslSocket::encrypted, &loop, &QEventLoop::quit);
        }
    }
    bool budget() {
        if (QThread::currentThread()->isInterruptionRequested()) {
            socket->abort();
            code = "CANCELLED";
            error = "server write cancelled";
            return false;
        }
        if ((deadlineMs > 0 && elapsed.elapsed() >= deadlineMs) || (timeoutMs > 0 && idle.elapsed() >= timeoutMs)) {
            code = "TIMEOUT";
            error = "server write timed out";
            return false;
        }
        return true;
    }
    bool wait(const std::function<bool()>& done) {
        while (budget()) {
            if (socket->bytesAvailable() > 0) {
                pending += socket->readAll();
            }
            if (pending.size() > maxResponse + 65536) {
                return fail("HTTP response is too large");
            }
            if (done()) {
                return true;
            }
            if (socket->state() == QAbstractSocket::UnconnectedState) {
                return fail("server connection closed: " + socket->errorString());
            }
            qint64 left = 25;  // Also wake to observe thread interruption.
            if (timeoutMs > 0) {
                left = std::min(left, timeoutMs - idle.elapsed());
            }
            if (deadlineMs > 0) {
                left = std::min(left, deadlineMs - elapsed.elapsed());
            }
            QTimer timer;
            timer.setSingleShot(true);
            QObject::connect(&timer, &QTimer::timeout, &loop, &QEventLoop::quit);
            timer.start(static_cast<int>(std::max<qint64>(1, left)));
            loop.exec();
        }
        return false;
    }
    bool fail(const QString& message) {
        code = "NETWORK";
        error = message;
        return false;
    }
    bool send(const QByteArray& bytes) {
        if (!budget()) {
            return false;
        }
        if (socket->state() != QAbstractSocket::ConnectedState) {
            return fail("server connection closed before write");
        }
        if (socket->write(bytes) != bytes.size()) {
            return fail(socket->errorString());
        }
        return wait([this]() { return socket->bytesToWrite() == 0; });
    }
    bool take(qsizetype size, QByteArray& out) {
        if (size < 0 || size > maxResponse) {
            return fail("HTTP body is too large");
        }
        if (!wait([&]() { return pending.size() >= size; })) {
            return false;
        }
        out += pending.first(size);
        pending.remove(0, size);
        return true;
    }
    bool line(QByteArray& out) {
        if (!wait([this]() { return pending.contains("\r\n") || pending.size() > 65536; })) {
            return false;
        }
        const auto end = pending.indexOf("\r\n");
        if (end < 0 || end > 65536) {
            return fail("invalid HTTP line");
        }
        out = pending.first(end);
        pending.remove(0, end + 2);
        return true;
    }
    bool response(HttpResponse& out, bool proof, const std::function<bool()>& checkHeaders = {}) {
        QByteArray value;
        if (!line(value)) {
            return false;
        }
        const auto status = value.split(' ');
        bool valid = false;
        out.status = status.value(1).toInt(&valid);
        if (!value.startsWith("HTTP/1.1 ") || !valid || out.status < 200 || out.status > 599) {
            return fail("invalid HTTP status");
        }
        qsizetype headerSize = 0;
        while (true) {
            if (!line(value)) {
                return false;
            }
            if (value.isEmpty()) {
                break;
            }
            headerSize += value.size();
            const auto colon = value.indexOf(':');
            if (colon <= 0 || headerSize > 65536) {
                return fail("invalid HTTP headers");
            }
            const auto name = value.first(colon).toLower();
            if (out.headers.contains(name)) {
                return fail("duplicate HTTP header");
            }
            out.headers.insert(name, value.mid(colon + 1).trimmed());
        }
        if (checkHeaders && !checkHeaders()) {
            return false;
        }
        if (out.headers.contains("transfer-encoding")) {
            if (out.header("transfer-encoding").toLower() != "chunked" || out.headers.contains("content-length")) {
                return fail("invalid HTTP framing");
            }
            while (true) {
                if (!line(value)) {
                    return false;
                }
                const auto size = value.split(';').first().toLongLong(&valid, 16);
                if (!valid || size < 0 || size > maxResponse - out.body.size()) {
                    return fail("invalid chunk size");
                }
                if (size == 0) {
                    qsizetype trailers = 0;
                    do {
                        if (!line(value)) {
                            return false;
                        }
                        trailers += value.size();
                        if (trailers > 65536) {
                            return fail("HTTP trailers too large");
                        }
                    } while (!value.isEmpty());
                    return true;
                }
                if (!take(size, out.body)) {
                    return false;
                }
                QByteArray crlf;
                if (!take(2, crlf)) {
                    return false;
                }
                if (crlf != "\r\n") {
                    return fail("invalid chunk terminator");
                }
            }
        }
        if (out.headers.contains("content-length")) {
            const auto size = out.header("content-length").toLongLong(&valid);
            if (!valid) {
                return fail("invalid Content-Length");
            }
            return take(size, out.body);
        }
        if (out.status == 204 || out.status == 304) {
            return true;
        }
        if (proof) {
            return fail("identity answer has no HTTP framing");
        }
        if (!wait([this]() {
                return socket->state() == QAbstractSocket::UnconnectedState || pending.size() > maxResponse;
            })) {
            return false;
        }
        if (pending.size() > maxResponse) {
            return fail("HTTP body is too large");
        }
        out.body = std::move(pending);
        return true;
    }
    std::unique_ptr<QTcpSocket> socket;
    QString code, error;

private:
    QEventLoop loop;
    QByteArray pending;
    QElapsedTimer elapsed, idle;
    int timeoutMs, deadlineMs;
};

QByteArray nonce() {
    QByteArray bytes;
    for (int i = 0; i < 4; ++i) {
        bytes += QByteArray::number(QRandomGenerator::system()->generate64(), 16).rightJustified(16, '0');
    }
    return bytes;
}

QByteArray head(const QByteArray& method, const QNetworkRequest& request, qint64 length, bool keepAlive) {
    const auto url = request.url();
    auto target = url.path(QUrl::FullyEncoded).toUtf8();
    if (target.isEmpty()) {
        target = "/";
    }
    if (url.hasQuery()) {
        target += '?' + url.query(QUrl::FullyEncoded).toUtf8();
    }
    auto host = url.host(QUrl::EncodeUnicode).toUtf8();
    if (host.contains(':')) {
        host = '[' + host + ']';
    }
    host += ':' + QByteArray::number(url.port(url.scheme() == u"https" ? 443 : 80));
    QByteArray result = method + ' ' + target + " HTTP/1.1\r\nHost: " + host +
                        "\r\nConnection: " + (keepAlive ? "keep-alive" : "close") + "\r\n";
    for (const auto& name : request.rawHeaderList()) {
        result += name + ": " + request.rawHeader(name) + "\r\n";
    }
    if (method == "POST") {
        result += "Content-Length: " + QByteArray::number(length) + "\r\n";
    }
    return result + "\r\n";
}
}  // namespace

void setBeforeWriteHook(BeforeWriteHook value) { hook = std::move(value); }
QString beforeWrite() { return hook ? hook() : QString(); }

WriteResult write(QNetworkRequest request, const QByteArray& secret, const QByteArray& body, QIODevice* file,
                  const QByteArray& tail, int timeoutMs, int deadlineMs) {
    const auto url = request.url();
    if (url.scheme() != u"http" && url.scheme() != u"https") {
        return {{}, "NETWORK", "unsupported server scheme"};
    }
    for (const auto& name : request.rawHeaderList()) {
        if (name.contains('\r') || name.contains('\n') || request.rawHeader(name).contains('\r') ||
            request.rawHeader(name).contains('\n')) {
            return {{}, "NETWORK", "invalid request header"};
        }
    }
    Connection connection(timeoutMs, deadlineMs, url.scheme() == u"https");
    auto failure = [&]() -> WriteResult { return {{}, connection.code, connection.error}; };
    auto* ssl = qobject_cast<QSslSocket*>(connection.socket.get());
    if (ssl) {
        ssl->connectToHostEncrypted(url.host(), static_cast<quint16>(url.port(443)));
    } else {
        connection.socket->connectToHost(url.host(), static_cast<quint16>(url.port(80)));
    }
    if (!connection.wait([&]() {
            return ssl ? ssl->isEncrypted() : connection.socket->state() == QAbstractSocket::ConnectedState;
        })) {
        return failure();
    }
    auto ready = request;
    ready.setUrl(url.resolved(QUrl("/ready")));
    ready.setRawHeader("Content-Type", {});
    const auto challenge = nonce();
    ready.setRawHeader("x-nodetool-instance-nonce", challenge);
    if (!connection.send(head("GET", ready, 0, true))) {
        return failure();
    }
    HttpResponse proof;
    const auto expected = QMessageAuthenticationCode::hash(challenge, secret, QCryptographicHash::Sha256).toHex();
    const auto checkProof = [&]() {
        if (proof.status >= 300 && proof.status < 400) {
            connection.code = "REDIRECT";
            connection.error = "refusing an identity redirect";
            return false;
        }
        const auto actual = proof.header("x-nodetool-instance-proof");
        unsigned int difference = static_cast<unsigned int>(actual.size() ^ expected.size());
        for (qsizetype i = 0; i < expected.size(); ++i) {
            difference |=
                static_cast<unsigned char>(expected[i]) ^ static_cast<unsigned char>(i < actual.size() ? actual[i] : 0);
        }
        if (difference != 0 || proof.status < 200 || proof.status >= 300) {
            connection.code = "WRONG_SERVER";
            connection.error = "refusing to write: not the expected server instance";
            return false;
        }
        return true;
    };
    if (!connection.response(proof, true, checkProof)) {
        return {proof, connection.code, connection.error};
    }
    const auto hookError = beforeWrite();
    if (!hookError.isEmpty()) {
        return {{}, "TIMEOUT", hookError};
    }
    if (!connection.budget()) {
        return failure();
    }
    if (proof.header("connection").toLower() == "close") {
        return {{}, "NETWORK", "server connection closed before write"};
    }
    const qint64 length = body.size() + (file ? file->size() - file->pos() : 0) + tail.size();
    if (!connection.send(head("POST", request, length, false)) || !connection.send(body)) {
        return failure();
    }
    while (file && !file->atEnd()) {
        const auto bytes = file->read(64 * 1024);
        if (bytes.isEmpty()) {
            return {{}, "FILE", "could not read upload file"};
        }
        if (!connection.send(bytes)) {
            return failure();
        }
    }
    if (!tail.isEmpty() && !connection.send(tail)) {
        return failure();
    }
    HttpResponse response;
    if (!connection.response(response, false)) {
        return failure();
    }
    return {std::move(response), {}, {}};
}
}  // namespace nt::server::identity
