#include "server/MsgPack.h"
#include "ui/EditorWindow.h"
#include <QApplication>
#include <QDateTime>
#include <QDir>
#include <QMenu>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QUrl>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
class QueueFixture final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList queue MEMBER rows NOTIFY changed)
    Q_PROPERTY(QVariantMap workflow MEMBER workflow CONSTANT)
    Q_PROPERTY(bool connected MEMBER connected CONSTANT)
  public:
    QVariantList rows;
    QVariantMap workflow{{"id", "current"}};
    bool connected = true;
    QString stopped;
    void setRows(QVariantList value) {
        rows = value;
        emit changed();
    }
    Q_INVOKABLE void stop(QString id) {
        stopped = id;
    }
  signals:
    void changed();
};
class QueueUiTest final : public QObject {
    Q_OBJECT
    static QQuickItem *find(QQuickItem *root, const QString &name) {
        if (root->objectName() == name ||
            root->property("accessibleName").toString() == name)
            return root;
        for (auto child : root->childItems())
            if (auto result = find(child, name))
                return result;
        return nullptr;
    }
    static QQuickWidget *panel(EditorWindow &w, const QString &file) {
        for (auto widget : w.findChildren<QQuickWidget *>())
            if (widget->isVisible() && widget->source().fileName() == file)
                return widget;
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
    void presentation() {
        QueueFixture session;
        RunOutputModel output;
        output.beginRun("a");
        output.beginRun("b");
        QQuickWidget widget;
        widget.rootContext()->setContextProperty("workflowSession", &session);
        widget.rootContext()->setContextProperty("runOutput", &output);
        widget.setResizeMode(QQuickWidget::SizeRootObjectToView);
        widget.setSource(QUrl("qrc:/editor/QueueOverlay.qml"));
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
        session.setRows({job("a", "running")});
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
        for (const auto &title :
             {QString("Running"), QString("Enqueued"), QString("Cancelled")}) {
            bool found = false;
            const auto texts = root->findChildren<QObject *>();
            for (const auto *text : texts) {
                found |= text->property("text").toString() == title;
            }
            QVERIFY2(found, qPrintable(title));
        }
        auto card = find(root, "queue-focus-0");
        QVERIFY(card);
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
        click(&widget, "queue-stop-0");
        QCOMPARE(session.stopped, QString("a"));
        click(&widget, "queue-stop-2");
        QCOMPARE(session.stopped, QString("q"));
        QCOMPARE(output.selectedRunId(), QString("a"));
        click(&widget, "queue-collapse");
        QVERIFY(!root->property("expanded").toBool());
        session.setRows(
            {job("x", "cancelled"), job("c", "completed"), job("f", "failed")});
        QTRY_VERIFY(!root->property("presented").toBool());
        QVERIFY(!root->property("clockRunning").toBool());
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
        QVERIFY(server.listen(QHostAddress::LocalHost));
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
            QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
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
            for (auto action : menu->actions())
                if (action->text() == label)
                    toggle = action;
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
        auto queue = panel(window, "QueueOverlay.qml");
        QTRY_VERIFY(queue && queue->isVisible());
        click(queue, "queue-toggle");
        click(queue, "queue-focus-0");
        QCOMPARE(window.runOutput()->selectedRunId(), first);
        click(queue, "queue-stop-0");
        QTRY_COMPARE(commands.size(), 2);
        QCOMPARE(commands.last()["command"].toString(), QString("cancel_job"));
        update(first, "cancelled", 3);
        QTRY_VERIFY(window.session()
                        ->property("queue")
                        .toList()[0]
                        .toMap()["terminal"]
                        .toBool());
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
            const auto count =
                window.session()->property("queue").toList().size();
            update(id, status, 1);
            QTRY_COMPARE(window.session()
                             ->property("queue")
                             .toList()[count - 1]
                             .toMap()["status"]
                             .toString(),
                         status);
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
        QTRY_COMPARE(window.session()
                         ->property("queue")
                         .toList()
                         .last()
                         .toMap()["status"]
                         .toString(),
                     QString("queued"));
        const auto capture = qEnvironmentVariable("NODETOOL_QUEUE_CAPTURE_DIR");
        if (!capture.isEmpty()) {
            QVERIFY(QDir().mkpath(capture));
            for (const QSize size : {QSize(1200, 800), QSize(760, 700)}) {
                window.resize(size);
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
                        const auto name =
                            QString("/queue-%1-%2-%3.png")
                                .arg(size.width())
                                .arg(dark ? "dark" : "light")
                                .arg(expanded ? "expanded" : "collapsed");
                        QVERIFY(window.grab().save(capture + name));
                        QVERIFY(queue->geometry().right() <=
                                queue->parentWidget()->width());
                        QVERIFY(queue->geometry().bottom() <
                                toolbar->geometry().top());
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
            QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {},
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
