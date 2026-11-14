#include "runtime/ChatSession.h"
#include "runtime/ComposerRules.h"
#include "model/MessageModel.h"
#include "model/Markdown.h"
#include "model/RichContent.h"
#include "runtime/CodeHighlighter.h"
#include <QTextBlock>
#include <QTextDocument>
#include <QTextLayout>
#include "model/PlanDocument.h"
#include <QWebSocketServer>
#include <QWebSocket>
#include <QFile>
#include <QTextBlock>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QElapsedTimer>
#include <QtTest>
using namespace nt::chat;
namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/streaming.json"));
    if (!file.open(QIODevice::ReadOnly)) { return {}; }
    return QJsonDocument::fromJson(file.readAll()).object();
}
QJsonObject normalized(ChatSession& session, const QJsonArray& threads) {
    QJsonObject result;
    for (const auto& value : threads) {
        const auto id = value.toObject()["id"].toString();
        session.selectThread(id);
        QJsonArray messages;
        auto* model = session.messages();
        for (int row = 0; row < model->rowCount(); ++row) {
            messages.append(QJsonObject{{"role", model->data(model->index(row, 0), MessageModel::RoleRole).toString()},
                {"text", model->data(model->index(row, 0), MessageModel::TextRole).toString()}});
        }
        result[id] = QJsonObject{{"status", session.turnStatus()}, {"messages", messages}};
    }
    return result;
}
QAbstractItemModel* partsFor(MessageModel& model, int row = 0) {
    return model.data(model.index(row), MessageModel::PartsRole).value<QAbstractItemModel*>();
}
QVariantMap partAt(QAbstractItemModel* model, int row) {
    const auto roles = model->roleNames();
    for (auto it = roles.cbegin(); it != roles.cend(); ++it) {
        if (it.value() == "modelData") { return model->data(model->index(row, 0), it.key()).toMap(); }
    }
    return {};
}
QJsonObject message(int id) {
    return {{"id", QString::number(id).rightJustified(32, QLatin1Char('0'))},
        {"role", id % 2 ? "assistant" : "user"}, {"content", QStringLiteral("History message %1").arg(id)}};
}
}
class ChatModelTests : public QObject {
    Q_OBJECT
private slots:
    void mediaBoundaryAndResources() {
        ChatClient client;
        bool rejected = false;
        client.openMedia(QUrl("file:///private.mp4"), [&](QJsonValue, QString error) { rejected = !error.isEmpty(); });
        QVERIFY(rejected);
        rejected = false;
        client.fetchMedia(QUrl("data:image/png;base64,invalid"), [&](QJsonValue, QString error) { rejected = !error.isEmpty(); });
        QVERIFY(rejected);
        ChatSession session;
        QSignalSpy navigation(&session, &ChatSession::resourceRequested);
        const QString uri = "timeline://0123456789abcdef0123456789abcdef";
        session.openResource(uri);
        QCOMPARE(navigation.size(), 0);
        session.setProperty("resourceKinds", QStringList{"timeline"});
        session.openResource(uri);
        QCOMPARE(navigation.size(), 1);
        QCOMPARE(navigation[0][0].toString(), uri);
        const auto pages = markdownPages("[Evening cut](" + uri + ")");
        QCOMPARE(pages[0].toList()[0].toMap().value("resourceUri").toString(), uri);
        const auto code = markdownPages("```md\n[Evening cut](" + uri + ")\n```");
        QVERIFY(!code[0].toList()[0].toMap().contains("resourceUri"));
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/media-resources.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto row = QJsonDocument::fromJson(file.readAll()).object()["events"].toArray()[0].toObject();
        row["thread_id"] = "a";
        session.applyEvent(row);
        session.selectThread("a");
        auto *parts = session.messages()->data(session.messages()->index(0, 0), MessageModel::PartsRole).value<QAbstractItemModel *>();
        QVERIFY(partAt(parts, 1).value("mediaUrl").toString().startsWith("data:image/png"));
        session.disconnectFromServer();
        QCOMPARE(session.messages()->rowCount(), 0);
    }
    void mediaHelperCasesAndUpdates() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/media-resources.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        for (const auto &value : fixture["helperCases"].toArray()) {
            const auto item = value.toObject();
            MessageModel model;
            model.upsert({{"id", "media"}, {"role", "assistant"}, {"content", item["content"]}});
            const auto first = partAt(partsFor(model), 0);
            QCOMPARE(first.value("type") == "media_group", item["expected"].toBool());
            QCOMPARE(model.snapshot()[0].toObject()["content"], item["content"]);
        }
        MessageModel model;
        QJsonArray rows;
        for (int i = 0; i < 2000; ++i) {
            auto row = fixture["events"].toArray()[0].toObject();
            row["id"] = QString::number(i);
            rows.append(row);
        }
        model.importHistory(rows);
        QCOMPARE(model.rowCount(), 2000);
        model.addPart({{"type", "prediction"}, {"id", "full-prediction-id"}, {"status", "running"}, {"progress", 0.2}});
        model.upsert({{"id", "later"}, {"role", "assistant"}, {"content", "Later"}});
        QSignalSpy changed(&model, &MessageModel::dataChanged);
        model.addPart({{"type", "prediction"}, {"id", "full-prediction-id"}, {"status", "completed"}, {"progress", 1}});
        QCOMPARE(changed.size(), 1);
        QCOMPARE(changed[0][0].value<QModelIndex>().row(), 1999);
        const auto parts = partsFor(model, 1999);
        QVERIFY(partAt(parts, parts->rowCount() - 1).value("text").toString().contains("completed"));
    }
    void planParserWebCases() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/plans-approvals.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        const auto cases = fixture["parseCases"].toArray();
        QVERIFY(cases.size() >= 8);
        for (const auto &value : cases) {
            const auto item = value.toObject();
            const auto parsed = parsePlanDocument(item["input"]);
            QCOMPARE(parsed["title"].toString(), item["title"].toString());
            if (!parsed.isEmpty()) { QCOMPARE(parsed["parallelizable"], item["parallelizable"]); }
        }
        const auto plan = parsePlanDocument(cases[0].toObject()["input"]);
        QCOMPARE(plan["executed"], false);
        QCOMPARE(plan["tasks"].toArray()[1].toObject()["dependsOn"].toArray(), QJsonArray{"inspect"});
        auto expected = cases[0].toObject()["input"].toObject();
        auto tasks = expected["tasks"].toArray();
        for (int i = 0; i < tasks.size(); ++i) {
            auto task = tasks[i].toObject();
            task["dependsOn"] = task.take("depends_on");
            tasks[i] = task;
        }
        expected["tasks"] = tasks;
        QCOMPARE(plan, expected);
        QCOMPARE(parsePlanDocument(cases[2].toObject()["input"])["executed"], QJsonValue(QJsonValue::Null));
        const auto text = planDocumentText(plan);
        QVERIFY(text.contains("2 tasks · 3 steps"));
        QVERIFY(text.contains("after Inspect the cache layer"));
        QVERIFY(text.contains("Nothing ran."));
        MessageModel model;
        model.upsert({{"id", "plan-message"}, {"role", "assistant"}, {"content", ""},
            {"tool_calls", QJsonArray{QJsonObject{{"id", "plan-call"}, {"name", "create_plan"}}}}});
        model.addPart({{"type", "tool_result_update"}, {"tool_call_id", "plan-call"}, {"result", cases[0].toObject()["input"]}});
        QCOMPARE(partAt(partsFor(model), 0)["planText"].toString(), text);
    }
    void compactionProjection() {
        MessageModel model;
        const QJsonObject raw{{"id", "compact"}, {"role", "user"}, {"execution_event_type", "compaction"},
            {"content", QJsonArray{QJsonObject{{"type", "text"}, {"text", " [Conversation so far]\nKeep "}},
                QJsonObject{{"type", "image_url"}, {"unknown", 42}},
                QJsonObject{{"type", "text"}, {"text", "asset://dddddddddddddddddddddddddddddddd"}}}}, {"unknown", 123}};
        model.upsert(raw);
        auto *parts = qobject_cast<PartModel *>(partsFor(model));
        QCOMPARE(partAt(parts, 0)["text"].toString(), "Keep asset://dddddddddddddddddddddddddddddddd");
        QVERIFY(model.data(model.index(0), MessageModel::DisplayTextRole).toString().isEmpty());
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        QSignalSpy changes(parts, &QAbstractItemModel::dataChanged);
        parts->toggleExpanded(0);
        QCOMPARE(changes.size(), 1);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(model.snapshot(), QJsonArray{raw});
    }
    void approvalSafety() {
        QWebSocketServer server("approval-test", QWebSocketServer::NonSecureMode);
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QList<QJsonObject> responses;
        connect(&server, &QWebSocketServer::newConnection, this, [&] {
            auto *peer = server.nextPendingConnection();
            peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, this, [&, peer](const QString &text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
                if (frame["command"] == "set_mode") {
                    peer->sendBinaryMessage(QByteArray::fromHex("81a76d657373616765b04d6f64652073657420746f2074657874"));
                }
                if (frame["type"].toString().endsWith("_response")) { responses.append(frame); }
            });
        });
        ChatSession session;
        session.connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())));
        QTRY_COMPARE(session.connectionStatus(), "connected");
        session.selectThread("a");
        const QString id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        auto request = QJsonObject{{"type", "plan_approval_request"}, {"thread_id", "a"}, {"approval_id", id},
            {"plan", QJsonObject{{"title", "Malformed plan"}}}, {"unknown", 42}};
        session.applyEvent(request);
        session.selectThread("a");
        QTest::qWait(20);
        QCOMPARE(responses.size(), 0);
        session.respondToAction("invented", true);
        QCOMPARE(responses.size(), 0);
        session.applyEvent({{"type", "message"}, {"thread_id", "a"}, {"id", "later"}, {"role", "assistant"}, {"content", "Later message"}});
        session.respondToAction(id, false, "  Fix the plan  ");
        session.respondToAction(id, true);
        QTRY_COMPARE(responses.size(), 1);
        QCOMPARE(responses[0], (QJsonObject{{"type", "plan_approval_response"}, {"approval_id", id}, {"decision", "reject"}, {"feedback", "Fix the plan"}}));
        session.applyEvent(request);
        session.respondToAction(id, true);
        QTest::qWait(20);
        QCOMPARE(responses.size(), 1);
        auto *model = qobject_cast<MessageModel *>(session.messages());
        QVERIFY(!partAt(partsFor(*model), 0)["pending"].toBool());
        request.remove("approval_id");
        session.applyEvent(request);
        auto last = partAt(partsFor(*model, model->rowCount() - 1), 1);
        QVERIFY(last["status"].toString().contains("Cannot answer"));
        for (const auto &kind : {"tool_approval_request", "secret_request"}) {
            const QString actionId = QString(kind) + "-full-id";
            session.applyEvent({{"type", kind}, {"thread_id", "a"}, {"approval_id", actionId}, {"args", 17}});
            session.respondToAction(actionId, false);
            session.respondToAction(actionId, false);
        }
        QTRY_COMPARE(responses.size(), 3);
        QCOMPARE(responses[1]["decision"], "deny");
        QCOMPARE(responses[2], (QJsonObject{{"type", "secret_request_response"}, {"approval_id", "secret_request-full-id"}, {"status", "declined"}}));
        request["approval_id"] = "reconnect-pending";
        session.applyEvent(request);
        session.importHistory("a", {});
        QVERIFY(partAt(partsFor(*model), 0)["pending"].toBool());
        QCOMPARE(partAt(partsFor(*model), 0)["actionId"].toString(), "reconnect-pending");
        session.suspendConnection();
        QTRY_COMPARE(session.connectionStatus(), "disconnected");
        session.respondToAction("reconnect-pending", true);
        QCOMPARE(responses.size(), 3);
        session.resumeConnection();
        QTRY_COMPARE(session.connectionStatus(), "connected");
        session.applyEvent({{"type", "chat_resumed"}, {"thread_id", "a"}, {"status", "running"}});
        session.applyEvent(request);
        session.respondToAction("reconnect-pending", true, "Do not send this feedback");
        session.respondToAction("reconnect-pending", true);
        QTRY_COMPARE(responses.size(), 4);
        QCOMPARE(responses[3]["decision"], "approve");
        QVERIFY(!responses[3].contains("feedback"));
        session.applyEvent({{"type", "tool_approval_request"}, {"thread_id", "a"}, {"approval_id", "allow-one"},
            {"args", QJsonObject{{"code", "return 1"}}}});
        session.respondToAction("allow-one", true);
        session.respondToAction("allow-one", false);
        QTRY_COMPARE(responses.size(), 5);
        QCOMPARE(responses[4]["decision"], "allow");
        request["approval_id"] = "cancelled";
        session.applyEvent(request);
        session.stop();
        session.respondToAction("cancelled", true);
        QTest::qWait(20);
        QCOMPARE(responses.size(), 5);
    }
    void subAgentWebCases() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/sub-agents.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto events = QJsonDocument::fromJson(file.readAll()).object()["events"].toArray();
        MessageModel model;
        for (const auto &event : events) { model.upsert(event.toObject()); }
        QCOMPARE(model.rowCount(), 2);
        auto *parts = partsFor(model);
        auto part = partAt(parts, 0);
        QCOMPARE(part["label"].toString(), "Audit the config loader");
        QCOMPARE(part["objective"].toString(), "Read every config file and report unused keys.");
        QCOMPARE(part["transcriptCount"].toInt(), 2);
        QVERIFY(!part["expanded"].toBool());
        auto *child = qobject_cast<MessageModel *>(part["childModel"].value<QAbstractItemModel *>());
        QVERIFY(child);
        QCOMPARE(child->rowCount(), 2);
        QCOMPARE(child->data(child->index(0), MessageModel::TextRole).toString(), "Checked three files.");
        const auto nestedTool = partAt(partsFor(*child, 1), 0);
        QCOMPARE(nestedTool["label"].toString(), "Searched todo");
        QCOMPARE(nestedTool["resultText"].toString(), "No unused keys.");
        QCOMPARE(nestedTool["displayStatus"].toString(), "Done");
        qobject_cast<PartModel *>(parts)->toggleExpanded(0);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QVERIFY(!partAt(partsFor(model, 1), 0).contains("transcriptCount"));
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        model.reduceNested({{"type", "chunk"}, {"parent_tool_call_id", "call-1"}, {"content", "More findings"}});
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(reset.count(), 0);
    }
    // ExecutionTree.tsx: the plan header counts tasks, tasks and steps show
    // their durations, and the planning log keeps every phase.
    // ToolCallTimeline in MessageView.tsx
    void toolTimelineFooterFoldsRows() {
        MessageModel model;
        model.upsert({{"id", "work"}, {"role", "assistant"}, {"content", ""}, {"created_at", "2026-11-13T10:00:00.000Z"},
            {"tool_calls", QJsonArray{QJsonObject{{"id", "one"}, {"name", "web_search"}, {"args", QJsonObject{{"query", "a"}}}},
                                      QJsonObject{{"id", "two"}, {"name", "execute_code"}, {"args", QJsonObject{{"code", "1"}}}}}}});
        auto *parts = partsFor(model);
        QCOMPARE(parts->rowCount(), 3);
        QCOMPARE(partAt(parts, 2)["label"].toString(), "Working · 0/2");
        QVERIFY(partAt(parts, 2)["running"].toBool());
        model.upsert({{"id", "r1"}, {"role", "tool"}, {"tool_call_id", "one"}, {"content", "done"}, {"created_at", "2026-11-13T10:00:03.000Z"}});
        model.upsert({{"id", "r2"}, {"role", "tool"}, {"tool_call_id", "two"}, {"content", "2"}, {"created_at", "2026-11-13T10:00:42.000Z"}});
        parts = partsFor(model);
        const auto footer = partAt(parts, parts->rowCount() - 1);
        QCOMPARE(footer["type"].toString(), "tool_timeline");
        QCOMPARE(footer["label"].toString(), "Worked for 42s");
        QCOMPARE(footer["steps"].toString(), "2 steps");
        QVERIFY(footer["expanded"].toBool());
        QVERIFY(!partAt(parts, 0)["timelineHidden"].toBool());
        qobject_cast<PartModel *>(parts)->toggleExpanded(parts->rowCount() - 1);
        QVERIFY(!partAt(parts, parts->rowCount() - 1)["expanded"].toBool());
        QVERIFY(partAt(parts, 0)["timelineHidden"].toBool());
        QVERIFY(partAt(parts, 1)["timelineHidden"].toBool());
        MessageModel single;
        single.upsert({{"id", "one"}, {"role", "assistant"}, {"content", ""},
            {"tool_calls", QJsonArray{QJsonObject{{"id", "x"}, {"name", "web_search"}}}}});
        QCOMPARE(partsFor(single)->rowCount(), 1);
    }
    void executionDurationsAndSummary() {
        int sequence = 0;
        auto event = [&sequence](const QString &time, const QJsonObject &content) {
            return QJsonObject{{"type", "message"}, {"role", "agent_execution"}, {"id", QString("event-%1").arg(++sequence)},
                {"agent_execution_id", "run"}, {"created_at", "2026-01-01T00:00:" + time + "Z"},
                {"execution_event_type", content["type"]}, {"content", content}};
        };
        MessageModel model;
        model.upsert(event("00.000", {{"type", "planning_update"}, {"phase", "plan"}, {"status", "Running"}, {"content", "Read"}}));
        model.upsert(event("00.500", {{"type", "planning_update"}, {"phase", "refine"}, {"status", "Running"}}));
        model.upsert(event("01.000", {{"type", "task_update"}, {"event", "task_created"}, {"task", QJsonObject{{"id", "t1"}, {"title", "Task one"},
            {"steps", QJsonArray{QJsonObject{{"id", "s1"}, {"instructions", "Step"}}}}}}}));
        model.upsert(event("01.000", {{"type", "task_update"}, {"event", "step_started"}, {"task", QJsonObject{{"id", "t1"}}}, {"step", QJsonObject{{"id", "s1"}}}}));
        model.upsert(event("03.500", {{"type", "task_update"}, {"event", "step_completed"}, {"task", QJsonObject{{"id", "t1"}}}, {"step", QJsonObject{{"id", "s1"}}}}));
        model.upsert(event("04.000", {{"type", "task_update"}, {"event", "task_completed"}, {"task", QJsonObject{{"id", "t1"}}}}));
        auto childOf = [](MessageModel &parent, int row) {
            return qobject_cast<MessageModel *>(partAt(partsFor(parent, row), 0)["childModel"].value<QAbstractItemModel *>());
        };
        const auto root = partAt(partsFor(model, 0), 0);
        QCOMPARE(root["label"].toString(), QStringLiteral("Execution plan · 1/1 tasks"));
        QCOMPARE(root["progress"].toString(), QStringLiteral("1 done"));
        QCOMPARE(root["displayStatus"].toString(), QStringLiteral("completed"));
        auto *run = childOf(model, 0);
        QVERIFY(run);
        QCOMPARE(partAt(partsFor(*run, 0), 0)["text"].toString(), QStringLiteral("plan · Read\nrefine"));
        const auto task = partAt(partsFor(*run, 1), 0);
        QCOMPARE(task["duration"].toString(), QStringLiteral("3s"));
        QCOMPARE(task["progress"].toString(), QStringLiteral("1/1 steps"));
        auto *steps = childOf(*run, 1);
        QVERIFY(steps);
        QCOMPARE(partAt(partsFor(*steps, 0), 0)["duration"].toString(), QStringLiteral("2.5s"));
    }
    void executionTreeReplayAndLongRun() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/execution-tree.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto events = QJsonDocument::fromJson(file.readAll()).object()["events"].toArray();
        MessageModel live, saved;
        for (const auto &value : events) { live.upsert(value.toObject()); }
        QJsonArray encoded;
        for (const auto &value : events) {
            auto event = value.toObject();
            event["content"] = QString::fromUtf8(QJsonDocument(event["content"].toObject()).toJson(QJsonDocument::Compact));
            encoded.append(event);
        }
        saved.importHistory(encoded);
        QCOMPARE(live.rowCount(), 1);
        QCOMPARE(saved.rowCount(), 1);
        auto childOf = [](MessageModel &model, int row) {
            return qobject_cast<MessageModel *>(partAt(partsFor(model, row), 0)["childModel"].value<QAbstractItemModel *>());
        };
        auto *run = childOf(live, 0);
        auto *savedRun = childOf(saved, 0);
        QVERIFY(run && savedRun);
        QCOMPARE(run->rowCount(), 3);
        auto *steps = childOf(*run, 1);
        auto *savedSteps = childOf(*savedRun, 1);
        QVERIFY(steps && savedSteps);
        QCOMPARE(steps->rowCount(), 2);
        QCOMPARE(partAt(partsFor(*steps, 0), 0)["displayStatus"].toString(), "completed");
        QCOMPARE(partAt(partsFor(*steps, 1), 0), partAt(partsFor(*savedSteps, 1), 0));
        QSignalSpy changed(steps, &QAbstractItemModel::dataChanged);
        QSignalSpy reset(&live, &QAbstractItemModel::modelReset);
        const QJsonValue execution = events.first().toObject()["agent_execution_id"];
        live.reduceNested({{"type", "task_update"}, {"agent_execution_id", execution},
            {"event", "step_failed"}, {"task", QJsonObject{{"id", "audit"}}}, {"step", QJsonObject{{"id", "report"}}}});
        QCOMPARE(changed.count(), 1);
        QCOMPARE(changed.first()[0].value<QModelIndex>().row(), 1);
        QCOMPARE(partAt(partsFor(*steps, 1), 0)["displayStatus"].toString(), "failed");
        QJsonArray many;
        for (int i = 0; i < 2000; ++i) {
            many.append(QJsonObject{{"id", QString("step-%1").arg(i)}, {"instructions", "Inspect file"}});
        }
        QElapsedTimer timer; timer.start();
        live.reduceNested({{"type", "task_update"}, {"agent_execution_id", execution}, {"event", "task_created"},
            {"task", QJsonObject{{"id", "long"}, {"title", "Long run"}, {"steps", many}}}});
        for (int i = 0; i < 2000; ++i) {
            live.reduceNested({{"type", "log_update"}, {"agent_execution_id", execution},
                {"node_id", "long"}, {"content", QString(8192, QLatin1Char('x'))}});
        }
        QCOMPARE(childOf(*run, 3)->rowCount(), 2000);
        QCOMPARE(run->rowCount(), 2004);
        QCOMPARE(reset.count(), 0);
        qInfo() << "2000 steps and 2000 long logs reduced in" << timer.elapsed() << "ms";
        QVERIFY(timer.elapsed() < 10000);
        QCOMPARE(live.snapshot().first().toObject()["agent_execution_id"], execution);
    }
    void linkColoursPreserveMarkdown() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/link-colours.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto event = QJsonDocument::fromJson(file.readAll()).object()["events"].toArray().first().toObject();
        MessageModel model;
        model.upsert(event);
        QCOMPARE(model.snapshot().first().toObject()["content"], event["content"]);
        const auto pages = markdownPages(event["content"].toString());
        QCOMPARE(pages.size(), 1);
        const auto sections = pages.first().toList();
        QCOMPARE(sections.size(), 4);
        QTextDocument document;
        document.setMarkdown(event["content"].toString());
        const auto plain = document.toPlainText();
        for (const QColor colour : {QColor("#22d3ee"), QColor("#0e7490")}) {
            styleMarkdownLinks(document, colour);
            int links = 0;
            for (auto block = document.begin(); block.isValid(); block = block.next()) {
                for (auto it = block.begin(); !it.atEnd(); ++it) {
                    const auto format = it.fragment().charFormat();
                    if (!format.isAnchor()) { continue; }
                    ++links;
                    QCOMPARE(format.foreground().color(), colour);
                    QCOMPARE(format.anchorHref(), "https://nodetool.ai");
                }
            }
            QCOMPARE(links, 2);
            QCOMPARE(document.toPlainText(), plain);
        }
        QVERIFY(sections.first().toMap()["text"].toString().contains("[NodeTool](https://nodetool.ai)"));
        QVERIFY(sections.last().toMap()["text"].toString().contains("[NodeTool](https://nodetool.ai)"));
    }
    // rehypeSanitizeChatHtml.ts keeps formatting and drops active content.
    void htmlIsSanitized() {
        const auto clean = sanitizeChatHtml(
            "<b onclick=\"x()\">bold</b><script>alert(1)</script><style>p{}</style>"
            "<a href=\"javascript:alert(1)\">bad</a><a href=\"https://nodetool.ai\" target=\"_blank\">good</a>"
            "<blink>kept</blink><img src=\"asset://abc\" alt=\"Cat\"><input type=\"checkbox\" checked>"
            "<!-- note --><https://example.com><iframe srcdoc=\"x\">inner</iframe><br/>");
        QCOMPARE(clean, QStringLiteral("<b>bold</b><a>bad</a><a href=\"https://nodetool.ai\">good</a>"
            "kept![Cat](asset://abc)☑ <https://example.com><br/>"));
        QCOMPARE(sanitizeChatHtml("a < b and 3>2"), QStringLiteral("a < b and 3>2"));
    }
    // mathMarkdown.ts renders LaTeX with KaTeX. Native writes Unicode.
    void texBecomesUnicode() {
        QCOMPARE(texToUnicode(R"(\frac{a}{b})"), QStringLiteral("a/b"));
        QCOMPARE(texToUnicode(R"(\frac{x+1}{2})"), QStringLiteral("(x+1)/2"));
        QCOMPARE(texToUnicode("x^2 + y_{12}"), QStringLiteral("x² + y₁₂"));
        QCOMPARE(texToUnicode(R"(\alpha_i \leq \sqrt{x+1})"), QStringLiteral("αᵢ ≤ √(x+1)"));
        QCOMPARE(texToUnicode(R"(e^{i\pi} \in \mathbb{R})"), QStringLiteral("e^(iπ) ∈ ℝ"));
        QCOMPARE(texToUnicode(R"(\sum_{n=1}^{\infty} \text{terms})"), QStringLiteral("∑ₙ₌₁^∞ terms"));
        QCOMPARE(texToUnicode(R"(\hat{x} \unknown)"), QStringLiteral("x̂ \\unknown"));
        QCOMPARE(renderInlineMath(R"(Area \(\pi r^2\) and `\(x\)` cost $5, $$a_1$$.)"),
                 QStringLiteral("Area π r² and `\\(x\\)` cost $5, a₁."));
    }
    void richMarkdownSections() {
        const auto pages = markdownPages(
            "Intro with `asset://aaaa` and asset://bbbb. and [site](https://nodetool.ai).\n"
            "![Cover](asset://cccc)\n"
            "$$\n\\frac{1}{2}\n$$\n"
            "<b>bold</b><script>x</script>\n"
            "```js\nconst x = asset://dddd\n```\n");
        QCOMPARE(pages.size(), 1);
        const auto page = pages.first().toList();
        QStringList kinds;
        for (const auto &entry : page) {
            const auto map = entry.toMap();
            kinds << (map.contains("resourceUri") ? "resource:" + map["resourceUri"].toString()
                      : map.contains("image") ? "image:" + map["image"].toString()
                      : map["math"].toBool() ? "math:" + map["text"].toString()
                      : map["code"].toBool() ? "code" : "text");
        }
        QCOMPARE(kinds, (QStringList{"text", "resource:asset://aaaa", "text", "resource:asset://bbbb", "text",
                                     "image:asset://cccc", "text", "math:1/2", "text", "code"}));
        QCOMPARE(page[1].toMap()["text"].toString(), QStringLiteral("aaaa"));
        QVERIFY(page[4].toMap()["text"].toString().contains("[site](https://nodetool.ai)"));
        QCOMPARE(page[5].toMap()["text"].toString(), QStringLiteral("Cover"));
        QCOMPARE(page[7].toMap()["source"].toString(), QStringLiteral("\\frac{1}{2}"));
        QCOMPARE(page[8].toMap()["text"].toString(), QStringLiteral("<b>bold</b>\n"));
        QVERIFY(page[9].toMap()["text"].toString().contains("asset://dddd"));
        const auto inlineMath = markdownPages(R"(\[ x^2 \] after)").first().toList();
        QCOMPARE(inlineMath.first().toMap()["text"].toString(), QStringLiteral("x²"));
        QCOMPARE(inlineMath.last().toMap()["text"].toString(), QStringLiteral("after\n"));
    }
    // CodeBlock.tsx colours fences with the One Dark palette.
    void codeIsHighlighted() {
        QTextDocument document("def area(r):  # size\n    return \"r\" * 2");
        CodeHighlighter highlighter;
        highlighter.setLanguage("python");
        highlighter.setDocument(&document);
        highlighter.rehighlight();
        auto colourAt = [&](int block, int position) {
            for (const auto &range : document.findBlockByNumber(block).layout()->formats()) {
                if (position >= range.start && position < range.start + range.length) { return range.format.foreground().color().name(); }
            }
            return QString();
        };
        QCOMPARE(colourAt(0, 0), QStringLiteral("#c678dd"));   // def
        QCOMPARE(colourAt(0, 4), QStringLiteral("#61afef"));   // area(
        QCOMPARE(colourAt(0, 15), QStringLiteral("#5c6370"));  // # size
        QCOMPARE(colourAt(1, 11), QStringLiteral("#98c379"));  // "r"
        QCOMPARE(colourAt(1, 17), QStringLiteral("#d19a66"));  // 2
        highlighter.setDark(false);
        QCOMPARE(colourAt(0, 0), QStringLiteral("#a626a4"));
        highlighter.setLanguage("text");
        QCOMPARE(colourAt(0, 0), QString());
    }
    // parseSearchResults.ts
    void searchResultsAreRecognized() {
        const auto items = normalizeSearchResults(QJsonValue(QJsonObject{{"organic_results", QJsonArray{
            QJsonObject{{"title", "NodeTool"}, {"link", "https://www.nodetool.ai/docs"}, {"snippet", "Visual AI"}},
            QJsonObject{{"name", "No link"}}, QJsonObject{{"other", 1}}}}}));
        QCOMPARE(items.size(), 2);
        QCOMPARE(items[0].toObject()["source"].toString(), QStringLiteral("nodetool.ai"));
        QCOMPARE(items[1].toObject()["title"].toString(), QStringLiteral("No link"));
        const auto text = normalizeSearchResults(QJsonValue("1. First\nhttps://a.example/x\nAbout a\n2. Second\nhttps://b.example"));
        QCOMPARE(text.size(), 2);
        QCOMPARE(text[0].toObject()["snippet"].toString(), QStringLiteral("About a"));
        QCOMPARE(text[1].toObject()["url"].toString(), QStringLiteral("https://b.example"));
        QVERIFY(normalizeSearchResults(QJsonValue("1. Step one\n2. Step two")).isEmpty());
        QVERIFY(normalizeSearchResults(QJsonValue(QJsonObject{{"ok", true}})).isEmpty());
        QCOMPARE(normalizeSearchResults(QJsonValue("[{\"url\":\"https://c.example\"}]")).size(), 1);
        QCOMPARE(CodeHighlighter::family("TSX"), QStringLiteral("js"));
        QCOMPARE(CodeHighlighter::family("html"), QStringLiteral("markup"));
        QVERIFY(CodeHighlighter::family("brainfuck").isEmpty());
    }
    void markdownStructureAndOrdering() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/markdown.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        MessageModel model;
        model.importHistory(fixture["messages"].toArray());
        auto *parts = partsFor(model);
        QCOMPARE(parts->rowCount(), 5);
        QCOMPARE(partAt(parts, 0)["type"].toString(), "prose");
        QVERIFY(partAt(parts, 1)["tool"].toBool());
        QCOMPARE(partAt(parts, 2)["text"].toString(), "Text after the tool.");
        QCOMPARE(partAt(parts, 3)["image"].toMap()["uri"].toString(), "asset://00000000000000000000000000000045");
        QCOMPARE(partAt(parts, 4)["text"].toString(), "Text after the image.");
        QCOMPARE(model.snapshot(), fixture["messages"].toArray());
        const auto pages = markdownPages(partAt(parts, 0)["text"].toString());
        bool code = false, table = false, link = false;
        for (const auto &page : pages) {
            for (const auto &section : page.toList()) {
                const auto block = section.toMap();
                QVERIFY(!block["text"].toString().contains("<|"));
                if (block["code"].toBool()) {
                    code = true;
                    QCOMPARE(block["language"].toString(), "cpp");
                    QCOMPARE(block["copy"].toString(), "int answer = 42;\n");
                }
                table |= block["text"].toString().contains("| --- | --- |");
                link |= block["text"].toString().contains("https://nodetool.ai");
            }
        }
        QVERIFY(code && table && link);
        QCOMPARE(cleanHarmony("prefix<|start|>assistant<|channel|>final<|message|>partial"), "prefixpartial");
        MessageModel stream;
        stream.appendChunk("Before", false);
        stream.addPart({{"type", "tool_call_update"}, {"name", "read_file"}, {"tool_call_id", "call"}});
        stream.appendChunk("After", true);
        QCOMPARE(partAt(partsFor(stream), 0)["text"].toString(), "Before");
        QVERIFY(partAt(partsFor(stream), 1)["tool"].toBool());
        QCOMPARE(partAt(partsFor(stream), 2)["text"].toString(), "After");
        MessageModel arrayStream;
        arrayStream.upsert({{"id", "array"}, {"role", "assistant"}, {"status", "streaming"},
            {"content", QJsonArray{QJsonObject{{"type", "text"}, {"text", "Before"}},
                                  QJsonObject{{"type", "image_url"}, {"image", QJsonObject{{"uri", "asset://full-id"}}}}}}});
        arrayStream.addPart({{"type", "tool_call_update"}, {"name", "read_file"}, {"tool_call_id", "call"}});
        arrayStream.appendChunk("After", true);
        auto *arrayParts = partsFor(arrayStream);
        QCOMPARE(partAt(arrayParts, 1)["type"].toString(), "image_url");
        QVERIFY(partAt(arrayParts, 2)["tool"].toBool());
        QCOMPARE(partAt(arrayParts, 3)["text"].toString(), "After");

    }
    void longMarkdownStreaming() {
        const QString code = QString("int value = 42;\n").repeated(2000);
        const auto pages = markdownPages("```cpp\n" + code + "```\n");
        QVERIFY(pages.size() > 1);
        QString reconstructed;
        for (const auto &page : pages) {
            for (const auto &section : page.toList()) {
                const auto block = section.toMap();
                if (!block["code"].toBool()) { continue; }
                QCOMPARE(block["copy"].toString(), code);
                QVERIFY(block["text"].toString().size() <= 4096);
                reconstructed += block["text"].toString();
            }
        }
        QCOMPARE(reconstructed, code);
        const QString header = "| Name | Value |\n| --- | --- |\n";
        const auto tables = markdownPages(header + QString("| row | value |\n").repeated(2000));
        QVERIFY(tables.size() > 1);
        for (const auto &page : tables) {
            QVERIFY(page.toList().first().toMap()["text"].toString().startsWith(header));
        }
        MessageModel model;
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        QElapsedTimer elapsed;
        elapsed.start();
        for (int i = 0; i < 100; ++i) {
            model.appendChunk(code.left(2048), false);
            QVERIFY(!markdownPages(model.data(model.index(0), MessageModel::TextRole).toString()).isEmpty());
            QCoreApplication::processEvents();
        }
        model.appendChunk({}, true);
        QCOMPARE(reset.count(), 0);
        QVERIFY2(elapsed.elapsed() < 5000, "Long-document reduction exceeded five seconds");
    }
    void thinkingLifecycleAndHistory() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/thinking.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        MessageModel model;
        const auto events = fixture["events"].toArray();
        model.appendChunk(events[0].toObject()["content"].toString(), false, true);
        auto *parts = qobject_cast<PartModel *>(partsFor(model));
        QCOMPARE(partAt(parts, 0)["label"].toString(), "Thinking");
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        parts->toggleExpanded(0);
        QSignalSpy changes(parts, &QAbstractItemModel::dataChanged);
        QSignalSpy resets(parts, &QAbstractItemModel::modelReset);
        model.appendChunk(events[1].toObject()["content"].toString(), false, true);
        model.appendChunk(events[2].toObject()["content"].toString(), true);
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(partAt(parts, 0)["label"].toString(), "Thought for 1s");
        QVERIFY(changes.count() > 0);
        QCOMPARE(resets.count(), 0);
        parts->toggleExpanded(0);
        model.upsert({{"id", "final"}, {"role", "assistant"}, {"content", "The answer is **42**."}});
        QCOMPARE(partsFor(model), parts);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        MessageModel loaded;
        loaded.importHistory(fixture["messages"].toArray());
        QCOMPARE(partAt(partsFor(loaded), 0)["text"], partAt(parts, 0)["text"]);
        QCOMPARE(partAt(partsFor(loaded), 1)["text"], partAt(parts, 1)["text"]);
        QCOMPARE(partAt(partsFor(loaded), 0)["label"].toString(), "Thought");
        QVERIFY(!partAt(partsFor(loaded), 0)["expanded"].toBool());
        MessageModel stopped;
        stopped.appendChunk("unfinished", false, true);
        stopped.finishThinking();
        QVERIFY(!partAt(partsFor(stopped), 0)["running"].toBool());
    }
    void webToolPresentationCases() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/tool-presentation.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        for (const auto &value : fixture["phrases"].toArray()) {
            auto call = value.toObject();
            MessageModel model;
            call["type"] = "tool_call_update";
            model.addPart(call);
            QCOMPARE(partAt(partsFor(model), 0)["label"].toString(), call["label"].toString());
        }
        for (const auto &value : fixture["groups"].toArray()) {
            const auto test = value.toObject();
            MessageModel model;
            model.upsert({{"id", "group"}, {"role", "assistant"}, {"content", ""}, {"tool_calls", test["calls"]}});
            auto *parts = partsFor(model);
            // Two or more rows add the ToolCallTimeline footer after them.
            const int rows = test["rows"].toInt();
            QCOMPARE(parts->rowCount(), rows > 1 ? rows + 1 : rows);
            if (rows > 1) { QCOMPARE(partAt(parts, rows)["type"].toString(), "tool_timeline"); }
            const auto labels = test["labels"].toArray();
            for (int i = 0; i < labels.size(); ++i) {
                QCOMPARE(partAt(parts, i)["label"].toString(), labels[i].toString());
            }
            if (test.contains("preview")) { QCOMPARE(partAt(parts, 0)["preview"].toString(), test["preview"].toString()); }
        }
        MessageModel model;
        const auto messages = fixture["messages"].toArray();
        model.upsert(messages[0].toObject());
        auto *parts = partsFor(model);
        QSignalSpy inserted(&model, &QAbstractItemModel::rowsInserted);
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        model.upsert(messages[1].toObject());
        model.upsert(messages[2].toObject());
        QCOMPARE(model.rowCount(), 1);
        QCOMPARE(model.data(model.index(0), MessageModel::MessageIdRole).toString(), messages[0].toObject()["id"].toString());
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(inserted.count(), 0);
        QCOMPARE(reset.count(), 0);
        QCOMPARE(model.snapshot(), messages);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        model.addPart({{"type", "tool_result_update"}, {"tool_call_id", QString("%1").arg(2, 32, 16, QLatin1Char('0'))}, {"result", "found"}});
        QCOMPARE(changed.count(), 1);
        QCOMPARE(partAt(parts, 0)["progress"].toString(), QString("1/3"));
    }
    void persistedToolsMatchLiveRows() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/persisted-tools.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        ChatSession live;
        live.upsertThread({{"id", "a"}});
        live.selectThread("a");
        for (const auto &event : fixture["events"].toArray()) { live.applyEvent(event.toObject()); }
        auto *streamed = qobject_cast<MessageModel *>(live.messages());
        MessageModel loaded;
        const auto raw = fixture["messages"].toArray();
        loaded.importHistory(raw);
        QCOMPARE(loaded.rowCount(), 2);
        QCOMPARE(loaded.rowCount(), streamed->rowCount());
        const auto presentation = [](const QVariantMap &part) {
            QVariantMap out;
            for (const auto key : {"label", "preview", "count", "progress", "displayStatus", "argumentsText", "resultText", "code", "duration"}) {
                out[key] = part.value(key);
            }
            QVariantList calls;
            for (const auto &value : part.value("calls").toList()) {
                auto call = value.toMap();
                QVariantMap item;
                for (const auto key : {"tool_call_id", "label", "displayStatus", "argumentsText", "resultText", "duration"}) { item[key] = call.value(key); }
                calls.append(item);
            }
            out["calls"] = calls;
            return out;
        };
        for (int row = 0; row < loaded.rowCount(); ++row) {
            for (const auto role : {MessageModel::MessageIdRole, MessageModel::RoleRole, MessageModel::TextRole, MessageModel::TimestampRole, MessageModel::StatusRole}) {
                QCOMPARE(loaded.data(loaded.index(row), role), streamed->data(streamed->index(row), role));
            }
            auto *a = partsFor(loaded, row);
            auto *b = partsFor(*streamed, row);
            QCOMPARE(a->rowCount(), b->rowCount());
            for (int part = 0; part < a->rowCount(); ++part) {
                QCOMPARE(presentation(partAt(a, part)), presentation(partAt(b, part)));
            }
        }
        for (const auto &original : raw) { QVERIFY(loaded.snapshot().contains(original)); }
        QCOMPARE(partAt(partsFor(loaded), 0)["displayStatus"].toString(), QString("Failed"));
        QCOMPARE(partAt(partsFor(loaded, 1), 0)["duration"].toString(), QString("1.2s"));
        QCOMPARE(partAt(partsFor(loaded, 1), 0)["code"].toString(), QString("console.log(2);"));
        auto *parts = partsFor(loaded, 1);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        loaded.upsert(raw.last().toObject());
        QCOMPARE(changed.count(), 0);
        // Results can arrive before their call when history pages are fetched separately.
        MessageModel reordered;
        reordered.upsert(raw.last().toObject());
        reordered.upsert(raw[raw.size() - 2].toObject());
        QCOMPARE(reordered.rowCount(), 1);
        QCOMPARE(presentation(partAt(partsFor(reordered), 0)), presentation(partAt(partsFor(loaded, 1), 0)));
    }
    // packages/protocol/tests/reasoning-effort.test.ts cases.
    void reasoningSupport_data() {
        QTest::addColumn<QString>("provider");
        QTest::addColumn<QString>("model");
        QTest::addColumn<bool>("supported");
        const QList<std::tuple<const char *, const char *, bool>> cases{
            {"anthropic", "claude-opus-5-5", true}, {"anthropic", "claude-sonnet-5-5", true},
            {"anthropic", "claude-haiku-5-5", true}, {"anthropic", "claude-fable-5-1", true},
            {"anthropic", "claude-opus-4-8", true}, {"anthropic", "claude-opus-4-6", true},
            {"anthropic", "claude-sonnet-4-6", true}, {"anthropic", "claude-opus-4-5-20251101", true},
            {"anthropic", "claude-sonnet-4-5", false}, {"anthropic", "claude-haiku-4-5", false},
            {"anthropic", "claude-opus-4-20250514", false}, {"anthropic", "claude-3-7-sonnet-latest", false},
            {"claude_agent_sdk", "sonnet", true}, {"antigravity", "gemini-3.5-flash", true},
            {"openai", "gpt-5.2", true}, {"openai", "gpt-5-mini", true}, {"openai", "gpt-5-chat-latest", false},
            {"openai", "gpt-4o", false}, {"gemini", "gemini-2.5-pro", true}, {"gemini", "models/gemini-3.5-flash", true},
            {"gemini", "gemini-3-pro-image", false}, {"gemini", "gemini-2.5-flash-preview-tts", false},
            {"gemini", "gemini-2.0-flash", false}, {"openrouter", "openai/gpt-5", false}, {"ollama", "qwen3", false},
            {"", "gpt-5", false}, {"openai", "", false}};
        for (const auto &[provider, model, supported] : cases) {
            QTest::addRow("%s %s", provider, model) << QString(provider) << QString(model) << supported;
        }
    }
    void reasoningSupport() {
        QFETCH(QString, provider);
        QFETCH(QString, model);
        QFETCH(bool, supported);
        QCOMPARE(nt::chat::composer::supportsReasoningEffort(provider, model), supported);
    }
    // useTextareaAssetMention.test.tsx findMentionTrigger and removeMentionToken cases.
    void mentionRules() {
        using nt::chat::composer::mentionTrigger;
        using nt::chat::composer::removeMention;
        const auto trigger = [](int start, int end, const QString &query) {
            return QVariantMap{{"start", start}, {"end", end}, {"query", query}};
        };
        QCOMPARE(mentionTrigger("@", 1), trigger(0, 1, ""));
        QCOMPARE(mentionTrigger("@fox", 4), trigger(0, 4, "fox"));
        QCOMPARE(mentionTrigger("hello @wo", 9), trigger(6, 9, "wo"));
        QCOMPARE(mentionTrigger("line1\n@foo", 10), trigger(6, 10, "foo"));
        QVERIFY(mentionTrigger("user@host", 9).isEmpty());
        QVERIFY(mentionTrigger("a@b", 3).isEmpty());
        QVERIFY(mentionTrigger("hello @wo world", 15).isEmpty());
        QVERIFY(mentionTrigger("@foo\nbar", 8).isEmpty());
        QCOMPARE(mentionTrigger("a @b @c", 7), trigger(5, 7, "c"));
        const auto longQuery = "@" + QString(65, 'x');
        QVERIFY(mentionTrigger(longQuery, static_cast<int>(longQuery.size())).isEmpty());
        QCOMPARE(removeMention("according to @no", 13, 16)["text"].toString(), QString("according to"));
        QCOMPARE(removeMention("according to @ my notes", 13, 14)["text"].toString(), QString("according to my notes"));
        QCOMPARE(removeMention("@fox runs", 0, 4)["text"].toString(), QString("runs"));
        QCOMPARE(removeMention("line1\n@foo", 6, 10)["text"].toString(), QString("line1\n"));
    }
    // web/src/utils/__tests__/groupByDate.test.ts cases. Weeks and months follow formatDateAndTime.ts relativeTime.
    void dateGroups() {
        using nt::chat::composer::dateGroup;
        const auto at = [](const char *text) {
            return QDateTime::fromString(QString::fromLatin1(text), Qt::ISODate);
        };
        const auto now = at("2024-01-15T12:00:00Z");
        QCOMPARE(dateGroup(at("2024-01-15T08:30:00Z"), now), QString("Today"));
        QCOMPARE(dateGroup(at("2024-01-15T23:59:59Z"), now), QString("Today"));
        QCOMPARE(dateGroup(at("2024-01-15T00:00:00Z"), now), QString("Today"));
        QCOMPARE(dateGroup(at("2024-01-14T12:00:00Z"), now), QString("Yesterday"));
        QCOMPARE(dateGroup(at("2024-01-14T00:00:00Z"), now), QString("Yesterday"));
        QCOMPARE(dateGroup(at("2024-01-14T23:59:59Z"), now), QString("Yesterday"));
        QCOMPARE(dateGroup(at("2024-01-13T12:00:00Z"), now), QString("2 days ago"));
        QCOMPARE(dateGroup(at("2024-01-09T12:00:00Z"), now), QString("6 days ago"));
        QCOMPARE(dateGroup(at("2024-01-08T12:00:00Z"), now), QString("1 week ago"));
        QCOMPARE(dateGroup(at("2024-01-01T12:00:00Z"), now), QString("2 weeks ago"));
        QCOMPARE(dateGroup(at("2023-12-15T12:00:00Z"), now), QString("1 month ago"));
        QCOMPARE(dateGroup(at("2022-11-01T12:00:00Z"), now), QString("1 year ago"));
    }
    // mediaGenerationRequest.ts with MediaGenerationStore.ts resolveImageSize.
    void mediaRequestSizes() {
        using nt::chat::composer::mediaRequest;
        auto settings = nt::chat::composer::defaultSettings("image");
        auto request = mediaRequest("image", settings, {}, {});
        QCOMPARE(request["width"].toInt(), 1820);
        QCOMPARE(request["height"].toInt(), 1024);
        QVERIFY(request["provider"].isNull());
        settings["aspectRatio"] = "9:16";
        settings["resolution"] = "4K";
        request = mediaRequest("image", settings, "fal", "flux");
        QCOMPARE(request["width"].toInt(), 4096);
        QCOMPARE(request["height"].toInt(), 7282);
        QVERIFY(!request.contains("preset_ids"));
        QCOMPARE(mediaRequest("chat", {}, {}, {}), (QJsonObject{{"mode", "chat"}}));
        QVERIFY(mediaRequest("reference_to_video", nt::chat::composer::defaultSettings("reference_to_video"), {}, {})["use_reference_video_audio"].isNull());
    }
    void persistedAssistantToolCallsRemainReadable() {
        MessageModel model;
        const QJsonObject call{{"id", "call-authoritative"}, {"type", "function"},
            {"function", QJsonObject{{"name", "ui_add_marker"}, {"arguments", "{\"time\":2}"}}}};
        const QJsonObject raw{{"id", "assistant-tool-message"}, {"role", "assistant"},
            {"content", QJsonValue::Null}, {"tool_calls", QJsonArray{call}}};
        model.upsert(raw);
        auto* parts = partsFor(model);
        QVERIFY(parts != nullptr);
        QCOMPARE(parts->rowCount(), 1);
        const auto part = partAt(parts, 0);
        QCOMPARE(part["type"].toString(), QStringLiteral("tool_call"));
        QCOMPARE(part["tool_call_id"].toString(), QStringLiteral("call-authoritative"));
        QCOMPARE(part["name"].toString(), QStringLiteral("ui_add_marker"));
        QVERIFY(part["text"].toString().contains("{\"time\":2}"));
        QCOMPARE(QJsonObject::fromVariantMap(part["payload"].toMap()), call);
        QCOMPARE(model.snapshot().first().toObject(), raw);
    }
    void streamedToolResultRetainsArguments() {
        ChatSession session;
        const QString thread = QString(32, 'a');
        session.upsertThread({{"id", thread}});
        session.selectThread(thread);
        session.applyEvent({{"type", "tool_call_update"}, {"thread_id", thread},
            {"tool_call_id", "call"}, {"name", "execute_code"},
            {"args", QJsonObject{{"code", "console.log(2)"}}}});
        auto* parts = partsFor(*qobject_cast<MessageModel*>(session.messages()));
        QSignalSpy reset(parts, &QAbstractItemModel::modelReset);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        session.applyEvent({{"type", "tool_result_update"}, {"thread_id", thread},
            {"tool_call_id", "call"}, {"result", QJsonObject{{"stdout", "2"}}}});
        QCOMPARE(parts->rowCount(), 1);
        QCOMPARE(partAt(parts, 0)["args"].toMap()["code"].toString(), QString("console.log(2)"));
        QVERIFY(partAt(parts, 0)["resultText"].toString().contains("2"));
        QCOMPARE(reset.count(), 0);
        QCOMPARE(changed.count(), 1);
    }
    void longToolConversationUpdatesOnlyOwningRow() {
        MessageModel model;
        for (int i = 0; i < 2000; ++i) {
            model.upsert({{"id", QString::number(i)}, {"role", "assistant"}, {"content", ""}});
            model.addPart({{"type", "tool_call_update"}, {"tool_call_id", QString("call-%1").arg(i)},
                {"name", "read_file"}, {"args", QJsonObject{{"path", "notes.txt"}}}});
        }
        auto* parts = partsFor(model, 5);
        QSignalSpy reset(&model, &QAbstractItemModel::modelReset);
        QSignalSpy changed(&model, &QAbstractItemModel::dataChanged);
        model.addPart({{"type", "tool_result_update"}, {"tool_call_id", "call-5"},
            {"is_error", true}, {"result", QJsonObject{{"error", "File not found"}}}});
        QCOMPARE(model.rowCount(), 2000);
        QCOMPARE(reset.count(), 0);
        QCOMPARE(changed.count(), 1);
        QCOMPARE(changed.first().first().value<QModelIndex>().row(), 5);
        QCOMPARE(partAt(parts, 0)["displayStatus"].toString(), QString("Failed"));
        QCOMPARE(partAt(parts, 0)["argumentsText"].toString().contains("notes.txt"), true);
    }
    void consecutiveToolsGroupWithoutLosingResults() {
        MessageModel model;
        model.upsert({{"id", "group"}, {"role", "assistant"}, {"content", ""}});
        model.addPart({{"type", "tool_call_update"}, {"name", "search"}, {"tool_call_id", "one"}, {"args", QJsonObject{{"query", "first"}}}});
        model.addPart({{"type", "tool_call_update"}, {"name", "search"}, {"tool_call_id", "two"}, {"args", QJsonObject{{"query", "second"}}}});
        auto* parts = partsFor(model);
        QCOMPARE(parts->rowCount(), 1);
        QCOMPARE(partAt(parts, 0)["label"].toString(), QString("Ran 2 searches"));
        QVERIFY(partAt(parts, 0)["preview"].toString().contains("first"));
        QVERIFY(partAt(parts, 0)["preview"].toString().contains("second"));
        QCOMPARE(model.snapshot()[0].toObject()["parts"].toArray().size(), 2);
    }
    void failedToolRemainsVisibleWhenCollapsed() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/compact-tools.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto data = QJsonDocument::fromJson(file.readAll()).object();
        ChatSession session;
        const auto thread = data["threads"].toArray().first().toObject();
        session.upsertThread(thread);
        session.selectThread(thread["id"].toString());
        for (const auto event : data["events"].toArray()) {
            session.applyEvent(event.toObject());
        }
        auto* model = qobject_cast<MessageModel*>(session.messages());
        const auto part = partAt(partsFor(*model), 1);
        QCOMPARE(part["displayStatus"].toString(), QString("Failed"));
        QCOMPARE(part["label"].toString(), QString("Count scenes"));
        QVERIFY(!part["expanded"].toBool());
        QCOMPARE(part["code"].toString(), QString("console.log(2);"));
        QVERIFY(part["resultText"].toString().contains("Execution unavailable"));
    }
    void toolExpansionIsPresentationState() {
        QFile file(QStringLiteral(CHAT_FIXTURE_DIR "/tool-calls.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto data = QJsonDocument::fromJson(file.readAll()).object();
        ChatSession session;
        const auto thread = data["threads"].toArray().first().toObject();
        session.upsertThread(thread);
        session.selectThread(thread["id"].toString());
        const auto events = data["events"].toArray();
        session.applyEvent(events.first().toObject());
        auto* model = qobject_cast<MessageModel*>(session.messages());
        auto* parts = qobject_cast<PartModel*>(partsFor(*model));
        QVERIFY(parts);
        const auto raw = model->snapshot();
        QSignalSpy reset(parts, &QAbstractItemModel::modelReset);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        parts->toggleExpanded(0);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(changed.count(), 1);
        QCOMPARE(model->snapshot(), raw);
        session.applyEvent(events.last().toObject());
        QCOMPARE(partsFor(*model), parts);
        QVERIFY(partAt(parts, 0)["expanded"].toBool());
        QCOMPARE(partAt(parts, 0)["displayStatus"].toString(), QString("Done"));
        parts->toggleExpanded(0);
        QVERIFY(!partAt(parts, 0)["expanded"].toBool());
        parts->toggleExpanded(-1);
        parts->toggleExpanded(1);
        QCOMPARE(reset.count(), 0);
    }
    void fixtureConformance() {
        const auto data = fixture();
        QVERIFY(!data.isEmpty());
        const auto threads = data["threads"].toArray();
        const auto events = data["events"].toArray();
        const auto expected = data["expected"].toArray();
        QVERIFY(!events.isEmpty());
        QCOMPARE(events.size(), expected.size());
        ChatSession session;
        for (const auto& thread : threads) { session.upsertThread(thread.toObject()); }
        for (int index = 0; index < events.size(); ++index) {
            session.applyEvent(events[index].toObject());
            QCOMPARE(normalized(session, threads), expected[index].toObject());
        }
    }
    void detectsCorruptDelta() {
        const auto data = fixture();
        ChatSession session;
        const auto threads = data["threads"].toArray();
        for (const auto& thread : threads) { session.upsertThread(thread.toObject()); }
        auto events = data["events"].toArray();
        QVERIFY(events.size() > 2);
        auto corrupted = events[2].toObject();
        corrupted["content"] = "lost";
        events[2] = corrupted;
        for (int index = 0; index <= 2; ++index) { session.applyEvent(events[index].toObject()); }
        QVERIFY(normalized(session, threads) != data["expected"].toArray()[2].toObject());
    }
    void preservesDrafts() {
        ChatSession session;
        session.upsertThread({{"id", "a"}, {"title", "A"}});
        session.upsertThread({{"id", "b"}, {"title", "B"}});
        session.selectThread("a");
        session.setDraft("first\nsecond");
        session.selectThread("b");
        QCOMPARE(session.draft(), QString());
        session.setDraft("other");
        session.selectThread("a");
        QCOMPARE(session.draft(), QStringLiteral("first\nsecond"));
    }
    void errorsBelongToTheirThread() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.upsertThread({{"id", "b"}});
        session.selectThread("b");
        session.applyEvent({{"type", "error"}, {"thread_id", "a"}, {"message", "Thread A failed"}});
        QCOMPARE(session.error(), QString());
        session.selectThread("a");
        QCOMPARE(session.error(), QStringLiteral("Thread A failed"));
    }
    void streamingDoesNotResetModel() {
        MessageModel model;
        QSignalSpy resets(&model, &QAbstractItemModel::modelReset);
        QSignalSpy changes(&model, &QAbstractItemModel::dataChanged);
        model.appendChunk("one", false);
        model.appendChunk(" ", false);
        model.appendChunk(" ", false);
        model.appendChunk("two", true);
        QCOMPARE(model.rowCount(), 1);
        QCOMPARE(model.data(model.index(0), MessageModel::TextRole).toString(), QStringLiteral("one  two"));
        QCOMPARE(resets.count(), 0);
        QVERIFY(changes.count() > 0);
    }
    void historyPrependKeepsIdentityAndDeduplicates() {
        MessageModel model;
        model.importHistory({message(3), message(4)});
        QSignalSpy resets(&model, &QAbstractItemModel::modelReset);
        model.importHistory({message(1), message(2), message(3)}, true);
        QCOMPARE(model.rowCount(), 4);
        QCOMPARE(model.data(model.index(0), MessageModel::MessageIdRole).toString(), message(1)["id"].toString());
        QCOMPARE(model.data(model.index(3), MessageModel::MessageIdRole).toString(), message(4)["id"].toString());
        QCOMPARE(resets.count(), 0);
    }
    void unknownContentPreserved() {
        MessageModel model;
        const QJsonObject payload{{"type", "future_content"}, {"payload", QJsonObject{{"value", 42}}}};
        model.upsert({{"id", "unknown"}, {"role", "assistant"}, {"content", QJsonArray{payload}}});
        QCOMPARE(model.snapshot()[0].toObject()["content"].toArray()[0].toObject(), payload);
        QVERIFY(partsFor(model));
        QVERIFY(partsFor(model)->rowCount() > 0);
    }
    void replaySequenceDeduplicatesWithoutContentHeuristic() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.selectThread("a");
        const QJsonObject first{{"type", "chunk"}, {"thread_id", "a"}, {"content", " "}, {"chat_seq", 1}};
        session.applyEvent(first);
        session.applyEvent(first);
        auto second = first;
        second["chat_seq"] = 2;
        session.applyEvent(second);
        QCOMPARE(session.messages()->rowCount(), 1);
        QCOMPARE(session.messages()->data(session.messages()->index(0, 0), MessageModel::TextRole).toString(), QStringLiteral("  "));
    }
    void idlessMediaUsesStableProjectionWithoutInventingServerId() {
        MessageModel model;
        const auto key = model.upsert({{"role", "assistant"}, {"content", QJsonArray{QJsonObject{{"type", "image_url"}, {"image", QJsonObject{{"asset_id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}}}}});
        QVERIFY(!key.isEmpty());
        QVERIFY(!model.snapshot()[0].toObject().contains("id"));
        QVERIFY(model.addResolvedPart(key, {{"type", "image"}, {"mediaUrl", "data:image/png;base64,AA=="}}));
        QVERIFY(partsFor(model));
        QVERIFY(partsFor(model)->rowCount() > 0);
    }
    void objectContentHasReadableFallbackWithoutLosingPayload() {
        MessageModel model;
        const QJsonObject content{{"future", "visible payload"}};
        model.upsert({{"id", "future"}, {"role", "assistant"}, {"content", content}});
        QCOMPARE(model.snapshot()[0].toObject()["content"].toObject(), content);
        auto* parts = partsFor(model);
        QVERIFY(parts);
        QVERIFY(parts->rowCount() > 0);
        QVERIFY(partAt(parts, 0)["text"].toString().contains("visible payload"));
    }
    void structuredPartsUpdateAffectedRowsWithoutReset() {
        MessageModel model;
        model.upsert({{"id", "approval-message"}, {"role", "assistant"}, {"content", "Review this action"}});
        auto* parts = partsFor(model);
        QVERIFY(parts);
        QSignalSpy resets(parts, &QAbstractItemModel::modelReset);
        QSignalSpy inserted(parts, &QAbstractItemModel::rowsInserted);
        QSignalSpy changed(parts, &QAbstractItemModel::dataChanged);
        QSignalSpy messageResets(&model, &QAbstractItemModel::modelReset);
        const QJsonObject request{{"type", "tool_approval_request"}, {"actionId", "approval-one"},
            {"pending", true}, {"args", QJsonObject{{"title", "Preserved argument"}}}};
        model.addPart(request);
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(parts->rowCount(), 2);
        QCOMPARE(inserted.count(), 1);
        QCOMPARE(partAt(parts, 0)["text"].toString(), "Review this action");
        QCOMPARE(QJsonObject::fromVariantMap(partAt(parts, 1)["args"].toMap()), request["args"].toObject());
        QCOMPARE(model.snapshot()[0].toObject()["parts"].toArray()[0].toObject(), request);
        auto response = request;
        response["pending"] = false;
        model.addPart(response);
        QCOMPARE(partsFor(model), parts);
        QCOMPARE(parts->rowCount(), 2);
        QVERIFY(changed.count() > 0);
        QCOMPARE(partAt(parts, 1)["pending"].toBool(), false);
        QCOMPARE(partAt(parts, 1)["actionId"].toString(), "approval-one");
        QCOMPARE(model.snapshot()[0].toObject()["parts"].toArray()[0].toObject(), response);
        QCOMPARE(resets.count(), 0);
        QCOMPARE(messageResets.count(), 0);
    }
    void toolRequestDoesNotFinishTurn() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.selectThread("a");
        session.applyEvent({{"type", "chunk"}, {"thread_id", "a"}, {"content", "Working"}});
        session.applyEvent({{"type", "message"}, {"thread_id", "a"}, {"id", "tool-message"},
            {"role", "assistant"}, {"content", "Working"},
            {"tool_calls", QJsonArray{QJsonObject{{"id", "call-one"}, {"name", "tool"}}}}});
        QCOMPARE(session.turnStatus(), QStringLiteral("streaming"));
    }
    void mediaResolutionMergesByStableMessageId() {
        MessageModel model;
        model.upsert({{"id", "image-message"}, {"role", "assistant"}, {"content", "Original"}});
        model.upsert({{"id", "image-message"}, {"role", "assistant"}, {"content", "Updated while loading"}});
        QVERIFY(model.addResolvedPart("image-message", {{"type", "image"}, {"mediaUrl", "data:image/png;base64,AA=="}}));
        QCOMPARE(model.data(model.index(0), MessageModel::TextRole).toString(), QStringLiteral("Updated while loading"));
        model.clear();
        QVERIFY(!model.addResolvedPart("image-message", {{"type", "image"}}));
        QCOMPARE(model.rowCount(), 0);
    }
    void mixedContentSurvivesStreaming() {
        MessageModel model;
        const QJsonObject image{{"type", "image_url"}, {"image", QJsonObject{{"uri", "asset://protected"}}}};
        model.upsert({{"id", "mixed"}, {"role", "assistant"}, {"status", "streaming"},
            {"content", QJsonArray{QJsonObject{{"type", "text"}, {"text", "Before"}}, image}}});
        model.appendChunk(" after", true);
        QCOMPARE(model.data(model.index(0), MessageModel::TextRole).toString(), QStringLiteral("Before after"));
        QVERIFY(model.snapshot()[0].toObject()["content"].toArray().contains(image));
    }
    void logoutClearsProtectedHistoryAndDrafts() {
        ChatSession session;
        session.upsertThread({{"id", "a"}});
        session.selectThread("a");
        session.setDraft("private draft");
        session.importHistory("a", {message(1)});
        session.disconnectFromServer();
        QCOMPARE(session.threads()->rowCount(), 0);
        QCOMPARE(session.messages()->rowCount(), 0);
        QCOMPARE(session.draft(), QString());
        QCOMPARE(session.selectedThreadId(), QString());
    }
    void pagedTenThousandMessageCorpus() {
        MessageModel model;
        QElapsedTimer timer;
        timer.start();
        constexpr int CorpusSize = 10000;
        constexpr int PageSize = 100;
        for (int start = CorpusSize - PageSize; start >= 0; start -= PageSize) {
            QJsonArray page;
            for (int row = start; row < start + PageSize; ++row) { page.append(message(row)); }
            model.importHistory(page, start != CorpusSize - PageSize);
        }
        QCOMPARE(model.rowCount(), CorpusSize);
        QCOMPARE(model.snapshot().first().toObject()["id"].toString(), message(0)["id"].toString());
        model.importHistory({message(CorpusSize)}, true);
        QVERIFY(model.rowCount() <= CorpusSize);
        qInfo().noquote() << QJsonDocument(QJsonObject{{"corpus_messages", CorpusSize},
            {"retained_messages", model.rowCount()}, {"elapsed_ms", timer.elapsed()},
            {"platform", QSysInfo::prettyProductName()}, {"cpu", QSysInfo::currentCpuArchitecture()},
            {"qt", QT_VERSION_STR}}).toJson(QJsonDocument::Compact);
        const auto previousLast = model.data(model.index(model.rowCount() - 1), MessageModel::TextRole).toString();
        model.appendChunk("new turn", false);
        QCOMPARE(model.rowCount(), CorpusSize);
        QCOMPARE(model.data(model.index(model.rowCount() - 1), MessageModel::TextRole).toString(), QStringLiteral("new turn"));
        QCOMPARE(model.data(model.index(model.rowCount() - 2), MessageModel::TextRole).toString(), previousLast);
        model.clear();
        QCOMPARE(model.rowCount(), 0);
    }
};
QTEST_MAIN(ChatModelTests)
#include "ChatModelTests.moc"
