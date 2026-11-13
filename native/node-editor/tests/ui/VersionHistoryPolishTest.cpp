#include "ui/EditorWindow.h"
#include "server/MsgPack.h"
#include "server/WorkflowVersions.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QDialog>
#include <QDockWidget>
#include <QDir>
#include <QApplication>
#include <QClipboard>
#include <QWheelEvent>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QSignalSpy>
#include <QPointer>
#include <QQmlEngine>

using namespace nodetool;
using nodetool::node_editor::WorkflowVersions;
using nodetool::node_editor::decodeMsgPack;

namespace {

// Answers one request per connection with the tRPC envelope the real server sends.
class Fixture final : public QTcpServer {
public:
    QList<QByteArray> requests;
    std::function<QByteArray(QByteArray)> respond;
    std::function<int(QByteArray)> status;
    // A null response holds the connection open until release() answers it.
    QPointer<QTcpSocket> held;
    // The workflow WebSocket, when a test wants the session connected.
    QWebSocketServer *webSocket = nullptr;
    void release(const QByteArray &body, int code = 200)
    {
        QVERIFY(held);
        held->write("HTTP/1.1 " + QByteArray::number(code) + " Response\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        held->disconnectFromHost();
        held.clear();
    }
    Fixture()
    {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            auto socket = nextPendingConnection();
            socket->setParent(this);
            // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
            auto buffer = std::make_shared<QByteArray>();
            // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
            auto served = std::make_shared<bool>(false);
            connect(socket, &QTcpSocket::readyRead, this, [this, socket, buffer, served] {
                // The WebSocket upgrade must reach the WebSocket server unread.
                if (webSocket && buffer->isEmpty()) {
                    const auto head = socket->peek(socket->bytesAvailable());
                    if (head.startsWith("GET /ws ") && head.contains("\r\n\r\n")) {
                        socket->disconnect(this);
                        socket->setParent(nullptr);
                        webSocket->handleConnection(socket);
                        return;
                    }
                }
                *buffer += socket->readAll();
                const auto split = buffer->indexOf("\r\n\r\n");
                if (*served || split < 0) {
                    return;
                }
                int length = 0;
                for (const auto &line : buffer->left(split).split('\n')) {
                    if (line.toLower().startsWith("content-length:")) {
                        length = line.mid(15).trimmed().toInt();
                    }
                }
                if (buffer->size() < split + 4 + length) {
                    return;
                }
                *served = true;
                requests.append(*buffer);
                if (!respond) {
                    return;
                }
                const auto body = respond(*buffer);
                if (body.isNull()) {
                    held = socket;
                    return;
                }
                const auto code = status ? status(*buffer) : 200;
                socket->write("HTTP/1.1 " + QByteArray::number(code) + " Response\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
    int count(const QByteArray &needle) const
    {
        int total = 0;
        for (const auto &request : requests) {
            if (request.left(request.indexOf("\r\n")).contains(needle)) {
                ++total;
            }
        }
        return total;
    }
    int indexOf(const QByteArray &needle) const
    {
        for (int index = 0; index < requests.size(); ++index) {
            if (requests[index].left(requests[index].indexOf("\r\n")).contains(needle)) {
                return index;
            }
        }
        return -1;
    }
};

QByteArray envelope(const QJsonValue &data)
{
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
}

// The error body a tRPC server returns for a failed procedure.
QByteArray trpcError(const QString &message, const QString &code, int httpStatus)
{
    return QJsonDocument(QJsonObject{{"error", QJsonObject{{"message", message}, {"code", -32603}, {"data", QJsonObject{{"code", code}, {"httpStatus", httpStatus}}}}}}).toJson(QJsonDocument::Compact);
}

QJsonObject twoNodeGraph()
{
    return QJsonObject{
        {"nodes", QJsonArray{
            QJsonObject{{"id", "source"}, {"type", "Text"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}},
            QJsonObject{{"id", "output"}, {"type", "Preview"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 400}, {"y", 200}}}}}}}},
        {"edges", QJsonArray{QJsonObject{{"source", "source"}, {"target", "output"}}}}};
}

// A row in the shape of versionResponse in packages/protocol/src/api-schemas/workflows.ts.
QJsonObject versionRow(const QString &id, int version, const QString &saveType, const QString &name, const QString &createdAt, const QJsonObject &graph = twoNodeGraph())
{
    return QJsonObject{
        {"id", id},
        {"workflow_id", "bound"},
        {"user_id", "1"},
        {"name", name.isEmpty() ? QJsonValue() : QJsonValue(name)},
        {"description", QJsonValue()},
        {"graph", graph},
        {"version", version},
        {"save_type", saveType},
        {"autosave_metadata", QJsonValue()},
        {"created_at", createdAt}};
}

QByteArray workflowBody(const QString &revision)
{
    return QJsonDocument(QJsonObject{{"id", "bound"}, {"name", "Original"}, {"updated_at", revision}, {"graph", QJsonObject{{"nodes", QJsonArray()}, {"edges", QJsonArray()}}}}).toJson(QJsonDocument::Compact);
}

// A server workflow whose graph has a node, so a run has something to execute.
QByteArray workflowBodyWithNode(const QString &revision)
{
    return QJsonDocument(QJsonObject{{"id", "bound"}, {"name", "Original"}, {"updated_at", revision}, {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "source"}, {"type", "nodetool.constant.String"}, {"data", QJsonObject{{"value", "hello"}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}}, {"edges", QJsonArray()}}}}).toJson(QJsonDocument::Compact);
}

QJsonObject requestBody(const QByteArray &request)
{
    return QJsonDocument::fromJson(request.mid(request.indexOf("\r\n\r\n") + 4)).object();
}

QQuickItem *find(QQuickItem *item, const QString &name)
{
    if (item->objectName() == name) {
        return item;
    }
    for (auto *child : item->childItems()) {
        if (auto *found = find(child, name)) {
            return found;
        }
    }
    return nullptr;
}

void resetScroll(QQuickItem *item)
{
    if (item->metaObject()->indexOfProperty("contentY") >= 0) {
        item->setProperty("contentY", 0);
    }
    for (auto *child : item->childItems()) {
        resetScroll(child);
    }
}

// Every string a visible item displays, from labels to the contents of text areas.
QStringList visibleTexts(QQuickItem *root)
{
    QStringList found;
    QList<QQuickItem *> pending{root};
    while (!pending.isEmpty()) {
        auto *item = pending.takeFirst();
        pending += item->childItems();
        const auto text = item->property("text");
        if (item->isVisible() && item->width() > 0 && text.metaType().id() == QMetaType::QString && !text.toString().isEmpty()) {
            found << text.toString();
        }
    }
    return found;
}

QPoint center(QQuickItem *item)
{
    return item->mapToScene({item->width() / 2, item->height() / 2}).toPoint();
}

void click(QQuickWidget *widget, const char *name)
{
    auto *item = find(widget->rootObject(), name);
    if (!item) {
        item = find(widget->quickWindow()->contentItem(), name);
    }
    QVERIFY(item);
    QVERIFY(item->isEnabled());
    for (auto *parent = item->parentItem(); parent; parent = parent->parentItem()) {
        if (parent->metaObject()->indexOfProperty("contentY") >= 0) {
            parent->setProperty("contentY", parent->property("contentY").toDouble() + item->mapToItem(parent, QPointF()).y());
            break;
        }
    }
    QCoreApplication::processEvents();
    QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, center(item));
}

void wheel(QQuickWindow *window, QPoint position, int delta)
{
    QWheelEvent event(QPointF(position), QPointF(window->mapToGlobal(position)), QPoint(), QPoint(0, delta), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
    QCoreApplication::sendEvent(window, &event);
}

QQuickWidget *panel(EditorWindow &window, const QString &file)
{
    for (auto *widget : window.findChildren<QQuickWidget *>()) {
        if (widget->source().fileName() == file && widget->isVisible()) {
            return widget;
        }
    }
    return nullptr;
}

WorkflowVersions *controllerOf(QQuickWidget *widget)
{
    return qobject_cast<WorkflowVersions *>(widget->rootObject()->property("controller").value<QObject *>());
}

// The web server's version list, with one more row once a version was created.
struct History {
    bool created = false;
    QString createdAt = "2026-06-15T11:59:30Z";
    QByteArray list() const
    {
        QJsonArray rows;
        if (created) {
            rows.append(versionRow("version-two", 2, "manual", "Before refactor", createdAt));
        }
        rows.append(versionRow("version-one", 1, "checkpoint", "Before execution", "2026-01-01T12:00:00Z"));
        return envelope(QJsonObject{{"versions", rows}});
    }
};

}

class VersionHistoryPolishTest : public QObject {
    Q_OBJECT

    static void connectWorkflow(EditorWindow &window, Fixture &server)
    {
        window.resize(1280, 900);
        window.show();
        window.session()->connectToServer(server.url(), {});
        window.session()->setAutosaveEnabled(false);
        window.session()->openWorkflow("bound");
        QTRY_VERIFY(window.session()->serverBound());
        QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("bound"));
    }

    static void editLocally(EditorWindow &window)
    {
        auto graph = window.document()->graph();
        graph.insert("draft_marker", "local");
        QVERIFY(window.document()->applyCommand({{"op", "replaceGraph"}, {"graph", graph}}));
        window.session()->flushDocumentNotification();
        QVERIFY(window.session()->dirty());
    }

    static QQuickWidget *openHistory(EditorWindow &window)
    {
        window.action("Version history");
        auto *widget = panel(window, "VersionHistoryPanel.qml");
        if (!widget) {
            QTest::qWait(50);
            widget = panel(window, "VersionHistoryPanel.qml");
        }
        return widget;
    }

    static void typeName(QQuickWidget *widget, const QString &name)
    {
        click(widget, "save-version-name");
        QTest::keyClicks(widget, name);
    }

private slots:
    void initTestCase()
    {
        QLocale::setDefault(QLocale(QLocale::English, QLocale::UnitedStates));
    }

    // web/src/serverState/useWorkflowVersions.ts:40 calls workflows.versions.create with the
    // name. The server snapshots its own row, so the dirty graph must be saved first, as
    // TimelineVersionHistoryPanel.tsx:210 does with flushPendingEdits.
    void savesNamedVersionAfterSendingLocalEdits()
    {
        Fixture server;
        History history;
        server.respond = [&history](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.startsWith("PUT /api/workflows/")) {
                auto body = requestBody(request);
                body.insert("updated_at", "r2");
                return QJsonDocument(body).toJson(QJsonDocument::Compact);
            }
            if (line.contains("versions.create")) {
                history.created = true;
                return envelope(versionRow("version-two", 2, "manual", requestBody(request)["name"].toString(), history.createdAt));
            }
            if (line.contains("versions.list")) {
                return history.list();
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QVERIFY(controller);
        QTRY_VERIFY(!controller->busy());
        QCOMPARE(controller->rows().size(), 1);
        editLocally(window);
        const auto undoIndex = window.document()->undoStack()->index();

        click(widget, "save-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "save-version-name"));
        typeName(widget, "Before refactor");
        click(widget, "confirm-save-version");

        QTRY_COMPARE(server.count("versions.create"), 1);
        QTRY_COMPARE(controller->rows().size(), 2);
        QTRY_VERIFY(!controller->busy());
        const auto put = server.indexOf("PUT /api/workflows/");
        const auto create = server.indexOf("versions.create");
        QVERIFY2(put >= 0 && put < create, "local edits must reach the server before it snapshots its row");
        QVERIFY(QString::fromUtf8(server.requests[put]).contains("draft_marker"));
        const auto body = requestBody(server.requests[create]);
        QCOMPARE(body["id"].toString(), QString("bound"));
        QCOMPARE(body["name"].toString(), QString("Before refactor"));
        QVERIFY(!window.session()->dirty());
        QCOMPARE(window.document()->undoStack()->index(), undoIndex);
        // The new version is selected and labeled as the web labels a manual save.
        QCOMPARE(controller->property("selectedIndex").toInt(), 0);
        const auto row = controller->rows().first().toMap();
        QCOMPARE(row["version"].toInt(), 2);
        QCOMPARE(row["save_label"].toString(), QString("Manual"));
        QCOMPARE(controller->rows().last().toMap()["save_label"].toString(), QString("Checkpoint"));
        QCOMPARE(find(widget->rootObject(), "versions-error")->property("text").toString(), QString());
    }

    void blankNameSavesWithoutAName()
    {
        Fixture server;
        History history;
        server.respond = [&history](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.create")) {
                history.created = true;
                return envelope(versionRow("version-two", 2, "manual", QString(), history.createdAt));
            }
            return line.contains("versions.list") ? history.list() : trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_VERIFY(!controllerOf(widget)->busy());
        click(widget, "save-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "save-version-name"));
        click(widget, "confirm-save-version");
        QTRY_COMPARE(server.count("versions.create"), 1);
        QVERIFY(!requestBody(server.requests[server.indexOf("versions.create")]).contains("name"));
        // A clean document sends no save first.
        QCOMPARE(server.count("PUT /api/workflows/"), 0);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 2);
    }

    void failedVersionCreationStaysVisibleAndRecovers()
    {
        Fixture server;
        History history;
        bool failing = true;
        server.respond = [&history, &failing](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.create")) {
                if (failing) {
                    return trpcError("Version storage is unavailable", "INTERNAL_SERVER_ERROR", 500);
                }
                history.created = true;
                return envelope(versionRow("version-two", 2, "manual", "Retry", history.createdAt));
            }
            return line.contains("versions.list") ? history.list() : trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        server.status = [&failing](QByteArray request) {
            return failing && request.left(request.indexOf("\r\n")).contains("versions.create") ? 500 : 200;
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_VERIFY(!controller->busy());
        const auto before = window.document()->snapshot();

        click(widget, "save-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "save-version-name"));
        typeName(widget, "Retry");
        click(widget, "confirm-save-version");

        QTRY_COMPARE(server.count("versions.create"), 1);
        QTRY_VERIFY(find(widget->rootObject(), "versions-error")->property("text").toString().contains("Version storage is unavailable"));
        QVERIFY(!controller->busy());
        QCOMPARE(controller->rows().size(), 1);
        QCOMPARE(window.document()->snapshot(), before);
        QCOMPARE(server.count("versions.list"), 1);

        failing = false;
        click(widget, "save-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "save-version-name"));
        click(widget, "confirm-save-version");
        QTRY_COMPARE(controller->rows().size(), 2);
        QCOMPARE(find(widget->rootObject(), "versions-error")->property("text").toString(), QString());
    }

    void failedSaveOfLocalEditsDoesNotCreateAVersion()
    {
        Fixture server;
        History history;
        server.respond = [&history](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.startsWith("PUT /api/workflows/")) {
                return QByteArray(R"({"detail":"Disk is full"})");
            }
            if (line.contains("versions.create")) {
                history.created = true;
            }
            return line.contains("versions.list") ? history.list() : trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        server.status = [](QByteArray request) {
            return request.startsWith("PUT") ? 500 : 200;
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_VERIFY(!controller->busy());
        editLocally(window);
        click(widget, "save-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "save-version-name"));
        click(widget, "confirm-save-version");
        QTRY_COMPARE(server.count("PUT /api/workflows/"), 1);
        QTRY_VERIFY(!controller->busy());
        QVERIFY(!find(widget->rootObject(), "versions-error")->property("text").toString().isEmpty());
        QCOMPARE(server.count("versions.create"), 0);
        QVERIFY(window.session()->dirty());
        QCOMPARE(controller->rows().size(), 1);
    }

    // web/src/utils/formatDateAndTime.ts:93
    void relativeTimesFollowTheWeb()
    {
        const auto now = QDateTime(QDate(2026, 6, 15), QTime(12, 0, 0), QTimeZone::UTC);
        const auto ago = [&now](qint64 seconds) {
            return WorkflowVersions::relativeTime(now.addSecs(-seconds), now);
        };
        QCOMPARE(WorkflowVersions::relativeTime(now.addSecs(30), now), QString("just now"));
        QCOMPARE(ago(0), QString("just now"));
        QCOMPARE(ago(1), QString("1 sec ago"));
        QCOMPARE(ago(45), QString("45 sec ago"));
        QCOMPARE(ago(59), QString("59 sec ago"));
        QCOMPARE(ago(60), QString("1 min ago"));
        QCOMPARE(ago(119), QString("1 min ago"));
        QCOMPARE(ago(5 * 60), QString("5 min ago"));
        QCOMPARE(ago(3599), QString("59 min ago"));
        QCOMPARE(ago(3600), QString("1 hour ago"));
        QCOMPARE(ago(3 * 3600), QString("3 hours ago"));
        QCOMPARE(ago(23 * 3600 + 3599), QString("23 hours ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addDays(-1), now), QString("1 day ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addDays(-6), now), QString("6 days ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addDays(-7), now), QString("1 week ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addDays(-13), now), QString("1 week ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addDays(-14), now), QString("2 weeks ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addDays(-29), now), QString("4 weeks ago"));
        // Months follow the calendar: 15 May to 15 June is one month, 16 May is not.
        QCOMPARE(WorkflowVersions::relativeTime(now.addMonths(-1), now), QString("1 month ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addMonths(-1).addSecs(1), now), QString("4 weeks ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addMonths(-11), now), QString("11 months ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addYears(-1), now), QString("1 year ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addYears(-1).addSecs(1), now), QString("11 months ago"));
        QCOMPARE(WorkflowVersions::relativeTime(now.addYears(-3), now), QString("3 years ago"));
        QCOMPARE(WorkflowVersions::absoluteTime(now), QString("Jun 15, 2026, ") + QLocale().toString(QTime(12, 0), QLocale::ShortFormat));
        QCOMPARE(WorkflowVersions::absoluteTime(QDateTime()), QString::fromUtf8("—"));
    }

    void rowsShowRelativeTimeAndUpdateAsTheClockAdvances()
    {
        Fixture server;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{
                    versionRow("v3", 3, "autosave", QString(), "2026-06-15T11:58:00Z"),
                    versionRow("v2", 2, "manual", "Draft", "2026-06-15T09:00:00Z"),
                    versionRow("v1", 1, "restore", QString(), "2026-05-06T12:00:00Z")}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_COMPARE(controller->rows().size(), 3);
        auto now = QDateTime(QDate(2026, 6, 15), QTime(12, 0, 0), QTimeZone::UTC);
        controller->setClockSource([&now] { return now; });
        controller->setClockInterval(20);
        const auto text = [widget](int row) {
            return find(widget->rootObject(), QString("version-time-%1").arg(row))->property("text").toString();
        };
        QTRY_COMPARE(text(0), QString("2 min ago"));
        QCOMPARE(text(1), QString("3 hours ago"));
        QCOMPARE(text(2), QString("1 month ago"));
        QCOMPARE(find(widget->rootObject(), "version-row-0")->property("text").toString(), QString("v3 · Auto"));
        QCOMPARE(find(widget->rootObject(), "version-row-1")->property("text").toString(), QString("v2 · Manual"));
        QCOMPARE(find(widget->rootObject(), "version-row-2")->property("text").toString(), QString("v1 · Restored"));

        now = now.addSecs(4 * 60);
        QTRY_COMPARE(text(0), QString("6 min ago"));
        QCOMPARE(text(1), QString("3 hours ago"));
        now = now.addSecs(3600);
        QTRY_COMPARE(text(0), QString("1 hour ago"));
        QTRY_COMPARE(text(1), QString("4 hours ago"));
        now = now.addDays(30);
        QTRY_COMPARE(text(2), QString("2 months ago"));

        // The detail pane keeps the absolute time next to the relative one, as the web does.
        click(widget, "version-row-0");
        const auto detail = find(widget->rootObject(), "version-detail-time")->property("text").toString();
        QCOMPARE(detail, QString("Jun 15, 2026, ") + QLocale().toString(QTime(11, 58), QLocale::ShortFormat) + " · 1 month ago");
        now = now.addDays(90);
        QTRY_VERIFY(find(widget->rootObject(), "version-detail-time")->property("text").toString().endsWith("· 3 months ago"));

        // The full time is a tooltip on the row, like the web's Tooltip around the relative time.
        auto *time = find(widget->rootObject(), "version-time-0");
        QTest::mouseMove(widget->quickWindow(), center(time));
        QTest::mouseMove(widget->quickWindow(), center(time) + QPoint(1, 0));
        const auto expected = QString("Jun 15, 2026, ") + QLocale().toString(QTime(11, 58), QLocale::ShortFormat);
        QTRY_VERIFY2(([&] {
            QList<QQuickItem *> pending{widget->quickWindow()->contentItem()};
            while (!pending.isEmpty()) {
                auto *item = pending.takeFirst();
                pending += item->childItems();
                if (item->isVisible() && item->property("text").toString() == expected && item != time) {
                    return true;
                }
            }
            return false;
        })(), "absolute time tooltip");
    }

    void previewPansWithDragAndZoomsWithTheWheel()
    {
        Fixture server;
        History history;
        history.created = true;
        server.respond = [&history](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            return line.contains("versions.list") ? history.list() : trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 2);
        click(widget, "version-row-0");
        auto *preview = find(widget->rootObject(), "version-graph-preview");
        QVERIFY(preview);
        // Let the detail pane finish laying out before measuring its position.
        QTest::qWait(100);
        resetScroll(widget->rootObject());
        QTRY_VERIFY(preview->property("graph").toMap()["nodes"].toList().size() == 2);
        const auto fitScale = preview->property("viewScale").toReal();
        const auto fitX = preview->property("viewX").toReal();
        const auto fitY = preview->property("viewY").toReal();
        QVERIFY(fitScale > 0);
        auto *quick = widget->quickWindow();
        const auto point = preview->mapToScene({preview->width() * 0.25, preview->height() * 0.5}).toPoint();
        const auto local = preview->mapFromScene(QPointF(point));
        const auto flowX = (local.x() - fitX) / fitScale;
        const auto flowY = (local.y() - fitY) / fitScale;
        const auto snapshot = [&] {
            QTest::qWait(60);
            return widget->grabFramebuffer().copy(QRect(preview->mapToScene(QPointF()).toPoint(), QSize(qRound(preview->width()), qRound(preview->height()))));
        };
        const auto fitImage = snapshot();

        // One wheel notch zooms by 2^(120 * 0.002) about the cursor.
        wheel(quick, point, 120);
        QTRY_VERIFY(preview->property("viewScale").toReal() > fitScale * 1.15);
        QVERIFY(qAbs(preview->property("viewScale").toReal() / fitScale - std::pow(2.0, 0.24)) < 0.001);
        auto scale = preview->property("viewScale").toReal();
        QVERIFY(qAbs(local.x() - (preview->property("viewX").toReal() + flowX * scale)) < 0.5);
        QVERIFY(qAbs(local.y() - (preview->property("viewY").toReal() + flowY * scale)) < 0.5);
        QVERIFY(snapshot() != fitImage);
        wheel(quick, point, -120);
        QTRY_VERIFY(qAbs(preview->property("viewScale").toReal() - fitScale) < 0.001);

        // Zoom stops at the web's limits (minZoom 0.02, maxZoom 1.5).
        for (int step = 0; step < 40; ++step) {
            wheel(quick, point, 120);
        }
        QTRY_COMPARE(preview->property("viewScale").toReal(), 1.5);
        for (int step = 0; step < 80; ++step) {
            wheel(quick, point, -120);
        }
        QTRY_COMPARE(preview->property("viewScale").toReal(), 0.02);

        // Dragging moves the graph with the pointer and leaves the scale alone.
        for (int step = 0; step < 80; ++step) {
            wheel(quick, point, 120);
        }
        scale = preview->property("viewScale").toReal();
        QVERIFY(scale > 0.02);
        const auto startX = preview->property("viewX").toReal();
        const auto startY = preview->property("viewY").toReal();
        const auto start = center(preview);
        QTest::mousePress(quick, Qt::LeftButton, Qt::NoModifier, start);
        for (int step = 1; step <= 10; ++step) {
            QTest::mouseMove(quick, start + QPoint(step * 4, step * 3));
        }
        QTest::mouseRelease(quick, Qt::LeftButton, Qt::NoModifier, start + QPoint(40, 30));
        QTRY_VERIFY(qAbs(preview->property("viewX").toReal() - (startX + 40)) < 1.5);
        QVERIFY(qAbs(preview->property("viewY").toReal() - (startY + 30)) < 1.5);
        QCOMPARE(preview->property("viewScale").toReal(), scale);
        QVERIFY(snapshot() != fitImage);
        // Selecting another version fits it again.
        click(widget, "version-row-1");
        QTRY_COMPARE(preview->property("viewScale").toReal(), fitScale);
        QCOMPARE(preview->property("viewX").toReal(), fitX);
        QCOMPARE(preview->property("viewY").toReal(), fitY);
        // A list thumbnail is fixed.
        auto *thumbnail = find(widget->rootObject(), "version-thumbnail-0");
        QVERIFY(thumbnail);
        QVERIFY(!thumbnail->property("interactive").toBool());
        const auto thumbnailScale = thumbnail->property("viewScale").toReal();
        wheel(quick, center(thumbnail), 120);
        QTest::qWait(60);
        QCOMPARE(thumbnail->property("viewScale").toReal(), thumbnailScale);
    }

    // The dock cannot narrow below the width at which every button label fits on one line.
    void buttonsDoNotWrapAtTheMinimumWidth()
    {
        Fixture server;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{
                    versionRow("v12", 12, "checkpoint", "Before execution", "2026-06-15T11:58:00Z"),
                    versionRow("v11", 11, "autosave", QString(), "2026-06-15T09:00:00Z")}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 2);
        const auto minimum = qCeil(widget->rootObject()->property("minimumWidth").toReal());
        QCOMPARE(widget->minimumWidth(), minimum);
        window.resize(200, 900);
        QCoreApplication::processEvents();
        QVERIFY(widget->width() >= minimum);
        qInfo() << "dock minimum width" << minimum << "narrowest window dock" << widget->width();

        // Lay the same panel out at exactly the minimum, with a selected row and a comparison target.
        QQuickWidget isolated(widget->engine(), nullptr);
        isolated.setResizeMode(QQuickWidget::SizeRootObjectToView);
        isolated.setInitialProperties({{"controller", QVariant::fromValue(controllerOf(widget))}});
        isolated.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/VersionHistoryPanel.qml"));
        QVERIFY(isolated.rootObject());
        isolated.resize(minimum, 720);
        isolated.show();
        QVERIFY(QTest::qWaitForWindowExposed(&isolated));
        click(&isolated, "version-row-0");
        click(&isolated, "compare-toggle");
        QTest::qWait(100);
        click(&isolated, "version-row-1");
        QVERIFY(find(isolated.rootObject(), "compare-clear")->isVisible());
        QTest::qWait(60);
        QCOMPARE(isolated.rootObject()->width(), qreal(minimum));
        // A comparison replaces the inspected version's actions, as the web's diff view does.
        QVERIFY(!find(isolated.rootObject(), "restore-version")->isVisible());
        const auto problems = [&isolated] {
            QStringList found;
            auto *root = isolated.rootObject();
            QList<QQuickItem *> pending{root};
            while (!pending.isEmpty()) {
                auto *item = pending.takeFirst();
                pending += item->childItems();
                const QString type = item->metaObject()->className();
                const bool button = type.startsWith("EditorButton");
                if (!item->isVisible() || (!button && !type.startsWith("CheckBox"))) {
                    continue;
                }
                const auto name = item->property("text").toString();
                if (auto *label = find(item, "nativeButtonLabel"); button && label && label->isVisible()) {
                    if (label->property("lineCount").toInt() > 1 || label->property("truncated").toBool()) {
                        found << "label wraps or is cut: " + name;
                    }
                }
                if (item->width() + 0.5 < item->implicitWidth()) {
                    found << "narrower than its content: " + name;
                }
                if (item->mapToItem(root, QPointF(item->width(), 0)).x() > root->width() + 0.5) {
                    found << "past the panel edge: " + name;
                }
            }
            return found;
        };
        QCOMPARE(problems(), QStringList());
        // The same check finds the overflow when the panel is narrower than its minimum.
        isolated.resize(minimum * 6 / 10, 720);
        QTest::qWait(60);
        QVERIFY(!problems().isEmpty());
        // At the minimum, in the narrowest dock the window allows, nothing wraps either.
        isolated.resize(minimum, 720);
        QTest::qWait(60);
        QCOMPARE(problems(), QStringList());
    }

    // web/src/components/sharing/ShareDocumentDialog.tsx lines 164 to 290: the dialog shows a
    // description, three link buttons, the active links as a role chip with copy and revoke, and
    // the people with access. It never shows the server response, a token or a link's URL.
    void sharePanelShowsOnlyWhatTheWebDialogShows()
    {
        Fixture server;
        bool revoked = false;
        server.respond = [&revoked](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("sharing.revokeLink")) {
                revoked = true;
                return envelope(QJsonObject{{"ok", true}});
            }
            if (line.contains("sharing.get")) {
                QJsonArray shares;
                if (!revoked) {
                    shares.append(QJsonObject{{"id", "share-a"}, {"workflow_id", "bound"}, {"token", "listed-editor"}, {"role", "editor"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}});
                }
                shares.append(QJsonObject{{"id", "share-b"}, {"workflow_id", "bound"}, {"token", "listed-public"}, {"role", "public"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}});
                return envelope(QJsonObject{
                    {"collaborators", QJsonArray{QJsonObject{{"workflow_id", "bound"}, {"user_id", "guest"}, {"role", "viewer"}, {"invited_by", "1"}, {"created_at", "2026-06-01T10:00:00Z"}}}},
                    {"shares", shares}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        window.action("Share workflow");
        auto *widget = panel(window, "WorkflowDetails.qml");
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_COMPARE(controller->rows().size(), 3);
        QTRY_VERIFY(!controller->busy());
        QTest::qWait(60);

        const auto texts = visibleTexts(widget->quickWindow()->contentItem());
        const auto joined = texts.join("\n");
        for (const auto &leak : {"workflow_id", "revoked_at", "created_at", "listed-editor", "listed-public", "http://", "{", "\"shares\""}) {
            QVERIFY2(!joined.contains(leak), qPrintable(QString("share panel shows raw server data: %1").arg(leak)));
        }
        QVERIFY(!find(widget->quickWindow()->contentItem(), "version-preview"));
        QVERIFY(texts.contains("Share \"Original\""));
        QVERIFY(joined.contains("Anyone signed in to this server who opens a view or edit link gets the role assigned to that link."));
        QVERIFY(texts.contains("Copy view link"));
        QVERIFY(texts.contains("Copy edit link"));
        QVERIFY(texts.contains("Copy public link"));
        QVERIFY(texts.contains("Active links"));
        QVERIFY(texts.contains("Can edit"));
        QVERIFY(texts.contains("Public view"));
        QVERIFY(texts.contains("People with access"));
        QVERIFY(texts.contains("guest"));
        QVERIFY(!find(widget->quickWindow()->contentItem(), "share-no-collaborators")->isVisible());

        // Revoking a link sends its share id and the list then drops it.
        click(widget, "revoke-share-link-0");
        QTRY_COMPARE(server.count("sharing.revokeLink"), 1);
        const auto body = requestBody(server.requests[server.indexOf("sharing.revokeLink")]);
        QCOMPARE(body["id"].toString(), QString("bound"));
        QCOMPARE(body["share_id"].toString(), QString("share-a"));
        QTRY_COMPARE(controller->rows().size(), 2);
        QVERIFY(!visibleTexts(widget->quickWindow()->contentItem()).contains("Can edit"));
    }

    // computeGraphDiff in web/src/utils/graphDiff.ts lists added, removed and changed nodes and
    // added and removed edges in graph order. QHash iteration made the order differ between runs.
    void graphDiffKeepsGraphOrder()
    {
        const auto id = [](int index) { return QString("n%1").arg(index, 2, 10, QChar('0')); };
        const auto sequence = [](int index) { return (index * 17 + 5) % 40; };
        const auto node = [&id](int index, int value) {
            return QJsonObject{{"id", id(index)}, {"type", "Type" + id(index)}, {"data", QJsonObject{{"zeta", value}, {"alpha", value}, {"mid", value}}}};
        };
        const auto edge = [&id](int from, int to) {
            return QJsonObject{{"source", id(from)}, {"target", id(to)}};
        };
        QJsonArray oldNodes;
        QJsonArray newNodes;
        QJsonArray oldEdges;
        QJsonArray newEdges;
        QStringList expectedAdded;
        QStringList expectedRemoved;
        QStringList expectedChanged;
        QStringList expectedAddedEdges;
        QStringList expectedRemovedEdges;
        for (int index = 0; index < 30; ++index) {
            oldNodes.append(node(sequence(index), 1));
            oldEdges.append(edge(sequence(index), sequence(index + 1)));
            if (index < 15) {
                expectedRemoved << id(sequence(index));
                expectedRemovedEdges << id(sequence(index));
            }
        }
        for (int index = 15; index < 40; ++index) {
            newNodes.append(node(sequence(index), index < 30 ? 2 : 1));
            newEdges.append(edge(sequence(index), sequence(index + 1)));
            if (index >= 30) {
                expectedAdded << id(sequence(index));
                expectedAddedEdges << id(sequence(index));
            } else {
                expectedChanged << id(sequence(index));
            }
        }
        const auto diff = WorkflowVersions::graphDiff(QJsonObject{{"nodes", oldNodes}, {"edges", oldEdges}}, QJsonObject{{"nodes", newNodes}, {"edges", newEdges}});
        const auto ids = [](const QVariantList &items, const char *key = "id") {
            QStringList result;
            for (const auto &item : items) {
                result << item.toMap().value(key).toString();
            }
            return result;
        };
        QCOMPARE(ids(diff["addedNodes"].toList()), expectedAdded);
        QCOMPARE(ids(diff["removedNodes"].toList()), expectedRemoved);
        QCOMPARE(ids(diff["modifiedNodes"].toList()), expectedChanged);
        QCOMPARE(ids(diff["addedEdges"].toList(), "source"), expectedAddedEdges);
        QCOMPARE(ids(diff["removedEdges"].toList(), "source"), expectedRemovedEdges);
        // Keys inside a changed node are listed by name, so the order does not depend on hashing.
        const auto changes = diff["modifiedNodes"].toList().first().toMap()["changes"].toList();
        QStringList keys;
        for (const auto &change : changes) {
            keys << change.toMap()["key"].toString();
        }
        QCOMPARE(keys, (QStringList{"alpha", "mid", "zeta"}));
        // The same graphs give the same result however often they are compared.
        QCOMPARE(WorkflowVersions::graphDiff(QJsonObject{{"nodes", oldNodes}, {"edges", oldEdges}}, QJsonObject{{"nodes", newNodes}, {"edges", newEdges}}), diff);
    }

    // The panel lists the changes in the same order, in the sections the web's VersionDiff uses.
    void comparedNodesAppearInGraphOrder()
    {
        QJsonArray nodes;
        QStringList expected;
        for (int index = 0; index < 12; ++index) {
            const auto number = (index * 7 + 3) % 12;
            const auto name = QString("Type%1").arg(number, 2, 10, QChar('0'));
            nodes.append(QJsonObject{{"id", QString("n%1").arg(number)}, {"type", name}});
            expected << name;
        }
        Fixture server;
        server.respond = [&nodes](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{
                    versionRow("v2", 2, "manual", "Emptied", "2026-06-15T11:00:00Z", QJsonObject{{"nodes", QJsonArray()}, {"edges", QJsonArray()}}),
                    versionRow("v1", 1, "autosave", QString(), "2026-06-15T10:00:00Z", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray()}})}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 2);
        click(widget, "compare-toggle");
        QTest::qWait(100);
        click(widget, "version-row-0");
        QTest::qWait(100);
        click(widget, "version-row-1");
        QTRY_COMPARE(controllerOf(widget)->comparison()["removedNodes"].toList().size(), 12);
        QTest::qWait(100);
        QList<QPair<qreal, QString>> found;
        QList<QQuickItem *> pending{widget->rootObject()};
        while (!pending.isEmpty()) {
            auto *item = pending.takeFirst();
            pending += item->childItems();
            const auto text = item->property("text").toString();
            if (item->isVisible() && QRegularExpression("^Type\\d\\d$").match(text).hasMatch()) {
                found.append({item->mapToScene(QPointF()).y(), text});
            }
        }
        std::sort(found.begin(), found.end());
        QStringList listed;
        for (const auto &entry : found) {
            listed << entry.second;
        }
        QCOMPARE(listed, expected);
    }

    // The web's All, Manual and Auto filter (VersionHistoryPanel.tsx). Auto is "autosave" only, so
    // checkpoints and restores appear under All alone.
    void filterShowsManualAutoOrAllVersions()
    {
        Fixture server;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{
                    versionRow("v5", 5, "autosave", QString(), "2026-06-15T11:59:00Z"),
                    versionRow("v4", 4, "manual", "Named", "2026-06-15T11:00:00Z"),
                    versionRow("v3", 3, "checkpoint", "Before execution", "2026-06-15T10:00:00Z"),
                    versionRow("v2", 2, "restore", QString(), "2026-06-15T09:00:00Z"),
                    versionRow("v1", 1, "autosave", QString(), "2026-06-15T08:00:00Z")}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 5);
        const auto shown = [widget] {
            QList<int> rows;
            for (int index = 0; index < 5; ++index) {
                if (find(widget->rootObject(), QString("version-row-%1").arg(index))->isVisible()) {
                    rows << index;
                }
            }
            return rows;
        };
        const auto count = [widget] { return find(widget->rootObject(), "version-count")->property("text").toString(); };
        QCOMPARE(shown(), (QList<int>{0, 1, 2, 3, 4}));
        QCOMPARE(count(), QString("5"));
        QVERIFY(find(widget->rootObject(), "version-filter-all")->property("active").toBool());

        click(widget, "version-filter-manual");
        QTRY_COMPARE(shown(), (QList<int>{1}));
        QCOMPARE(count(), QString("1"));
        QVERIFY(find(widget->rootObject(), "version-filter-manual")->property("active").toBool());
        QVERIFY(!find(widget->rootObject(), "version-filter-all")->property("active").toBool());
        click(widget, "version-filter-autosave");
        QTRY_COMPARE(shown(), (QList<int>{0, 4}));
        QCOMPARE(count(), QString("2"));
        // Row indexes still address the controller's rows, so a filtered row inspects its own version.
        click(widget, "version-row-4");
        QCOMPARE(controllerOf(widget)->property("selectedIndex").toInt(), 4);
        click(widget, "version-filter-all");
        QTRY_COMPARE(shown(), (QList<int>{0, 1, 2, 3, 4}));
        QVERIFY(!find(widget->rootObject(), "versions-empty")->isVisible());
    }

    // A filter that matches nothing shows the web's empty state.
    void filterWithoutMatchesShowsTheEmptyState()
    {
        Fixture server;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{versionRow("v1", 1, "autosave", QString(), "2026-06-15T08:00:00Z")}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 1);
        QVERIFY(!find(widget->rootObject(), "versions-empty")->isVisible());
        click(widget, "version-filter-manual");
        QTRY_VERIFY(find(widget->rootObject(), "versions-empty")->isVisible());
        QVERIFY(!find(widget->rootObject(), "version-row-0")->isVisible());
        QCOMPARE(find(widget->rootObject(), "version-count")->property("text").toString(), QString("0"));
    }

    // web/src/components/version/VersionHistoryPanel.tsx: with nothing selected the preview pane
    // only asks for a selection. Restore, Delete, the confirmation and the diff appear once a
    // version is inspected, under a header with its number, save type, time and size.
    void detailPaneWaitsForASelection()
    {
        Fixture server;
        const QJsonObject graph{
            {"nodes", QJsonArray{
                QJsonObject{{"id", "0123456789abcdef"}, {"type", "nodetool.text.Template"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}},
            {"edges", QJsonArray()}};
        server.respond = [&graph](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{versionRow("v1", 1, "autosave", "Draft", "2026-06-15T08:00:00Z", graph)}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 1);
        auto *root = widget->rootObject();
        const auto visible = [root](const char *name) {
            auto *item = find(root, name);
            return item && item->isVisible();
        };
        QVERIFY(visible("version-detail-empty"));
        QCOMPARE(find(root, "version-detail-empty-hint")->property("text").toString(), QString("Click any entry to see its graph and metadata here."));
        for (const auto *name : {"version-graph-preview", "restore-confirm", "restore-version", "delete-selected-version",
                                 "version-detail-header", "version-diff-current-heading", "version-diff-empty", "version-diff-addedNodes"}) {
            QVERIFY2(!visible(name), name);
        }
        if (const auto directory = qEnvironmentVariable("NODETOOL_VERSIONS_CAPTURE_DIR"); !directory.isEmpty()) {
            QVERIFY(QDir().mkpath(directory));
            QTest::qWait(120);
            QVERIFY(window.grab().save(directory + "/versions-unselected.png"));
        }

        click(widget, "version-row-0");
        QTRY_VERIFY(visible("version-detail-header"));
        QVERIFY(!visible("version-detail-empty"));
        QCOMPARE(find(root, "version-detail-number")->property("text").toString(), QString("v1"));
        QCOMPARE(find(root, "version-detail-type")->property("text").toString(), QString("Auto"));
        QCOMPARE(find(root, "version-detail-name")->property("text").toString(), QString("Draft"));
        for (const auto *name : {"version-graph-preview", "restore-confirm", "restore-version", "delete-selected-version", "version-diff-current-heading", "version-diff-addedNodes"}) {
            QVERIFY2(visible(name), name);
        }
        // Diff rows name a node by the last segment of its type, as VersionDiff.tsx does.
        QCOMPARE(find(root, "version-diff-title-addedNodes")->property("text").toString(), QString("Added node (1)"));
        QCOMPARE(find(root, "version-diff-item-addedNodes-0")->property("text").toString(), QString("Template"));

        // In compare mode the empty pane asks for two versions.
        click(widget, "version-row-0");
        click(widget, "compare-toggle");
        QTRY_COMPARE(find(root, "version-detail-empty-hint")->property("text").toString(), QString("Pick two versions to see what changed."));
    }

    // The web's compare mode (VersionHistoryPanel.tsx): the toggle makes rows pick two versions,
    // the lower version number is the older side, and GraphVisualDiff draws the result.
    void compareModeDrawsTheVisualDiff()
    {
        const auto node = [](const QString &id, const QString &type, int value) {
            return QJsonObject{{"id", id}, {"type", type}, {"data", QJsonObject{{"value", value}}}};
        };
        const QJsonObject older{
            {"nodes", QJsonArray{node("a", "nodetool.text.Concat", 1), node("b", "nodetool.output.Preview", 1), node("c", "nodetool.constant.String", 1)}},
            {"edges", QJsonArray{QJsonObject{{"source", "a"}, {"target", "b"}}, QJsonObject{{"source", "b"}, {"target", "c"}}}}};
        const QJsonObject newer{
            {"nodes", QJsonArray{node("a", "nodetool.text.Concat", 2), node("b", "nodetool.output.Preview", 1), node("d", "nodetool.image.Resize", 1)}},
            {"edges", QJsonArray{QJsonObject{{"source", "a"}, {"target", "b"}}, QJsonObject{{"source", "a"}, {"target", "d"}}}}};
        Fixture server;
        server.respond = [&](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{
                    versionRow("v2", 2, "manual", "Newer", "2026-06-15T11:00:00Z", newer),
                    versionRow("v1", 1, "autosave", QString(), "2026-06-15T10:00:00Z", older)}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_COMPARE(controller->rows().size(), 2);
        auto *preview = find(widget->rootObject(), "version-graph-preview");
        QVERIFY(preview);
        const auto hint = [widget] { return find(widget->rootObject(), "compare-hint"); };

        // Outside compare mode a click inspects one version, and clicking it again clears it.
        QVERIFY(!hint()->isVisible());
        click(widget, "version-row-0");
        QCOMPARE(controller->property("selectedIndex").toInt(), 0);
        click(widget, "version-row-0");
        QCOMPARE(controller->property("selectedIndex").toInt(), -1);

        click(widget, "compare-toggle");
        QVERIFY(find(widget->rootObject(), "compare-toggle")->property("active").toBool());
        // The banner shifts the list, so let the layout settle before the next pointer event.
        QTest::qWait(100);
        QVERIFY(hint()->isVisible());
        QCOMPARE(hint()->property("text").toString(), QString("Select the first version to compare"));
        QVERIFY(!find(widget->rootObject(), "compare-clear")->isVisible());
        click(widget, "version-row-0");
        QCOMPARE(hint()->property("text").toString(), QString("Select the second version to compare"));
        QVERIFY(find(widget->rootObject(), "compare-clear")->isVisible());
        QVERIFY(!preview->property("diffMode").toBool());
        // The newer version was picked first. The lower version is still the older side.
        click(widget, "version-row-1");
        QTRY_VERIFY(preview->property("diffMode").toBool());
        QVERIFY(!hint()->isVisible());
        QVERIFY(find(widget->rootObject(), "version-compare-target-1")->isVisible());
        QCOMPARE(find(widget->rootObject(), "version-diff-heading")->property("text").toString(), QString::fromUtf8("Comparing v1 ↔ v2"));
        const auto diff = controller->comparison();
        QCOMPARE(diff["addedNodes"].toList().size(), 1);
        QCOMPARE(diff["addedNodes"].toList().first().toMap()["id"].toString(), QString("d"));
        QCOMPARE(diff["removedNodes"].toList().first().toMap()["id"].toString(), QString("c"));
        QCOMPARE(diff["modifiedNodes"].toList().first().toMap()["id"].toString(), QString("a"));
        QCOMPARE(diff["addedEdges"].toList().size(), 1);
        QCOMPARE(diff["removedEdges"].toList().size(), 1);
        QCOMPARE(preview->property("legend").toList().size(), 3);

        // Sections appear in the order of the web's VersionDiff.
        QTest::qWait(100);
        const QStringList headings{"Added node (1)", "Removed node (1)", "Modified node (1)", "Added connection (1)", "Removed connection (1)"};
        qreal previous = -1;
        for (const auto &heading : headings) {
            qreal y = -1;
            QList<QQuickItem *> pending{widget->rootObject()};
            while (!pending.isEmpty()) {
                auto *item = pending.takeFirst();
                pending += item->childItems();
                if (item->isVisible() && item->property("text").toString() == heading) {
                    y = item->mapToScene(QPointF()).y();
                }
            }
            QVERIFY2(y > previous, qPrintable("section out of order: " + heading));
            previous = y;
        }

        // The preview draws the added node in the success colour, the changed one in the warning
        // colour and the removed one in the error colour at half opacity.
        auto *theme = widget->engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        const auto colorOf = [theme](const char *name) { return theme->property(name).value<QColor>(); };
        QTest::qWait(150);
        const auto image = widget->grabFramebuffer().copy(QRect(preview->mapToScene(QPointF()).toPoint(), QSize(qRound(preview->width()), qRound(preview->height()))));
        const auto close = [](const QColor &a, const QColor &b) {
            return qAbs(a.red() - b.red()) < 8 && qAbs(a.green() - b.green()) < 8 && qAbs(a.blue() - b.blue()) < 8;
        };
        const auto background = colorOf("surfaceInput");
        const auto error = colorOf("statusError");
        const QColor blended(
            qRound((error.red() + background.red()) / 2.0),
            qRound((error.green() + background.green()) / 2.0),
            qRound((error.blue() + background.blue()) / 2.0));
        int added = 0;
        int changed = 0;
        int removed = 0;
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width(); ++x) {
                const auto pixel = image.pixelColor(x, y);
                added += pixel == colorOf("statusSuccess");
                changed += pixel == colorOf("statusWarning");
                removed += close(pixel, blended);
            }
        }
        // A legend dot is a few dozen pixels. A node fill is many more.
        QVERIFY2(added > 300, qPrintable(QString("added node pixels: %1").arg(added)));
        QVERIFY2(changed > 300, qPrintable(QString("changed node pixels: %1").arg(changed)));
        QVERIFY2(removed > 300, qPrintable(QString("removed node pixels: %1").arg(removed)));

        // Clear leaves compare mode and the selection.
        click(widget, "compare-clear");
        QVERIFY(!find(widget->rootObject(), "compare-toggle")->property("active").toBool());
        QCOMPARE(controller->property("selectedIndex").toInt(), -1);
        QCOMPARE(controller->property("compareIndex").toInt(), -1);
        QVERIFY(!preview->property("diffMode").toBool());
        QVERIFY(!hint()->isVisible());
    }

    // A delete's reload is queued after its reply. A Share panel opened while the delete ran
    // must keep its data, because the reload is for a panel that is no longer shown.
    void reloadAfterDeleteCannotReplaceTheSharePanel()
    {
        Fixture server;
        History history;
        history.created = true;
        server.respond = [&history](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.delete")) {
                return QByteArray();
            }
            if (line.contains("sharing.get")) {
                return envelope(QJsonObject{
                    {"collaborators", QJsonArray()},
                    {"shares", QJsonArray{
                        QJsonObject{{"id", "share-a"}, {"workflow_id", "bound"}, {"token", "listed-editor"}, {"role", "editor"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}},
                        QJsonObject{{"id", "share-b"}, {"workflow_id", "bound"}, {"token", "listed-public"}, {"role", "public"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}}}}});
            }
            return line.contains("versions.list") ? history.list() : trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_COMPARE(controller->rows().size(), 2);
        click(widget, "version-row-0");
        click(widget, "delete-selected-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "confirm-delete-version"));
        click(widget, "confirm-delete-version");
        QTRY_COMPARE(server.count("versions.delete"), 1);
        QVERIFY(controller->busy());

        // Open Share while the delete is still unanswered.
        window.findChild<QDockWidget *>("workflow-versions-dock")->close();
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        window.action("Share workflow");
        auto *sharing = panel(window, "WorkflowDetails.qml");
        QVERIFY(sharing);
        QCOMPARE(server.count("sharing.get"), 0);

        server.release(envelope(QJsonObject{{"ok", true}}));
        QTRY_COMPARE(controller->rows().size(), 2);
        QTRY_VERIFY(!controller->busy());
        const auto shareRows = controller->rows();
        QCOMPARE(shareRows.first().toMap()["kind"].toString(), QString("link"));
        QTest::qWait(300);
        QTRY_VERIFY(!controller->busy());
        QCOMPARE(controller->rows(), shareRows);
        QCOMPARE(server.count("sharing.get"), 1);
        QCOMPARE(server.count("versions.list"), 1);
        QCOMPARE(find(sharing->rootObject(), "versions-error")->property("text").toString(), QString());
        QVERIFY(find(sharing->rootObject(), "copy-share-link-1")->isVisible());
    }

    // web/src/hooks/useFloatingToolbarActions.ts lines 156 to 180: before a run the web sends a
    // forced "checkpoint" autosave described "Before execution", waits for its reply, and adopts the
    // returned updated_at. The run waits for that one request and nothing else.
    void runSendsABeforeExecutionCheckpointAndWaitsForIt()
    {
        QWebSocketServer sockets("runs", QWebSocketServer::NonSecureMode);
        QList<QJsonObject> commands;
        connect(&sockets, &QWebSocketServer::newConnection, this, [&] {
            auto *peer = sockets.nextPendingConnection();
            peer->setParent(&sockets);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [&](QByteArray bytes) {
                const auto decoded = decodeMsgPack(bytes);
                QVERIFY(decoded);
                commands.append(decoded->toObject());
            });
        });
        Fixture server;
        server.webSocket = &sockets;
        bool answered = false;
        server.respond = [&answered](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBodyWithNode("r1");
            }
            if (line.startsWith("PUT /api/workflows/")) {
                auto body = requestBody(request);
                body.insert("updated_at", "r3");
                return QJsonDocument(body).toJson(QJsonDocument::Compact);
            }
            if (line.contains("workflows.autosave")) {
                return answered ? envelope(QJsonObject{{"version", QJsonObject{{"id", "cp"}, {"version", 3}, {"workflow_id", "bound"}, {"save_type", "checkpoint"}, {"created_at", "2026-06-15T12:00:00Z"}}}, {"message", "Autosaved successfully"}, {"skipped", false}, {"updated_at", "r2"}, {"etag", "etag-2"}}) : QByteArray();
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        QTRY_VERIFY(window.session()->connected());
        auto *toolbar = panel(window, "Toolbar.qml");
        QVERIFY(toolbar);
        QSignalSpy errors(window.session(), &nodetool::node_editor::WorkflowSession::errorOccurred);

        click(toolbar, "run-workflow");
        QTRY_COMPARE(server.count("workflows.autosave"), 1);
        const auto body = requestBody(server.requests[server.indexOf("workflows.autosave")]);
        QCOMPARE(body["id"].toString(), QString("bound"));
        QCOMPARE(body["save_type"].toString(), QString("checkpoint"));
        QCOMPARE(body["description"].toString(), QString("Before execution"));
        QVERIFY(body["force"].toBool());
        QCOMPARE(body["client_id"].toString(), QString("system"));
        QCOMPARE(body["expected_updated_at"].toString(), QString("r1"));
        QCOMPARE(body["graph"].toObject()["nodes"].toArray().size(), 1);
        // The run does not start while the checkpoint is unanswered.
        QTest::qWait(300);
        QCOMPARE(commands.size(), 0);

        answered = true;
        server.release(envelope(QJsonObject{{"version", QJsonObject{{"id", "cp"}, {"version", 3}, {"workflow_id", "bound"}, {"save_type", "checkpoint"}, {"created_at", "2026-06-15T12:00:00Z"}}}, {"message", "Autosaved successfully"}, {"skipped", false}, {"updated_at", "r2"}, {"etag", "etag-2"}}));
        // The reply starts the run at once. Nothing else is awaited.
        QTRY_COMPARE_WITH_TIMEOUT(commands.size(), 1, 1000);
        QCOMPARE(commands.first()["command"].toString(), QString("run_job"));
        QCOMPARE(server.count("workflows.autosave"), 1);
        QCOMPARE(window.session()->workflow()["updated_at"].toString(), QString("r2"));
        QVERIFY(!window.session()->saving());
        QCOMPARE(errors.size(), 0);

        // The next save sends the revision the checkpoint left, so it is not a conflict.
        editLocally(window);
        window.session()->save();
        QTRY_COMPARE(server.count("PUT /api/workflows/"), 1);
        QCOMPARE(requestBody(server.requests[server.indexOf("PUT /api/workflows/")])["expected_updated_at"].toString(), QString("r2"));
        QTRY_VERIFY(!window.session()->saving());
        QVERIFY(!window.session()->conflictPending());
    }

    // The web logs a failed checkpoint and runs anyway (triggerAutosaveForWorkflow returns null).
    void failedCheckpointDoesNotStopTheRun()
    {
        QWebSocketServer sockets("runs", QWebSocketServer::NonSecureMode);
        QList<QJsonObject> commands;
        connect(&sockets, &QWebSocketServer::newConnection, this, [&] {
            auto *peer = sockets.nextPendingConnection();
            peer->setParent(&sockets);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [&](QByteArray bytes) {
                const auto decoded = decodeMsgPack(bytes);
                QVERIFY(decoded);
                commands.append(decoded->toObject());
            });
        });
        Fixture server;
        server.webSocket = &sockets;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBodyWithNode("r1");
            }
            if (line.contains("workflows.autosave")) {
                return trpcError("Storage is unavailable", "INTERNAL_SERVER_ERROR", 500);
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        server.status = [](QByteArray request) {
            return request.contains("workflows.autosave") ? 500 : 200;
        };
        EditorWindow window;
        connectWorkflow(window, server);
        QTRY_VERIFY(window.session()->connected());
        QSignalSpy errors(window.session(), &nodetool::node_editor::WorkflowSession::errorOccurred);
        click(panel(window, "Toolbar.qml"), "run-workflow");
        QTRY_COMPARE(server.count("workflows.autosave"), 1);
        QTRY_COMPARE_WITH_TIMEOUT(commands.size(), 1, 1000);
        QCOMPARE(commands.first()["command"].toString(), QString("run_job"));
        QCOMPARE(errors.size(), 0);
        QVERIFY(!window.session()->saving());
        QVERIFY(!window.session()->conflictPending());
    }

    // The web skips the checkpoint when the graph has no nodes.
    void emptyWorkflowRunsWithoutACheckpoint()
    {
        QWebSocketServer sockets("runs", QWebSocketServer::NonSecureMode);
        QList<QJsonObject> commands;
        connect(&sockets, &QWebSocketServer::newConnection, this, [&] {
            auto *peer = sockets.nextPendingConnection();
            peer->setParent(&sockets);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [&](QByteArray bytes) {
                const auto decoded = decodeMsgPack(bytes);
                QVERIFY(decoded);
                commands.append(decoded->toObject());
            });
        });
        Fixture server;
        server.webSocket = &sockets;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            return line.startsWith("GET /api/workflows/") ? workflowBody("r1") : trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        QTRY_VERIFY(window.session()->connected());
        click(panel(window, "Toolbar.qml"), "run-workflow");
        QTRY_COMPARE_WITH_TIMEOUT(commands.size(), 1, 1000);
        QCOMPARE(server.count("workflows.autosave"), 0);
    }

    // The dock's minimum width is the panel's, and the panel's follows the UI scale.
    void dockMinimumWidthFollowsTheUiScale()
    {
        Fixture server;
        server.respond = [](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{versionRow("v1", 1, "autosave", QString(), "2026-06-15T08:00:00Z")}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        QTRY_COMPARE(controllerOf(widget)->rows().size(), 1);
        auto *theme = widget->engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        const auto initial = widget->minimumWidth();
        QCOMPARE(initial, qCeil(widget->rootObject()->property("minimumWidth").toReal()));
        theme->setProperty("uiScale", 1.5);
        QTRY_VERIFY(widget->minimumWidth() > initial * 13 / 10);
        QCOMPARE(widget->minimumWidth(), qCeil(widget->rootObject()->property("minimumWidth").toReal()));
        // The dock honors the new minimum when the window narrows.
        window.resize(200, 900);
        QCoreApplication::processEvents();
        QVERIFY(widget->width() >= widget->minimumWidth());
        theme->setProperty("uiScale", 1.0);
        QTRY_COMPARE(widget->minimumWidth(), initial);
    }

    // NODETOOL_VERSIONS_CAPTURE_DIR enables dark and light captures of the polished panel.
    void capturesDarkAndLight()
    {
        const auto directory = qEnvironmentVariable("NODETOOL_VERSIONS_CAPTURE_DIR");
        if (directory.isEmpty()) {
            QSKIP("Set NODETOOL_VERSIONS_CAPTURE_DIR to write captures");
        }
        QVERIFY(QDir().mkpath(directory));
        // The two newest versions differ the way the web's GraphVisualDiff shows: one node
        // changed, one added, one removed, and a connection added and removed.
        const auto node = [](const QString &id, const QString &type, int value) {
            return QJsonObject{{"id", id}, {"type", type}, {"data", QJsonObject{{"value", value}}}};
        };
        const QJsonObject olderGraph{
            {"nodes", QJsonArray{node("a", "nodetool.text.Concat", 1), node("b", "nodetool.output.Preview", 1), node("c", "nodetool.constant.String", 1)}},
            {"edges", QJsonArray{QJsonObject{{"source", "a"}, {"target", "b"}}, QJsonObject{{"source", "b"}, {"target", "c"}}}}};
        const QJsonObject newerGraph{
            {"nodes", QJsonArray{node("a", "nodetool.text.Concat", 2), node("b", "nodetool.output.Preview", 1), node("d", "nodetool.image.Resize", 1)}},
            {"edges", QJsonArray{QJsonObject{{"source", "a"}, {"target", "b"}}, QJsonObject{{"source", "a"}, {"target", "d"}}}}};
        Fixture server;
        server.respond = [&](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("versions.list")) {
                return envelope(QJsonObject{{"versions", QJsonArray{
                    versionRow("v4", 4, "autosave", QString(), "2026-06-15T11:59:20Z", newerGraph),
                    versionRow("v3", 3, "manual", "Before refactor", "2026-06-15T11:58:00Z", olderGraph),
                    versionRow("v2", 2, "checkpoint", "Before execution", "2026-06-15T09:00:00Z"),
                    versionRow("v1", 1, "restore", QString(), "2026-05-06T12:00:00Z")}}});
            }
            if (line.contains("sharing.get")) {
                return envelope(QJsonObject{
                    {"collaborators", QJsonArray{QJsonObject{{"workflow_id", "bound"}, {"user_id", "guest@example.com"}, {"role", "viewer"}, {"invited_by", "1"}, {"created_at", "2026-06-01T10:00:00Z"}}}},
                    {"shares", QJsonArray{
                        QJsonObject{{"id", "share-a"}, {"workflow_id", "bound"}, {"token", "listed-editor"}, {"role", "editor"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}},
                        QJsonObject{{"id", "share-b"}, {"workflow_id", "bound"}, {"token", "listed-public"}, {"role", "public"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}}}}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        EditorWindow window;
        connectWorkflow(window, server);
        auto *widget = openHistory(window);
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_COMPARE(controller->rows().size(), 4);
        const auto now = QDateTime(QDate(2026, 6, 15), QTime(12, 0, 0), QTimeZone::UTC);
        controller->setClockSource([now] { return now; });
        click(widget, "version-row-1");
        QTest::qWait(100);
        resetScroll(widget->rootObject());
        auto *preview = find(widget->rootObject(), "version-graph-preview");
        QVERIFY(preview);
        wheel(widget->quickWindow(), preview->mapToScene({preview->width() * 0.3, preview->height() * 0.5}).toPoint(), 120);
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            window.setDarkTheme(scheme == "dark");
            QTest::qWait(120);
            QVERIFY(window.grab().save(directory + "/versions-history-" + scheme + ".png"));
        }
        // The Manual filter shows the one manual version.
        click(widget, "version-filter-manual");
        QTest::qWait(100);
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            window.setDarkTheme(scheme == "dark");
            QTest::qWait(120);
            QVERIFY(window.grab().save(directory + "/versions-filter-manual-" + scheme + ".png"));
        }
        click(widget, "version-filter-all");
        // Compare mode with the manual version v3 selected and v4 as the second version.
        click(widget, "compare-toggle");
        // The banner shifts the list, so let the layout settle before the next pointer event.
        QTest::qWait(100);
        click(widget, "version-row-0");
        QTRY_VERIFY(preview->property("diffMode").toBool());
        QTest::qWait(150);
        resetScroll(widget->rootObject());
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            window.setDarkTheme(scheme == "dark");
            QTest::qWait(150);
            QVERIFY(window.grab().save(directory + "/versions-compare-" + scheme + ".png"));
        }
        click(widget, "compare-clear");
        click(widget, "save-version");
        QTRY_VERIFY(find(widget->quickWindow()->contentItem(), "save-version-name"));
        typeName(widget, "Before the new prompt");
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            window.setDarkTheme(scheme == "dark");
            QTest::qWait(120);
            QVERIFY(window.grab().save(directory + "/versions-save-dialog-" + scheme + ".png"));
        }
        click(widget, "cancel-save-version");
        window.findChild<QDockWidget *>("workflow-versions-dock")->close();
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        window.action("Share workflow");
        auto *sharing = panel(window, "WorkflowDetails.qml");
        QVERIFY(sharing);
        QTRY_COMPARE(controllerOf(sharing)->rows().size(), 3);
        // Tall enough to show the whole list of links.
        window.findChild<QDialog *>("workflow-details-dialog")->resize(640, 1200);
        QTest::qWait(100);
        click(sharing, "copy-share-link-0");
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            window.setDarkTheme(scheme == "dark");
            sharing->rootObject()->forceActiveFocus();
            resetScroll(sharing->rootObject());
            QTest::qWait(120);
            QVERIFY(sharing->grab().save(directory + "/sharing-copy-" + scheme + ".png"));
        }
    }

    void sharingLinksCopyToTheClipboard()
    {
        Fixture server;
        bool allowCreate = false;
        server.respond = [&allowCreate](QByteArray request) {
            const auto line = request.left(request.indexOf("\r\n"));
            if (line.startsWith("GET /api/workflows/")) {
                return workflowBody("r1");
            }
            if (line.contains("sharing.get")) {
                return envelope(QJsonObject{
                    {"collaborators", QJsonArray{QJsonObject{{"workflow_id", "bound"}, {"user_id", "guest"}, {"role", "viewer"}, {"invited_by", "1"}, {"created_at", "2026-06-01T10:00:00Z"}}}},
                    {"shares", QJsonArray{
                        QJsonObject{{"id", "share-a"}, {"workflow_id", "bound"}, {"token", "listed-editor"}, {"role", "editor"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}},
                        QJsonObject{{"id", "share-b"}, {"workflow_id", "bound"}, {"token", "listed-public"}, {"role", "public"}, {"created_at", "2026-06-01T10:00:00Z"}, {"revoked_at", QJsonValue()}}}}});
            }
            if (line.contains("sharing.createLink")) {
                if (!allowCreate) {
                    return trpcError("Only the workflow owner can manage sharing", "FORBIDDEN", 403);
                }
                return envelope(QJsonObject{{"id", "share-c"}, {"workflow_id", "bound"}, {"token", "fresh-viewer"}, {"role", "viewer"}, {"created_at", "2026-06-15T12:00:00Z"}, {"revoked_at", QJsonValue()}});
            }
            return trpcError("Unexpected request", "NOT_FOUND", 404);
        };
        server.status = [&allowCreate](QByteArray request) {
            return !allowCreate && request.contains("sharing.createLink") ? 403 : 200;
        };
        EditorWindow window;
        connectWorkflow(window, server);
        window.action("Share workflow");
        auto *widget = panel(window, "WorkflowDetails.qml");
        QVERIFY(widget);
        auto *controller = controllerOf(widget);
        QTRY_COMPARE(controller->rows().size(), 3);
        auto *clipboard = QGuiApplication::clipboard();
        clipboard->setText("untouched");
        const auto origin = server.url().toString();

        // A failed mint leaves the clipboard alone and says why.
        click(widget, "create-share-viewer");
        QTRY_VERIFY(find(widget->rootObject(), "versions-error")->property("text").toString().contains("Permission denied"));
        QCOMPARE(clipboard->text(), QString("untouched"));

        click(widget, "copy-share-link-0");
        QCOMPARE(clipboard->text(), origin + "/share/listed-editor");
        QTRY_COMPARE(find(widget->rootObject(), "copy-share-link-0")->property("text").toString(), QString("Copied"));
        QCOMPARE(find(widget->rootObject(), "copy-share-link-1")->property("text").toString(), QString("Copy share link"));
        click(widget, "copy-share-link-1");
        QCOMPARE(clipboard->text(), origin + "/view/listed-public");
        QTRY_COMPARE(find(widget->rootObject(), "copy-share-link-1")->property("text").toString(), QString("Copied"));
        QCOMPARE(find(widget->rootObject(), "copy-share-link-0")->property("text").toString(), QString("Copy share link"));

        // Creating a link copies it at once, as the web's "Copy view link" does.
        allowCreate = true;
        click(widget, "create-share-viewer");
        QTRY_COMPARE(clipboard->text(), origin + "/share/fresh-viewer");
        QCOMPARE(find(widget->rootObject(), "create-share-viewer")->property("text").toString(), QString("Copy view link"));
    }
};

int main(int argc, char **argv)
{
    qputenv("TZ", "UTC");
    QApplication app(argc, argv);
    VersionHistoryPolishTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "VersionHistoryPolishTest.moc"
