#include "server/BundledServer.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QDir>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QHostAddress>
#include <QLockFile>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QStandardPaths>
#include <QTcpServer>
#include <QTimer>
#include <QWindow>

#include <memory>

namespace nt::server {
namespace {

constexpr int kStartTimeoutMs = 90000;
constexpr int kStopTimeoutMs = 5000;
// How long a window that is being opened has to join before an owner that
// quits stops the server.
constexpr qint64 kHandoffMs = 30000;
constexpr int kUserPollMs = 250;

const char* const kUsersVariable = "NT_BUNDLED_SERVER_USERS";
const char* const kUrlVariable = "NT_BUNDLED_SERVER_URL";

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

// True while another app process holds its lock in `dir`, or a window that
// is being opened announced itself less than kHandoffMs ago. Removes the
// locks of processes that are gone and expired announcements.
bool otherUsers(const QString& dir) {
    const QDir users(dir);
    bool found = false;
    for (const QFileInfo& entry : users.entryInfoList({QStringLiteral("*.lock")}, QDir::Files)) {
        QLockFile lock(entry.filePath());
        // Only a lock whose process is gone is stale, however old it is.
        lock.setStaleLockTime(0);
        if (lock.tryLock(0)) {
            lock.unlock();
        } else if (lock.error() == QLockFile::LockFailedError) {
            found = true;
        }
    }
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    for (const QFileInfo& entry : users.entryInfoList({QStringLiteral("*.handoff")}, QDir::Files)) {
        if (now - entry.lastModified().toMSecsSinceEpoch() < kHandoffMs) {
            found = true;
        } else {
            QFile::remove(entry.filePath());
        }
    }
    return found;
}

// UI thread only. The server process of a bundled server this process
// started. Owned by its QCoreApplication parent. stopBundledServer() stops the
// server after the last save. A process that ends another way kills it
// when the application destroys the host.
class BundledServerHost : public QObject {
public:
    BundledServerHost(QString usersDir, QObject* parent) : QObject(parent), m_usersDir(std::move(usersDir)) {
        setObjectName(QStringLiteral("nt-bundled-server-host"));
    }
    // A member: the host owns the server process and kills it, if still running, when destroyed.
    QProcess* process() { return &m_process; }

    void stop() {
        if (m_process.state() == QProcess::NotRunning) return;
        if (otherUsers(m_usersDir)) {
            waitForOtherUsers();
        }
#if defined(Q_OS_WIN)
        // terminate() posts WM_CLOSE, which a console process without a
        // window never receives.
        m_process.kill();
#else
        m_process.terminate();
#endif
        if (!m_process.waitForFinished(kStopTimeoutMs)) {
            m_process.kill();
            m_process.waitForFinished(kStopTimeoutMs);
        }
        QDir(m_usersDir).removeRecursively();
    }

private:
    // The windows go away at once. The process stays, holding the server and,
    // in an AppImage, the mount it runs from, until the windows it opened close.
    void waitForOtherUsers() {
        if (qobject_cast<QGuiApplication*>(QCoreApplication::instance())) {
            for (QWindow* window : QGuiApplication::topLevelWindows()) window->hide();
        }
        QEventLoop wait;
        QTimer poll;
        connect(&poll, &QTimer::timeout, &wait, [this, &wait] {
            if (!otherUsers(m_usersDir) || m_process.state() == QProcess::NotRunning) wait.quit();
        });
        poll.start(kUserPollMs);
        wait.exec();
    }

    QString m_usersDir;
    QProcess m_process;
};

// UI thread only. This process's lock in the bundled server's users folder.
// Owned by its QCoreApplication parent. The lock goes when the process exits,
// or with the process if it ends without cleanup.
class BundledServerUser : public QObject {
public:
    BundledServerUser(const QString& usersDir, QObject* parent)
        : QObject(parent),
          m_lock(std::make_unique<QLockFile>(
              QDir(usersDir).filePath(QStringLiteral("%1.lock").arg(QCoreApplication::applicationPid())))) {
        setObjectName(QStringLiteral("nt-bundled-server-user"));
        m_lock->setStaleLockTime(0);
        if (!m_lock->tryLock(0)) return;
        // The window that announced itself has joined: its lock now keeps the server.
        for (const QFileInfo& entry : QDir(usersDir).entryInfoList({QStringLiteral("*.handoff")}, QDir::Files)) {
            QFile::remove(entry.filePath());
        }
    }

private:
    std::unique_ptr<QLockFile> m_lock;
};

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
    const QString usersDir =
        QDir(dataDir).filePath(QStringLiteral("server-users/%1").arg(QCoreApplication::applicationPid()));
    QDir(usersDir).removeRecursively();
    QDir().mkpath(usersDir);

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

    const QUrl url(QStringLiteral("http://127.0.0.1:%1").arg(port));
    // Qt parent: the application. It stops the server at quit.
    auto* host = new BundledServerHost(usersDir, QCoreApplication::instance());
    QProcess* server = host->process();
    server->setProcessEnvironment(env);
    server->setWorkingDirectory(backend.absolutePath());
    server->setProcessChannelMode(QProcess::MergedChannels);
    server->setStandardOutputFile(QDir(dataDir).filePath(QStringLiteral("server.log")), QIODevice::Append);
    server->start(node, {entry});
    if (!server->waitForStarted()) {
        *error = QStringLiteral("the bundled server did not start: %1").arg(server->errorString());
        host->deleteLater();
        return {};
    }

    QNetworkAccessManager network;
    QElapsedTimer elapsed;
    elapsed.start();
    while (elapsed.elapsed() < kStartTimeoutMs) {
        if (server->state() == QProcess::NotRunning) {
            *error = QStringLiteral("the bundled server exited with code %1, see %2/server.log")
                         .arg(server->exitCode())
                         .arg(dataDir);
            host->deleteLater();
            return {};
        }
        if (healthy(network, url)) {
            qputenv("NODETOOL_SERVER_URL", url.toString().toUtf8());
            qputenv(kUrlVariable, url.toString().toUtf8());
            qputenv(kUsersVariable, QFile::encodeName(usersDir));
            return url;
        }
        QEventLoop pause;
        QTimer::singleShot(250, &pause, &QEventLoop::quit);
        pause.exec();
    }
    // A server that never answered would otherwise run until the app quits.
    host->stop();
    host->deleteLater();
    *error = QStringLiteral("the bundled server did not answer /health in %1 s, see %2/server.log")
                 .arg(kStartTimeoutMs / 1000)
                 .arg(dataDir);
    return {};
}

void joinBundledServer() {
    auto* app = QCoreApplication::instance();
    const QString usersDir = qEnvironmentVariable(kUsersVariable);
    if (!app || usersDir.isEmpty() || !QFileInfo(usersDir).isDir()) return;
    if (app->findChild<QObject*>(QStringLiteral("nt-bundled-server-host"), Qt::FindDirectChildrenOnly) ||
        app->findChild<QObject*>(QStringLiteral("nt-bundled-server-user"), Qt::FindDirectChildrenOnly)) {
        return;
    }
    // Qt parent: the application.
    new BundledServerUser(usersDir, app);
}

void stopBundledServer() {
    auto* app = QCoreApplication::instance();
    if (!app) return;
    // Only startBundledServer() makes a child with this name.
    if (auto* host = app->findChild<QObject*>(QStringLiteral("nt-bundled-server-host"), Qt::FindDirectChildrenOnly)) {
        static_cast<BundledServerHost*>(host)->stop();
    }
}

QUrl bundledServerUrl() {
    return qEnvironmentVariableIsEmpty(kUsersVariable) ? QUrl() : QUrl(qEnvironmentVariable(kUrlVariable));
}

void noteBundledServerHandoff() {
    const QString usersDir = qEnvironmentVariable(kUsersVariable);
    if (usersDir.isEmpty() || !QFileInfo(usersDir).isDir()) return;
    QFile marker(QDir(usersDir).filePath(QStringLiteral("%1-%2.handoff")
        .arg(QCoreApplication::applicationPid()).arg(QDateTime::currentMSecsSinceEpoch())));
    if (marker.open(QIODevice::WriteOnly)) marker.close();
}

QString appRelaunchProgram() {
    const QString appImage = qEnvironmentVariable("APPIMAGE");
    if (!appImage.isEmpty() && QFileInfo(appImage).isExecutable()) return appImage;
    return QCoreApplication::applicationFilePath();
}

}  // namespace nt::server
