#include "properties/ResourcePickerController.h"
#include "properties/PropertyFields.h"
#include "document/WorkflowDocument.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QJsonDocument>
#include <QJSValue>
#include <memory>
using namespace nodetool::node_editor;
class ResourcePickerTest final : public QObject {
 Q_OBJECT
private:
 static QVariant unwrapped(const QVariant& value) {
  return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
 }
private slots:
 void workflowSelectionAndLists() {
  const QString first = "1234567890abcdef1234567890abcdef";
  const QString second = "abcdef1234567890abcdef1234567890";
  QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
  QList<QByteArray> requests;
  bool fail = false;
  connect(&server, &QTcpServer::newConnection, &server, [&] {
   auto* socket = server.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    const auto request = socket->readAll(); requests.append(request);
    const bool get = request.startsWith("GET /trpc/workflows.get?");
    const bool missing = request.contains("missing");
    const bool laterPage = request.contains("next-page");
    const QJsonObject data = get ? QJsonObject{{"id", first}} : QJsonObject{{"workflows", laterPage ? QJsonArray{QJsonObject{{"id", second}, {"name", "Second workflow"}}} : QJsonArray{QJsonObject{{"id", first}, {"name", "First workflow"}}}}, {"next", laterPage ? QJsonValue(QJsonValue::Null) : QJsonValue("next-page")}};
    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
    socket->write(QByteArray("HTTP/1.1 ") + (fail ? "500 Failed" : missing ? "404 Missing" : "200 OK") + "\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
   });
  });
  ResourcePickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "secret", "scope-user");
  QSignalSpy listed(&controller, &ResourcePickerController::listed);
  QSignalSpy verified(&controller, &ResourcePickerController::verified);
  QSignalSpy failed(&controller, &ResourcePickerController::failed);
  controller.workflows("page"); QTRY_COMPARE(listed.count(), 1);
  QCOMPARE(listed.first().at(1).toList().first().toMap().value("id").toString(), first);
  controller.workflows("page", "next-page"); QTRY_COMPARE(listed.count(), 2);
  QCOMPARE(listed.last().at(1).toList().first().toMap().value("id").toString(), second);
  controller.verifyWorkflow("verify", "missing"); QTRY_COMPARE(verified.count(), 1);
  QVERIFY(!verified.first().at(2).toBool());
  for (const auto& request : requests) { QVERIFY(request.contains("Authorization: Bearer secret")); QVERIFY(request.toLower().contains("x-user-id: scope-user")); }
  QQmlEngine engine;
  engine.rootContext()->setContextProperty("resourcePickerController", &controller);
  QQmlComponent component(&engine, QUrl("qrc:/editor/WorkflowPropertyEditor.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading);
  QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  const QVariantMap descriptor{{"name", "workflow"}, {"kind", "workflow"}, {"dataType", QVariantMap{{"type", "workflow"}}}};
  std::unique_ptr<QObject> item(component.createWithInitialProperties({{"descriptor", descriptor}, {"value", QVariantMap{{"type", "workflow"}, {"id", "missing"}, {"future", 7}}}, {"writable", true}, {"nodeId", "a"}}));
  QVERIFY2(item, qPrintable(component.errorString()));
  QTRY_COMPARE(verified.count(), 2);
  const auto statusValue = item->property("statuses");
  const auto statuses = unwrapped(statusValue).toMap();
  QCOMPARE(statuses.value("missing").toString(), "missing");
  QSignalSpy commits(item.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(item.get(), "browse", Q_ARG(QVariant, false)));
  auto* select = item->findChild<QObject*>("workflow-select-workflow"); QVERIFY(select);
  QTRY_VERIFY(select->property("enabled").toBool());
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, first)));
  QCOMPARE(commits.count(), 1);
  auto result = unwrapped(commits.first().first()).toMap();
  QCOMPARE(result.value("id").toString(), first); QCOMPARE(result.value("type").toString(), "workflow"); QCOMPARE(result.value("future").toInt(), 7);
  QVariantMap listDescriptor = descriptor; listDescriptor.insert("kind", "workflow_list");
  item->setProperty("descriptor", listDescriptor);
  item->setProperty("value", QVariantList{QVariantMap{{"type", "workflow"}, {"id", first}, {"future", "retained"}}});
  QVERIFY(QMetaObject::invokeMethod(item.get(), "browse", Q_ARG(QVariant, true)));
  QTRY_VERIFY(select->property("options").value<QJSValue>().property("length").toInt() == 2);
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, second)));
  QCOMPARE(commits.count(), 2);
  auto list = unwrapped(commits.last().first()).toList();
  QCOMPARE(list.size(), 2); QCOMPARE(list.first().toMap().value("future").toString(), "retained"); QCOMPARE(list.last().toMap().value("id").toString(), second);
  item->setProperty("value", list);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "moveAt", Q_ARG(QVariant, 1), Q_ARG(QVariant, -1)));
  QCOMPARE(commits.count(), 3);
  auto reordered = unwrapped(commits.last().first()).toList();
  QCOMPARE(reordered.first().toMap().value("id").toString(), second);
  item->setProperty("value", reordered);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "removeAt", Q_ARG(QVariant, 0)));
  QCOMPARE(commits.count(), 4);
  QCOMPARE(unwrapped(commits.last().first()).toList().first().toMap().value("future").toString(), "retained");
  item->setProperty("nodeId", "b");
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, first))); QCOMPARE(commits.count(), 4);
  item->setProperty("writable", false);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "removeAt", Q_ARG(QVariant, 0))); QCOMPARE(commits.count(), 4);
  fail = true; controller.workflows("fail"); QTRY_VERIFY(!failed.isEmpty());
  const auto listedCount = listed.count(); const auto verifiedCount = verified.count();
  controller.workflows("stale"); controller.verifyWorkflow("stale-verify", first); controller.configure({}, {}, {});
  QCoreApplication::processEvents(); QCOMPARE(listed.count(), listedCount); QCOMPARE(verified.count(), verifiedCount);
 }
 void collectionNamesAreIdentity() {
  QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
  bool fail = false;
  bool empty = false;
  QList<QByteArray> requests;
  connect(&server, &QTcpServer::newConnection, &server, [&] {
   auto* socket = server.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    requests.append(socket->readAll());
    const QJsonArray rows = empty ? QJsonArray{} : QJsonArray{QJsonObject{{"name", "project-documents"}, {"count", 8}}};
    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"collections", rows}, {"count", rows.size()}}}}}}).toJson(QJsonDocument::Compact);
    socket->write(QByteArray("HTTP/1.1 ") + (fail ? "500 Failed" : "200 OK") + "\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
   });
  });
  ResourcePickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "secret", "collection-owner");
  QSignalSpy listed(&controller, &ResourcePickerController::collectionsListed);
  QQmlEngine engine; engine.rootContext()->setContextProperty("resourcePickerController", &controller);
  QQmlComponent component(&engine, QUrl("qrc:/editor/CollectionPropertyEditor.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading); QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> item(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "collection"}}}, {"value", QVariantMap{{"type", "collection"}, {"name", "deleted"}, {"future", 7}}}, {"nodeId", "n"}, {"writable", true}}));
  QVERIFY2(item, qPrintable(component.errorString()));
  QTRY_COMPARE(listed.count(), 1);
  QVERIFY(requests.first().startsWith("GET /trpc/collections.list?"));
  QVERIFY(requests.first().contains("Authorization: Bearer secret"));
  QVERIFY(requests.first().toLower().contains("x-user-id: collection-owner"));
  auto* select = item->findChild<QObject*>("collection-select-collection"); QVERIFY(select);
  QSignalSpy commit(item.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, "project-documents")));
  QCOMPARE(commit.count(), 1);
  const auto reference = unwrapped(commit.first().first()).toMap();
  QCOMPARE(reference.value("name").toString(), "project-documents"); QCOMPARE(reference.value("type").toString(), "collection"); QCOMPARE(reference.value("future").toInt(), 7); QVERIFY(!reference.contains("id"));
  const QJsonObject type{{"type", "collection"}};
  QCOMPARE(propertyKind({{"type", type}}), "collection");
  QVERIFY(validatePropertyValue({{"type", type}}, QJsonObject::fromVariantMap(reference)).isEmpty());
  QVERIFY(!validatePropertyValue({{"type", type}}, QJsonObject{{"type", "collection"}, {"id", "wrong"}}).isEmpty());
  WorkflowDocument document;
  document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "collection"}, {"type", type}}}}}});
  const QJsonObject old{{"type", "collection"}, {"name", "deleted"}, {"future", 7}};
  QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"collection", old}}}}}}, {"edges", QJsonArray{}}}}}));
  QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "collection"}, {"value", QJsonObject::fromVariantMap(reference)}}));
  QCOMPARE(document.undoStack()->count(), 1); document.undo(); QCOMPARE(document.node("n").value("data").toObject().value("collection").toObject(), old);
  document.redo(); WorkflowDocument reopened; QVERIFY(reopened.load(document.snapshot()));
  QCOMPARE(reopened.node("n").value("data").toObject().value("collection").toObject(), QJsonObject::fromVariantMap(reference));
  empty = true;
  QVERIFY(QMetaObject::invokeMethod(item.get(), "refresh"));
  QTRY_COMPARE(listed.count(), 2); QTRY_VERIFY(!select->property("enabled").toBool());
  fail = true;
  QVERIFY(QMetaObject::invokeMethod(item.get(), "refresh"));
  QTRY_VERIFY(!item->property("error").toString().isEmpty());
  item->setProperty("nodeId", "different");
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, "project-documents"))); QCOMPARE(commit.count(), 1);
  controller.configure({}, {}, {});
  item->setProperty("writable", false);
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, "project-documents"))); QCOMPARE(commit.count(), 1);
 }
 void typedDocumentBoundary() {
  const QJsonObject workflow{{"type", "workflow"}};
  const QJsonObject list{{"type", "list"}, {"type_args", QJsonArray{workflow}}};
  QCOMPARE(propertyKind({{"type", workflow}}), "workflow");
  QCOMPARE(propertyKind({{"type", list}}), "workflow_list");
  QVERIFY(!validatePropertyValue({{"type", workflow}}, "raw-id").isEmpty());
  QVERIFY(!validatePropertyValue({{"type", list}}, QJsonArray{QJsonObject{{"type", "workflow"}}}).isEmpty());
  QJsonArray large;
  for (int index = 0; index < 5000; ++index) { large.append(QJsonObject{{"type", "workflow"}, {"id", QString::number(index).rightJustified(32, '0')}}); }
  QVERIFY(validatePropertyValue({{"type", list}}, large).isEmpty());
  WorkflowDocument document;
  document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "workflows"}, {"type", list}}}}}});
  QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"workflows", QJsonArray{}}}}}}}, {"edges", QJsonArray{}}}}}));
  const QJsonArray refs{QJsonObject{{"type", "workflow"}, {"id", "1234567890abcdef1234567890abcdef"}, {"future", 7}}};
  QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "workflows"}, {"value", refs}}));
  QCOMPARE(document.undoStack()->count(), 1); document.undo();
  QVERIFY(document.node("n").value("data").toObject().value("workflows").toArray().isEmpty());
  document.redo(); WorkflowDocument reopened; QVERIFY(reopened.load(document.snapshot()));
  QCOMPARE(reopened.node("n").value("data").toObject().value("workflows").toArray(), refs);
 }
};
QTEST_MAIN(ResourcePickerTest)
#include "ResourcePickerTest.moc"
