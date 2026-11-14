// The bundled server's lifetime across app processes (BundledServer.h). A
// fake backend stands in for Node: runtime/node is a shell script that serves
// /health with Python. The test binary also plays the app processes: run with
// NT_BUNDLED_TEST_ROLE=owner it starts the server, opens a joined window and
// quits at once, as Open timeline does; with NT_BUNDLED_TEST_ROLE=user it
// joins and stays until a file appears.
#include "server/BundledServer.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QProcess>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QTest>
#include <QThread>
#include <QTimer>

#include <cstdio>

namespace {
bool answers(const QUrl& url) {
    QNetworkAccessManager network;
    QNetworkRequest request(url.resolved(QUrl(QStringLiteral("/health"))));
    request.setTransferTimeout(1000);
    QNetworkReply* reply = network.get(request);
    QEventLoop wait;
    QObject::connect(reply, &QNetworkReply::finished, &wait, &QEventLoop::quit);
    wait.exec();
    const bool ok = reply->error() == QNetworkReply::NoError;
    reply->deleteLater();
    return ok;
}

void spin(int ms) {
    QEventLoop pause;
    QTimer::singleShot(ms, &pause, &QEventLoop::quit);
    pause.exec();
}

int runOwner() {
    QString error;
    const QUrl url = nt::server::startBundledServer(&error);
    if (url.isEmpty()) {
        std::fprintf(stderr, "owner: %s\n", qPrintable(error));
        return 1;
    }
    std::printf("%s\n", qPrintable(url.toString()));
    std::fflush(stdout);
    QProcessEnvironment environment = QProcessEnvironment::systemEnvironment();
    environment.insert(QStringLiteral("NT_BUNDLED_TEST_ROLE"), QStringLiteral("user"));
    nt::server::noteBundledServerHandoff();
    QProcess user;
    user.setProgram(nt::server::appRelaunchProgram());
    user.setProcessEnvironment(environment);
    if (!user.startDetached()) return 1;
    QTimer::singleShot(0, qApp, &QCoreApplication::quit);
    const int rc = QCoreApplication::exec();
    nt::server::stopBundledServer();
    return rc;
}

int runUser() {
    // Join late, to show that the owner waits for a window that is still opening.
    QThread::msleep(static_cast<unsigned long>(qEnvironmentVariableIntValue("NT_BUNDLED_TEST_JOIN_DELAY_MS")));
    nt::server::joinBundledServer();
    const QString release = qEnvironmentVariable("NT_BUNDLED_TEST_RELEASE");
    while (!QFileInfo::exists(release)) spin(50);
    return 0;
}
}  // namespace

class BundledServerTest : public QObject {
    Q_OBJECT

private:
    QTemporaryDir m_scratch;

    QProcessEnvironment environment(const QString& release, int joinDelayMs) const {
        QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
        env.remove(QStringLiteral("NODETOOL_SERVER_URL"));
        env.remove(QStringLiteral("NT_BUNDLED_SERVER_USERS"));
        env.remove(QStringLiteral("NT_BUNDLED_SERVER_URL"));
        env.insert(QStringLiteral("NT_BUNDLED_BACKEND_DIR"), m_scratch.filePath(QStringLiteral("backend")));
        env.insert(QStringLiteral("NT_BUNDLED_TEST_ROLE"), QStringLiteral("owner"));
        env.insert(QStringLiteral("NT_BUNDLED_TEST_RELEASE"), release);
        env.insert(QStringLiteral("NT_BUNDLED_TEST_JOIN_DELAY_MS"), QString::number(joinDelayMs));
        env.insert(QStringLiteral("XDG_DATA_HOME"), m_scratch.filePath(QStringLiteral("data")));
        env.insert(QStringLiteral("HOME"), m_scratch.filePath(QStringLiteral("home")));
        return env;
    }

    // The owner quits right after it opens the joined window. The server must
    // keep answering until that window is gone, and stop after it.
    void checkHandoff(int joinDelayMs) {
        const QString release = m_scratch.filePath(QStringLiteral("release-%1").arg(joinDelayMs));
        QProcess owner;
        owner.setProcessEnvironment(environment(release, joinDelayMs));
        owner.start(QCoreApplication::applicationFilePath(), {});
        QVERIFY(owner.waitForStarted());
        QVERIFY2(owner.waitForReadyRead(20000), owner.readAllStandardError().constData());
        const QUrl url(QString::fromUtf8(owner.readLine()).trimmed());
        QVERIFY(url.isValid());
        // The owner has quit its window. It must still be running, and so must the server.
        spin(joinDelayMs + 1500);
        QCOMPARE(owner.state(), QProcess::Running);
        QVERIFY(answers(url));
        QFile marker(release);
        QVERIFY(marker.open(QIODevice::WriteOnly));
        marker.close();
        QVERIFY2(owner.waitForFinished(15000), owner.readAllStandardError().constData());
        QCOMPARE(owner.exitCode(), 0);
        QTRY_VERIFY_WITH_TIMEOUT(!answers(url), 10000);
    }

private slots:
    void initTestCase() {
#if defined(Q_OS_WIN)
        QSKIP("The fake backend is a shell script.");
#endif
        if (QStandardPaths::findExecutable(QStringLiteral("python3")).isEmpty()) QSKIP("The fake backend needs python3.");
        QVERIFY(m_scratch.isValid());
        const QDir backend(m_scratch.filePath(QStringLiteral("backend")));
        QVERIFY(QDir().mkpath(backend.filePath(QStringLiteral("runtime"))));
        QFile entry(backend.filePath(QStringLiteral("server.mjs")));
        QVERIFY(entry.open(QIODevice::WriteOnly));
        entry.close();
        QFile node(backend.filePath(QStringLiteral("runtime/node")));
        QVERIFY(node.open(QIODevice::WriteOnly));
        // socketserver.TCPServer, not http.server.HTTPServer: HTTPServer's bind
        // calls socket.getfqdn(), a reverse lookup that can take longer than the
        // test waits on macOS runners.
        node.write("#!/bin/sh\n"
                   "exec python3 -c 'import http.server, os, socketserver\n"
                   "class H(http.server.BaseHTTPRequestHandler):\n"
                   "    def do_GET(self):\n"
                   "        self.send_response(200); self.end_headers(); self.wfile.write(b\"ok\")\n"
                   "    def log_message(self, *a): pass\n"
                   "socketserver.TCPServer((\"127.0.0.1\", int(os.environ[\"PORT\"])), H).serve_forever()'\n");
        node.close();
        QVERIFY(node.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner));
    }

    void ownerWaitsForTheWindowItOpened() { checkHandoff(0); }
    void ownerWaitsForAWindowThatJoinsLate() { checkHandoff(2000); }

    void withoutBackendNothingStarts() {
        qputenv("NT_BUNDLED_BACKEND_DIR", QFile::encodeName(m_scratch.filePath(QStringLiteral("missing"))));
        qunsetenv("NODETOOL_SERVER_URL");
        QString error;
        QVERIFY(nt::server::startBundledServer(&error).isEmpty());
        QVERIFY(error.isEmpty());
        QVERIFY(nt::server::bundledServerUrl().isEmpty());
    }

    void relaunchUsesTheAppImage() {
        qunsetenv("APPIMAGE");
        QCOMPARE(nt::server::appRelaunchProgram(), QCoreApplication::applicationFilePath());
        const QString appImage = m_scratch.filePath(QStringLiteral("Timeline.AppImage"));
        QFile image(appImage);
        QVERIFY(image.open(QIODevice::WriteOnly));
        image.close();
        QVERIFY(image.setPermissions(QFileDevice::ReadOwner | QFileDevice::ExeOwner));
        qputenv("APPIMAGE", QFile::encodeName(appImage));
        QCOMPARE(nt::server::appRelaunchProgram(), appImage);
        qputenv("APPIMAGE", QFile::encodeName(m_scratch.filePath(QStringLiteral("missing.AppImage"))));
        QCOMPARE(nt::server::appRelaunchProgram(), QCoreApplication::applicationFilePath());
        qunsetenv("APPIMAGE");
    }
};

int main(int argc, char** argv) {
    const QString role = qEnvironmentVariable("NT_BUNDLED_TEST_ROLE");
    if (role == u"owner") {
        QGuiApplication app(argc, argv);
        return runOwner();
    }
    if (role == u"user") {
        QGuiApplication app(argc, argv);
        return runUser();
    }
    QGuiApplication app(argc, argv);
    BundledServerTest test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_bundledserver.moc"
