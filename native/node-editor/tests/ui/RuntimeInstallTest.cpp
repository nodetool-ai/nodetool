#include "server/SetupController.h"
#include "ui/EditorWindow.h"
#include <QClipboard>
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QtTest>
#include <cerrno>
#include <csignal>

using namespace nodetool;
using node_editor::SetupController;
namespace {
class Server : public QTcpServer {
public:
    Server() {
        listen(QHostAddress::AnyIPv4);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto *socket = nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, socket, [socket] {
                    const auto bytes = socket->readAll();
                    QJsonObject data{{"packs", QJsonArray{}}, {"workflows", QJsonArray{}},
                        {"statuses", QJsonArray{QJsonObject{{"id", "python"}, {"installed", false}}}}};
                    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
                    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                    socket->disconnectFromHost();
                });
            }
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};
bool click(QQuickWidget &view, const QString &name) {
    QTest::qWait(100);
    auto *item = view.rootObject()->findChild<QQuickItem *>(name);
    if (!item || !item->isVisible() || !item->isEnabled()) {
        return false;
    }
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier,
        item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
    return true;
}
void panel(QQuickWidget &view, SetupController &controller) {
    view.setResizeMode(QQuickWidget::SizeRootObjectToView);
    view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
    view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/SetupPanel.qml"));
    view.resize(660, 860);
    view.show();
}
qint64 processId(const QString &path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        return 0;
    }
    return file.readAll().toLongLong();
}
bool alive(qint64 pid) {
    return pid > 0 && (::kill(pid, 0) == 0 || errno != ESRCH);
}
}
class RuntimeInstallTest : public QObject {
    Q_OBJECT
    QTemporaryDir temp_;
    QString pid_, log_;
    void capture(QQuickWidget &view, const QString &name) {
        const auto dir = qEnvironmentVariable("NODETOOL_RUNTIME_INSTALL_CAPTURE_DIR");
        if (dir.isEmpty()) {
            return;
        }
        QVERIFY(QDir().mkpath(dir));
        auto *theme = view.engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        for (bool dark : {true, false}) {
            theme->setProperty("preference", dark ? 2 : 3);
            QTest::qWait(50);
            QVERIFY(view.grab().save(QDir(dir).filePath(name + (dark ? "-dark.png" : "-light.png"))));
        }
    }
private slots:
    void init() {
        pid_ = temp_.filePath("pid");
        log_ = temp_.filePath("log");
        QFile::remove(pid_);
        QFile::remove(log_);
        qputenv("NODETOOL_CLI", QCoreApplication::applicationDirPath().toUtf8() + "/node_editor_runtime_fake");
        qputenv("NODETOOL_FAKE_PID", pid_.toUtf8());
        qputenv("NODETOOL_FAKE_LOG", log_.toUtf8());
        qunsetenv("NODETOOL_FAKE_HANG");
        qunsetenv("NODETOOL_FAKE_FAIL");
        qunsetenv("NODETOOL_FAKE_ALL_MISSING");
    }
    void listAndSuccess() {
        Server server;
        SetupController controller;
        QQuickWidget view;
        panel(view, controller);
        QVERIFY2(view.status() == QQuickWidget::Ready, qPrintable(view.errors().value(0).toString()));
        controller.configure(server.url(), {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        QCOMPARE(controller.runtimes()[1].toMap()["version"].toString(), QString("1.2.3"));
        QCOMPARE(controller.runtimes()[0].toMap()["installCommand"].toString(), QString("nodetool runtime add python"));
        QSignalSpy refresh(&controller, &SetupController::registryRefreshRequested);
        QVERIFY(click(view, "runtime-install-all"));
        QTRY_COMPARE(controller.state(), QString("installed"));
        QCOMPARE(refresh.size(), 1);
        QVERIFY(controller.progress().contains("CLI exit 0"));
        QVERIFY(controller.progress().contains("Restart nodetool serve."));
    }
    void sequentialAndFallback() {
        Server server;
        SetupController controller;
        QQuickWidget view;
        panel(view, controller);
        qputenv("NODETOOL_FAKE_ALL_MISSING", "1");
        controller.configure(server.url(), {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        QVERIFY(click(view, "runtime-install-all"));
        QTRY_COMPARE(controller.state(), QString("installed"));
        QFile log(log_);
        QVERIFY(log.open(QIODevice::ReadOnly));
        QCOMPARE(log.readAll(), QByteArray("runtime add python\nruntime add yt-dlp\n"));
        qputenv("NODETOOL_CLI", "/nonexistent/nodetool");
        controller.configure(server.url(), {}, "two");
        QTRY_COMPARE(controller.runtimes().size(), 1);
        QVERIFY(!controller.canInstall());
        QVERIFY(!controller.statuses()["python"].toBool());
    }
    void failureAndRetry() {
        Server server;
        SetupController controller;
        QQuickWidget view;
        panel(view, controller);
        controller.configure(server.url(), {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        qputenv("NODETOOL_FAKE_FAIL", "1");
        QVERIFY(click(view, "runtime-install-all"));
        QTRY_COMPARE(controller.state(), QString("failed"));
        QVERIFY(controller.error().contains("exit 7"));
        QVERIFY(controller.error().contains("fixture error"));
        capture(view, "failed");
        qunsetenv("NODETOOL_FAKE_FAIL");
        QVERIFY(click(view, "setup-retry"));
        QTRY_COMPARE(controller.state(), QString("installed"));
    }
    void invalidId() {
        Server server;
        SetupController controller;
        controller.configure(server.url(), {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        for (const auto &id : {"--help", "python;touch", "unknown"}) {
            controller.installRuntime(id);
            QCOMPARE(controller.state(), QString("failed"));
            QVERIFY(!QFile::exists(log_));
        }
    }
    void cancelTerminates() {
        Server server;
        SetupController controller;
        QQuickWidget view;
        panel(view, controller);
        controller.configure(server.url(), {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        qputenv("NODETOOL_FAKE_HANG", "1");
        QVERIFY(click(view, "runtime-install-all"));
        QTRY_VERIFY(processId(pid_) > 0);
        const auto pid = processId(pid_);
        QVERIFY(alive(pid));
        capture(view, "installing");
        QVERIFY(click(view, "setup-cancel"));
        QTRY_VERIFY_WITH_TIMEOUT(!alive(pid), 3000);
        QCOMPARE(controller.state(), QString("cancelled"));
        QVERIFY(controller.error().contains("partially installed"));
    }
    void remoteAndDetails() {
        Server server;
        SetupController controller;
        QQuickWidget view;
        panel(view, controller);
        auto remote = server.url();
        remote.setHost("0.0.0.0");
        controller.configure(remote, {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        QVERIFY(!controller.canInstall());
        QVERIFY(click(view, "runtime-install-all"));
        QVERIFY(controller.guidance().contains("nodetool runtime add python"));
        QVERIFY(!QFile::exists(log_));
        controller.missingRuntime({{"runtimePackage", "python"}, {"managed", "npm run dev:nodetool -- runtime add python"},
            {"bringYourOwn", "Or set NODETOOL_PYTHON."}, {"restart", "Restart the container."}});
        QCOMPARE(controller.guidance(), QString("npm run dev:nodetool -- runtime add python\nOr set NODETOOL_PYTHON.\nRestart the container."));
        QVERIFY(click(view, "runtime-copy"));
        QCOMPARE(QGuiApplication::clipboard()->text(), controller.guidance());
        capture(view, "remote");
    }
    void workflowOfferAndAccountChange() {
        Server server;
        SetupController controller;
        controller.configure(server.url(), {}, "one");
        QTRY_COMPARE(controller.runtimes().size(), 2);
        QSignalSpy offers(&controller, &SetupController::runtimeOfferRequested);
        const QJsonObject workflow{{"id", "workflow"}, {"nodes", QJsonArray{
            QJsonObject{{"type", "test"}}, QJsonObject{{"type", "test"}}}}};
        const QJsonArray metadata{QJsonObject{{"node_type", "test"},
            {"required_runtimes", QJsonArray{"python", "yt-dlp"}}}};
        controller.offerWorkflow(workflow, metadata);
        QCOMPARE(offers.size(), 1);
        QCOMPARE(controller.runtimes().size(), 1);
        controller.offerWorkflow(workflow, metadata);
        QCOMPARE(offers.size(), 1);
        qputenv("NODETOOL_FAKE_HANG", "1");
        controller.installAll();
        QTRY_VERIFY(processId(pid_) > 0);
        const auto pid = processId(pid_);
        controller.configure(server.url(), {}, "two");
        QTRY_VERIFY(!alive(pid));
    }
    void sharedWindowExclusion() {
        Server server;
        QObject scope;
        SetupController first;
        SetupController second;
        first.setInstallScope(&scope);
        second.setInstallScope(&scope);
        first.configure(server.url(), {}, "one");
        second.configure(server.url(), {}, "one");
        QTRY_COMPARE(first.runtimes().size(), 2);
        QTRY_COMPARE(second.runtimes().size(), 2);
        qputenv("NODETOOL_FAKE_HANG", "1");
        first.installRuntime("python");
        QTRY_VERIFY(processId(pid_) > 0);
        second.installRuntime("python");
        QVERIFY(second.error().contains("Another runtime"));
        first.cancel();
        QTRY_VERIFY(!alive(processId(pid_)));
    }
    void tabClose() {
        Server server;
        EditorWindow window;
        window.show();
        auto *controller = window.activeEditor()->setup();
        controller->configure(server.url(), {}, "one");
        QTRY_COMPARE(controller->runtimes().size(), 2);
        qputenv("NODETOOL_FAKE_HANG", "1");
        window.activeEditor()->setupAction("runtimes");
        QQuickWidget *dialogView = nullptr;
        for (auto *view : window.findChildren<QQuickWidget *>()) {
            if (view->rootObject() && view->rootObject()->objectName() == "runtime-dialog") {
                dialogView = view;
            }
        }
        QVERIFY(dialogView);
        QTRY_COMPARE(controller->runtimes().size(), 2);
        QVERIFY(click(*dialogView, "runtime-install-all"));
        QTRY_VERIFY(processId(pid_) > 0);
        const auto pid = processId(pid_);
        window.newTab();
        QVERIFY(window.closeTab(0));
        QTRY_VERIFY_WITH_TIMEOUT(!alive(pid), 3000);
    }
};
QTEST_MAIN(RuntimeInstallTest)
#include "RuntimeInstallTest.moc"
