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
#include <QJSValue>
#include <QSettings>
#include <QTemporaryDir>
#include "ModelPickerCatalog.h"
using namespace nodetool::node_editor;
class ModelPickerTest final : public QObject {
 Q_OBJECT
private slots:
 void authenticatedSelection() {
  QTemporaryDir settings;
  QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
  QTcpServer server;
  QVERIFY(server.listen(QHostAddress::LocalHost));
  QStringList requests;
  connect(&server, &QTcpServer::newConnection, &server, [&] {
   auto* socket = server.nextPendingConnection();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
    const auto request = socket->readAll(); requests.append(QString::fromUtf8(request));
    QJsonArray data;
    if (request.startsWith("GET /trpc/models.providers?")) {
     data = {QJsonObject{{"provider", "test"}, {"access", "remote_api"}, {"capabilities", QJsonArray{"upscale_image"}}},
             QJsonObject{{"provider", "other"}, {"access", "remote_api"}, {"capabilities", QJsonArray{"upscale_image"}}}};
    } else if (request.startsWith("GET /trpc/settings.providerCatalog?")) {
     data = {QJsonObject{{"provider", "test"}, {"configured", false}}};
    } else if (request.startsWith("GET /trpc/models.imageByProvider?")) {
     data = {QJsonObject{{"id", "full/model-id"}, {"name", "Test model"}, {"path", "weights.bin"}, {"supported_tasks", QJsonArray{"upscale"}}},
             QJsonObject{{"id", "wrong-task"}, {"supported_tasks", QJsonArray{"text_to_image"}}},
             QJsonObject{{"id", "undeclared"}}};
    }
    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
   });
  });
  ModelPickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "secret", "authorized-user");
  QQmlEngine engine;
  engine.addImportPath("qrc:/qt/qml");
  engine.rootContext()->setContextProperty("modelPickerController", &controller);
  QQmlComponent component(&engine, QUrl("qrc:/editor/ModelPropertyEditor.qml"));
  QTRY_VERIFY2(component.status() != QQmlComponent::Loading, qPrintable(component.errorString()));
  QVERIFY2(!component.isError(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> item(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "model"}, {"label", "Model"}, {"modelType", "image_model"}, {"allowedProviders", QStringList{"test"}}, {"modelTasks", QStringList{"upscale"}}}}, {"value", QVariantMap{{"id", "full/model-id"}, {"provider", "test"}}}, {"writable", true}}));
  QVERIFY2(item != nullptr, qPrintable(component.errorString()));
  auto* catalog = qobject_cast<nt::modelpicker::Catalog*>(controller.catalogFor("image_model", {"test"}, {"upscale"}));
  QVERIFY(catalog);
  QTRY_VERIFY(catalog->loaded() && !catalog->loading() && !controller.loading());
  // The provider restriction and the strict task filter both apply.
  QCOMPARE(catalog->models().size(), 1);
  for (const auto& request : requests) {
   QVERIFY(request.contains("Authorization: Bearer secret"));
   QVERIFY(request.toLower().contains("x-user-id: authorized-user"));
  }
  auto* button = item->findChild<QObject*>("model-select-model"); QVERIFY(button);
  QTRY_VERIFY(button->property("text").toString().startsWith("Test model"));
  auto* warning = item->findChild<QObject*>("model-warning-model"); QVERIFY(warning);
  QTRY_VERIFY(warning->property("text").toString().contains("needs an API key"));
  auto* picker = item->findChild<QObject*>("sharedModelPicker"); QVERIFY(picker);
  QSignalSpy committed(item.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(picker, "choose", Q_ARG(QVariant, "full/model-id"), Q_ARG(QVariant, "test")));
  QCOMPARE(committed.size(), 1);
  const auto selected = committed.first().first().toMap();
  QCOMPARE(selected.value("id").toString(), "full/model-id");
  QCOMPARE(selected.value("type").toString(), "image_model");
  QCOMPARE(selected.value("provider").toString(), "test");
  QCOMPARE(selected.value("path").toString(), "weights.bin");
  WorkflowDocument document;
  document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", QJsonObject{{"type", "image_model"}}}}}}}});
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
  QVERIFY(QMetaObject::invokeMethod(picker, "choose", Q_ARG(QVariant, "full/model-id"), Q_ARG(QVariant, "test")));
  QCOMPARE(committed.size(), 1);
  controller.configure({}, {}, {});
  QVERIFY(catalog->models().isEmpty());
 }
 void huggingFaceAndVoiceValues() {
  ModelPickerController controller;
  QQmlEngine engine;
  engine.addImportPath("qrc:/qt/qml");
  engine.rootContext()->setContextProperty("modelPickerController", &controller);
  QQmlComponent component(&engine, QUrl("qrc:/editor/ModelPropertyEditor.qml"));
  QTRY_VERIFY2(component.status() != QQmlComponent::Loading, qPrintable(component.errorString()));
  QVERIFY2(!component.isError(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> hf(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "model"}, {"modelType", "hf.text_to_image"}}}, {"value", QVariantMap{{"type", "hf.text_to_image"}, {"repo_id", "org/repo"}, {"path", "a.safetensors"}}}, {"writable", true}}));
  QVERIFY2(hf != nullptr, qPrintable(component.errorString()));
  QCOMPARE(hf->property("selectedId").toString(), "org/repo:a.safetensors");
  QVariant result;
  const QVariant chosen = QVariantMap{{"id", "org/repo:b.safetensors"}, {"provider", "huggingface"}};
  QVERIFY(QMetaObject::invokeMethod(hf.get(), "valueFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, chosen)));
  auto value = result.value<QJSValue>().toVariant().toMap();
  QCOMPARE(value.value("repo_id").toString(), "org/repo");
  QCOMPARE(value.value("path").toString(), "b.safetensors");
  QCOMPARE(value.value("type").toString(), "hf.text_to_image");
  QVERIFY(!value.contains("id"));
  std::unique_ptr<QObject> tts(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "voice"}, {"modelType", "tts_model"}}}, {"value", QVariantMap{{"type", "tts_model"}, {"id", "t"}, {"provider", "p"}, {"voices", QStringList{"a", "b"}}, {"selected_voice", "a"}}}, {"writable", true}}));
  QVERIFY2(tts != nullptr, qPrintable(component.errorString()));
  QSignalSpy committed(tts.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(tts.get(), "commitVoice", Q_ARG(QVariant, "b")));
  QCOMPARE(committed.size(), 1);
  value = committed.first().first().toMap();
  QCOMPARE(value.value("selected_voice").toString(), "b");
  QCOMPARE(value.value("id").toString(), "t");
 }
 void cancelAndScopeReset() {
  QTemporaryDir settings;
  QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
  QTcpServer server;
  QVERIFY(server.listen(QHostAddress::LocalHost));
  QPointer<QTcpSocket> held;
  connect(&server, &QTcpServer::newConnection, &server, [&] { held = server.nextPendingConnection(); });
  ModelPickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "first-account", "first");
  auto* catalog = qobject_cast<nt::modelpicker::Catalog*>(controller.catalogFor("language_model", {}, {}));
  QVERIFY(catalog);
  QTRY_VERIFY(held);
  QVERIFY(controller.loading());
  controller.configure({}, {}, {});
  QVERIFY(!controller.loading());
  QVERIFY(!catalog->loading());
  QVERIFY(catalog->models().isEmpty());
  QCoreApplication::processEvents();
  QVERIFY(controller.error().isEmpty());
  controller.configure(QUrl("http://remote.example"), "secret", "second");
  QVERIFY(!controller.error().isEmpty());
  QVERIFY(!controller.loading());
 }
 void typedBoundary() {
  const QJsonObject declaration{{"type", QJsonObject{{"type", "language_model"}}}, {"default", QJsonObject{{"provider", "locked"}}}};
  QCOMPARE(propertyKind(declaration), "model");
  QVERIFY(validatePropertyValue(declaration, "legacy/model").isEmpty());
  QVERIFY(!validatePropertyValue(declaration, QJsonObject{{"type", "language_model"}, {"id", "m"}, {"provider", "other"}}).isEmpty());
  QVERIFY(validatePropertyValue(declaration, QJsonObject{{"type", "language_model"}, {"id", "m"}, {"provider", "locked"}}).isEmpty());
  QVERIFY(!validatePropertyValue(declaration, 42).isEmpty());
  QVERIFY(!validatePropertyValue(declaration, QJsonObject{{"type", "image_model"}, {"id", "m"}, {"provider", "locked"}}).isEmpty());
  const auto kindOf = [](const char* type) { return propertyKind(QJsonObject{{"type", QJsonObject{{"type", type}}}}); };
  for (const auto* type : {"image_model", "video_model", "tts_model", "asr_model", "music_model", "embedding_model", "rerank_model", "audio_to_audio_model", "hf.text_to_image"}) {
   QCOMPARE(kindOf(type), QString("model"));
  }
  QCOMPARE(kindOf("model_3d_model"), QString("unsupported"));
  // A media default names a provider without locking the field to it.
  const QJsonObject image{{"type", QJsonObject{{"type", "image_model"}}}, {"default", QJsonObject{{"provider", "fal"}}}};
  QVERIFY(validatePropertyValue(image, QJsonObject{{"type", "image_model"}, {"id", "m"}, {"provider", "other"}}).isEmpty());
  const QJsonObject hf{{"type", QJsonObject{{"type", "hf.text_to_image"}}}};
  QVERIFY(validatePropertyValue(hf, QJsonObject{{"type", "hf.text_to_image"}, {"repo_id", "org/repo"}, {"path", QJsonValue::Null}}).isEmpty());
 }
};
QTEST_MAIN(ModelPickerTest)
#include "ModelPickerTest.moc"
