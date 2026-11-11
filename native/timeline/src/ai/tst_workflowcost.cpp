#include "ai/WorkflowCost.h"
#include "server/ServerClient.h"
#include "../../tests/TestHttpServer.h"
#include <QJsonDocument>
#include <QtTest>

class WorkflowCostTest : public QObject {
    Q_OBJECT
private slots:
    void summary() {
        QJsonObject response{{"version", 1}, {"level", "static"}, {"workflow_id", "wf"},
            {"cost", QJsonObject{{"amount", 0.015}, {"currency", "USD"}, {"confidence", "partial"},
                                {"unknown_cost_nodes", QJsonArray{"node"}}}}};
        auto result = nt::ai::workflowCostFromPreflight(response, "wf");
        QVERIFY(result.available);
        QVERIFY(result.lowerBound);
        QCOMPARE(result.label, QStringLiteral("$0.015"));
        QCOMPARE(result.detail, QStringLiteral("1 node without a known price is excluded."));
        QVERIFY(!nt::ai::workflowCostFromPreflight(response, "other").available);
        auto cost = response.value("cost").toObject();
        cost.insert("amount", QJsonValue::Null); cost.insert("confidence", "unknown"); response.insert("cost", cost);
        result = nt::ai::workflowCostFromPreflight(response, "wf");
        QVERIFY(!result.available);
        QCOMPARE(result.detail, QStringLiteral("Price unavailable."));
        cost.insert("amount", 0.00000123); cost.insert("confidence", "estimate"); cost.insert("unknown_cost_nodes", QJsonArray{});
        response.insert("cost", cost);
        result = nt::ai::workflowCostFromPreflight(response, "wf");
        QCOMPARE(result.label, QStringLiteral("$0.00000123"));
        QVERIFY(!result.lowerBound);
        cost.insert("currency", "EUR"); response.insert("cost", cost);
        QVERIFY(!nt::ai::workflowCostFromPreflight(response, "wf").available);
    }
    void scratchRequest() {
        TestHttpServer http;
        http.setFile("/api/sdk/v1/preflight", ServedFile(R"({"version":1,"level":"static","workflow_id":"wf","cost":{"amount":0.25,"currency":"USD","confidence":"estimate","unknown_cost_nodes":[]}})"));
        nt::server::ServerClient client(http.base(), "fixture-token");
        const auto result = nt::ai::estimateWorkflowCost(client, "wf", {{"prompt", "example"}});
        QVERIFY2(result.error.isEmpty(), qPrintable(result.error));
        QCOMPARE(result.label, QStringLiteral("$0.25"));
        const auto requests = http.requests();
        QCOMPARE(requests.size(), size_t(1));
        QCOMPARE(requests.front().method, QByteArray("POST"));
        QCOMPARE(requests.front().target, QByteArray("/api/sdk/v1/preflight"));
        QCOMPARE(requests.front().headers.value("authorization"), QByteArray("Bearer fixture-token"));
        QCOMPARE(requests.front().headers.value("content-type"), QByteArray("application/json"));
        QVERIFY(!requests.front().headers.contains("origin"));
        const auto body = QJsonDocument::fromJson(requests.front().body).object();
        QCOMPARE(body.value("workflow_id").toString(), QStringLiteral("wf"));
        QCOMPARE(body.value("level").toString(), QStringLiteral("static"));
        QCOMPARE(body.value("interface_version").toInt(), 1);
        QVERIFY(body.value("workspace_id").isNull());
        QVERIFY(body.value("workflow_etag").isNull());
        QCOMPARE(body.value("inputs").toObject().value("prompt").toString(), QStringLiteral("example"));
    }
    void pinnedServerRejectsWrongInstance() {
        TestHttpServer http;
        http.setFile("/ready", ServedFile("{}"));
        http.setFile("/api/sdk/v1/preflight", ServedFile("{}"));
        http.setInstanceSecret("right-instance");
        nt::server::ServerClient client(http.base());
        client.setExpectedInstance("wrong-instance");
        const auto result = nt::ai::estimateWorkflowCost(client, "wf");
        QVERIFY(!result.error.isEmpty());
        QCOMPARE(http.countRequests("POST", "/api/sdk/v1/preflight"), 0);
        http.setFile("/api/sdk/v1/preflight", ServedFile(R"({"version":1,"level":"static","workflow_id":"wf","cost":{"amount":0.25,"currency":"USD","confidence":"estimate","unknown_cost_nodes":[]}})"));
        nt::server::ServerClient matching(http.base());
        matching.setExpectedInstance("right-instance");
        const auto allowed = nt::ai::estimateWorkflowCost(matching, "wf");
        QVERIFY2(allowed.error.isEmpty(), qPrintable(allowed.error));
        QCOMPARE(allowed.label, QStringLiteral("$0.25"));
        QCOMPARE(http.countRequests("POST", "/api/sdk/v1/preflight"), 1);
    }
};
QTEST_GUILESS_MAIN(WorkflowCostTest)
#include "tst_workflowcost.moc"
