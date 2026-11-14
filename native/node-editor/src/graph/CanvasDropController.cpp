#include "CanvasDropController.h"
#include "WorkflowGraphModel.h"
#include "CardBodies.h"
#include "CardMedia.h"
#include <QApplication>
#include <QDropEvent>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QMimeData>
#include <QMimeDatabase>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QRegularExpression>
#include <QTimer>
#include <QUrlQuery>
#include <QUuid>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <cmath>
#include <optional>
#include <limits>
namespace nodetool {
namespace {
constexpr auto DragMime = "application/x-nodetool-drag";
constexpr qint64 TextLimit = 8 * 1024 * 1024;
QString mediaKind(QString mime, const QString &name) {
  mime = mime.section(';', 0, 0).trimmed().toLower();
  if (mime.startsWith("model/") || (mime == "application/octet-stream" && QSet<QString>{"glb", "gltf", "obj", "fbx", "stl", "ply"}.contains(QFileInfo(name).suffix().toLower()))) return "model_3d";
  if (QSet<QString>{"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/tiff", "image/bmp", "image/x-icon", "image/heic", "image/heif"}.contains(mime)) return "image";
  if (QSet<QString>{"video/mp4", "video/mpeg", "video/ogg", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/3gpp", "video/3gpp2"}.contains(mime)) return "video";
  if (QSet<QString>{"audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm", "audio/mp3", "audio/aac", "audio/midi", "audio/x-midi", "audio/flac", "audio/x-flac", "audio/x-m4a", "audio/mp4"}.contains(mime)) return "audio";
  if (QSet<QString>{"application/json", "text/plain", "text/html", "text/markdown", "text/xml", "application/xml", "text/javascript", "application/javascript", "text/css"}.contains(mime)) return "text";
  if (QSet<QString>{"text/csv", "application/x-yaml", "text/x-yaml", "application/x-parquet", "application/x-hdf5"}.contains(mime)) return "dataframe";
  if (QSet<QString>{"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-powerpoint", "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation", "application/rtf", "text/rtf", "application/x-tex", "application/epub+zip"}.contains(mime)) return "document";
  return mime == "folder" ? "folder" : QString{};
}
QString nodeType(const QString &kind) {
  static const QHash<QString, QString> types{{"image", "nodetool.constant.Image"}, {"audio", "nodetool.constant.Audio"}, {"video", "nodetool.constant.Video"}, {"document", "nodetool.constant.Document"}, {"model_3d", "nodetool.constant.Model3D"}, {"text", "nodetool.constant.String"}, {"dataframe", "nodetool.constant.DataFrame"}, {"folder", "nodetool.input.AssetFolderInput"}};
  return types.value(kind);
}
QJsonObject dragPayload(const QMimeData *mime) {
  QByteArray bytes = mime->data(DragMime);
  if (bytes.isEmpty() && mime->hasFormat("asset")) { const auto legacy = mime->data("asset"); return legacy.size() <= 64 * 1024 ? QJsonObject{{"type", "asset"}, {"payload", QJsonDocument::fromJson(legacy).object()}} : QJsonObject{}; }
  if (bytes.isEmpty() && mime->hasFormat("selectedAssetIds")) { const auto legacy = mime->data("selectedAssetIds"); return legacy.size() <= 64 * 1024 ? QJsonObject{{"type", "assets-multiple"}, {"payload", QJsonDocument::fromJson(legacy).array()}} : QJsonObject{}; }
  return bytes.size() <= 64 * 1024 ? QJsonDocument::fromJson(bytes).object() : QJsonObject{};
}
QStringList assetIds(const QJsonObject &drag) {
  QStringList ids;
  if (drag["type"] == "asset") ids.append(drag["payload"].toObject()["id"].toString());
  else if (drag["type"] == "assets-multiple") for (const auto &value : drag["payload"].toArray()) { if (!value.isString()) return {}; ids.append(value.toString()); }
  if (ids.isEmpty() || ids.size() > 256) return {};
  for (const auto &id : ids) if (id.isEmpty() || id.size() > 1024) return {};
  return ids;
}
// A saved sketch or timeline enters the graph as a constant node that names the
// document by ID (web hooks/handlers/useDropHandler.ts:195-239).
struct DocumentDrop { QString nodeType, kind, id, title; };
DocumentDrop documentDrop(const QJsonObject &drag) {
    const auto kind = drag["type"].toString();
    const auto payload = drag["payload"].toObject();
    const auto id = payload["id"].toString();
    if ((kind != "sketch" && kind != "timeline") || id.isEmpty() || id.size() > 1024) { return {}; }
    const auto name = payload["name"].toString();
    if (kind == "sketch") { return {"nodetool.constant.Sketch", kind, id, name.isEmpty() ? QObject::tr("Untitled sketch") : name}; }
    return {"nodetool.constant.Timeline", kind, id, name.isEmpty() ? QObject::tr("Untitled video") : name};
}
// A Collection's zone names its kind "collection", or "collection:<type>" once
// its first item locks the type. It takes any asset kind until then.
bool collectionZone(const QString &target) { return target == QLatin1String("collection") || target.startsWith(QLatin1String("collection:")); }
bool zoneTakes(const QString &target, const QString &kind) {
  if (!collectionZone(target)) return kind == target;
  const auto locked = target.section(QLatin1Char(':'), 1);
  return !kind.isEmpty() && (locked.isEmpty() || locked == kind);
}
bool sameOrigin(const QUrl &a, const QUrl &b) { return a.scheme() == b.scheme() && a.host() == b.host() && a.port(a.scheme() == "https" ? 443 : 80) == b.port(b.scheme() == "https" ? 443 : 80); }
QJsonObject trpcData(const QByteArray &bytes) {
  auto data = QJsonDocument::fromJson(bytes).object()["result"].toObject()["data"].toObject();
  return data["json"].isObject() ? data["json"].toObject() : data;
}
bool utf8(const QByteArray &bytes, QString &text) {
  const auto payload = bytes.startsWith(QByteArray::fromHex("efbbbf")) ? bytes.mid(3) : bytes;
  text = QString::fromUtf8(payload); return text.toUtf8() == payload;
}
std::optional<QList<QStringList>> csvRows(const QString &text, QChar delimiter, int maximumRows = 0) {
  QList<QStringList> rows; QStringList row; QString cell; bool quoted = false, afterQuote = false;
  const auto pushRow = [&] {
    row.append(cell); cell.clear(); bool empty = true;
    for (const auto &value : row) if (!value.trimmed().isEmpty()) empty = false;
    if (!empty) rows.append(row);
    row.clear();
  };
  for (qsizetype i = 0; i < text.size(); ++i) {
    const auto c = text[i];
    if (quoted) {
      if (c == '"') { if (i + 1 < text.size() && text[i + 1] == '"') { cell += '"'; ++i; } else { quoted = false; afterQuote = true; } }
      else cell += c;
      continue;
    }
    if (c == '"' && cell.isEmpty() && !afterQuote) { quoted = true; continue; }
    if (c == delimiter) { row.append(cell); cell.clear(); afterQuote = false; continue; }
    if (c == '\r' || c == '\n') {
      if (c == '\r' && i + 1 < text.size() && text[i + 1] == '\n') ++i;
      pushRow(); afterQuote = false;
      if (maximumRows > 0 && rows.size() >= maximumRows) return rows;
      continue;
    }
    if (afterQuote) { if (c == ' ' || c == '\t') continue; return std::nullopt; }
    cell += c;
  }
  if (quoted) return std::nullopt;
  pushRow(); return rows;
}
QJsonValue dataframe(QString text) {
  if (text.startsWith(QChar(0xfeff))) text.remove(0, 1);
  QChar delimiter(','); double bestAverage = 1.99; qint64 bestDelta = std::numeric_limits<qint64>::max();
  for (const auto candidate : {QChar(','), QChar('\t'), QChar('|'), QChar(';'), QChar(0x1e), QChar(0x1f)}) {
    const auto sample = csvRows(text, candidate, 10); if (!sample || sample->isEmpty()) continue;
    qint64 fields = 0, delta = 0, previous = sample->first().size();
    for (const auto &row : *sample) { fields += row.size(); delta += std::abs(qint64(row.size()) - previous); previous = row.size(); }
    const auto average = double(fields) / sample->size();
    if (average >= 1.99 && (delta < bestDelta || (delta == bestDelta && average > bestAverage))) { delimiter = candidate; bestDelta = delta; bestAverage = average; }
  }
  auto rows = csvRows(text, delimiter); if (!rows || rows->isEmpty()) return {};
  QJsonArray columns, data;
  for (const auto &name : rows->takeFirst()) columns.append(QJsonObject{{"name", name}, {"data_type", "string"}});
  for (const auto &values : *rows) { QJsonArray cells; for (const auto &value : values) cells.append(value); data.append(cells); }
  return QJsonObject{{"type", "dataframe"}, {"columns", columns}, {"data", data}};
}
}
CanvasDropController::CanvasDropController(WorkflowGraphModel &model, QGraphicsView &view, QObject *parent)
    : QObject(parent), model_(model), view_(view), uploader_(this), network_(this) {
  view.viewport()->setAcceptDrops(true); view.viewport()->installEventFilter(this);
  connect(&uploader_, &node_editor::AssetPickerController::progress, this, [this](const QString &key, qint64 sent, qint64 total) {
    if (!transfers_.contains(key)) return; auto &row = transfers_[key]; row.sent = sent; row.total = total; emit changed();
  });
  connect(&uploader_, &node_editor::AssetPickerController::failed, this, [this](const QString &key, QString message) {
    message.replace(tr("Choose the file again to retry."), tr("Retry the upload."));
    fail(key, message);
  });
  connect(&uploader_, &node_editor::AssetPickerController::uploaded, this, [this](const QString &key, const QVariantMap &reference) {
    if (!transfers_.contains(key) || transfers_[key].state == "cancelled") return;
    transfers_[key].assetId = reference["asset_id"].toString(); fetchAsset(key);
  });
}
CanvasDropController::~CanvasDropController() { view_.viewport()->removeEventFilter(this); cancelAll(); }
QVariantList CanvasDropController::transfers() const {
  QVariantList result;
  for (const auto &key : order_) {
    const auto row = transfers_.value(key);
    result.append(QVariantMap{{"key", key}, {"name", row.name}, {"kind", row.kind}, {"state", row.state}, {"error", row.error}, {"sent", row.sent}, {"total", row.total}});
  }
  return result;
}
void CanvasDropController::configure(const QUrl &origin, const QString &token, const QString &userId) {
  cancelAll(); network_.clearAccessCache(); network_.setCookieJar(new QNetworkCookieJar(&network_));
  origin_ = QUrl{}; token_.clear(); user_.clear();
  const bool loopback = origin.host() == "localhost" || origin.host() == "127.0.0.1" || origin.host() == "::1";
  if ((origin.scheme() == "http" || origin.scheme() == "https") && !origin.host().isEmpty() && origin.userInfo().isEmpty() && !origin.hasQuery() && !origin.hasFragment() && (origin.path().isEmpty() || origin.path() == "/") && (token.isEmpty() || origin.scheme() == "https" || loopback)) { origin_ = origin; token_ = token; user_ = userId; }
  uploader_.configure(origin_, token_, user_);
}
void CanvasDropController::setCatalog(const QJsonArray &metadata) {
  catalog_.clear(); for (const auto &value : metadata) { const auto entry = value.toObject(); catalog_.insert(entry["node_type"].toString(entry["type"].toString()), entry); }
}
void CanvasDropController::setWorkflowId(const QString &id) { if (workflow_ != id) { cancelAll(); workflow_ = id; } }
void CanvasDropController::cancelAll() {
  ++epoch_;
  const auto keys = transfers_.keys(); for (const auto &key : keys) cancel(key);
  transfers_.clear(); order_.clear(); emit changed();
}
void CanvasDropController::cancel(const QString &key) {
  if (!transfers_.contains(key)) return;
  transfers_[key].state = "cancelled"; transfers_[key].serial = ++nextSerial_; transfers_[key].error.clear();
  uploader_.cancel(key); const auto reply = replies_.take(key); if (reply) reply->abort(); emit changed();
}
void CanvasDropController::retry(const QString &key) {
  if (!transfers_.contains(key) || (transfers_[key].state != "failed" && transfers_[key].state != "cancelled")) return;
  start(key);
}
void CanvasDropController::fail(const QString &key, const QString &message) {
  if (!transfers_.contains(key) || transfers_[key].state == "cancelled") return;
  transfers_[key].state = "failed"; transfers_[key].error = message; emit changed(); emit errorOccurred(message);
}
bool CanvasDropController::accepts(const QMimeData *mime) const {
  // A document reference needs no upload, so it needs no server.
  if (!model_.readOnly() && !documentDrop(dragPayload(mime)).id.isEmpty()) return true;
  if (origin_.isEmpty() || model_.readOnly()) return false;
  if (!assetIds(dragPayload(mime)).isEmpty()) return true;
  if (!mime->hasUrls() || mime->urls().isEmpty() || mime->urls().size() > 256) return false;
  for (const auto &url : mime->urls()) if (url.isLocalFile() && QFileInfo(url.toLocalFile()).isFile()) return true;
  return false;
}
bool CanvasDropController::eventFilter(QObject *object, QEvent *event) {
  // A click on a drop zone opens a file picker. The scene still sees the click and selects the card.
  if (object == view_.viewport() && (event->type() == QEvent::MouseButtonPress || event->type() == QEvent::MouseButtonRelease)) {
    auto *mouse = static_cast<QMouseEvent *>(event);
    if (mouse->button() != Qt::LeftButton) return QObject::eventFilter(object, event);
    const auto point = mouse->position().toPoint();
    if (event->type() == QEvent::MouseButtonPress) {
      pressZone_ = clickZone(point);
      pressPoint_ = point;
    } else {
      const auto zone = pressZone_;
      pressZone_.clear();
      if (!zone.isEmpty() && clickZone(point) == zone && (point - pressPoint_).manhattanLength() < QApplication::startDragDistance()) {
        if (zone[3] == QLatin1String("copy")) {
          emit copyRequested(zone[0], zone[1]);
        } else {
          QTimer::singleShot(0, this, [this, zone, point] { pickFile(zone, point); });
        }
      }
    }
    return QObject::eventFilter(object, event);
  }
  if (object != view_.viewport() || (event->type() != QEvent::DragEnter && event->type() != QEvent::DragMove && event->type() != QEvent::Drop)) return QObject::eventFilter(object, event);
  auto *dropEvent = static_cast<QDropEvent *>(event);
  if (dropEvent->mimeData()->hasFormat("application/x-nodetool-node-type")) return false;
  if (!accepts(dropEvent->mimeData())) {
    if (dropEvent->mimeData()->hasUrls() || dropEvent->mimeData()->hasFormat(DragMime) || dropEvent->mimeData()->hasFormat("asset") || dropEvent->mimeData()->hasFormat("selectedAssetIds")) { dropEvent->ignore(); return true; }
    return false;
  }
  if (!(dropEvent->possibleActions() & Qt::CopyAction)) { dropEvent->ignore(); return true; }
  const auto document = documentDrop(dragPayload(dropEvent->mimeData()));
  const auto zone = document.id.isEmpty() ? dropZone(dropEvent->position().toPoint()) : QStringList{};
  if ((!assetIds(dragPayload(dropEvent->mimeData())).isEmpty() && zone.isEmpty()) || !document.id.isEmpty()) {
    for (auto *entry : view_.items(dropEvent->position().toPoint())) for (auto *item = entry; item; item = item->parentItem())
      if (qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item)) { dropEvent->ignore(); return true; }
  }
  dropEvent->setDropAction(Qt::CopyAction); dropEvent->accept();
  if (event->type() == QEvent::Drop) {
    bool invertible = false; const auto inverse = view_.viewportTransform().inverted(&invertible);
    if (!invertible) { dropEvent->ignore(); return true; }
    drop(dropEvent->mimeData(), inverse.map(dropEvent->position()), zone);
  }
  return true;
}
void CanvasDropController::pickFile(const QStringList &zone, const QPoint &viewportPosition) {
    const auto kind = collectionZone(zone[2]) ? zone[2].section(QLatin1Char(':'), 1) : zone[2];
    QString path;
    if (chooseFile) {
        path = chooseFile(kind);
    } else {
        const QHash<QString, QString> filters{{"image", tr("Images (*.png *.jpg *.jpeg *.webp *.gif *.bmp)")},
                                              {"video", tr("Videos (*.mp4 *.mov *.webm *.mkv)")},
                                              {"audio", tr("Audio (*.wav *.mp3 *.ogg *.flac *.m4a)")}};
        path = QFileDialog::getOpenFileName(view_.window(), tr("Choose %1").arg(kind), {}, filters.value(kind, tr("All files (*)")));
    }
    bool invertible = false;
    const auto inverse = view_.viewportTransform().inverted(&invertible);
    if (path.isEmpty() || !invertible) return;
    QMimeData mime;
    mime.setUrls({QUrl::fromLocalFile(path)});
    drop(&mime, inverse.map(QPointF(viewportPosition)), zone);
}
QStringList CanvasDropController::dropZone(const QPoint &viewportPosition) const {
    for (auto *entry : view_.items(viewportPosition)) {
        for (auto *item = entry; item; item = item->parentItem()) {
            auto *node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item);
            if (!node) {
                continue;
            }
            const auto local = node->mapFromScene(view_.mapToScene(viewportPosition));
            const auto row = model_.dropZoneAt(node->nodeId(), local);
            if (row < 0) {
                // PainterBody's onAreaDrop: an image dropped on the paint area becomes its source image.
                for (const auto &paint : model_.layout(node->nodeId()).rows) {
                    if (paint.kind == NodeRowKind::Paint && !model_.readOnly() && paint.parts.value(0, paint.rect).contains(local)) {
                        return {model_.resourceId(node->nodeId()), QStringLiteral("image"), QStringLiteral("image")};
                    }
                }
                return {};
            }
            const auto &zone = model_.layout(node->nodeId()).rows[row];
            return {model_.resourceId(node->nodeId()), zone.propertyName, zone.typeName};
        }
    }
    return {};
}
QStringList CanvasDropController::clickZone(const QPoint &viewportPosition) const {
    auto zone = dropZone(viewportPosition);
    if (zone.isEmpty()) {
        return {};
    }
    // An empty zone opens the picker anywhere. A loaded image does so only from
    // its Replace action, as the web's dropped zone takes no click.
    for (auto *entry : view_.items(viewportPosition)) {
        for (auto *item = entry; item; item = item->parentItem()) {
            auto *node = qgraphicsitem_cast<QtNodes::NodeGraphicsObject *>(item);
            if (!node) {
                continue;
            }
            const auto local = node->mapFromScene(view_.mapToScene(viewportPosition));
            // The Painter canvas takes drops only, so a press there paints.
            const auto index = model_.dropZoneAt(node->nodeId(), local);
            if (index < 0) {
                return {};
            }
            const auto &row = model_.layout(node->nodeId()).rows[index];
            // A Collection's grid holds its tiles, so only the empty grid opens the picker.
            if (collectionZone(row.typeName)) {
                return row.placeholder ? zone << QStringLiteral("pick") : QStringList{};
            }
            if (row.placeholder || row.mediaKind.isEmpty() || cardMediaActionRect(row, CardMediaAction::Replace).contains(local)) {
                return zone << QStringLiteral("pick");
            }
            if (cardMediaActionRect(row, CardMediaAction::Copy).contains(local)) {
                return zone << QStringLiteral("copy");
            }
            return {};
        }
    }
    return {};
}
void CanvasDropController::drop(const QMimeData *mime, const QPointF &position, const QStringList &zone) {
  if (const auto document = documentDrop(dragPayload(mime)); !document.id.isEmpty()) {
    if (model_.readOnly() || !catalog_.contains(document.nodeType) || !createNode || !applyCommand) {
      emit errorOccurred(tr("Could not create %1 node: metadata is missing.").arg(document.kind));
      return;
    }
    auto node = createNode(catalog_.value(document.nodeType), position, QJsonObject{{"value", QJsonObject{{"type", document.kind}, {"id", document.id}}}});
    auto ui = node["ui_properties"].toObject();
    ui["title"] = document.title;
    node["ui_properties"] = ui;
    if (!node["id"].toString().isEmpty() && applyCommand(QJsonObject{{"op", "addNode"}, {"node", node}})) { emit nodeCreated(node["id"].toString()); }
    return;
  }
  const auto ids = assetIds(dragPayload(mime));
  // A drop zone takes one file, as the web's single media property does. A Collection takes them all.
  const auto count = !zone.isEmpty() && !collectionZone(zone[2]) ? qsizetype(1) : ids.isEmpty() ? mime->urls().size() : ids.size();
  for (qsizetype index = 0; index < count; ++index) {
    Transfer row; row.key = QUuid::createUuid().toString(QUuid::Id128); row.position = position + QPointF((index % 2) * 250, (index / 2) * 250);
    if (!zone.isEmpty()) {
        row.targetNode = zone[0];
        row.targetProperty = zone[1];
        row.targetKind = zone[2];
    }
    if (ids.isEmpty()) { row.file = mime->urls()[index]; row.name = row.file.fileName(); }
    else { row.assetId = ids[index]; row.name = row.assetId; }
    transfers_.insert(row.key, row); order_.append(row.key); start(row.key);
  }
}
void CanvasDropController::start(const QString &key) {
  if (!transfers_.contains(key)) return;
  auto &row = transfers_[key]; row.serial = ++nextSerial_; row.error.clear(); row.sent = row.total = 0; row.hasValue = false;
  if (origin_.isEmpty() || model_.readOnly()) { fail(key, tr("Connect to a server and enable graph editing before dropping files")); return; }
  if (row.file.isEmpty()) { fetchAsset(key); return; }
  if (!row.file.isLocalFile() || !QFileInfo(row.file.toLocalFile()).isFile()) { fail(key, tr("Drop a readable local file")); return; }
  const auto mime = QMimeDatabase{}.mimeTypeForFile(row.file.toLocalFile()).name(); row.kind = mediaKind(mime, row.name);
  if (!row.targetNode.isEmpty() && !zoneTakes(row.targetKind, row.kind)) {
      const auto locked = collectionZone(row.targetKind) ? row.targetKind.section(QLatin1Char(':'), 1) : row.targetKind;
      fail(key, locked.isEmpty() ? tr("Unsupported drop type: %1").arg(row.name)
                : collectionZone(row.targetKind) ? tr("Collection only accepts \"%1\" items.").arg(locked)
                                                 : tr("Drop a %1 file here").arg(locked));
      return;
  }
  if (row.kind.isEmpty() || (row.targetNode.isEmpty() && !catalog_.contains(nodeType(row.kind)))) { fail(key, tr("Unsupported drop type or missing node metadata: %1").arg(row.name)); return; }
  // A Collection keeps the uploaded asset, not the file's text.
  if (!collectionZone(row.targetKind) && (row.kind == "text" || (row.kind == "dataframe" && mime == "text/csv"))) {
    QFile file(row.file.toLocalFile()); if (!file.open(QIODevice::ReadOnly) || file.size() > TextLimit) { fail(key, tr("Could not read text file, or it exceeds the 8 MiB limit")); return; }
    const auto bytes = file.readAll(); QString text;
    if (!utf8(bytes, text)) { fail(key, tr("Drop a UTF-8 text file")); return; }
    if (QFileInfo(row.name).suffix().compare("json", Qt::CaseInsensitive) == 0) {
      QJsonParseError error; const auto parsed = QJsonDocument::fromJson("[" + text.toUtf8() + "]", &error);
      if (error.error != QJsonParseError::NoError || parsed.array().size() != 1) { fail(key, tr("Invalid JSON file")); return; }
      const auto graph = parsed.array()[0].toObject()["graph"].toObject();
      if (graph["nodes"].isArray() && graph["edges"].isArray()) {
        // The web opens a dropped workflow file as its own workflow instead of
        // pasting it into this graph (hooks/handlers/dropHandlerUtils.ts:204-220).
        const auto path = row.file.toLocalFile();
        transfers_.remove(key);
        order_.removeAll(key);
        emit changed();
        emit workflowFileDropped(path);
        return;
      }
    }
    row.value = row.kind == "dataframe" ? dataframe(text) : QJsonValue(text); row.hasValue = true;
    if (row.value.isNull() || row.value.isUndefined()) { fail(key, tr("CSV data is empty or malformed")); return; }
    if (row.kind == "dataframe") { finish(key, row.value); return; }
  }
  row.state = "uploading";
  const auto uploadKind = row.kind == "image" || row.kind == "audio" || row.kind == "video" ? row.kind : QString("asset");
  const auto file = row.file; const auto serial = row.serial; emit changed();
  if (transfers_.contains(key) && transfers_[key].serial == serial) uploader_.upload(key, uploadKind, file, workflow_);
}
void CanvasDropController::fetchAsset(const QString &key) {
  if (!transfers_.contains(key)) return;
  auto &row = transfers_[key]; row.state = "loading";
  const auto requested = row.assetId; const auto serial = row.serial; emit changed();
  if (!transfers_.contains(key) || transfers_[key].serial != serial) return;
  auto url = origin_.resolved(QUrl("/trpc/assets.get")); QUrlQuery query; query.addQueryItem("input", QString::fromUtf8(QJsonDocument(QJsonObject{{"id", requested}}).toJson(QJsonDocument::Compact))); url.setQuery(query);
  QNetworkRequest request(url); request.setTransferTimeout(30000); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); request.setRawHeader("x-user-id", user_.toUtf8());
  auto *reply = network_.get(request); replies_.insert(key, reply); const auto epoch = epoch_;
  connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > 1024 * 1024) reply->abort(); });
  connect(reply, &QNetworkReply::finished, this, [this, reply, key, epoch, requested, serial] {
    reply->deleteLater(); if (epoch != epoch_ || !transfers_.contains(key) || transfers_[key].serial != serial || transfers_[key].state == "cancelled") return; replies_.remove(key);
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt(); const auto asset = trpcData(reply->readAll()); const auto id = asset["id"].toString();
    const bool prefix = requested.size() == 12 && QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch() && id.left(12) == requested;
    if (reply->error() != QNetworkReply::NoError || status != 200 || id.isEmpty() || (id != requested && !prefix)) { fail(key, tr("Could not load the dropped asset (HTTP %1)").arg(status)); return; }
    auto &row = transfers_[key]; const auto kind = mediaKind(asset["content_type"].toString(), asset["name"].toString());
    if (kind.isEmpty() || (row.targetNode.isEmpty() ? !catalog_.contains(nodeType(kind)) : !zoneTakes(row.targetKind, kind)) || (!row.file.isEmpty() && kind != row.kind)) { fail(key, tr("The asset type is unsupported or does not match the dropped file")); return; }
    row.assetId = id; row.kind = kind; row.name = asset["name"].toString(id);
    if ((kind == "text" || kind == "dataframe") && !row.hasValue && row.file.isEmpty() && !collectionZone(row.targetKind)) {
      auto contentUrl = QUrl(asset["get_url"].toString());
      if (contentUrl.isEmpty()) contentUrl = origin_.resolved(QUrl("/api/content/" + id));
      else if (contentUrl.isRelative() && !contentUrl.toString().startsWith("//")) contentUrl = origin_.resolved(contentUrl);
      downloadText(key, contentUrl); return;
    }
    finish(key, row.hasValue ? row.value : QJsonValue(QJsonObject{{"type", kind}, {"asset_id", id}, {"uri", kind == "folder" ? QString{} : "asset://" + id}}));
  });
}
void CanvasDropController::downloadText(const QString &key, const QUrl &url) {
  if (!url.isValid() || (url.scheme() != "http" && url.scheme() != "https") || !url.userInfo().isEmpty() || (origin_.scheme() == "https" && url.scheme() != "https")) { fail(key, tr("The asset has no supported content URL")); return; }
  QNetworkRequest request(url); request.setTransferTimeout(30000); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (sameOrigin(url, origin_)) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); request.setRawHeader("x-user-id", user_.toUtf8()); }
  auto *reply = network_.get(request); replies_.insert(key, reply); const auto epoch = epoch_; const auto serial = transfers_[key].serial;
  connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > TextLimit) reply->abort(); });
  connect(reply, &QNetworkReply::finished, this, [this, reply, key, epoch, serial] {
    const auto bytes = reply->readAll(); reply->deleteLater();
    if (epoch != epoch_ || !transfers_.contains(key) || transfers_[key].serial != serial || transfers_[key].state == "cancelled") return; replies_.remove(key);
    QString text; const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status != 200 || bytes.size() > TextLimit || !utf8(bytes, text)) { fail(key, tr("Could not read the asset as UTF-8 text (HTTP %1)").arg(status)); return; }
    const auto value = transfers_[key].kind == "dataframe" ? dataframe(text) : QJsonValue(text);
    if (value.isNull() || value.isUndefined()) { fail(key, tr("CSV asset is empty or malformed")); return; }
    finish(key, value);
  });
}
void CanvasDropController::finish(const QString &key, const QJsonValue &value) {
  if (!transfers_.contains(key) || transfers_[key].state == "cancelled") return;
  const auto row = transfers_[key]; const auto type = nodeType(row.kind);
  if (!row.targetNode.isEmpty() && collectionZone(row.targetKind)) {
      finishCollection(key, row);
      return;
  }
  if (!row.targetNode.isEmpty()) {
      // Keep fields of the stored reference that this drop does not replace.
      auto reference = QJsonObject{};
      for (const auto id : model_.allNodeIds()) {
          if (model_.resourceId(id) == row.targetNode) {
              reference = model_.nodeSnapshot(id)["data"].toObject()[row.targetProperty].toObject();
          }
      }
      const auto dropped = value.toObject();
      for (auto it = dropped.begin(); it != dropped.end(); ++it) {
          reference.insert(it.key(), it.value());
      }
      const QJsonObject command{{"op", "setProperty"}, {"id", row.targetNode}, {"name", row.targetProperty}, {"value", reference}};
      if (model_.readOnly() || !applyCommand || !applyCommand(command)) {
          fail(key, tr("Could not set the dropped file. Local work is unchanged."));
          return;
      }
      transfers_.remove(key);
      order_.removeAll(key);
      emit changed();
      return;
  }
  if (model_.readOnly() || !catalog_.contains(type) || !createNode || !applyCommand) { fail(key, tr("The graph or node metadata changed. Retry this drop when editing is available.")); return; }
  QJsonObject properties{{"value", value}};
  if (row.kind == "folder") { auto name = row.name.toLower(); name.replace(QRegularExpression("\\s+"), "_"); properties["name"] = name; }
  const auto node = createNode(catalog_.value(type), row.position, properties);
  if (node["id"].toString().isEmpty() || node["type"] != type || !applyCommand(QJsonObject{{"op", "addNode"}, {"node", node}})) { fail(key, tr("Could not add the dropped asset. Local work is unchanged.")); return; }
  transfers_.remove(key); order_.removeAll(key); emit changed(); emit nodeCreated(node["id"].toString());
}
void CanvasDropController::finishCollection(const QString &key, const Transfer &row) {
  // assetToItem in collectionItems.ts: the asset reference with the asset's name.
  const QJsonObject item{{"type", row.kind}, {"asset_id", row.assetId}, {"uri", "asset://" + row.assetId}, {"name", row.name}};
  QJsonArray items;
  for (const auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) == row.targetNode) { items = model_.nodeSnapshot(id)["data"].toObject()[row.targetProperty].toArray(); }
  }
  const auto result = appendCollectionItems(items, QJsonArray{item});
  if (!result.ok) {
    // An asset already in the collection is left as it is.
    if (result.expected == row.kind) { transfers_.remove(key); order_.removeAll(key); emit changed(); return; }
    fail(key, tr("Collection only accepts \"%1\" items.").arg(result.expected));
    return;
  }
  const QJsonObject command{{"op", "setProperty"}, {"id", row.targetNode}, {"name", row.targetProperty}, {"value", result.items}};
  if (model_.readOnly() || !applyCommand || !applyCommand(command)) {
    fail(key, tr("Could not add the dropped file. Local work is unchanged."));
    return;
  }
  transfers_.remove(key);
  order_.removeAll(key);
  emit changed();
}
}
