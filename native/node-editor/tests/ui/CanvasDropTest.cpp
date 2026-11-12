#include "ui/EditorWindow.h"
#include "graph/CanvasDropController.h"
#include "graph/EditorScene.h"
#include <QBuffer>
#include <QDragEnterEvent>
#include <QDragMoveEvent>
#include <QDropEvent>
#include <QFile>
#include <QGraphicsView>
#include <QImage>
#include <QJsonDocument>
#include <QMimeData>
#include <QPointer>
#include <QRegularExpression>
#include <QScopeGuard>
#include <QUuid>
#include <QQuickItem>
#include <QQuickWidget>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QWebSocketServer>
#include <QDir>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include <cmath>
using namespace nodetool;
namespace {
QJsonArray metadata() {
  QJsonArray result;
  const QHash<QString, QString> kinds{{"Image", "image"}, {"Audio", "audio"}, {"Video", "video"}, {"Document", "document"}, {"Model3D", "model_3d"}, {"String", "str"}, {"DataFrame", "dataframe"}};
  for (auto it = kinds.begin(); it != kinds.end(); ++it) {
    result.append(QJsonObject{{"node_type", "nodetool.constant." + it.key()}, {"title", it.key()},
      {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", it.value()}}}, {"default", QJsonValue::Null}}, QJsonObject{{"name", "extra"}, {"type", QJsonObject{{"type", "str"}}}, {"default", "kept"}}}},
      {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", it.value()}}}}}}});
  }
  result.append(QJsonObject{{"node_type", "nodetool.input.AssetFolderInput"}, {"title", "Asset folder"}, {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "folder"}}}}, QJsonObject{{"name", "name"}, {"type", QJsonObject{{"type", "str"}}}, {"default", "folder"}}}}});
  return result;
}
class Server final : public QTcpServer {
public:
  struct Pending { QPointer<QTcpSocket> socket; QJsonObject body; int status; };
  QJsonObject workflow{{"id", "bound"}, {"updated_at", "r1"}, {"name", "Canvas drop fixture"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
  QHash<QString, QJsonObject> assets;
  QHash<QString, QByteArray> contents;
  QWebSocketServer websocket{"drop socket", QWebSocketServer::NonSecureMode};
  QList<QJsonObject> uploadMetadata;
  QList<QByteArray> requests;
  QList<Pending> pending;
  QList<QPair<QPointer<QTcpSocket>, QByteArray>> pendingText;
  QByteArray png;
  int uploadStatus = 200, assetStatus = 200, uploads = 0;
  bool delayUpload = false, delayAsset = false, delayContent = false, mismatchId = false;
  Server() {
    QImage image(12, 12, QImage::Format_RGB32); image.fill(Qt::blue); QBuffer buffer(&png); buffer.open(QIODevice::WriteOnly); image.save(&buffer, "PNG");
    listen(QHostAddress::LocalHost);
    connect(&websocket, &QWebSocketServer::newConnection, this, [this] { auto *peer = websocket.nextPendingConnection(); peer->setParent(this); });
    connect(this, &QTcpServer::newConnection, this, [this] {
      while (hasPendingConnections()) {
        auto *socket = nextPendingConnection(); socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
          if (socket->peek(32).startsWith("GET /ws ")) { socket->disconnect(this); websocket.handleConnection(socket); return; }
          const auto bytes = socket->property("bytes").toByteArray() + socket->readAll(); socket->setProperty("bytes", bytes);
          const auto end = bytes.indexOf("\r\n\r\n"); if (end < 0 || socket->property("done").toBool()) return;
          qint64 length = 0; for (const auto &line : bytes.left(end).split('\n')) if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toLongLong();
          if (bytes.size() < end + 4 + length) return; socket->setProperty("done", true); requests.append(bytes);
          const auto target = bytes.split(' ').value(1); const auto url = QUrl("http://fixture" + QString::fromUtf8(target));
          QJsonObject response; int status = 200;
          if (target.startsWith("/api/nodes/metadata")) response = {{"nodes", metadata()}};
          else if (target == "/api/workflows/bound") response = workflow;
          else if (target == "/api/assets" && bytes.startsWith("POST")) {
            ++uploads;
            const auto marker = bytes.indexOf("name=\"json\""); const auto begin = bytes.indexOf("\r\n\r\n", marker) + 4;
            const auto stop = bytes.indexOf("\r\n--", begin);
            const auto fields = QJsonDocument::fromJson(bytes.mid(begin, stop - begin)).object(); uploadMetadata.append(fields);
            const auto id = QString::number(uploads, 16).rightJustified(32, '0');
            response = {{"id", id}, {"name", fields["name"]}, {"content_type", fields["content_type"]}, {"workflow_id", fields["workflow_id"]}, {"user_id", "1"}, {"get_url", "/api/content/" + id}};
            assets[id] = response; status = uploadStatus;
            if (delayUpload) { pending.append({socket, response, status}); return; }
          } else if (target.startsWith("/trpc/assets.get")) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input").toUtf8()).object(); const auto requested = input["id"].toString();
            auto id = requested;
            if (requested.size() == 12) { QStringList matches; for (auto it = assets.begin(); it != assets.end(); ++it) if (it.key().left(12) == requested) matches.append(it.key()); if (matches.size() == 1) id = matches.first(); else status = 409; }
            auto asset = assets.value(id); if (asset.isEmpty() && status == 200) status = 404; if (assetStatus != 200) status = assetStatus;
            if (mismatchId) asset["id"] = "ffffffffffffffffffffffffffffffff";
            response = {{"result", QJsonObject{{"data", asset}}}};
            if (delayAsset) { pending.append({socket, response, status}); return; }
          } else if (target.startsWith("/trpc/assets.list") || target.startsWith("/trpc/assets.search")) response = {{"result", QJsonObject{{"data", QJsonObject{{"assets", QJsonArray{}}, {"next", QJsonValue::Null}}}}}};
          else if (target.startsWith("/api/content/")) { const auto content = contents.value(url.path().section('/', -1), png); if (delayContent) pendingText.append({socket, content}); else send(socket, content); return; }
          send(socket, QJsonDocument(response).toJson(QJsonDocument::Compact), status);
        });
      }
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
  void send(QTcpSocket *socket, const QByteArray &body, int status = 200) {
    if (!socket || socket->state() == QAbstractSocket::UnconnectedState) return;
    socket->write("HTTP/1.1 " + QByteArray::number(status) + " Response\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body); socket->disconnectFromHost();
  }
  void release() { const auto queued = pending; pending.clear(); for (const auto &row : queued) if (row.socket) send(row.socket, QJsonDocument(row.body).toJson(QJsonDocument::Compact), row.status); const auto text = pendingText; pendingText.clear(); for (const auto &row : text) if (row.first) send(row.first, row.second); }
};
}
class CanvasDropTest final : public QObject {
  Q_OBJECT
  static CanvasDropController *controller(EditorWindow &window) { return window.findChild<CanvasDropController *>(); }
  static void setup(EditorWindow &window, Server &server) {
    window.resize(1400, 1000); window.show(); window.session()->setAutosaveEnabled(false);
    window.session()->connectToServer(server.url(), "drop-token", "1"); window.session()->openWorkflow("bound");
    QTRY_VERIFY(window.session()->serverBound()); QTRY_VERIFY(controller(window)); QTest::qWait(40);
  }
  static bool drop(EditorWindow &window, QMimeData &mime, const QPointF &position) {
    auto *view = window.findChild<QGraphicsView *>(); Q_ASSERT(view);
    QDragEnterEvent enter(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier); QApplication::sendEvent(view->viewport(), &enter);
    if (!enter.isAccepted()) return false;
    QDragMoveEvent move(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier); QApplication::sendEvent(view->viewport(), &move);
    QDropEvent event(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier); QApplication::sendEvent(view->viewport(), &event); return event.isAccepted();
  }
  static QQuickWidget *uploadPanel(EditorWindow &window) {
    for (auto *panel : window.findChildren<QQuickWidget *>()) if (panel->source().fileName() == "CanvasDropPanel.qml" && panel->isVisible()) return panel;
    return nullptr;
  }
  static QQuickItem *findControl(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) return root;
    for (auto *child : root->childItems()) if (auto *found = findControl(child, name)) return found;
    return nullptr;
  }
  static void clickUpload(EditorWindow &window, const QString &name) {
    auto *panel = uploadPanel(window); QVERIFY(panel); QCOMPARE(panel->status(), QQuickWidget::Ready); QVERIFY(panel->rootObject()); auto *item = findControl(panel->rootObject(), name); QVERIFY(item); QVERIFY(item->isVisible()); QVERIFY(item->isEnabled());
    QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
  }
  static QString writeFile(const QTemporaryDir &dir, const QString &name, const QByteArray &bytes) {
    const auto path = dir.filePath(name); QFile file(path); if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size()) return {}; return path;
  }
  static QMimeData *assetMime(const QString &id, QMimeData &mime) { mime.setData("application/x-nodetool-drag", QJsonDocument(QJsonObject{{"type", "asset"}, {"payload", QJsonObject{{"id", id}, {"content_type", "image/not-authoritative"}}}}).toJson(QJsonDocument::Compact)); return &mime; }
private slots:
  void liveDisposablePngDrop() {
    const auto base = qEnvironmentVariable("NODETOOL_DROP_LIVE_URL"); if (base.isEmpty()) QSKIP("Set NODETOOL_DROP_LIVE_URL to a disposable backend");
    QNetworkAccessManager network;
    const auto request = [&](const QByteArray &method, const QString &path, const QJsonObject &body) {
      QNetworkRequest req(QUrl(base).resolved(QUrl(path))); req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json"); req.setTransferTimeout(10000);
      auto *reply = network.sendCustomRequest(req, method, method == "GET" || method == "DELETE" ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact));
      QSignalSpy done(reply, &QNetworkReply::finished); if (!reply->isFinished()) done.wait(10000);
      const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt(); const auto object = QJsonDocument::fromJson(reply->readAll()).object(); reply->deleteLater(); return qMakePair(status, object);
    };
    const auto created = request("POST", "/api/workflows", {{"name", "Native disposable drop proof"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}});
    QVERIFY(created.first >= 200 && created.first < 300); const auto workflowId = created.second["id"].toString(); QVERIFY(!workflowId.isEmpty()); QString assetId;
    auto cleanup = qScopeGuard([&] { if (!assetId.isEmpty()) request("POST", "/trpc/assets.delete", {{"id", assetId}}); request("DELETE", "/api/workflows/" + workflowId, {}); });
    EditorWindow window; window.show(); window.session()->setAutosaveEnabled(false); window.session()->connectToServer(QUrl(base), {}); window.session()->openWorkflow(workflowId);
    QTRY_VERIFY(window.session()->serverBound()); QTRY_VERIFY(!window.catalog().isEmpty()); QTRY_VERIFY(controller(window));
    QTemporaryDir dir; QImage image(12, 12, QImage::Format_RGB32); image.fill(Qt::blue); const auto path = dir.filePath("native-drop-" + QUuid::createUuid().toString(QUuid::Id128) + ".png"); QVERIFY(image.save(path));
    QMimeData mime; mime.setUrls({QUrl::fromLocalFile(path)}); QVERIFY(drop(window, mime, QPointF(200, 150))); QTRY_COMPARE_WITH_TIMEOUT(window.document()->nodes().size(), 1, 15000);
    const auto node = window.document()->nodes()[0].toObject(); QCOMPARE(node["type"].toString(), QString("nodetool.constant.Image"));
    const auto reference = node["data"].toObject()["value"].toObject(); assetId = reference["asset_id"].toString(); QCOMPARE(assetId.size(), 32); QCOMPARE(reference["uri"].toString(), "asset://" + assetId);
    const auto encoded = QString::fromLatin1(QUrl::toPercentEncoding(QString::fromUtf8(QJsonDocument(QJsonObject{{"id", assetId}}).toJson(QJsonDocument::Compact))));
    const auto fetched = request("GET", "/trpc/assets.get?input=" + encoded, {}); QCOMPARE(fetched.first, 200); const auto asset = fetched.second["result"].toObject()["data"].toObject();
    QCOMPARE(asset["id"].toString(), assetId); QCOMPARE(asset["workflow_id"].toString(), workflowId); QCOMPARE(asset["content_type"].toString(), QString("image/png"));
    QCOMPARE(request("GET", "/api/workflows/" + workflowId, {}).second["graph"].toObject()["nodes"].toArray().size(), 0);
    QCOMPARE(window.document()->undoStack()->index(), 1); window.action("Undo"); QVERIFY(window.document()->nodes().isEmpty());
    qInfo() << "Live PNG drop: uploaded once, authoritative full asset reference and workflow relation, one undo, server graph unchanged";
  }
  void fileUploadCoordinatesDefaultsAndUndo() {
    QTest::failOnWarning(QRegularExpression(".*AssetPropertyEditor.*TypeError.*"));
    Server server; EditorWindow window; setup(window, server); QVERIFY(controller(window));
    QTemporaryDir dir; QVERIFY(dir.isValid()); const auto path = writeFile(dir, "image.png", server.png); QVERIFY(!path.isEmpty());
    auto *view = window.findChild<QGraphicsView *>(); window.action("Reset zoom"); view->setTransform(QTransform::fromScale(1.6, 1.6)); view->centerOn(1200, -700);
    const QPointF point(210.5, 155.5); const auto expected = view->viewportTransform().inverted().map(point);
    QMimeData mime; mime.setUrls({QUrl::fromLocalFile(path)}); server.delayUpload = true;
    QVERIFY(drop(window, mime, point)); QTRY_COMPARE(server.uploads, 1); QVERIFY(window.document()->nodes().isEmpty()); QVERIFY(!controller(window)->transfers().isEmpty());
    QCOMPARE(server.uploadMetadata[0]["workflow_id"].toString(), QString("bound")); QCOMPARE(server.uploadMetadata[0]["parent_id"].toString(), QString("1"));
    QVERIFY(server.requests.last().contains("Authorization: Bearer drop-token")); server.delayUpload = false; server.release();
    QTRY_COMPARE(window.document()->nodes().size(), 1); const auto node = window.document()->nodes()[0].toObject();
    QCOMPARE(node["type"].toString(), QString("nodetool.constant.Image")); QCOMPARE(node["data"].toObject()["extra"].toString(), QString("kept"));
    const auto reference = node["data"].toObject()["value"].toObject(); const auto id = reference["asset_id"].toString(); QCOMPARE(id.size(), 32);
    QCOMPARE(reference["type"].toString(), QString("image")); QCOMPARE(reference["uri"].toString(), "asset://" + id);
    const auto position = node["ui_properties"].toObject()["position"].toObject(); QVERIFY(std::abs(position["x"].toDouble() - expected.x()) < 0.001); QVERIFY(std::abs(position["y"].toDouble() - expected.y()) < 0.001);
    QCOMPARE(window.document()->undoStack()->index(), 1); window.action("Undo"); QVERIFY(window.document()->nodes().isEmpty()); window.action("Redo"); QCOMPARE(window.document()->nodes()[0].toObject(), node);
  }
  void savedAssetsUseAuthoritativeTypesFullIdsAndGrid() {
    Server server; EditorWindow window; setup(window, server); QVERIFY(controller(window));
    const QString first = "abcdef0123456789abcdef0123456789", second = "fedcba9876543210fedcba9876543210";
    server.assets[first] = {{"id", first}, {"name", "Existing image"}, {"content_type", "image/png"}};
    server.assets[second] = {{"id", second}, {"name", "Existing video"}, {"content_type", "video/mp4"}};
    QMimeData mime; mime.setData("application/x-nodetool-drag", QJsonDocument(QJsonObject{{"type", "assets-multiple"}, {"payload", QJsonArray{first.left(12), second}}}).toJson());
    auto *view = window.findChild<QGraphicsView *>(); const QPointF point(220, 180); const auto expected = view->viewportTransform().inverted().map(point);
    QVERIFY(drop(window, mime, point)); QTRY_COMPARE(window.document()->nodes().size(), 2); QCOMPARE(server.uploads, 0);
    for (const auto &value : window.document()->nodes()) {
      const auto node = value.toObject(); const auto reference = node["data"].toObject()["value"].toObject(); const auto id = reference["asset_id"].toString();
      QVERIFY(id == first || id == second); QCOMPARE(id.size(), 32); QCOMPARE(reference["uri"].toString(), "asset://" + id);
      QCOMPARE(node["type"].toString(), id == first ? QString("nodetool.constant.Image") : QString("nodetool.constant.Video"));
      const auto position = node["ui_properties"].toObject()["position"].toObject(); QCOMPARE(position["x"].toDouble(), expected.x() + (id == first ? 0 : 250)); QCOMPARE(position["y"].toDouble(), expected.y());
    }
    QCOMPARE(window.document()->undoStack()->index(), 2);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel()); const auto id = *model.allNodeIds().begin(); auto *node = window.scene()->nodeGraphicsObject(id); QVERIFY(node);
    const auto before = controller(window)->transfers(); QSignalSpy created(controller(window), &CanvasDropController::nodeCreated);
    QMimeData onBody; assetMime(first, onBody);
    QVERIFY(!drop(window, onBody, view->mapFromScene(node->scenePos() + QPointF(50, 25)))); QTest::qWait(20);
    QCOMPARE(controller(window)->transfers(), before); QCOMPARE(created.count(), 0); QCOMPARE(window.document()->nodes().size(), 2);
  }
  void authoritativeAssetKinds_data() {
    QTest::addColumn<QString>("mime"); QTest::addColumn<QString>("kind"); QTest::addColumn<QString>("type"); QTest::addColumn<QByteArray>("content");
    QTest::newRow("audio") << QString("audio/wav") << QString("audio") << QString("nodetool.constant.Audio") << QByteArray{};
    QTest::newRow("document") << QString("application/pdf") << QString("document") << QString("nodetool.constant.Document") << QByteArray{};
    QTest::newRow("model") << QString("model/gltf-binary") << QString("model_3d") << QString("nodetool.constant.Model3D") << QByteArray{};
    QTest::newRow("folder") << QString("folder") << QString("folder") << QString("nodetool.input.AssetFolderInput") << QByteArray{};
    QTest::newRow("text") << QString("text/plain") << QString("text") << QString("nodetool.constant.String") << QByteArray("Full authoritative text");
    QTest::newRow("csv") << QString("text/csv") << QString("dataframe") << QString("nodetool.constant.DataFrame") << QByteArray("column\nvalue");
    QTest::newRow("yaml") << QString("application/x-yaml") << QString("dataframe") << QString("nodetool.constant.DataFrame") << QByteArray("column\nvalue");
    QTest::newRow("text-yaml") << QString("text/x-yaml") << QString("dataframe") << QString("nodetool.constant.DataFrame") << QByteArray("column\nvalue");
    QTest::newRow("parquet-mime") << QString("application/x-parquet") << QString("dataframe") << QString("nodetool.constant.DataFrame") << QByteArray("column\nvalue");
    QTest::newRow("hdf5-mime") << QString("application/x-hdf5") << QString("dataframe") << QString("nodetool.constant.DataFrame") << QByteArray("column\nvalue");
  }
  void authoritativeAssetKinds() {
    QFETCH(QString, mime); QFETCH(QString, kind); QFETCH(QString, type); QFETCH(QByteArray, content);
    Server server; EditorWindow window; setup(window, server); const QString id = "abcdeffedcba0123456789abcdef0123";
    server.assets[id] = {{"id", id}, {"name", "My Folder"}, {"content_type", mime}, {"metadata", QJsonObject{{"text", "Wrong capped preview"}}}};
    server.contents[id] = content; QMimeData drag; assetMime(id, drag); QVERIFY(drop(window, drag, QPointF(200, 150)));
    QTRY_COMPARE(window.document()->nodes().size(), 1); const auto node = window.document()->nodes()[0].toObject(); QCOMPARE(node["type"].toString(), type);
    const QJsonValue value = node["data"].toObject()["value"];
    if (kind == "text") QCOMPARE(value.toString(), QString::fromUtf8(content));
    else if (kind == "dataframe") QCOMPARE(value.toObject()["data"].toArray()[0].toArray()[0].toString(), QString("value"));
    else { QCOMPARE(value.toObject()["type"].toString(), kind); QCOMPARE(value.toObject()["asset_id"].toString(), id); QCOMPARE(value.toObject()["uri"].toString(), kind == "folder" ? QString{} : "asset://" + id); }
    if (kind == "folder") QCOMPARE(node["data"].toObject()["name"].toString(), QString("my_folder"));
    QCOMPARE(window.document()->undoStack()->index(), 1);
  }
  void csvJsonAndUnsupportedNoGhostNodes() {
    Server server; EditorWindow window; setup(window, server); QVERIFY(controller(window)); QTemporaryDir dir; QVERIFY(dir.isValid());
    const auto csv = writeFile(dir, "data.csv", "first,second\r\n\"hello, world\",\"two\nlines\"\r\n\r\n"); QVERIFY(!csv.isEmpty());
    QMimeData csvMime; csvMime.setUrls({QUrl::fromLocalFile(csv)}); QVERIFY(drop(window, csvMime, QPointF(170, 140))); QTRY_COMPARE(window.document()->nodes().size(), 1);
    const auto frame = window.document()->nodes()[0].toObject()["data"].toObject()["value"].toObject(); QCOMPARE(frame["type"].toString(), QString("dataframe")); QCOMPARE(frame["columns"].toArray().size(), 2); QCOMPARE(frame["data"].toArray()[0].toArray()[0].toString(), QString("hello, world")); QCOMPARE(frame["data"].toArray()[0].toArray()[1].toString(), QString("two\nlines")); QCOMPARE(server.uploads, 0);
    const auto json = writeFile(dir, "value.json", "{\"answer\":42}"); QMimeData jsonMime; jsonMime.setUrls({QUrl::fromLocalFile(json)}); QVERIFY(drop(window, jsonMime, QPointF(200, 180))); QTRY_COMPARE(window.document()->nodes().size(), 2); QCOMPARE(server.uploads, 1);
    QCOMPARE(window.document()->nodes()[1].toObject()["type"].toString(), QString("nodetool.constant.String")); QCOMPARE(window.document()->nodes()[1].toObject()["data"].toObject()["value"].toString(), QString("{\"answer\":42}"));
    const auto snapshot = window.document()->snapshot();
    const auto invalid = writeFile(dir, "invalid.json", "invalid json"); QMimeData invalidMime; invalidMime.setUrls({QUrl::fromLocalFile(invalid)}); QVERIFY(drop(window, invalidMime, QPointF(230, 200))); QCOMPARE(window.document()->snapshot(), snapshot); QCOMPARE(server.uploads, 1);
    QMimeData remote; remote.setUrls({QUrl("https://example.com/image.png")}); QVERIFY(!drop(window, remote, QPointF(230, 200))); QCOMPARE(window.document()->snapshot(), snapshot);
    // A workflow file opens as its own workflow and leaves this graph, the
    // uploads and the transfer panel unchanged (web dropHandlerUtils.ts:204-220).
    auto *drops = controller(window);
    const auto rows = drops->transfers().size();
    const auto tabs = window.workflowTabs().size();
    const auto workflow = writeFile(dir, "workflow.json", "{\"name\":\"Dropped workflow\",\"graph\":{\"nodes\":[{\"id\":\"n1\",\"type\":\"nodetool.constant.String\",\"data\":{\"value\":\"kept\"}}],\"edges\":[]}}");
    QMimeData workflowMime; workflowMime.setUrls({QUrl::fromLocalFile(workflow)});
    QVERIFY(drop(window, workflowMime, QPointF(230, 200)));
    QCOMPARE(drops->transfers().size(), rows);
    QCOMPARE(server.uploads, 1);
    QTRY_COMPARE(window.workflowTabs().size(), tabs + 1);
    QTRY_COMPARE(window.document()->nodes().size(), 1);
    QCOMPARE(window.document()->nodes()[0].toObject()["data"].toObject()["value"].toString(), QString("kept"));
    QCOMPARE(window.localFilePath(), workflow);
  }
  void csvDelimiterAndQuotedWhitespace_data() {
    QTest::addColumn<QByteArray>("csv"); QTest::addColumn<QString>("left"); QTest::addColumn<QString>("right");
    QTest::newRow("semicolon") << QByteArray("a;b\n1;2") << QString("1") << QString("2");
    QTest::newRow("utf8-bom") << (QByteArray::fromHex("efbbbf") + QByteArray("a,b\n1,2")) << QString("1") << QString("2");
    QTest::newRow("tab") << QByteArray("a\tb\n1\t2") << QString("1") << QString("2");
    QTest::newRow("pipe") << QByteArray("a|b\n1|2") << QString("1") << QString("2");
    QTest::newRow("quoted-space") << QByteArray("a,b\n\"x\" ,y") << QString("x") << QString("y");
    QTest::newRow("escaped") << QByteArray("a,b\n\"say \"\"yes\"\"\",\"two\nlines\"") << QString("say \"yes\"") << QString("two\nlines");
  }
  void csvDelimiterAndQuotedWhitespace() {
    QFETCH(QByteArray, csv); QFETCH(QString, left); QFETCH(QString, right);
    Server server; EditorWindow window; setup(window, server); QTemporaryDir dir; const auto file = writeFile(dir, "data.csv", csv); QVERIFY(!file.isEmpty());
    QMimeData mime; mime.setUrls({QUrl::fromLocalFile(file)}); QVERIFY(drop(window, mime, QPointF(180, 150))); QTRY_COMPARE(window.document()->nodes().size(), 1);
    const auto value = window.document()->nodes()[0].toObject()["data"].toObject()["value"].toObject(); QCOMPARE(value["columns"].toArray().size(), 2);
    const auto cells = value["data"].toArray()[0].toArray(); QCOMPARE(cells[0].toString(), left); QCOMPARE(cells[1].toString(), right); QCOMPARE(server.uploads, 0);
  }
  void rejectsWrongIdsAmbiguousPrefixAndReadonlyCompletion() {
    Server server; EditorWindow window; setup(window, server); auto *drops = controller(window); QVERIFY(drops);
    const QString first = "abcdef0123456789abcdef0123456789", second = "abcdef0123459999abcdef0123456789";
    server.assets[first] = {{"id", first}, {"name", "Image"}, {"content_type", "image/png"}};
    server.mismatchId = true; QMimeData wrong; assetMime(first, wrong); QVERIFY(drop(window, wrong, QPointF(190, 150)));
    QTRY_COMPARE(drops->transfers().last().toMap()["state"].toString(), QString("failed")); QVERIFY(window.document()->nodes().isEmpty());
    server.mismatchId = false; server.assets[second] = {{"id", second}, {"name", "Other image"}, {"content_type", "image/png"}};
    QMimeData ambiguous; assetMime(first.left(12), ambiguous); QVERIFY(drop(window, ambiguous, QPointF(190, 150)));
    QTRY_VERIFY(drops->transfers().last().toMap()["error"].toString().contains("409")); QVERIFY(window.document()->nodes().isEmpty());
    drops->cancelAll(); server.delayAsset = true; QMimeData slow; assetMime(first, slow); QVERIFY(drop(window, slow, QPointF(190, 150))); QTRY_VERIFY(!server.pending.isEmpty());
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel()); model.project(window.document()->snapshot(), metadata(), true);
    server.release(); QTRY_COMPARE(drops->transfers().last().toMap()["state"].toString(), QString("failed")); QVERIFY(window.document()->nodes().isEmpty()); QCOMPARE(window.document()->undoStack()->index(), 0);
    QMimeData readonly; assetMime(first, readonly); QVERIFY(!drop(window, readonly, QPointF(190, 150))); QVERIFY(window.document()->nodes().isEmpty());
  }
  void delayedAssetAndTextDownloadsCannotCrossScope() {
    Server server; EditorWindow window; setup(window, server); auto *drops = controller(window); QVERIFY(drops);
    const QString id = "abcdeffedcba0123456789abcdef0123";
    server.assets[id] = {{"id", id}, {"name", "Text"}, {"content_type", "text/plain"}}; server.contents[id] = "Authoritative content";
    server.delayAsset = true; QMimeData metadataDrop; assetMime(id, metadataDrop); QVERIFY(drop(window, metadataDrop, QPointF(180, 150))); QTRY_VERIFY(!server.pending.isEmpty());
    auto next = window.document()->snapshot(); next["id"] = "other-workflow"; QVERIFY(window.document()->load(next)); server.release(); QTest::qWait(30);
    QVERIFY(drops->transfers().isEmpty()); QCOMPARE(window.document()->snapshot(), next); QVERIFY(window.document()->nodes().isEmpty());
    server.delayAsset = false; server.delayContent = true; QMimeData textDrop; assetMime(id, textDrop); QVERIFY(drop(window, textDrop, QPointF(180, 150))); QTRY_VERIFY(!server.pendingText.isEmpty());
    window.session()->credentialsChanged(server.url(), "new-account-token", "2"); server.release(); QTest::qWait(30);
    QVERIFY(drops->transfers().isEmpty()); QCOMPARE(window.document()->snapshot(), next); QVERIFY(window.document()->nodes().isEmpty());
  }
  void failedUploadCancelRetryAndScopeIsolation() {
    Server server; EditorWindow window; setup(window, server); auto *drops = controller(window); QVERIFY(drops); QTemporaryDir dir; const auto path = writeFile(dir, "image.png", server.png); QVERIFY(!path.isEmpty()); QMimeData mime; mime.setUrls({QUrl::fromLocalFile(path)});
    server.uploadStatus = 500; QVERIFY(drop(window, mime, QPointF(210, 160))); QTRY_COMPARE(drops->transfers()[0].toMap()["state"].toString(), QString("failed")); QVERIFY(window.document()->nodes().isEmpty()); QCOMPARE(window.document()->undoStack()->index(), 0);
    QVERIFY(drops->transfers()[0].toMap()["error"].toString().contains("Retry the upload"));
    QVERIFY(!drops->transfers()[0].toMap()["error"].toString().contains("Choose the file again"));
    auto key = drops->transfers()[0].toMap()["key"].toString(); QTRY_VERIFY(uploadPanel(window));
    const auto captureDir = qEnvironmentVariable("NODETOOL_CANVAS_DROP_CAPTURE_DIR");
    if (!captureDir.isEmpty()) {
      QVERIFY(QDir().mkpath(captureDir));
      for (const auto &scheme : {QString("dark"), QString("light")}) { window.setDarkTheme(scheme == "dark"); QTest::qWait(30); QVERIFY(uploadPanel(window)->grab().save(captureDir + "/canvas-upload-error-" + scheme + ".png")); }
    }
    server.uploadStatus = 200; clickUpload(window, "canvas-drop-retry-" + key); QTRY_COMPARE(window.document()->nodes().size(), 1);
    window.action("Undo"); server.delayUpload = true; QVERIFY(drop(window, mime, QPointF(220, 170))); QTRY_VERIFY(!server.pending.isEmpty()); key = drops->transfers()[0].toMap()["key"].toString(); QTRY_VERIFY(uploadPanel(window)); clickUpload(window, "canvas-drop-cancel-" + key); server.release(); QTest::qWait(30); QVERIFY(window.document()->nodes().isEmpty()); QCOMPARE(drops->transfers()[0].toMap()["state"].toString(), QString("cancelled"));
    clickUpload(window, "canvas-drop-retry-" + key); QTRY_VERIFY(!server.pending.isEmpty()); const auto local = window.document()->snapshot();
    window.session()->credentialsChanged(server.url(), "next-token", "2"); server.release(); QTest::qWait(30); QVERIFY(drops->transfers().isEmpty()); QCOMPARE(window.document()->snapshot(), local);
    window.session()->credentialsChanged(server.url(), "drop-token", "1"); QVERIFY(drop(window, mime, QPointF(220, 170))); QTRY_VERIFY(!server.pending.isEmpty());
    auto next = local; next["id"] = "next-workflow"; QVERIFY(window.document()->load(next)); server.release(); QTest::qWait(30); QVERIFY(window.document()->nodes().isEmpty()); QVERIFY(drops->transfers().isEmpty());
  }
  // Saved sketches and timelines enter as constant nodes on the pane, with
  // one undo entry each, and need no server (web useDropHandler.ts:195-239).
  void sketchAndTimelineDocumentsBecomeConstantNodes() {
    auto catalog = metadata();
    for (const auto &type : {QString("Sketch"), QString("Timeline")}) {
      catalog.append(QJsonObject{{"node_type", "nodetool.constant." + type}, {"title", type},
        {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", type.toLower()}}}, {"default", QJsonValue::Null}}}},
        {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", type.toLower()}}}}}}});
    }
    EditorWindow window;
    window.setCatalog(catalog);
    window.resize(1400, 1000);
    window.show();
    QTest::qWait(60);
    auto *view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    view->scale(0.75, 0.75);
    const QPointF point(210, 190);
    const auto expected = view->mapToScene(point.toPoint());
    const auto payload = [](const QString &type, const QJsonObject &body) {
      return QJsonDocument(QJsonObject{{"type", type}, {"payload", body}}).toJson(QJsonDocument::Compact);
    };
    QMimeData sketch;
    sketch.setData("application/x-nodetool-drag", payload("sketch", QJsonObject{{"id", "0123456789abcdef0123456789abcdef"}, {"name", "Poster"}}));
    QVERIFY(drop(window, sketch, point));
    QTRY_COMPARE(window.document()->nodes().size(), 1);
    auto node = window.document()->nodes()[0].toObject();
    QCOMPARE(node["type"].toString(), QString("nodetool.constant.Sketch"));
    QCOMPARE(node["data"].toObject()["value"].toObject(), QJsonObject({{"type", "sketch"}, {"id", "0123456789abcdef0123456789abcdef"}}));
    QCOMPARE(node["ui_properties"].toObject()["title"].toString(), QString("Poster"));
    const auto at = node["ui_properties"].toObject()["position"].toObject();
    QCOMPARE(QPointF(at["x"].toDouble(), at["y"].toDouble()), expected);
    QCOMPARE(window.document()->undoStack()->count(), 1);
    // A nameless timeline gets the web fallback title.
    QMimeData timeline;
    timeline.setData("application/x-nodetool-drag", payload("timeline", QJsonObject{{"id", "fedcba9876543210fedcba9876543210"}}));
    QVERIFY(drop(window, timeline, QPointF(210, 600)));
    QTRY_COMPARE(window.document()->nodes().size(), 2);
    node = window.document()->nodes()[1].toObject();
    QCOMPARE(node["type"].toString(), QString("nodetool.constant.Timeline"));
    QCOMPARE(node["ui_properties"].toObject()["title"].toString(), QString("Untitled video"));
    QCOMPARE(window.document()->undoStack()->count(), 2);
    // A drop on a card, or without an ID, adds nothing.
    const auto card = view->mapFromScene(expected + QPointF(30, 20));
    // The scene indexes a new card after the projection settles.
    QTRY_VERIFY(!view->items(card).isEmpty());
    QVERIFY(!drop(window, sketch, QPointF(card)));
    QMimeData empty;
    empty.setData("application/x-nodetool-drag", payload("sketch", QJsonObject{{"name", "No id"}}));
    QVERIFY(!drop(window, empty, QPointF(700, 600)));
    QCOMPARE(window.document()->nodes().size(), 2);
    window.action("Undo");
    QCOMPARE(window.document()->nodes().size(), 1);
    // Without node metadata the drop reports and adds nothing.
    EditorWindow bare;
    bare.setCatalog(metadata());
    bare.resize(1000, 800);
    bare.show();
    QTest::qWait(40);
    QVERIFY(drop(bare, sketch, point));
    QTest::qWait(20);
    QVERIFY(bare.document()->nodes().isEmpty());
    QVERIFY(bare.message().contains("metadata is missing"));
  }
};
QTEST_MAIN(CanvasDropTest)
#include "CanvasDropTest.moc"
