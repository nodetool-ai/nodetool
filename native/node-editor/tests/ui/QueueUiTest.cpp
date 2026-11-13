#include "interfaces/RunState.h"
#include "server/MsgPack.h"
#include "ui/EditorWindow.h"
#include <QApplication>
#include <QDateTime>
#include <QDir>
#include <QDockWidget>
#include <QJsonDocument>
#include <QMenu>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QTcpServer>
#include <QTcpSocket>
#include <QUrl>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
// Fills a RunState as the editor window does: the queue, the open workflow,
// the run output's selected run, and the select request. It records the
// cancel request instead of sending it. UI thread only.
class QueueFixture final {
public:
    explicit QueueFixture(RunOutputModel &output) : output_(output) {
        runs.setConnected(true);
        runs.setWorkflowId("current");
        sync();
        QObject::connect(&output, &RunOutputModel::changed, &runs, [this] { sync(); });
        QObject::connect(&runs, &RunState::selectRunRequested, &output, &RunOutputModel::selectRun);
        QObject::connect(&runs, &RunState::cancelRequested, &runs, [this](const QString &id) { stopped = id; });
    }
    void setRows(const QVariantList &rows) { runs.setQueue(rows); }
    RunState runs;
    QString stopped;

private:
    void sync() { runs.setOutput(output_.runs(), output_.selectedRunId()); }
    RunOutputModel &output_;
};
class QueueUiTest final : public QObject {
    Q_OBJECT
    static QQuickItem *find(QQuickItem *root, const QString &name) {
        if (!root) {
            return nullptr;
        }
        if (root->objectName() == name ||
            root->property("accessibleName").toString() == name) {
            return root;
        }
        for (auto child : root->childItems()) {
            if (auto result = find(child, name)) {
                return result;
            }
        }
        return nullptr;
    }
    static QQuickWidget *panel(EditorWindow &w, const QString &file) {
        for (auto widget : w.findChildren<QQuickWidget *>()) {
            if (widget->isVisible() && widget->source().fileName() == file) {
                return widget;
            }
        }
        return nullptr;
    }
    static void click(QQuickWidget *widget, const QString &name) {
        QVERIFY(widget);
        auto item = find(widget->rootObject(), name);
        QVERIFY(item);
        QVERIFY(item->isEnabled());
        QTest::mouseClick(
            widget->quickWindow(), Qt::LeftButton, Qt::NoModifier,
            item->mapToScene({item->width() / 2, item->height() / 2})
                .toPoint());
    }
private slots:
    void roundedCorners() {
        RunOutputModel output;
        QueueFixture session(output);
        session.setRows({QVariantMap{{"jobId", "running"}, {"status", "running"}}});
        QQuickWidget widget;
        widget.setClearColor(Qt::transparent);
        widget.setInitialProperties({{"runs", QVariant::fromValue(&session.runs)}});
        widget.setResizeMode(QQuickWidget::SizeRootObjectToView);
        widget.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/QueueOverlay.qml"));
        QVERIFY(widget.rootObject());
        widget.resize(304, 92);
        widget.show();
        auto theme = widget.engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        for (int preference : {2, 3}) {
            theme->setProperty("preference", preference);
            QTest::qWait(250);
            const auto pixels = widget.grabFramebuffer();
            QVERIFY(!pixels.isNull());
            for (int x : {0, pixels.width() - 1}) {
                QCOMPARE(pixels.pixelColor(x, pixels.height() - 1).alpha(), 0);
            }
            QVERIFY(pixels.pixelColor(pixels.width() / 2, pixels.height() - 1).alpha() > 0);
        }
    }
    void presentation() {
        RunOutputModel output;
        QueueFixture session(output);
        output.beginRun("a");
        output.beginRun("b");
        QQuickWidget widget;
        widget.setInitialProperties({{"runs", QVariant::fromValue(&session.runs)}});
        widget.setResizeMode(QQuickWidget::SizeRootObjectToView);
        widget.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/QueueOverlay.qml"));
        QVERIFY2(widget.rootObject(),
                 qPrintable(widget.errors().isEmpty()
                                ? QString()
                                : widget.errors().first().toString()));
        widget.resize(304, 480);
        widget.show();
        auto root = widget.rootObject();
        const auto job = [](QString id, QString status,
                            QString workflow = "current") {
            return QVariantMap{{"jobId", id},
                               {"status", status},
                               {"name", "Workflow " + id},
                               {"workflow_id", workflow}};
        };
        auto timed = job("a", "running");
        timed.insert(
            "started_at",
            QDateTime::fromMSecsSinceEpoch(
                root->property("now").toLongLong() - 125000, QTimeZone::UTC)
                .toString(Qt::ISODateWithMs));
        session.setRows({timed});
        QCOMPARE(find(root, "queue-clock")->property("text").toString(),
                 QString("2:05"));
        QTRY_COMPARE(find(root, "queue-summary")->property("text").toString(),
                     QString("Workflow a"));
        QVERIFY(root->property("clockRunning").toBool());
        session.setRows({job("a", "running"), job("b", "running", "other"),
                         job("q", "scheduled"), job("x", "cancelled")});
        QTRY_COMPARE(find(root, "queue-summary")->property("text").toString(),
                     QString("2 jobs running"));
        QCOMPARE(find(root, "queue-queued-count")->property("text").toString(),
                 QString("1 queued"));
        click(&widget, "queue-toggle");
        QVERIFY(root->property("expanded").toBool());
        QCoreApplication::processEvents();
        const auto title = find(root, "queue-title");
        QVERIFY(title);
        for (const auto &name : {QString("queue-header-running-count"), QString("queue-header-queued-count")}) {
            const auto count = find(root, name);
            QVERIFY(count);
            QVERIFY(qAbs(title->mapToScene({0, title->height() / 2}).y()
                         - count->mapToScene({0, count->height() / 2}).y()) < 1);
        }
        for (const auto &title :
             {QString("Active"), QString("Running"), QString("Enqueued"), QString("History")}) {
            QVERIFY(find(root, "queue-section-" + title));
        }
        // The cancelled job moved to the history.
        QVERIFY(find(root, "queue-history-x"));
        auto card = find(root, "queue-focus-0");
        QVERIFY(card);
        QTRY_VERIFY(card->width() > 250);
        QVERIFY(card->property("focusable").toBool());
        QVERIFY(!find(root, "queue-focus-1")->property("focusable").toBool());
        click(&widget, "queue-focus-0");
        QTRY_COMPARE(output.selectedRunId(), QString("a"));
        output.selectRun("b");
        card->forceActiveFocus();
        QTest::keyClick(widget.quickWindow(), Qt::Key_Return);
        QTRY_COMPARE(output.selectedRunId(), QString("a"));
        output.selectRun("b");
        QTest::keyClick(widget.quickWindow(), Qt::Key_Space);
        QTRY_COMPARE(output.selectedRunId(), QString("a"));
        click(&widget, "queue-focus-1");
        QCOMPARE(output.selectedRunId(), QString("a"));
        output.selectRun("b");
        click(&widget, "queue-stop-0");
        QCOMPARE(session.stopped, QString("a"));
        click(&widget, "queue-stop-2");
        QCOMPARE(session.stopped, QString("q"));
        QCOMPARE(output.selectedRunId(), QString("b"));
        click(&widget, "queue-collapse");
        QVERIFY(!root->property("expanded").toBool());
        session.setRows(
            {job("x", "cancelled"), job("c", "completed"), job("f", "failed")});
        QTRY_VERIFY(!root->property("presented").toBool());
        QVERIFY(!root->property("clockRunning").toBool());
        const auto idleNow = root->property("now");
        QTest::qWait(1100);
        QCOMPARE(root->property("now"), idleNow);
        auto theme = widget.engine()->singletonInstance<QObject *>(
            "NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        theme->setProperty("reducedMotion", true);
        session.setRows({job("a", "running")});
        QTRY_VERIFY(root->property("presented").toBool());
        session.setRows({job("a", "cancelled")});
        QTRY_VERIFY(!root->property("presented").toBool());
        QVERIFY(!root->property("clockRunning").toBool());
        theme->setProperty("reducedMotion", false);
    }
    void lifecycle() {
        QWebSocketServer server("queue", QWebSocketServer::NonSecureMode);
        QTcpServer http;
        QVERIFY(http.listen(QHostAddress::LocalHost));
        QStringList cancellations;
        connect(&http, &QTcpServer::newConnection, this, [&] {
            auto socket = http.nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, &http, [&, socket] {
                const auto bytes = socket->peek(socket->bytesAvailable());
                if (!bytes.contains("\r\n\r\n")) {
                    return;
                }
                if (bytes.startsWith("GET /ws ")) {
                    socket->disconnect(&http);
                    server.handleConnection(socket);
                    return;
                }
                const auto split = bytes.indexOf("\r\n\r\n");
                int length = 0;
                for (const auto &line : bytes.left(split).split('\n')) {
                    if (line.toLower().startsWith("content-length:")) {
                        length = line.mid(15).trimmed().toInt();
                    }
                }
                if (bytes.size() < split + 4 + length) {
                    return;
                }
                socket->readAll();
                socket->disconnect(&http);
                QJsonObject data{{"jobs", QJsonArray{}}};
                if (bytes.contains("/trpc/jobs.cancel ")) {
                    const auto id =
                        QJsonDocument::fromJson(bytes.mid(split + 4))
                            .object()["id"]
                            .toString();
                    cancellations.append(id);
                    data = {{"job_id", id}, {"status", "cancelled"}};
                }
                const auto body =
                    QJsonDocument(
                        QJsonObject{{"result", QJsonObject{{"data", data}}}})
                        .toJson(QJsonDocument::Compact);
                socket->write("HTTP/1.1 200 OK\r\nContent-Type: "
                              "application/json\r\nContent-Length: " +
                              QByteArray::number(body.size()) +
                              "\r\nConnection: close\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
        });
        QPointer<QWebSocket> peer;
        QList<QJsonObject> commands;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            peer = server.nextPendingConnection();
            peer->setParent(&server);
            connect(peer, &QWebSocket::binaryMessageReceived, this,
                    [&](QByteArray bytes) {
                        auto decoded = decodeMsgPack(bytes);
                        QVERIFY(decoded);
                        commands.append(decoded->toObject());
                    });
        });
        EditorWindow window;
        window.resize(1200, 800);
        window.show();
        window.session()->connectToServer(
            QUrl(QString("http://127.0.0.1:%1").arg(http.serverPort())), {});
        QTRY_VERIFY(window.session()->connected());
        const auto before = window.document()->snapshot();
        const auto undo = window.document()->undoStack()->index();
        auto toolbar = panel(window, "Toolbar.qml");
        QVERIFY(toolbar);
        for (const auto label :
             {QString("Instant Update: Off"), QString("Instant Update: On")}) {
            click(toolbar, "toolbar-more");
            auto menu =
                qobject_cast<QMenu *>(QApplication::activePopupWidget());
            QTRY_VERIFY(menu);
            QAction *toggle = nullptr;
            for (auto action : menu->actions()) {
                if (action->text() == label) {
                    toggle = action;
                }
            }
            QVERIFY(toggle);
            QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier,
                              menu->actionGeometry(toggle).center());
        }
        click(toolbar, "run-workflow");
        QTRY_COMPARE(commands.size(), 1);
        QCOMPARE(commands.last()["command"].toString(), QString("run_job"));
        QTRY_COMPARE(window.session()->property("queue").toList().size(), 1);
        const auto first =
            commands.last()["data"].toObject()["job_id"].toString();
        auto update = [&](QString id, QString status, int seq) {
            peer->sendBinaryMessage(encodeMsgPack(QJsonObject{
                {"type", status == "failed" ? "error" : "job_update"},
                {"job_id", id},
                {"status", status},
                {"job_seq", seq},
                {"error", status == "failed" ? "Submit rejected" : ""}}));
        };
        update(first, "queued", 1);
        QTRY_COMPARE(window.session()
                         ->property("queue")
                         .toList()[0]
                         .toMap()["status"]
                         .toString(),
                     QString("queued"));
        update(first, "running", 2);
        QTRY_COMPARE(window.session()
                         ->property("queue")
                         .toList()[0]
                         .toMap()["status"]
                         .toString(),
                     QString("running"));
        // The overlay shows once the active state holds for the shown queue delay.
        QTRY_VERIFY(panel(window, "QueueOverlay.qml"));
        auto queue = panel(window, "QueueOverlay.qml");
        click(queue, "queue-toggle");
        click(queue, "queue-focus-0");
        QCOMPARE(window.runOutput()->selectedRunId(), first);
        click(queue, "queue-stop-0");
        QTRY_COMPARE(cancellations, QStringList{first});
        update(first, "cancelled", 3);
        QTRY_VERIFY(window.session()
                        ->property("queue")
                        .toList()[0]
                        .toMap()["terminal"]
                        .toBool());
        const auto rowFor = [&](const QString &id) {
            for (const auto &row : window.session()->queue()) {
                if (row.toMap()["jobId"] == id) {
                    return row.toMap();
                }
            }
            return QVariantMap{};
        };
        for (const auto status :
             {QString("failed"), QString("completed"), QString("running")}) {
            const auto previous = commands.size();
            click(toolbar, "run-workflow");
            QTRY_COMPARE(commands.size(), previous + 1);
            QTRY_COMPARE(commands.last()["command"].toString(),
                         QString("run_job"));
            const auto id =
                commands.last()["data"].toObject()["job_id"].toString();
            QVERIFY(id != first);
            update(id, status, 1);
            QTRY_COMPARE(rowFor(id)["status"].toString(), status);
            if (status == "failed") {
                QTRY_COMPARE(window.message(), QString("Submit rejected"));
                QVERIFY(panel(window, "RunOutput.qml"));
            }
        }
        QVERIFY(window.message() != "Run completed");
        bool failureVisible = false;
        for (const auto &run : window.runOutput()->runs()) {
            if (run.toMap()["status"] == "failed") {
                failureVisible = true;
            }
        }
        QVERIFY(failureVisible);
        const auto pendingCommands = commands.size();
        click(toolbar, "run-workflow");
        QTRY_COMPARE(commands.size(), pendingCommands + 1);
        const auto pendingId =
            commands.last()["data"].toObject()["job_id"].toString();
        update(pendingId, "queued", 1);
        QTRY_COMPARE(rowFor(pendingId)["status"].toString(), QString("queued"));
        const auto capture = qEnvironmentVariable("NODETOOL_QUEUE_CAPTURE_DIR");
        if (!capture.isEmpty()) {
            QVERIFY(QDir().mkpath(capture));
            for (const QSize size : {QSize(1200, 800), QSize(760, 700)}) {
                window.resize(size);
                auto outputDock = window.findChild<QDockWidget *>("run-output-dock");
                QVERIFY(outputDock);

                for (bool dark : {true, false}) {
                    window.setDarkTheme(dark);
                    for (bool expanded : {true, false}) {
                        if (queue->rootObject()
                                ->property("expanded")
                                .toBool() != expanded) {
                            click(queue,
                                  expanded ? "queue-toggle" : "queue-collapse");
                        }
                        QTest::qWait(250);
                        auto catalog = panel(window, "Catalog.qml");
                        QVERIFY(catalog);
                        auto empty = find(catalog->rootObject(), "catalog-empty-state");
                        QVERIFY(empty);
                        QVERIFY(empty->isVisible());
                        QVERIFY(empty->width() >= 250);
                        const auto name =
                            QString("/queue-%1-%2-%3.png")
                                .arg(size.width())
                                .arg(dark ? "dark" : "light")
                                .arg(expanded ? "expanded" : "collapsed");
                        QVERIFY(window.grab().save(capture + name));
                        QVERIFY(queue->geometry().right() <=
                                queue->parentWidget()->width());
                        QVERIFY(queue->geometry().bottom() <= queue->parentWidget()->height());
                    }
                }
            }
        }
        peer->close();
        QTRY_VERIFY(!window.session()->connected());
        QTRY_VERIFY(!find(toolbar->rootObject(), "run-workflow")->isEnabled());
        QCOMPARE(window.document()->snapshot(), before);
        QCOMPARE(window.document()->undoStack()->index(), undo);
        window.session()->connectToServer(
            QUrl(QString("http://127.0.0.1:%1").arg(http.serverPort())), {},
            "different-account");
        QTRY_VERIFY(window.session()->connected());
        QVERIFY(window.session()->property("queue").toList().isEmpty());
        click(toolbar, "run-workflow");
        QTRY_COMPARE(window.session()->property("queue").toList().size(), 1);
        QPointer<WorkflowSession> closedSession = window.session();
        click(panel(window, "TabBar.qml"), "new-workflow-tab");
        QTRY_COMPARE(window.workflowTabs().size(), 2);
        QVERIFY(window.session() != closedSession);
        QVERIFY(window.session()->property("queue").toList().isEmpty());
        click(panel(window, "TabBar.qml"), "close-tab-0");
        QTRY_COMPARE(window.workflowTabs().size(), 1);
        QTRY_VERIFY(closedSession.isNull());
        QVERIFY(window.session()->property("queue").toList().isEmpty());
    }
};
QTEST_MAIN(QueueUiTest)
#include "QueueUiTest.moc"
