#include "document/WorkflowDocument.h"
#include "server/WorkflowSession.h"
#include <QJsonDocument>
#include <QNetworkReply>
#include <QRegularExpression>
#include <QScopeGuard>
#include <QUrlQuery>
#include <QUuid>
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
QString resourceId() { return QUuid::createUuid().toString(QUuid::Id128); }
struct Response {
  int status = 0;
  QJsonObject body;
};
Response request(QNetworkAccessManager &network, const QUrl &base,
                 const QByteArray &method, const QString &path,
                 const QJsonObject &body = {}) {
  QNetworkRequest request(base.resolved(QUrl(path)));
  request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  auto *reply = network.sendCustomRequest(
      request, method,
      method == "GET" || method == "DELETE"
          ? QByteArray{}
          : QJsonDocument(body).toJson(QJsonDocument::Compact));
  QSignalSpy finished(reply, &QNetworkReply::finished);
  if (!reply->isFinished() && !finished.wait(10000)) {
    reply->abort();
    reply->deleteLater();
    return {};
  }
  const auto bytes = reply->readAll();
  const auto status =
      reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
  reply->deleteLater();
  return {status, QJsonDocument::fromJson(bytes).object()};
}
QJsonObject trpcData(const QJsonObject &body) {
  const auto data = body["result"].toObject()["data"].toObject();
  return data.contains("json") ? data["json"].toObject() : data;
}
Response assetsFor(QNetworkAccessManager &network, const QUrl &base,
                   const QString &workflow) {
  QUrl url("/trpc/assets.list");
  QUrlQuery query;
  query.addQueryItem(
      "input",
      QString::fromUtf8(QJsonDocument(QJsonObject{{"workflow_id", workflow},
                                                  {"page_size", 10000}})
                            .toJson(QJsonDocument::Compact)));
  url.setQuery(query);
  return request(network, base, "GET", url.toString());
}
QJsonObject node(const QString &id, const QString &type,
                 const QJsonObject &data) {
  return {{"id", id}, {"type", type}, {"data", data}};
}
QJsonArray outputs(const QSignalSpy &events, const QString &job,
                   const QString &node) {
  QJsonArray values;
  for (const auto &row : events) {
    const auto event = row[1].toJsonObject();
    if (row[0].toString() == job && event["type"] == "generation_complete" &&
        event["node_id"] == node &&
        event["outputs"].toObject().contains("output")) {
      values.append(event["outputs"].toObject()["output"]);
    }
  }
  return values;
}
QString errorsText(const QSignalSpy &errors) {
  QStringList messages;
  for (const auto &row : errors) {
    if (!row.isEmpty()) {
      messages.append(row.first().toString());
    }
  }
  return messages.join('\n');
}
QString terminalStatus(const QSignalSpy &events, const QString &job) {
  for (const auto &row : events) {
    const auto event = row[1].toJsonObject();
    if (row[0].toString() == job && event["type"] == "job_update" &&
        (event["status"] == "completed" || event["status"] == "failed" ||
         event["status"] == "cancelled")) {
      return event["status"].toString();
    }
  }
  return {};
}
} // namespace
class RerouteLiveTests final : public QObject {
  Q_OBJECT
private slots:
  void insertedReroutePreservesValues_data() {
    QTest::addColumn<QJsonValue>("value");
    QTest::addColumn<bool>("stream");
    QTest::newRow("null") << QJsonValue(QJsonValue::Null) << false;
    QTest::newRow("false") << QJsonValue(false) << false;
    QTest::newRow("zero") << QJsonValue(0) << false;
    QTest::newRow("list") << QJsonValue(QJsonArray{
                                 false, 0, QJsonValue::Null, QJsonArray{1, 2},
                                 QJsonObject{{"nested", "value"}}})
                          << false;
    QTest::newRow("string") << QJsonValue("Native reroute value") << false;
    QTest::newRow("ordered-multiple-emissions")
        << QJsonValue(
               QJsonArray{false, 0, QJsonValue::Null, QJsonArray{1, 2}, "last"})
        << true;
  }
  void insertedReroutePreservesValues() {
    const QUrl base(qEnvironmentVariable("NODETOOL_PARTIAL_LIVE_URL"));
    if (base.isEmpty()) {
      QSKIP("Set NODETOOL_PARTIAL_LIVE_URL to a disposable backend for reroute "
            "execution acceptance");
    }
    QFETCH(QJsonValue, value);
    QFETCH(bool, stream);
    WorkflowSession session;
    QSignalSpy events(&session, &WorkflowSession::runEvent),
        errors(&session, &WorkflowSession::errorOccurred);
    session.connectToServer(base, {});
    QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 10000);
    QTRY_VERIFY_WITH_TIMEOUT(!session.catalog().isEmpty(), 10000);
    const auto metadata = session.catalog()["nodes"].toArray();
    QSet<QString> types;
    for (const auto &item : metadata) {
      types.insert(item.toObject()["node_type"].toString());
    }
    for (const auto &type : {QString("nodetool.input.ValueInput"),
                             QString("nodetool.control.ForEach"),
                             QString("nodetool.control.Reroute"),
                             QString("nodetool.output.Output")}) {
      QVERIFY2(types.contains(type),
               qPrintable("Disposable backend lacks registered fixture node " +
                          type));
    }
    session.setNodeMetadata(metadata);
    const auto sourceId = resourceId(), targetId = resourceId(),
               edgeId = resourceId();
    const auto source = stream ? node(sourceId, "nodetool.control.ForEach",
                                      {{"input_list", value}, {"limit", -1}})
                               : node(sourceId, "nodetool.input.ValueInput",
                                      {{"name", "source"}, {"value", value}});
    const QJsonObject originalEdge{{"id", edgeId},
                                   {"source", sourceId},
                                   {"sourceHandle", "output"},
                                   {"target", targetId},
                                   {"targetHandle", "value"},
                                   {"edge_type", "data"},
                                   {"future", QJsonObject{{"preserve", true}}}};
    QJsonObject snapshot{
        {"name", "Native reroute live acceptance"},
        {"graph",
         QJsonObject{{"nodes", QJsonArray{source, node(targetId,
                                                       "nodetool.output.Output",
                                                       {{"name", "result"}})}},
                     {"edges", QJsonArray{originalEdge}}}}};
    QNetworkAccessManager network;
    const auto created =
        request(network, base, "POST", "/api/workflows", snapshot);
    QVERIFY2(created.status >= 200 && created.status < 300,
             qPrintable(QString::number(created.status)));
    QString workflowId = created.body["id"].toString();
    snapshot["id"] = workflowId;
    QString activeJob;
    auto cleanup = qScopeGuard([&] {
      if (!activeJob.isEmpty() && terminalStatus(events, activeJob).isEmpty()) {
        session.stop(activeJob);
      }
      if (workflowId.isEmpty()) {
        return;
      }
      const auto listed = assetsFor(network, base, workflowId);
      const auto assets = trpcData(listed.body)["assets"].toArray();
      for (const auto &item : assets) {
        const auto asset = item.toObject();
        if (asset["workflow_id"] == workflowId &&
            !asset["id"].toString().isEmpty()) {
          request(network, base, "POST", "/trpc/assets.delete",
                  {{"id", asset["id"]}});
        }
      }
      request(network, base, "DELETE", "/api/workflows/" + workflowId);
    });
    QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(workflowId).hasMatch());
    const auto persistedBefore =
        request(network, base, "GET", "/api/workflows/" + workflowId);
    QCOMPARE(persistedBefore.status, 200);
    activeJob = session.run(snapshot);
    QVERIFY(!activeJob.isEmpty());
    QTRY_VERIFY_WITH_TIMEOUT(!terminalStatus(events, activeJob).isEmpty(),
                             20000);
    QVERIFY2(terminalStatus(events, activeJob) == "completed",
             qPrintable(errorsText(errors)));
    const QJsonArray requested = stream ? value.toArray() : QJsonArray{value};
    QJsonArray expected;
    for (const auto &item : requested) {
      // Forward correlations classify Output/Reroute as streaming nodes.
      // NodeActor::_filterStreamingPartial omits null outputs on both paths.
      // Nulls nested inside a delivered list remain part of that list value.
      if (!item.isNull()) {
        expected.append(item);
      }
    }
    const auto direct = outputs(events, activeJob, targetId);
    QCOMPARE(direct, expected);
    WorkflowDocument document;
    document.setNodeMetadata(metadata);
    QVERIFY(document.load(snapshot));
    const auto inserted = document.applyCommand(
        {{"op", "insertReroute"},
         {"id", edgeId},
         {"position", QJsonObject{{"x", 300}, {"y", 100}}}});
    QVERIFY2(inserted.ok, qPrintable(inserted.error));
    const auto rerouteId = inserted.idMap["reroute"].toString();
    QVERIFY(QRegularExpression("^[0-9a-f]{32}$")
                .match(inserted.idMap["upstreamEdge"].toString())
                .hasMatch());
    QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(rerouteId).hasMatch());
    const auto authored = document.snapshot();
    QCOMPARE(document.edges().last().toObject()["id"].toString(), edgeId);
    QCOMPARE(document.edges().last().toObject()["future"],
             originalEdge["future"]);
    activeJob = session.run(authored);
    QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(activeJob).hasMatch());
    QTRY_VERIFY_WITH_TIMEOUT(!terminalStatus(events, activeJob).isEmpty(),
                             20000);
    QVERIFY2(terminalStatus(events, activeJob) == "completed",
             qPrintable(errorsText(errors)));
    QCOMPARE(outputs(events, activeJob, rerouteId), expected);
    QCOMPARE(outputs(events, activeJob, targetId), direct);
    QSet<QString> completedNodes;
    for (const auto &row : events) {
      const auto event = row[1].toJsonObject();
      if (row[0].toString() == activeJob && event["type"] == "node_update" &&
          event["status"] == "completed") {
        completedNodes.insert(event["node_id"].toString());
      }
    }
    QVERIFY(completedNodes.contains(rerouteId));
    QVERIFY(completedNodes.contains(targetId));
    if (expected.size() != requested.size()) {
      qInfo() << "Backend null-output omission matched direct and inserted "
                 "paths; this does not establish standalone null delivery";
    }
    for (const auto &row : events) {
      if (row[0].toString() != activeJob) {
        continue;
      }
      const auto event = row[1].toJsonObject();
      if (event["type"] == "generation_complete") {
        const auto id = event["node_id"].toString();
        QVERIFY(id == sourceId || id == targetId || id == rerouteId);
        QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch());
      }
    }
    QCOMPARE(document.snapshot(), authored);
    document.undo();
    QCOMPARE(document.snapshot(), snapshot);
    document.redo();
    QCOMPARE(document.snapshot(), authored);
    const auto persistedAfter =
        request(network, base, "GET", "/api/workflows/" + workflowId);
    QCOMPARE(persistedAfter.status, 200);
    QCOMPARE(persistedAfter.body["graph"], persistedBefore.body["graph"]);
    const auto listed = assetsFor(network, base, workflowId);
    QCOMPARE(listed.status, 200);
    const auto assets = trpcData(listed.body);
    QVERIFY(assets["assets"].isArray());
    QVERIFY(assets["assets"].toArray().isEmpty());
    const auto removed =
        request(network, base, "DELETE", "/api/workflows/" + workflowId);
    QVERIFY(removed.status >= 200 && removed.status < 300);
    workflowId.clear();
    qInfo() << "Direct and inserted runs preserved" << expected.size()
            << "output(s), full resource IDs, local/server snapshots and exact "
               "undo";
  }
};
QTEST_GUILESS_MAIN(RerouteLiveTests)
#include "RerouteLiveTests.moc"
