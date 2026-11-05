#include "properties/ModelPickerController.h"
#include "properties/PropertyFields.h"
#include "document/WorkflowDocument.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQuickItem>
#include <QJsonDocument>
using namespace nodetool::node_editor;
class ModelPickerTest final : public QObject {
 Q_OBJECT
private slots:
 void authenticatedSelection() {
  QTcpServer server;
  QVERIFY(server.listen(QHostAddress::LocalHost));
  QStringList requests;
  connect(&server, &QTcpServer::newConnection, &server, [&] {
   auto* socket = server.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    const auto request = socket->readAll(); requests.append(QString::fromUtf8(request));
    const bool providers = request.startsWith("GET /trpc/models.providers?");
    const auto data = providers ? QJsonArray{QJsonObject{{"provider", "test"}, {"capabilities", QJsonArray{"generate_message"}}}}
     : QJsonArray{QJsonObject{{"id", "full/model-id"}, {"name", "Test model"}, {"supported_tasks", QJsonArray{"tools"}}}};
    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
   });
  });
  ModelPickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "secret", "authorized-user");
  QTRY_VERIFY(!controller.loading());
  QCOMPARE(controller.models().size(), 1);
  QCOMPARE(requests.size(), 2);
  for (const auto& request : requests) {
   QVERIFY(request.contains("Authorization: Bearer secret"));
   QVERIFY(request.toLower().contains("x-user-id: authorized-user"));
  }
  QQmlEngine engine;
  engine.rootContext()->setContextProperty("modelPickerController", &controller);
  QQmlComponent component(&engine, QUrl("qrc:/editor/ModelPropertyEditor.qml"));
  QTRY_VERIFY2(component.status() != QQmlComponent::Loading, qPrintable(component.errorString()));
  QVERIFY2(!component.isError(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> item(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "model"}, {"label", "Model"}, {"allowedProviders", QStringList{"test"}}}}, {"value", QVariantMap{{"id", "missing"}, {"provider", "test"}}}, {"writable", true}}));
  QVERIFY2(item != nullptr, qPrintable(component.errorString()));
  auto* select = item->findChild<QObject*>("model-select-model"); QVERIFY(select);
  QSignalSpy committed(item.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, "test\nfull/model-id")));
  QCOMPARE(committed.size(), 1);
  const auto selected = committed.first().first().toMap();
  QCOMPARE(selected.value("id").toString(), "full/model-id");
  QCOMPARE(selected.value("type").toString(), "language_model");
  QCOMPARE(selected.value("provider").toString(), "test");
  WorkflowDocument document;
  document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", QJsonObject{{"type", "language_model"}}}}}}}});
  QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"model", "legacy/model"}}}}}}, {"edges", QJsonArray{}}}}}));
  QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "model"}, {"value", QJsonObject::fromVariantMap(selected)}}));
  QCOMPARE(document.undoStack()->count(), 1);
  QCOMPARE(document.node("n").value("data").toObject().value("model").toObject().value("id").toString(), "full/model-id");
  document.undo();
  QCOMPARE(document.node("n").value("data").toObject().value("model").toString(), "legacy/model");
  document.redo();
  WorkflowDocument reopened;
  QVERIFY(reopened.load(document.snapshot()));
  QCOMPARE(reopened.node("n").value("data").toObject().value("model"), QJsonValue(QJsonObject::fromVariantMap(selected)));
  item->setProperty("writable", false);
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, "test\nfull/model-id")));
  QCOMPARE(committed.size(), 1);
  controller.configure({}, {}, {});
  QCOMPARE(controller.models().size(), 0);
 }
 void cancelAndScopeReset() {
  QTcpServer server;
  QVERIFY(server.listen(QHostAddress::LocalHost));
  QPointer<QTcpSocket> held;
  connect(&server, &QTcpServer::newConnection, &server, [&] { held = server.nextPendingConnection(); });
  ModelPickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "first-account", "first");
  QTRY_VERIFY(held);
  QVERIFY(controller.loading());
  controller.configure({}, {}, {});
  QVERIFY(!controller.loading());
  QVERIFY(controller.models().isEmpty());
  QCoreApplication::processEvents();
  QVERIFY(controller.error().isEmpty());
  controller.configure(QUrl("http://remote.example"), "secret", "second");
  QVERIFY(!controller.error().isEmpty());
  QVERIFY(!controller.loading());
  QVERIFY(controller.models().isEmpty());
 }
 void typedBoundary() {
  const QJsonObject declaration{{"type", QJsonObject{{"type", "language_model"}}}, {"default", QJsonObject{{"provider", "locked"}}}};
  QCOMPARE(propertyKind(declaration), "model");
  QVERIFY(validatePropertyValue(declaration, "legacy/model").isEmpty());
  QVERIFY(!validatePropertyValue(declaration, QJsonObject{{"type", "language_model"}, {"id", "m"}, {"provider", "other"}}).isEmpty());
  QVERIFY(validatePropertyValue(declaration, QJsonObject{{"type", "language_model"}, {"id", "m"}, {"provider", "locked"}}).isEmpty());
  QVERIFY(!validatePropertyValue(declaration, 42).isEmpty());
 }
};
QTEST_MAIN(ModelPickerTest)
#include "ModelPickerTest.moc"
