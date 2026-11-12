#include "properties/AssetPickerController.h"
#include "properties/ResourcePickerController.h"
#include "properties/PropertyFields.h"
#include "document/WorkflowDocument.h"
#include "media/MediaResolver.h"
#include "media/VideoFrameView.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QFile>
#include <QJSValue>
#include <QImage>
#include <QBuffer>
#include <QQuickItem>
#include <QMediaPlayer>
#include <memory>
#include <QtQml/QQmlExtensionPlugin>
#include "interfaces/PropertyHost.h"

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)
using namespace nodetool::node_editor;
// The property interface with a document whose replacement bumps its epoch,
// and a count of the commits it asked for.
struct FieldHost {
 FieldHost() {
  host.setSelection("node");
  QObject::connect(&document, &WorkflowDocument::replaced, &host, [this] { host.setDocumentEpoch(host.documentEpoch() + 1); });
  QObject::connect(&host, &PropertyHost::commitRequested, &host, [this] { ++commits; });
 }
 WorkflowDocument document;
 PropertyHost host;
 int commits = 0;
};
class AssetPickerTest final : public QObject {
 Q_OBJECT
 static QQuickItem* findPreview(QQuickItem* item) {
  if (item->metaObject()->indexOfProperty("resolvedSource") >= 0) return item;
  for (auto* child : item->childItems()) { if (auto* found = findPreview(child)) return found; }
  return nullptr;
 }
private slots:
 void typedSelectionUploadAndIsolation() {
  registerMediaTypes();
  const QString id = "abcdef0123456789abcdef0123456789";
  QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
  QList<QByteArray> requests;
  bool fail = false;
  connect(&server, &QTcpServer::newConnection, &server, [&] {
   auto* socket = server.nextPendingConnection();
   // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
   auto buffer = std::make_shared<QByteArray>();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket, buffer] {
    buffer->append(socket->readAll());
    const auto headerEnd = buffer->indexOf("\r\n\r\n"); if (headerEnd < 0) return;
    const auto lines = buffer->left(headerEnd).split('\n');
    qint64 length = 0;
    for (const auto& line : lines) { if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toLongLong(); }
    if (buffer->size() < headerEnd + 4 + length) return;
    requests.append(*buffer);
    const QJsonObject asset{{"id", id}, {"name", "Library image"}, {"content_type", "image/png"}};
    const bool upload = buffer->startsWith("POST ");
    const auto body = QJsonDocument(upload ? asset : QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"assets", QJsonArray{asset}}, {"next_cursor", "next-page"}}}}}}).toJson(QJsonDocument::Compact);
    socket->write(QByteArray("HTTP/1.1 ") + (fail ? "500 Failed" : "200 OK") + "\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
   });
  });
  AssetPickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "secret", "scope-user");
  QSignalSpy listed(&controller, &AssetPickerController::listed);
  QSignalSpy uploaded(&controller, &AssetPickerController::uploaded);
  QSignalSpy failed(&controller, &AssetPickerController::failed);
  controller.search("list", "image", "library", "cursor-full");
  QTRY_COMPARE(listed.count(), 1);
  QCOMPARE(listed.first().at(1).toList().first().toMap().value("id").toString(), id);
  QCOMPARE(listed.first().at(2).toString(), "next-page");
  QVERIFY(requests.first().contains("assets.search"));
  QVERIFY(QUrl::fromPercentEncoding(requests.first()).contains("cursor-full"));
  QTemporaryDir directory;
  const auto path = directory.filePath("picture.png");
  QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QByteArray::fromHex("89504e470d0a1a0a")); file.close();
  controller.upload("upload", "image", QUrl::fromLocalFile(path));
  QTRY_COMPARE(uploaded.count(), 1);
  const auto reference = uploaded.first().at(1).toMap();
  QCOMPARE(reference.value("asset_id").toString(), id);
  QCOMPARE(reference.value("uri").toString(), "asset://" + id);
  QCOMPARE(reference.value("type").toString(), "image");
  QVERIFY(requests.last().contains("name=\"file\""));
  QVERIFY(requests.last().contains("\"parent_id\":\"scope-user\""));
  for (const auto& request : requests) {
   QVERIFY(request.contains("Authorization: Bearer secret"));
   QVERIFY(request.toLower().contains("x-user-id: scope-user"));
  }
  MediaResolver resolver;
  QQmlEngine engine;
  engine.rootContext()->setContextProperty("assetPickerController", &controller);
  engine.rootContext()->setContextProperty("mediaResolver", &resolver);
  QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AssetPropertyEditor.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading);
  QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> item(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "picture"}, {"dataType", QVariantMap{{"type", "image"}}}}}, {"value", QVariant{}}, {"writable", true}, {"nodeId", "node-a"}}));
  QVERIFY2(item, qPrintable(component.errorString()));
  QSignalSpy commit(item.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(item.get(), "search", Q_ARG(QVariant, false)));
  QTRY_COMPARE(requests.size(), 3);
  auto* select = item->findChild<QObject*>("asset-select-picture"); QVERIFY(select);
  QTRY_VERIFY(select->property("enabled").toBool());
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, id)));
  QCOMPARE(commit.count(), 1);
  auto selected = commit.first().first();
  if (selected.canConvert<QJSValue>()) selected = selected.value<QJSValue>().toVariant();
  QCOMPARE(selected.toMap(), reference);
  WorkflowDocument document;
  document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "picture"}, {"type", QJsonObject{{"type", "image"}}}}}}}});
  QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}}));
  QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "picture"}, {"value", QJsonObject::fromVariantMap(reference)}}));
  QCOMPARE(document.undoStack()->count(), 1);
  document.undo(); QVERIFY(!document.node("n").value("data").toObject().contains("picture"));
  document.redo(); WorkflowDocument reopened; QVERIFY(reopened.load(document.snapshot()));
  QCOMPARE(reopened.node("n").value("data").toObject().value("picture").toObject().value("uri").toString(), "asset://" + id);
  const auto staleUploadKey = item->property("uploadKey").toString();
  QVERIFY(QMetaObject::invokeMethod(item.get(), "uploadFile", Q_ARG(QVariant, QUrl::fromLocalFile(path))));
  item->setProperty("nodeId", "node-b");
  emit controller.uploaded(staleUploadKey, reference);
  QCoreApplication::processEvents();
  QCOMPARE(commit.count(), 1);
  // The signal above is a deliberately late completion. It must never commit
  // to the newly selected node even if an external producer emits it.
  uploaded.clear();
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, id)));
  QCOMPARE(commit.count(), 1);
  item->setProperty("writable", false);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "uploadFile", Q_ARG(QVariant, QUrl::fromLocalFile(path))));
  QCOMPARE(uploaded.count(), 0);
  fail = true;
  controller.search("fail-list", "image", ""); QTRY_COMPARE(failed.count(), 1);
  controller.upload("fail-upload", "image", QUrl::fromLocalFile(path)); QTRY_COMPARE(failed.count(), 2);
  controller.upload("invalid", "audio", QUrl::fromLocalFile(path)); QCOMPARE(failed.count(), 3);
  controller.search("cancel-list", "image", ""); controller.cancel("cancel-list");
  controller.upload("cancel-upload", "image", QUrl::fromLocalFile(path)); controller.configure({}, {}, {});
  QCoreApplication::processEvents(); QCOMPARE(uploaded.count(), 0); QCOMPARE(listed.count(), 2); QCOMPARE(failed.count(), 3);
 }
 void dispatchAndConnectedLock() {
  registerMediaTypes();
  AssetPickerController controller;
  MediaResolver resolver;
  FieldHost host;
  QQmlEngine engine;
  engine.rootContext()->setContextProperty("assetPickerController", &controller);
  engine.rootContext()->setContextProperty("mediaResolver", &resolver);
  QJsonObject property{{"name", "picture"}, {"type", QJsonObject{{"type", "image"}}}, {"required", true}};
  const QJsonObject metadata{{"properties", QJsonArray{property}}};
  const QJsonObject node{{"id", "node"}, {"data", QJsonObject{}}};
  auto fields = propertyFields(node, metadata, {});
  QCOMPARE(fields.size(), 1);
  QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/PropertyField.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading);
  QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> field(component.createWithInitialProperties({{"descriptor", fields.first()}, {"host", QVariant::fromValue(&host.host)}, {"nodeId", "node"}}));
  QVERIFY2(field, qPrintable(component.errorString()));
  auto* button = field->findChild<QObject*>("asset-upload-picture");
  QVERIFY(button); QVERIFY(button->property("enabled").toBool());
  auto* editor = field->findChild<QObject*>("asset-editor-picture"); QVERIFY(editor);
  const QVariant reference = QVariantMap{{"type", "image"}, {"asset_id", "abcdef0123456789abcdef0123456789"}, {"uri", "asset://abcdef0123456789abcdef0123456789"}};
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, reference)));
  controller.configure({}, {}, {});
  QCoreApplication::processEvents();
  QCOMPARE(host.commits, 0);
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, reference)));
  QTRY_COMPARE(host.commits, 1);
  const QJsonObject snapshot{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "node"}, {"type", "test"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}};
  QVERIFY(host.document.load(snapshot));
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, reference)));
  QVERIFY(host.document.load(snapshot));
  QCoreApplication::processEvents(); QCOMPARE(host.commits, 1);
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, reference)));
  host.host.setReadOnly(true); QCoreApplication::processEvents(); QCOMPARE(host.commits, 1);
  QTRY_VERIFY(!button->property("enabled").toBool());
  host.host.setReadOnly(false);
  const QJsonArray edges{QJsonObject{{"target", "node"}, {"targetHandle", "picture"}}};
  fields = propertyFields(node, metadata, edges);
  QVERIFY(!fields.first().toMap().value("editable").toBool());
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, reference)));
  field->setProperty("descriptor", fields.first()); QCoreApplication::processEvents(); QCOMPARE(host.commits, 1);
  QTRY_VERIFY(!button->property("enabled").toBool());
  QCOMPARE(host.commits, 1);
 }
 void workflowDispatchAndScope() {
  registerMediaTypes();
  ResourcePickerController controller;
  MediaResolver resolver;
  FieldHost host;
  QQmlEngine engine;
  engine.rootContext()->setContextProperty("resourcePickerController", &controller);
  engine.rootContext()->setContextProperty("mediaResolver", &resolver);
  const QJsonObject listType{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "workflow"}}}}};
  const QJsonObject property{{"name", "workflows"}, {"type", listType}, {"required", true}};
  const QJsonObject metadata{{"properties", QJsonArray{property}}};
  const QJsonObject node{{"id", "node"}, {"data", QJsonObject{{"workflows", QJsonArray{}}}}};
  auto fields = propertyFields(node, metadata, {});
  QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/PropertyField.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading);
  QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> field(component.createWithInitialProperties({{"descriptor", fields.first()}, {"host", QVariant::fromValue(&host.host)}, {"nodeId", "node"}}));
  QVERIFY2(field, qPrintable(component.errorString()));
  auto* editor = field->findChild<QObject*>("workflow-editor-workflows"); QVERIFY(editor);
  const QVariant references = QVariantList{QVariantMap{{"type", "workflow"}, {"id", "abcdef0123456789abcdef0123456789"}, {"future", "kept"}}};
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, references)));
  controller.configure({}, {}, {}); QCoreApplication::processEvents(); QCOMPARE(host.commits, 0);
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, references))); QTRY_COMPARE(host.commits, 1);
  host.host.setReadOnly(true);
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, references))); QCoreApplication::processEvents(); QCOMPARE(host.commits, 1);
  host.host.setReadOnly(false);
  fields = propertyFields(node, metadata, QJsonArray{QJsonObject{{"target", "node"}, {"targetHandle", "workflows"}}});
  field->setProperty("descriptor", fields.first());
  QVERIFY(!editor->property("writable").toBool());
  QVERIFY(QMetaObject::invokeMethod(editor, "valueCommitted", Q_ARG(QVariant, references))); QCoreApplication::processEvents(); QCOMPARE(host.commits, 1);
 }
 void mediaListsAndGenericAssets() {
  registerMediaTypes();
  QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
  QList<QByteArray> requests;
  int uploads = 0;
  bool hold = false;
  QPointer<QTcpSocket> held;
  connect(&server, &QTcpServer::newConnection, &server, [&] {
   auto* socket = server.nextPendingConnection();
   // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
   auto buffer = std::make_shared<QByteArray>();
   connect(socket, &QTcpSocket::readyRead, socket, [&, socket, buffer] {
    buffer->append(socket->readAll());
    const auto headerEnd = buffer->indexOf("\r\n\r\n"); if (headerEnd < 0) return;
    qint64 length = 0;
    for (const auto& line : buffer->left(headerEnd).split('\n')) { if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toLongLong(); }
    if (buffer->size() < headerEnd + 4 + length) return;
    requests.append(*buffer);
    if (hold) { held = socket; return; }
    const bool upload = buffer->startsWith("POST ");
    const QString id = QString::number(upload ? ++uploads : 99).rightJustified(32, '0');
    const QJsonObject asset{{"id", id}, {"name", "Library file"}, {"content_type", buffer->contains("image/png") ? "image/png" : "application/octet-stream"}};
    const auto body = QJsonDocument(upload ? asset : QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"assets", QJsonArray{asset, QJsonObject{{"id", "folder"}, {"content_type", "folder"}}}}, {"next_cursor", QJsonValue::Null}}}}}}).toJson(QJsonDocument::Compact);
    socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
   });
  });
  AssetPickerController controller;
  controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "secret", "owner");
  MediaResolver resolver;
  QQmlEngine engine;
  engine.rootContext()->setContextProperty("assetPickerController", &controller);
  engine.rootContext()->setContextProperty("mediaResolver", &resolver);
  QTemporaryDir directory;
  const auto png = directory.filePath("image.png"); QFile file(png); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QByteArray::fromHex("89504e470d0a1a0a")); file.close();
  const auto other = directory.filePath("data.bin"); QFile binary(other); QVERIFY(binary.open(QIODevice::WriteOnly)); binary.write("arbitrary data"); binary.close();
  QImage inlineImage(1, 1, QImage::Format_ARGB32); inlineImage.fill(Qt::green); QByteArray inlineBytes; QBuffer inlineBuffer(&inlineBytes); inlineBuffer.open(QIODevice::WriteOnly); QVERIFY(inlineImage.save(&inlineBuffer, "PNG"));
  const QVariantMap old{{"type", "image"}, {"uri", "data:image/png;base64," + QString::fromLatin1(inlineBytes.toBase64())}, {"future", QVariantMap{{"clip", 7}}}};
  const QVariantMap descriptor{{"name", "images"}, {"kind", "media_list"}, {"mediaType", "image"}, {"dataType", QVariantMap{{"type", "list"}}}};
  QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/MediaListPropertyEditor.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading); QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  std::unique_ptr<QObject> item(component.createWithInitialProperties({{"descriptor", descriptor}, {"value", QVariantList{old}}, {"writable", true}, {"nodeId", "same"}}));
  QVERIFY2(item, qPrintable(component.errorString()));
  QSignalSpy commits(item.get(), SIGNAL(valueCommitted(QVariant)));
  auto* priorPreview = findPreview(qobject_cast<QQuickItem*>(item.get())); QVERIFY(priorPreview);
  QPointer<QMediaPlayer> priorPlayer = priorPreview->findChild<QMediaPlayer*>(); QVERIFY(priorPlayer);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "resetScope")); QTRY_VERIFY(priorPlayer.isNull());
  QTRY_VERIFY(findPreview(qobject_cast<QQuickItem*>(item.get())));
  auto* picker = item->findChild<QObject*>("asset-editor-images"); QVERIFY(picker);
  const QVariant urls = QVariantList{QUrl::fromLocalFile(png), QUrl::fromLocalFile(png)};
  QVERIFY(QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, urls)));
  QTRY_COMPARE(commits.count(), 1); QCOMPARE(uploads, 2);
  auto unpack = [](QVariant value) { return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value; };
  auto refs = unpack(commits.last().first()).toList(); QCOMPARE(refs.size(), 3); QCOMPARE(refs.first().toMap(), old);
  QCOMPARE(refs.at(1).toMap().value("asset_id").toString(), QString("1").rightJustified(32, '0'));
  QCOMPARE(refs.at(2).toMap().value("asset_id").toString(), QString("2").rightJustified(32, '0'));
  item->setProperty("value", refs);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "moveAt", Q_ARG(QVariant, 0), Q_ARG(QVariant, 1))); QCOMPARE(commits.count(), 2);
  auto moved = unpack(commits.last().first()).toList(); QCOMPARE(moved.at(1).toMap(), old);
  item->setProperty("value", moved);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "removeAt", Q_ARG(QVariant, 0))); QCOMPARE(commits.count(), 3);
  QCOMPARE(unpack(commits.last().first()).toList().first().toMap(), old);
  const QVariant invalidBatch = QVariantList{QUrl::fromLocalFile(png), QUrl::fromLocalFile(other)};
  QVERIFY(QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, invalidBatch)));
  QTRY_VERIFY(!picker->property("uploading").toBool()); QCOMPARE(commits.count(), 3); QVERIFY(!picker->property("error").toString().isEmpty());
  QVERIFY(QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, urls)));
  const auto oldKey = picker->property("uploadKey").toString(); item->setProperty("nodeId", "different");
  emit controller.uploaded(oldKey, {{"type", "image"}, {"uri", "asset://late"}, {"asset_id", "late"}}); QCoreApplication::processEvents(); QCOMPARE(commits.count(), 3);
  item->setProperty("writable", false);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "removeAt", Q_ARG(QVariant, 0))); QCOMPARE(commits.count(), 3);
  QQmlComponent generic(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AssetPropertyEditor.qml")); QTRY_VERIFY(generic.status() != QQmlComponent::Loading);
  std::unique_ptr<QObject> asset(generic.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "file"}, {"mediaType", "asset"}, {"dataType", QVariantMap{{"type", "asset"}}}}}, {"value", QVariantMap{{"type", "asset"}, {"id", "legacy"}, {"future", 9}}}, {"writable", true}, {"nodeId", "same"}}));
  QVERIFY2(asset, qPrintable(generic.errorString()));
  QSignalSpy assetCommits(asset.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(asset.get(), "search", Q_ARG(QVariant, false)));
  auto* select = asset->findChild<QObject*>("asset-select-file"); QVERIFY(select); QTRY_VERIFY(select->property("enabled").toBool());
  QVERIFY(!QUrl::fromPercentEncoding(requests.last()).contains("content_type"));
  QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, QString("99").rightJustified(32, '0')))); QCOMPARE(assetCommits.count(), 1);
  const auto genericRef = unpack(assetCommits.first().first()).toMap(); QCOMPARE(genericRef.value("type").toString(), "asset"); QCOMPARE(genericRef.value("future").toInt(), 9); QCOMPARE(genericRef.value("id"), genericRef.value("asset_id"));
  WorkflowDocument genericDocument;
  genericDocument.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "file"}, {"type", QJsonObject{{"type", "asset"}}}}}}}});
  const QJsonObject oldGeneric{{"type", "asset"}, {"id", "legacy"}, {"future", 9}};
  QVERIFY(genericDocument.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"file", oldGeneric}}}}}}, {"edges", QJsonArray{}}}}}));
  QVERIFY(genericDocument.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "file"}, {"value", QJsonObject::fromVariantMap(genericRef)}}));
  QCOMPARE(genericDocument.undoStack()->count(), 1); genericDocument.undo(); QCOMPARE(genericDocument.node("n").value("data").toObject().value("file").toObject(), oldGeneric);
  genericDocument.redo(); WorkflowDocument genericReopened; QVERIFY(genericReopened.load(genericDocument.snapshot()));
  QCOMPARE(genericReopened.node("n").value("data").toObject().value("file").toObject(), QJsonObject::fromVariantMap(genericRef));
  QVERIFY(QMetaObject::invokeMethod(asset.get(), "uploadFile", Q_ARG(QVariant, QUrl::fromLocalFile(other)))); QTRY_COMPARE(assetCommits.count(), 2);
  FieldHost host;
  const QJsonObject listType{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "image"}}}}};
  const QJsonObject declaration{{"name", "images"}, {"type", listType}};
  const QJsonObject metadata{{"properties", QJsonArray{declaration}}};
  const QJsonObject node{{"id", "node"}, {"type", "test"}, {"data", QJsonObject{{"images", QJsonArray{}}}}};
  const QJsonObject snapshot{{"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}};
  QVERIFY(host.document.load(snapshot));
  QQmlComponent fieldComponent(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/PropertyField.qml")); QTRY_VERIFY(fieldComponent.status() != QQmlComponent::Loading);
  std::unique_ptr<QObject> field(fieldComponent.createWithInitialProperties({{"descriptor", propertyFields(node, metadata, {}).first()}, {"host", QVariant::fromValue(&host.host)}, {"nodeId", "node"}}));
  QVERIFY2(field, qPrintable(fieldComponent.errorString()));
  auto* pendingPicker = field->findChild<QObject*>("asset-editor-images"); QVERIFY(pendingPicker);
  hold = true;
  QVERIFY(QMetaObject::invokeMethod(pendingPicker, "uploadFiles", Q_ARG(QVariant, urls)));
  QTRY_VERIFY(held);
  const auto pendingKey = pendingPicker->property("uploadKey").toString();
  QVERIFY(host.document.load(snapshot));
  emit controller.uploaded(pendingKey, {{"type", "image"}, {"uri", "asset://late"}, {"asset_id", "late"}});
  QCoreApplication::processEvents(); QCOMPARE(host.commits, 0); QVERIFY(!pendingPicker->property("uploading").toBool());
 }
 void mediaTypes() {
  for (const auto& kind : {QString("image"), QString("audio"), QString("video")}) {
   const QJsonObject property{{"type", QJsonObject{{"type", kind}}}};
   QCOMPARE(propertyKind(property), "media");
   const QJsonObject listType{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", kind}}}}};
   const QJsonObject listProperty{{"name", "media"}, {"type", listType}};
   QCOMPARE(propertyKind(listProperty), "media_list");
   const QJsonArray values{QJsonObject{{"type", kind}, {"asset_id", "abcdef0123456789abcdef0123456789"}, {"uri", "asset://abcdef0123456789abcdef0123456789"}, {"future", 7}}};
   QVERIFY(validatePropertyValue(listProperty, values).isEmpty());
   const QJsonObject alias{{"type", QJsonObject{{"type", kind + "_list"}}}};
   QCOMPARE(propertyKind(alias), "media_list"); QVERIFY(validatePropertyValue(alias, values).isEmpty());
   const QJsonObject metadata{{"node_type", "test"}, {"append_static_inputs", QJsonArray{"media"}}, {"properties", QJsonArray{listProperty}}};
   const QJsonObject node{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"media", QJsonArray{}}}}};
   const QJsonArray edge{QJsonObject{{"target", "n"}, {"targetHandle", "media"}}};
   auto rows = propertyFields(node, metadata, edge); QVERIFY(rows.first().toMap().value("editable").toBool()); QVERIFY(rows.first().toMap().value("appendStatic").toBool());
   auto locked = metadata; locked.remove("append_static_inputs"); QVERIFY(!propertyFields(node, locked, edge).first().toMap().value("editable").toBool());
   WorkflowDocument document; document.setNodeMetadata({metadata});
   QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}}));
   QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "media"}, {"value", values}})); QCOMPARE(document.undoStack()->count(), 1);
   document.undo(); QVERIFY(document.node("n").value("data").toObject().value("media").toArray().isEmpty()); document.redo(); WorkflowDocument reopened; QVERIFY(reopened.load(document.snapshot()));
   QCOMPARE(reopened.node("n").value("data").toObject().value("media").toArray(), values);
   QVERIFY(validatePropertyValue(property, QJsonObject{{"type", kind}, {"asset_id", "abcdef0123456789abcdef0123456789"}, {"uri", "asset://abcdef0123456789abcdef0123456789"}}).isEmpty());
   QVERIFY(!validatePropertyValue(property, QJsonObject{{"type", "other"}, {"uri", "asset://wrong"}}).isEmpty());
  }
 }
};
QTEST_MAIN(AssetPickerTest)
#include "AssetPickerTest.moc"
