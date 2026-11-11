#pragma once

#include <QEventLoop>
#include <QCryptographicHash>
#include <QMessageAuthenticationCode>
#include <QSemaphore>
#include <QTcpServer>
#include <QTcpSocket>
#include <QThread>
#include <QTimer>
#include <QUrl>
#include <atomic>
#include <memory>

// Runs independently of the test/UI thread so data keeps arriving while a
// browser destructor waits. The finite lifetime also bounds a failing test.
class TrickleHttpServer {
public:
    explicit TrickleHttpServer(int lifetimeMs = 3000, QByteArray instanceSecret = {},
                               bool trickle = true, bool sendHeaders = true) {
        const auto ready = std::make_shared<QSemaphore>();
        m_thread.reset(QThread::create([this, lifetimeMs, ready, instanceSecret, trickle, sendHeaders] {
            QTcpServer server;
            QEventLoop loop;
            QObject::connect(&server, &QTcpServer::newConnection, &server, [&] {
                while (auto* socket = server.nextPendingConnection()) {
                    socket->setParent(&server);
                    socket->setSocketOption(QAbstractSocket::LowDelayOption, 1);
                    auto responded = std::make_shared<bool>(false);
                    auto request = std::make_shared<QByteArray>();
                    QObject::connect(socket, &QTcpSocket::readyRead, socket, [this, socket, responded, request, lifetimeMs, instanceSecret, trickle, sendHeaders] {
                        request->append(socket->readAll());
                        if (*responded) { return; }
                        if (!request->contains("\r\n\r\n")) { return; }
                        *responded = true;
                        ++m_requests;
                        QByteArray head = "HTTP/1.1 200 OK\r\nContent-Length: 1048576\r\nContent-Type: application/json\r\nConnection: close\r\n";
                        if (!instanceSecret.isEmpty()) {
                            for (const auto& line : request->split('\n')) {
                                if (line.toLower().startsWith("x-nodetool-instance-nonce:")) {
                                    const auto nonce = line.mid(line.indexOf(':') + 1).trimmed();
                                    head += "x-nodetool-instance-proof: " + QMessageAuthenticationCode::hash(nonce, instanceSecret, QCryptographicHash::Sha256).toHex() + "\r\n";
                                }
                            }
                        }
                        if (sendHeaders) { socket->write(head + "\r\n{"); }
                        auto* timer = new QTimer(socket);
                        QObject::connect(timer, &QTimer::timeout, socket, [this, socket] {
                            if (socket->state() == QAbstractSocket::ConnectedState) {
                                socket->write(" ");
                                ++m_chunks;
                            }
                        });
                        if (trickle) { timer->start(10); }
                        QTimer::singleShot(lifetimeMs, socket, [socket] { socket->abort(); });
                    });
                    QObject::connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
                }
            });
            server.listen(QHostAddress::LocalHost, 0);
            m_port = server.serverPort();
            ready->release();
            loop.exec();
        }));
        m_thread->start();
        ready->acquire();
    }
    ~TrickleHttpServer() {
        m_thread->quit();
        m_thread->wait();
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(m_port)); }
    int requests() const { return m_requests.load(); }
    int chunks() const { return m_chunks.load(); }
private:
    std::unique_ptr<QThread> m_thread;
    quint16 m_port = 0;
    std::atomic_int m_requests = 0;
    std::atomic_int m_chunks = 0;
};
