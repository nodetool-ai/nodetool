#include "server/BundledServer.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFileInfo>
#include <QHostAddress>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QStandardPaths>
#include <QTcpServer>
#include <QTimer>

namespace nt::server {
namespace {

constexpr int kStartTimeoutMs = 90000;
constexpr int kStopTimeoutMs = 5000;

QString backendDir() {
    const QString env = qEnvironmentVariable("NT_BUNDLED_BACKEND_DIR");
    if (!env.isEmpty()) return env;
    const QDir appDir(QCoreApplication::applicationDirPath());
#if defined(Q_OS_MACOS)
    return appDir.filePath(QStringLiteral("../Resources/backend"));
#elif defined(Q_OS_WIN)
    return appDir.filePath(QStringLiteral("backend"));
#else
    // The AppImage holds the app in usr/bin.
    return appDir.filePath(QStringLiteral("../share/nodetool-timeline/backend"));
#endif
}

QString nodeBinary() {
#if defined(Q_OS_WIN)
    return QStringLiteral("runtime/node.exe");
#else
    return QStringLiteral("runtime/node");
#endif
}

int freePort() {
    QTcpServer probe;
    if (!probe.listen(QHostAddress::LocalHost, 0)) return 0;
    return probe.serverPort();
}

bool healthy(QNetworkAccessManager& network, const QUrl& url) {
    QNetworkRequest request(url.resolved(QUrl(QStringLiteral("/health"))));
    request.setTransferTimeout(2000);
    QNetworkReply* reply = network.get(request);
    QEventLoop wait;
    QObject::connect(reply, &QNetworkReply::finished, &wait, &QEventLoop::quit);
    wait.exec();
    const bool ok = reply->error() == QNetworkReply::NoError &&
                    reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200;
    reply->deleteLater();
    return ok;
}

void stopOnQuit(QProcess* server) {
    QObject::connect(QCoreApplication::instance(), &QCoreApplication::aboutToQuit, server, [server] {
        if (server->state() == QProcess::NotRunning) return;
#if defined(Q_OS_WIN)
        // terminate() posts WM_CLOSE, which a console process without a
        // window never receives.
        server->kill();
#else
        server->terminate();
#endif
        if (!server->waitForFinished(kStopTimeoutMs)) {
            server->kill();
            server->waitForFinished(kStopTimeoutMs);
        }
    });
}

}  // namespace

QUrl startBundledServer(QString* error) {
    if (!qEnvironmentVariableIsEmpty("NODETOOL_SERVER_URL")) return {};
    const QDir backend(backendDir());
    const QString entry = backend.filePath(QStringLiteral("server.mjs"));
    const QString node = backend.filePath(nodeBinary());
    if (!QFileInfo::exists(entry) || !QFileInfo(node).isExecutable()) return {};

    const int port = freePort();
    if (port == 0) {
        *error = QStringLiteral("no free loopback port for the bundled server");
        return {};
    }
    const QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    QDir().mkpath(dataDir);

    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert(QStringLiteral("PORT"), QString::number(port));
    env.insert(QStringLiteral("HOST"), QStringLiteral("127.0.0.1"));
    env.insert(QStringLiteral("NODE_ENV"), QStringLiteral("production"));
    env.insert(QStringLiteral("NODE_PATH"), backend.filePath(QStringLiteral("node_modules")));
    env.insert(QStringLiteral("NODE_COMPILE_CACHE"), QDir(dataDir).filePath(QStringLiteral("server-compile-cache")));
    env.insert(QStringLiteral("NODETOOL_PACKS_REQUIRE_ALLOWLIST"), QStringLiteral("1"));
    if (!env.contains(QStringLiteral("NODETOOL_NODE_PROFILE"))) {
        env.insert(QStringLiteral("NODETOOL_NODE_PROFILE"), QStringLiteral("full"));
    }
    env.insert(QStringLiteral("NODETOOL_SHUTDOWN_GRACE_MS"), QString::number(kStopTimeoutMs - 1000));

    auto* server = new QProcess(QCoreApplication::instance());
    server->setProcessEnvironment(env);
    server->setWorkingDirectory(backend.absolutePath());
    server->setProcessChannelMode(QProcess::MergedChannels);
    server->setStandardOutputFile(QDir(dataDir).filePath(QStringLiteral("server.log")), QIODevice::Append);
    server->start(node, {entry});
    if (!server->waitForStarted()) {
        *error = QStringLiteral("the bundled server did not start: %1").arg(server->errorString());
        server->deleteLater();
        return {};
    }
    stopOnQuit(server);

    const QUrl url(QStringLiteral("http://127.0.0.1:%1").arg(port));
    QNetworkAccessManager network;
    QElapsedTimer elapsed;
    elapsed.start();
    while (elapsed.elapsed() < kStartTimeoutMs) {
        if (server->state() == QProcess::NotRunning) {
            *error = QStringLiteral("the bundled server exited with code %1, see %2/server.log")
                         .arg(server->exitCode())
                         .arg(dataDir);
            return {};
        }
        if (healthy(network, url)) return url;
        QEventLoop pause;
        QTimer::singleShot(250, &pause, &QEventLoop::quit);
        pause.exec();
    }
    *error = QStringLiteral("the bundled server did not answer /health in %1 s, see %2/server.log")
                 .arg(kStartTimeoutMs / 1000)
                 .arg(dataDir);
    return {};
}

}  // namespace nt::server
