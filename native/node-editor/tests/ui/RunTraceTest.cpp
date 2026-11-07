#include "../../src/run/RunTraceController.h"
#include "../../src/ui/EditorWindow.h"
#include <QDockWidget>
#include <QQuickWidget>
#include <QGuiApplication>
#include <QClipboard>
#include <QDir>
#include <QJsonDocument>
#include <QPointer>
#include <QQuickView>
#include <QQuickItem>
#include <QQmlContext>
#include <QQmlEngine>
#include <QTcpServer>
#include <QTcpSocket>
#include <QUrlQuery>
#include <QtTest>
using namespace nodetool::node_editor;

class TraceHttp final : public QTcpServer {
public:
    QList<QJsonObject> inputs;
    QList<QByteArray> requests;
    QPointer<QTcpSocket> pending;
    bool delay = false, invalid = false, empty = false, multipleSpans = false;
    int extraSpans = 0;
    int extraLogs = 0;
    bool pagedLogs = false;
    int lateDepth = 2;
    bool endpointSpan = false;
    TraceHttp() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            auto *socket = nextPendingConnection();
            socket->setParent(this);
            connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
                socket->setProperty("bytes", bytes);
                if (!bytes.contains("\r\n\r\n") || socket->property("done").toBool()) { return; }
                socket->setProperty("done", true);
                requests.append(bytes);
                const QUrl url(QStringLiteral("http://localhost") + QString::fromUtf8(bytes.split(' ').value(1)));
                const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                inputs.append(input);
                if (delay) { pending = socket; return; }
                if (invalid) { reply(socket, {}); return; }
                QJsonObject data;
                const auto run = QJsonObject{{"id", input["id"].toString("run-a")}, {"kind", "workflow"}, {"status", "failed"}, {"started_at", "2026-01-01T00:00:00Z"}, {"ended_at", "2026-01-01T00:00:01Z"}};
                if (url.path().endsWith("runs.list")) {
                    data = {{"runs", empty ? QJsonArray{} : QJsonArray{run, QJsonObject{{"id", "run-b"}, {"kind", "workflow"}, {"status", "completed"}}}}, {"next_cursor", QJsonValue::Null}};
                } else if (url.path().endsWith("runs.get")) {
                    data = {{"run", run}, {"summary", QJsonObject{{"span_count", 1 + extraSpans + (multipleSpans ? 2 : 0)}, {"first_failed_span_id", "1111111111111111"}}}};
                } else if (url.path().endsWith("runs.logs")) {
                    QJsonArray logs{QJsonObject{{"id", "log-a"}, {"span_id", "1111111111111111"}, {"span_name", "Failure <b>plain</b>"}, {"time_ms", 1000}, {"source", "worker"}, {"level", "error"}, {"attributes", QJsonObject{{"log.message", "<b>plain failure</b>"}}}}};
                    for (int i = 0; i < extraLogs; ++i) {
                        logs.append(QJsonObject{{"id", QString("log-%1").arg(i, 6, 10, QLatin1Char('0'))}, {"span_id", "2222222222222222"}, {"span_name", "Browser preparation"}, {"source", "browser"}, {"time_ms", 1001 + i}, {"level", i % 2 ? "info" : "warn"}, {"attributes", QJsonObject{{"log.message", QString("<b>Event %1</b>").arg(i)}}}});
                    }
                    if (pagedLogs && input.contains("cursor")) {
                        logs = QJsonArray{logs.first(), QJsonObject{{"id", "log-next"}, {"span_id", "3333333333333333"}, {"time_ms", 9999}, {"level", "debug"}, {"attributes", QJsonObject{{"log.message", "Next page"}}}}};
                    }
                    QJsonArray filtered;
                    for (const auto &value : logs) {
                        const auto log = value.toObject();
                        if ((!input.contains("level") || input["level"] == log["level"])
                            && (!input.contains("source") || input["source"] == log["source"])
                            && (!input.contains("span_id") || input["span_id"] == log["span_id"])) {
                            filtered.append(log);
                        }
                    }
                    data = {{"logs", filtered}, {"next_cursor", pagedLogs && !input.contains("cursor") ? QJsonValue("logs-next") : QJsonValue::Null}};
                } else {
                    const QJsonObject record{{"span_id", "1111111111111111"}, {"name", "Failure <b>plain</b>"}, {"start_time_ms", 1000}, {"end_time_ms", 2000}, {"duration_ms", 1000}, {"status", QJsonObject{{"code", "ERROR"}, {"message", "failed"}}}, {"attributes", QJsonObject{{"node.id", "node-a"}, {"large", QString(40000, 'x')}, {"a.literal", "<b>literal value</b>"}, {"gen_ai.usage.cost_usd", 0.125}}}};
                    auto detailedRecord = record;
                    detailedRecord["events"] = QJsonArray{QJsonObject{{"name", "<b>event</b>"}, {"time_ms", 1250}, {"attributes", QJsonObject{{"event.value", "<i>literal</i>"}}}}, QJsonObject{{"name", "No attributes"}, {"time_ms", 1500}, {"attributes", QJsonObject{}}}};
                    QJsonArray nodes{QJsonObject{{"record", detailedRecord}, {"depth", 0}}};
                    if (multipleSpans) {
                        auto browser = record;
                        browser["span_id"] = "2222222222222222";
                        browser["name"] = "Browser preparation";
                        browser["start_time_ms"] = 1250;
                        browser["end_time_ms"] = 1500;
                        browser["duration_ms"] = 250;
                        browser["status"] = QJsonObject{{"code", "OK"}};
                        browser["resource"] = QJsonObject{{"nodetool.trace.source", "browser"}};
                        nodes.append(QJsonObject{{"record", browser}, {"depth", 1}});
                        auto late = record;
                        late["span_id"] = "3333333333333333";
                        late["name"] = "Zero duration";
                        late["start_time_ms"] = endpointSpan ? 2000 : 1900;
                        late["end_time_ms"] = endpointSpan ? 2000 : 1900;
                        late["duration_ms"] = 0;
                        late["status"] = QJsonObject{{"code", "UNSET"}};
                        nodes.append(QJsonObject{{"record", late}, {"depth", lateDepth}});
                    }
                    for (int i = 0; i < extraSpans; ++i) {
                        auto child = record;
                        child["span_id"] = QString::number(i + 4, 16).rightJustified(16, '0');
                        child["name"] = QString("Server span %1").arg(i);
                        child["attributes"] = QJsonObject{};
                        child["start_time_ms"] = 1000 + i;
                        child["end_time_ms"] = 1001 + i;
                        child["duration_ms"] = 1;
                        nodes.append(QJsonObject{{"record", child}, {"depth", 1}});
                    }
                    data = {{"nodes", nodes}, {"limited", false}};
                }
                reply(socket, QJsonObject{{"result", QJsonObject{{"data", data}}}});
            });
        });
    }
    QUrl url() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(serverPort())); }
    static void reply(QTcpSocket *socket, const QJsonObject &object) {
        const auto body = QJsonDocument(object).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
    }
};
class RunTraceTest final : public QObject {
    Q_OBJECT
    static void polish(QQuickItem *item) {
        item->ensurePolished();
        for (auto *child : item->childItems()) { polish(child); }
    }
    static QQuickItem *findItem(QQuickItem *root, const QString &name) {
        if (root->objectName() == name) { return root; }
        for (auto *child : root->childItems()) {
            if (auto *match = findItem(child, name)) { return match; }
        }
        return nullptr;
    }
    static void click(QQuickView &view, const char *name) {
        QCoreApplication::processEvents();
        polish(view.contentItem());
        auto *item = findItem(view.rootObject(), QString::fromLatin1(name));
        QVERIFY2(item, name);
        QVERIFY(item->isVisible());
        const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
        QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, point);
    }
    static QQuickWidget *hostPanel(nodetool::EditorWindow &window, const QString &file) {
        for (auto *widget : window.findChildren<QQuickWidget *>()) {
            if (widget->source().fileName() == file) { return widget; }
        }
        return nullptr;
    }
    static void hostClick(QQuickWidget *widget, const char *name) {
        QVERIFY(widget);
        QVERIFY(widget->rootObject());
        QCoreApplication::processEvents();
        polish(widget->quickWindow()->contentItem());
        auto *item = findItem(widget->rootObject(), QString::fromLatin1(name));
        QVERIFY2(item, name);
        QVERIFY(item->isVisible());
        QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier,
            item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
    }
private slots:
    void logSpanActionsArePlainText() {
        TraceHttp server;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(1500, 1000); view.show();
        controller.refresh();
        QTRY_COMPARE(controller.spanChoices().size(), 1);
        click(view, "trace-logs");
        QTRY_COMPARE(controller.logs().size(), 1);
        auto *action = findItem(view.rootObject(), "trace-log-focus-log-a");
        QVERIFY(action);
        auto *label = findItem(action->property("contentItem").value<QQuickItem *>(), "nativeButtonLabel");
        QVERIFY(label);
        QCOMPARE(label->property("text").toString(), QString("Failure <b>plain</b>"));
        QCOMPARE(label->property("textFormat").toInt(), 0);
        controller.focusSpan("1111111111111111");
        auto *picker = findItem(view.rootObject(), "trace-log-span-picker");
        QVERIFY(picker);
        auto *selectedLabel = findItem(picker->property("contentItem").value<QQuickItem *>(), "nativeButtonLabel");
        QVERIFY(selectedLabel);
        QCOMPARE(selectedLabel->property("text").toString(), QString("Failure <b>plain</b>"));
        QCOMPARE(selectedLabel->property("textFormat").toInt(), 0);
    }
    void logSelectionSurvivesPageAppend() {
        TraceHttp server;
        server.extraLogs = 2;
        server.pagedLogs = true;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(1500, 1000); view.show();
        controller.refresh();
        QTRY_COMPARE(controller.spanChoices().size(), 1);
        click(view, "trace-logs");
        QTRY_COMPARE(controller.logs().size(), 3);
        click(view, "trace-log-log-000001");
        QTRY_COMPARE(controller.selectedLogId(), QString("log-000001"));
        controller.loadMoreLogs();
        QTRY_COMPARE(controller.logs().size(), 4);
        QCOMPARE(controller.selectedLogId(), QString("log-000001"));
        auto *selected = findItem(view.rootObject(), "trace-log-log-000001");
        QVERIFY(selected && selected->property("active").toBool());
        auto *list = findItem(view.rootObject(), "trace-log-rows");
        QVERIFY(list);
        const auto point = selected->mapToItem(list, QPointF(selected->width() / 2, selected->height() / 2));
        QVERIFY(QRectF(0, 0, list->width(), list->height()).contains(point));
    }
    void virtualLogListAndSpanPicker() {
        QTest::failOnWarning(QRegularExpression(".*(rearrange|binding loop).*", QRegularExpression::CaseInsensitiveOption));
        TraceHttp server;
        server.extraLogs = 1000;
        server.multipleSpans = true;
        server.lateDepth = 12;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString{} : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(1500, 1000); view.show();
        controller.refresh();
        QTRY_COMPARE(controller.spanChoices().size(), 3);
        QCOMPARE(controller.spanChoices().first().toMap()["status"].toString(), QString("ERROR"));
        QCOMPARE(controller.spanChoices().last().toMap()["depth"].toInt(), 8);
        QVERIFY(controller.spanChoices().last().toMap()["timing"].toString().startsWith("+"));
        click(view, "trace-logs");
        QTRY_COMPARE(controller.logs().size(), 1001);
        auto *root = view.rootObject();
        auto *list = findItem(root, "trace-log-rows");
        QVERIFY(list);
        QCOMPARE(list->property("count").toInt(), 1001);
        QTRY_VERIFY(list->height() > 0);
        const auto instantiatedRows = [](QQuickItem *item, const auto &count) -> int {
            int total = item->objectName().startsWith("trace-log-log-") ? 1 : 0;
            for (auto *child : item->childItems()) { total += count(child, count); }
            return total;
        };
        const auto delegateCount = [&] { return instantiatedRows(list, instantiatedRows); };
        QTRY_VERIFY(delegateCount() > 0);
        QVERIFY2(delegateCount() < 100, "The log list must instantiate viewport delegates rather than the entire loaded page");
        auto *literal = findItem(root, "trace-log-message-0");
        QVERIFY(literal);
        QCOMPARE(literal->property("text").toString(), QString("<b>plain failure</b>"));
        QCOMPARE(literal->property("textFormat").toInt(), 0);
        QCOMPARE(findItem(root, "trace-log-level-0")->property("tone").toInt(), 6);
        QCOMPARE(findItem(root, "trace-log-level-1")->property("tone").toInt(), 5);
        auto *time = findItem(root, "trace-log-time-0");
        auto *nextTime = findItem(root, "trace-log-time-1");
        QVERIFY(time && nextTime);
        QCOMPARE(time->mapToItem(root, QPointF()).x(), nextTime->mapToItem(root, QPointF()).x());
        list->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_End);
        QTRY_COMPARE(list->property("currentIndex").toInt(), 1000);
        QTRY_VERIFY(findItem(root, "trace-log-log-000999"));
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(controller.selectedLogId(), QString("log-000999"));
        QCoreApplication::processEvents(); polish(root);
        auto *selectedTail = findItem(root, "trace-log-log-000999");
        QVERIFY(selectedTail);
        const auto tailPoint = selectedTail->mapToItem(list, QPointF(selectedTail->width() / 2, selectedTail->height() / 2));
        QVERIFY2(QRectF(0, 0, list->width(), list->height()).contains(tailPoint), "Opening log details must retain the selected tail row in the viewport");
        QVERIFY(delegateCount() < 100);
        controller.closeLog();
        list->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_Home);
        QTRY_COMPARE(list->property("currentIndex").toInt(), 0);
        click(view, "trace-log-focus-log-a");
        QTRY_COMPARE(controller.focusedSpanId(), QString("1111111111111111"));
        QTRY_COMPARE(controller.logs().size(), 1);
        controller.clearFocus();
        QTRY_COMPARE(controller.logs().size(), 1001);
        click(view, "trace-log-span-picker");
        auto *search = findItem(view.contentItem(), "trace-log-span-search");
        QVERIFY(search && search->isVisible());
        search->forceActiveFocus();
        for (const auto key : {Qt::Key_B, Qt::Key_R, Qt::Key_O, Qt::Key_W, Qt::Key_S, Qt::Key_E, Qt::Key_R}) { QTest::keyClick(&view, key); }
        auto *results = findItem(view.contentItem(), "trace-log-span-results");
        QVERIFY(results);
        QTRY_COMPARE(results->property("count").toInt(), 1);
        QTest::keyClick(&view, Qt::Key_Down);
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(controller.focusedSpanId(), QString("2222222222222222"));
        QTRY_COMPARE(controller.logs().size(), 1000);
        click(view, "trace-log-span-picker");
        search->forceActiveFocus();
        for (const auto key : {Qt::Key_E, Qt::Key_R, Qt::Key_R, Qt::Key_O, Qt::Key_R}) { QTest::keyClick(&view, key); }
        QTRY_COMPARE(results->property("count").toInt(), 1);
        QTest::keyClick(&view, Qt::Key_Down);
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(controller.focusedSpanId(), QString("1111111111111111"));
        QTRY_VERIFY(findItem(root, "trace-log-span-picker")->hasActiveFocus());
        click(view, "trace-log-span-picker");
        auto *all = findItem(view.contentItem(), "trace-log-all-spans");
        QVERIFY(all);
        QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, all->mapToScene(QPointF(all->width() / 2, all->height() / 2)).toPoint());
        QTRY_VERIFY(controller.focusedSpanId().isEmpty());
        QTRY_COMPARE(controller.logs().size(), 1001);
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            auto *theme = view.engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
            QVERIFY(theme); theme->setProperty("preference", scheme == "dark" ? 2 : 3);
            for (const auto width : {1500, 340}) {
                view.resize(width, 1000); QCoreApplication::processEvents(); polish(root);
                auto *source = findItem(root, "trace-source");
                auto *picker = findItem(root, "trace-log-span-picker");
                QVERIFY(source && picker);
                for (auto *item : {source, picker, list}) {
                    const auto point = item->mapToItem(root, QPointF());
                    QVERIFY(point.x() >= 0 && point.x() + item->width() <= root->width());
                    QVERIFY(point.y() >= 0 && point.y() + item->height() <= root->height());
                }
                if (width == 340) { QVERIFY(picker->mapToItem(root, QPointF()).y() > source->mapToItem(root, QPointF()).y()); }
                const auto capture = qEnvironmentVariable("NODETOOL_TRACE_CAPTURE_DIR");
                if (!capture.isEmpty()) {
                    QVERIFY(QDir().mkpath(capture));
                    QVERIFY(view.grabWindow().save(capture + QString("/trace-log-list-%1-%2.png").arg(scheme).arg(width)));
                }
                click(view, "trace-log-span-picker");
                auto *popup = view.rootObject()->findChild<QObject *>("trace-log-span-popup");
                QVERIFY(popup && popup->property("visible").toBool());
                auto *popupItem = popup->property("contentItem").value<QQuickItem *>();
                QVERIFY(popupItem && popupItem->isVisible());
                const auto popupPoint = popupItem->mapToScene(QPointF());
                QVERIFY(popupPoint.x() >= 0 && popupPoint.x() + popupItem->width() <= view.width());
                QVERIFY(popupPoint.y() >= 0 && popupPoint.y() + popupItem->height() <= view.height());
                if (!capture.isEmpty()) {
                    QVERIFY(view.grabWindow().save(capture + QString("/trace-log-picker-%1-%2.png").arg(scheme).arg(width)));
                }
                QTest::keyClick(&view, Qt::Key_Escape);
                QTRY_VERIFY(!popup->property("visible").toBool());
            }
        }
        controller.focusSpan("not-in-trace");
        QTRY_COMPARE(findItem(root, "trace-log-span-picker")->property("text").toString(), QString("Span not-in-trace"));
    }
    void logFilterRequestsAndPaging() {
        TraceHttp server;
        server.extraLogs = 2;
        server.pagedLogs = true;
        RunTraceController controller;
        controller.configure(server.url());
        controller.refresh();
        QTRY_COMPARE(controller.spanChoices().size(), 1);
        controller.setView("logs");
        QTRY_COMPARE(controller.logs().size(), 3);
        QVERIFY(controller.hasMoreLogs());
        controller.loadMoreLogs();
        QTRY_COMPARE(controller.logs().size(), 4);
        QVERIFY(!controller.hasMoreLogs());
        QCOMPARE(controller.logs().last().toMap()["id"].toString(), QString("log-next"));
        bool cursorSeen = false;
        for (const auto &input : server.inputs) { cursorSeen = cursorSeen || input["cursor"].toString() == "logs-next"; }
        QVERIFY(cursorSeen);
        controller.setLogLevel("warn");
        QTRY_VERIFY(!controller.logsLoading());
        QCOMPARE(controller.logs().size(), 1);
        QCOMPARE(controller.logs().first().toMap()["levelKey"].toString(), QString("warn"));
        controller.setLogSource("browser");
        QTRY_VERIFY(!controller.logsLoading());
        controller.focusSpan("2222222222222222");
        QTRY_VERIFY(!controller.logsLoading());
        const auto logQuery = [&server] {
            for (int i = server.inputs.size() - 1; i >= 0; --i) {
                if (server.inputs[i].contains("include_content")) { return server.inputs[i]; }
            }
            return QJsonObject{};
        };
        QCOMPARE(logQuery()["level"].toString(), QString("warn"));
        QCOMPARE(logQuery()["source"].toString(), QString("browser"));
        QCOMPARE(logQuery()["span_id"].toString(), QString("2222222222222222"));
        QVERIFY(!logQuery().contains("cursor"));
        controller.clearFocus();
        QTRY_VERIFY(!controller.logsLoading());
        QVERIFY(!logQuery().contains("span_id"));
        controller.setLogSource("missing-source");
        QTRY_VERIFY(!controller.logsLoading());
        QCOMPARE(controller.logs().size(), 0);
        QVERIFY(controller.logSources().contains("missing-source"));
    }
    void logsOwnDetailsPane() {
        QTest::failOnWarning(QRegularExpression(".*(rearrange|binding loop).*", QRegularExpression::CaseInsensitiveOption));
        TraceHttp server;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(1200, 900); view.show();
        controller.refresh();
        QTRY_COMPARE(controller.serverSpans().size(), 1);
        controller.showFailingSpan();
        QTRY_VERIFY(!controller.focus().isEmpty());
        auto *root = view.rootObject();
        auto *spanDetails = findItem(root, "trace-span-details");
        QVERIFY(spanDetails && spanDetails->isVisible());
        click(view, "trace-logs");
        QTRY_COMPARE(controller.logs().size(), 1);
        QVERIFY2(!spanDetails->isVisible(), "A remembered span must not occupy Logs details");
        click(view, "trace-log-log-a");
        QTRY_VERIFY(findItem(root, "trace-log-attribute-value-0"));
        auto *literal = findItem(root, "trace-log-attribute-value-0");
        QCOMPARE(literal->property("text").toString(), QString("<b>plain failure</b>"));
        QCOMPARE(literal->property("textFormat").toInt(), 0);
        auto *logDetails = findItem(root, "trace-log-details");
        QVERIFY(logDetails && logDetails->isVisible());
        QSignalSpy ask(root, SIGNAL(askAgentRequested(QString,QString)));
        QVERIFY(ask.isValid());
        click(view, "trace-ask-log");
        QCOMPARE(ask.size(), 1);
        QCOMPARE(ask.last().at(0).toString(), controller.selectedRunId());
        QCOMPARE(ask.last().at(1).toString(), QString("1111111111111111"));
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            auto *theme = view.engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
            QVERIFY(theme); theme->setProperty("preference", scheme == "dark" ? 2 : 3);
            for (const auto width : {1200, 340}) {
                view.resize(width, 900); QCoreApplication::processEvents(); polish(root);
                auto *list = findItem(root, "trace-list-scroll");
                auto *row = findItem(root, "trace-log-log-a");
                QVERIFY(list && row && list->height() > 0);
                const auto rowPoint = row->mapToItem(list, QPointF(row->width() / 2, row->height() / 2));
                QVERIFY(QRectF(0, 0, list->width(), list->height()).contains(rowPoint));
                const auto pos = logDetails->mapToItem(root, QPointF());
                QVERIFY(pos.x() >= 0 && pos.x() + logDetails->width() <= root->width());
                QVERIFY(pos.y() >= 0 && pos.y() + logDetails->height() <= root->height());
                QVERIFY(logDetails->height() > 0);
                if (width == 1200) { QVERIFY(pos.x() > list->mapToItem(root, QPointF()).x()); }
                else { QVERIFY(pos.y() > list->mapToItem(root, QPointF()).y()); }
                const auto capture = qEnvironmentVariable("NODETOOL_TRACE_CAPTURE_DIR");
                if (!capture.isEmpty()) {
                    QVERIFY(QDir().mkpath(capture));
                    QVERIFY(view.grabWindow().save(capture + QString("/trace-log-%1-%2.png").arg(scheme).arg(width)));
                }
            }
        }
        click(view, "trace-close-log");
        QVERIFY(controller.selectedLog().isEmpty());
        QVERIFY(!logDetails->isVisible());
        QVERIFY(!spanDetails->isVisible());
        click(view, "trace-view");
        QTRY_VERIFY(spanDetails->isVisible());
        QCOMPARE(controller.focusedSpanId(), QString("1111111111111111"));
        controller.configure(server.url(), "other-account", "other-owner");
        QVERIFY(controller.selectedLog().isEmpty());
        QVERIFY(!logDetails->isVisible());
    }
    void structuredSpanDetails() {
        QTest::failOnWarning(QRegularExpression(".*(rearrange|binding loop).*", QRegularExpression::CaseInsensitiveOption));
        TraceHttp server;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString{} : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(1200, 900);
        view.show();
        controller.refresh();
        QTRY_COMPARE(controller.serverSpans().size(), 1);
        QSignalSpy ask(view.rootObject(), SIGNAL(askAgentRequested(QString,QString)));
        QVERIFY(ask.isValid());
        click(view, "trace-ask-run");
        QCOMPARE(ask.size(), 1);
        QCOMPARE(ask.last().at(0).toString(), controller.selectedRunId());
        QVERIFY(ask.last().at(1).toString().isEmpty());
        controller.showFailingSpan();
        QTRY_VERIFY(!controller.focus().isEmpty());
        click(view, "trace-ask-span");
        QCOMPARE(ask.size(), 2);
        QCOMPARE(ask.last().at(0).toString(), controller.selectedRunId());
        QCOMPARE(ask.last().at(1).toString(), controller.focusedSpanId());
        const auto attributes = controller.focus()["attributes"].toList();
        QCOMPARE(attributes.first().toMap()["key"].toString(), QString("a.literal"));
        QVERIFY(controller.focus()["meta"].toString().contains("$0.1250"));
        const auto events = controller.focus()["events"].toList();
        QCOMPARE(events.size(), 2);
        QCOMPARE(events.first().toMap()["label"].toString(), QString("+250 ms · <b>event</b>"));
        auto *root = view.rootObject();
        QTRY_VERIFY(findItem(root, "trace-attribute-value-0"));
        auto *literal = findItem(root, "trace-attribute-value-0");
        QCOMPARE(literal->property("text").toString(), QString("<b>literal value</b>"));
        QCOMPARE(literal->property("textFormat").toInt(), 0);
        auto *large = findItem(root, "trace-attribute-value-2");
        QVERIFY(large);
        QVERIFY(large->property("text").toString().endsWith("[Display truncated]"));
        for (const auto width : {1200, 340}) {
            view.resize(width, 900);
            QCoreApplication::processEvents();
            polish(root);
            auto *details = findItem(root, "trace-span-details");
            auto *lane = findItem(root, "trace-server-lane");
            QVERIFY(details && lane);
            const auto detailsPosition = details->mapToItem(root, QPointF());
            QVERIFY(detailsPosition.x() >= 0);
            QVERIFY(detailsPosition.x() + details->width() <= root->width());
            QVERIFY(details->height() > 0);
            if (width == 1200) { QVERIFY(detailsPosition.x() > lane->mapToItem(root, QPointF()).x()); }
            else {
                QVERIFY(detailsPosition.y() > lane->mapToItem(root, QPointF()).y());
                auto *listViewport = findItem(root, "trace-list-scroll");
                auto *row = findItem(root, "trace-span-1111111111111111");
                auto *bar = findItem(root, "trace-bar-1111111111111111");
                QVERIFY(listViewport && row && bar);
                QVERIFY(listViewport->height() > 0);
                const auto viewportRect = QRectF(listViewport->mapToItem(root, QPointF()), listViewport->size());
                const auto laneRect = QRectF(lane->mapToItem(root, QPointF()), lane->size());
                const auto rowRect = QRectF(row->mapToItem(root, QPointF()), row->size());
                QVERIFY(viewportRect.intersects(laneRect));
                QVERIFY(viewportRect.contains(rowRect.center()));
                QVERIFY(rowRect.bottom() <= viewportRect.bottom());
                const auto frame = view.grabWindow();
                QVERIFY(!frame.isNull());
                const auto marker = bar->mapToItem(root, QPointF(bar->width() / 2, bar->height() / 2));
                QVERIFY(viewportRect.contains(marker));
                const auto pixel = frame.pixelColor(qRound(marker.x() * frame.width() / view.width()),
                                                     qRound(marker.y() * frame.height() / view.height()));
                QVERIFY2(pixel.red() > pixel.green() && pixel.red() > pixel.blue(), "The visible failing span marker must appear in the narrow rendered viewport");
            }
            const auto capture = qEnvironmentVariable("NODETOOL_TRACE_CAPTURE_DIR");
            if (!capture.isEmpty()) {
                QVERIFY(QDir().mkpath(capture));
                QVERIFY(view.grabWindow().save(capture + QString("/trace-details-%1.png").arg(width)));
            }
        }
        auto *scroll = findItem(root, "trace-details-scroll");
        QVERIFY(scroll);
        auto *flickable = scroll->property("contentItem").value<QObject *>();
        QVERIFY(flickable);
        flickable->setProperty("contentY", 200);
        QVERIFY(flickable->property("contentY").toReal() > 0);
        controller.focusSpan("1111111111111111");
        QTRY_VERIFY(!controller.focus().isEmpty());
        QTRY_COMPARE(flickable->property("contentY").toReal(), 0.0);
        controller.copyFocusedSpan();
        const auto copied = QJsonDocument::fromJson(QGuiApplication::clipboard()->text().toUtf8()).object();
        QCOMPARE(copied["attributes"].toObject()["large"].toString().size(), 40000);
        QCOMPARE(copied["events"].toArray().size(), 2);
        controller.clearFocus();
        QVERIFY(controller.focus().isEmpty());
        QTRY_VERIFY(!findItem(root, "trace-span-details")->isVisible());
    }
    void boundarySpan_data() {
        QTest::addColumn<bool>("endpoint");
        QTest::newRow("deep-pointer") << false;
        QTest::newRow("endpoint-marker") << true;
    }
    void boundarySpan() {
        QFETCH(bool, endpoint);
        TraceHttp server;
        server.multipleSpans = true;
        server.endpointSpan = endpoint;
        server.lateDepth = endpoint ? 2 : 16;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(340, 900);
        view.show();
        controller.refresh();
        QTRY_COMPARE(controller.serverSpans().size(), 2);
        auto *root = view.rootObject();
        QCoreApplication::processEvents();
        polish(root);
        if (endpoint) {
            auto *bar = findItem(root, "trace-bar-3333333333333333");
            auto *track = findItem(root, "trace-track-3333333333333333");
            QVERIFY(bar && track);
            QVERIFY(bar->width() > 0);
            QVERIFY(bar->x() + bar->width() <= track->width());
        } else {
            auto *button = findItem(root, "trace-span-3333333333333333");
            QVERIFY(button);
            QVERIFY(button->width() > 0);
            click(view, "trace-span-3333333333333333");
            QTRY_COMPARE(controller.focus()["spanId"].toString(), QString("3333333333333333"));
        }
    }
    void virtualizedLaneReachesLastSpan() {
        TraceHttp server;
        server.extraSpans = 250;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(900, 700);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        controller.refresh();
        QTRY_COMPARE(controller.serverSpans().size(), 251);
        auto *root = view.rootObject();
        QTRY_VERIFY(findItem(root, "trace-server-lane-rows"));
        auto *list = findItem(root, "trace-server-lane-rows");
        QTRY_VERIFY(list->height() > 0);
        QCOMPARE(list->property("count").toInt(), 251);
        const auto instantiatedRows = [](QQuickItem *item, const auto &count) -> int {
            int total = item->objectName().startsWith("trace-span-") ? 1 : 0;
            for (auto *child : item->childItems()) { total += count(child, count); }
            return total;
        };
        QTRY_VERIFY(findItem(root, "trace-span-1111111111111111"));
        QVERIFY(instantiatedRows(list, instantiatedRows) < 80);
        list->forceActiveFocus();
        QTRY_VERIFY(list->hasActiveFocus());
        QTest::keyClick(&view, Qt::Key_End);
        QCOMPARE(list->property("currentIndex").toInt(), 250);
        const auto last = QString::number(253, 16).rightJustified(16, '0');
        QTRY_VERIFY(findItem(root, "trace-span-" + last));
        QTest::keyClick(&view, Qt::Key_Return);
        QTRY_COMPARE(controller.focus()["spanId"].toString(), last);
        QVERIFY(instantiatedRows(list, instantiatedRows) < 80);
    }
    void sourceLanesAndTiming() {
        TraceHttp server;
        server.multipleSpans = true;
        RunTraceController controller;
        controller.configure(server.url());
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY(view.status() == QQuickView::Ready);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(900, 900);
        view.show();
        controller.refresh();
        QTRY_COMPARE(controller.browserSpans().size(), 1);
        QTRY_COMPARE(controller.serverSpans().size(), 2);
        auto *root = view.rootObject();
        QTRY_VERIFY(findItem(root, "trace-browser-lane"));
        QVERIFY(findItem(root, "trace-server-lane"));
        for (const auto &scheme : {QString("dark"), QString("light")}) {
            auto *theme = view.engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
            QVERIFY(theme);
            theme->setProperty("preference", scheme == "dark" ? 2 : 3);
            for (const auto width : {900, 340}) {
                view.resize(width, 900);
                QCoreApplication::processEvents();
                polish(root);
                auto *track = findItem(root, "trace-track-2222222222222222");
                auto *bar = findItem(root, "trace-bar-2222222222222222");
                QTRY_VERIFY(track && bar);
                QTRY_VERIFY(track->width() > 0);
                QVERIFY(qAbs(bar->x() / track->width() - .25) < .001);
                QVERIFY(qAbs(bar->width() / track->width() - .25) < .001);
                const auto right = track->mapToItem(root, QPointF(track->width(), 0)).x();
                QVERIFY(right <= root->width());
                auto *serverTrack = findItem(root, "trace-track-1111111111111111");
                QVERIFY(serverTrack);
                QVERIFY(qAbs(serverTrack->mapToItem(root, QPointF()).x() - track->mapToItem(root, QPointF()).x()) < .1);
                auto *zero = findItem(root, "trace-bar-3333333333333333");
                auto *zeroTrack = findItem(root, "trace-track-3333333333333333");
                QVERIFY(zero && zeroTrack);
                QVERIFY(zero->width() >= .005 * zeroTrack->width());
                QVERIFY(zero->width() > 0);
                const auto capture = qEnvironmentVariable("NODETOOL_TRACE_CAPTURE_DIR");
                if (!capture.isEmpty()) {
                    QVERIFY(QDir().mkpath(capture));
                    QVERIFY(view.grabWindow().save(capture + QString("/trace-%1-%2.png").arg(scheme).arg(width)));
                }
            }
        }
        click(view, "trace-span-2222222222222222");
        QTRY_COMPARE(controller.focus()["spanId"].toString(), QString("2222222222222222"));
        auto *zeroButton = findItem(root, "trace-span-3333333333333333");
        QVERIFY(zeroButton);
        zeroButton->forceActiveFocus();
        QTest::keyClick(&view, Qt::Key_Space);
        QTRY_COMPARE(controller.focus()["spanId"].toString(), QString("3333333333333333"));
    }
    void hostStatusInspectionAndIsolation() {
        TraceHttp server;
        nodetool::EditorWindow window;
        window.resize(1400, 1000);
        window.show();
        window.session()->connectToServer(server.url(), "host-secret", "owner");
        auto *status = hostPanel(window, "StatusBar.qml");
        QVERIFY(status);
        hostClick(status, "status-trace");
        QTRY_VERIFY(hostPanel(window, "RunTracePanel.qml"));
        auto *panel = hostPanel(window, "RunTracePanel.qml");
        QTRY_VERIFY(panel->rootObject());
        QTRY_VERIFY(panel->isVisible());
        auto *controller = qobject_cast<RunTraceController *>(panel->rootObject()->property("controller").value<QObject *>());
        QVERIFY(controller);
        QTRY_COMPARE(controller->runs().size(), 2);
        QTRY_VERIFY(controller->summary()["failureVisible"].toBool());
        hostClick(panel, "trace-failure");
        QTRY_VERIFY(!controller->focus().isEmpty());
        const auto selectedRun = controller->selectedRunId();
        const auto selectedSpan = controller->focusedSpanId();
        QSignalSpy panelChanged(&window, &nodetool::EditorWindow::panelChanged);
        hostClick(panel, "trace-ask-span");
        const auto chatRun = [&window] {
            return window.chatSession()->property("hostContext").toMap()["ui_context"].toMap()["run"].toMap();
        };
        QCOMPARE(chatRun()["run_id"].toString(), selectedRun);
        QCOMPARE(chatRun()["span_id"].toString(), selectedSpan);
        QTRY_VERIFY(!panelChanged.isEmpty());
        QCoreApplication::processEvents();
        QCOMPARE(chatRun()["run_id"].toString(), selectedRun);
        QCOMPARE(chatRun()["span_id"].toString(), selectedSpan);
        hostClick(panel, "trace-logs");
        QTRY_COMPARE(controller->logs().size(), 1);
        hostClick(panel, "trace-log-log-a");
        QCOMPARE(controller->selectedLog()["id"].toString(), QString("log-a"));
        auto *picker = panel->rootObject()->findChild<QQuickItem *>("trace-run");
        QVERIFY(picker);
        picker->forceActiveFocus();
        QTest::keyClick(panel->quickWindow(), Qt::Key_End);
        QTRY_COMPARE(controller->selectedRunId(), QString("run-b"));
        const auto original = window.document()->snapshot();
        auto other = original; other["id"] = "other-workflow";
        QVERIFY(window.document()->load(other));
        QTRY_VERIFY(!hostPanel(window, "RunTracePanel.qml"));
        hostClick(status, "status-trace");
        QTRY_VERIFY(hostPanel(window, "RunTracePanel.qml"));
        panel = hostPanel(window, "RunTracePanel.qml");
        QTRY_VERIFY(panel->isVisible());
        server.delay = true;
        hostClick(panel, "trace-refresh");
        QTRY_VERIFY(server.pending);
        window.session()->connectToServer(server.url(), "new-host-secret", "new-owner");
        QTRY_VERIFY(!hostPanel(window, "RunTracePanel.qml"));
        if (server.pending) { TraceHttp::reply(server.pending, {}); }
        server.delay = false;
        hostClick(status, "status-trace");
        QTRY_VERIFY(hostPanel(window, "RunTracePanel.qml"));
        panel = hostPanel(window, "RunTracePanel.qml");
        QTRY_VERIFY(panel->rootObject());
        controller = qobject_cast<RunTraceController *>(panel->rootObject()->property("controller").value<QObject *>());
        QVERIFY(controller);
        QTRY_COMPARE(controller->runs().size(), 2);
        QVERIFY(controller->error().isEmpty());
        QCOMPARE(window.document()->snapshot()["id"].toString(), QString("other-workflow"));
    }
    void panelInspectionAndScope() {
        TraceHttp server;
        RunTraceController controller;
        controller.configure(server.url(), "secret", "owner");
        controller.setWorkflow("workflow-a", "Workflow");
        QQuickView view;
        view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
        view.setSource(QUrl("qrc:/editor/RunTracePanel.qml"));
        QVERIFY2(view.status() == QQuickView::Ready, qPrintable(view.errors().isEmpty() ? QString{} : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(900, 1000);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        click(view, "trace-refresh");
        QTRY_COMPARE(controller.serverSpans().size(), 1);
        QCOMPARE(server.inputs.first()["workflow_id"].toString(), QString("workflow-a"));
        QVERIFY(server.requests.first().contains("Authorization: Bearer secret"));
        click(view, "trace-failure");
        QTRY_VERIFY(!controller.focus().isEmpty());
        QVERIFY(controller.focus()["json"].toString().endsWith("[Display truncated]"));
        QVERIFY(controller.focus()["json"].toString().size() < 32100);
        click(view, "trace-errors");
        QTRY_VERIFY(controller.errorsOnly());
        QTRY_VERIFY(!controller.traceLoading());
        bool requestedErrors = false;
        for (const auto &input : server.inputs) {
            requestedErrors = requestedErrors || input["errors_only"].toBool();
        }
        QVERIFY(requestedErrors);
        click(view, "trace-copy");
        const auto copied = QJsonDocument::fromJson(QGuiApplication::clipboard()->text().toUtf8()).object();
        QCOMPARE(copied["span_id"].toString(), QString("1111111111111111"));
        QCOMPARE(copied["attributes"].toObject()["large"].toString().size(), 40000);
        click(view, "trace-logs");
        QTRY_COMPARE(controller.logs().size(), 1);
        click(view, "trace-log-log-a");
        QCOMPARE(controller.selectedLog()["id"].toString(), QString("log-a"));
        controller.setWorkflow("workflow-b", "Other");
        QVERIFY(controller.runs().isEmpty());
        QVERIFY(controller.focus().isEmpty());
        QVERIFY(controller.logs().isEmpty());
        QVERIFY(controller.copied().isEmpty());
        QVERIFY(!controller.hasMoreLogs());
    }
    void emptyErrorRetryAndStaleAccount() {
        TraceHttp server;
        RunTraceController controller;
        controller.configure(server.url());
        server.invalid = true;
        controller.refresh();
        QTRY_VERIFY(!controller.error().isEmpty());
        QVERIFY(!controller.runsLoading());
        server.invalid = false; server.empty = true;
        controller.refresh();
        QTRY_VERIFY(!controller.runsLoading());
        QVERIFY(controller.error().isEmpty());
        QVERIFY(controller.runs().isEmpty());
        server.delay = true;
        controller.refresh();
        QTRY_VERIFY(server.pending);
        controller.configure(server.url(), "next-secret", "next-owner");
        TraceHttp::reply(server.pending, QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"runs", QJsonArray{QJsonObject{{"id", "stale"}}}}, {"next_cursor", QJsonValue::Null}}}}}});
        QTest::qWait(30);
        QVERIFY(controller.runs().isEmpty());
        QVERIFY(controller.error().isEmpty());
    }
};
QTEST_MAIN(RunTraceTest)
#include "RunTraceTest.moc"
