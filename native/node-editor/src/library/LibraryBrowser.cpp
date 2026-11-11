#include "LibraryBrowser.h"
#include <QJsonArray>
#include <algorithm>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDrag>
#include <QMimeData>
#include <QNetworkReply>
#include <QTimer>
#include <QUrlQuery>
namespace nodetool::node_editor {
namespace {
constexpr qint64 ResponseLimit = 16 * 1024 * 1024;
QJsonObject trpcData(const QByteArray &bytes) {
  auto data = QJsonDocument::fromJson(bytes).object()["result"].toObject()["data"].toObject();
  return data.contains("json") ? data["json"].toObject() : data;
}
}
LibraryBrowser::LibraryBrowser(QObject *parent) : QObject(parent) {}
void LibraryBrowser::configure(const QUrl &origin, const QString &token, const QString &userId) {
  if (origin_ == origin && token_ == token && user_ == userId) { return; }
  origin_ = origin; token_ = token; user_ = userId;
  ++epoch_;
  if (list_) { list_->abort(); }
  folder_.clear(); crumbs_.clear(); error_.clear();
  model_.apply({}, true);
  emit changed();
}
QNetworkRequest LibraryBrowser::request(const QUrl &url) const {
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
  if (!user_.isEmpty()) { request.setRawHeader("x-user-id", user_.toUtf8()); }
  return request;
}
void LibraryBrowser::refresh() {
  if (!configured()) { return; }
  if (crumbs_.isEmpty()) {
    // The server's home folder id is the user id. Without one, as on a local
    // server without accounts, the server lists the home folder by default.
    folder_ = user_;
    crumbs_ = {QVariantMap{{"id", user_}, {"name", tr("Assets")}}};
  }
  list();
}
void LibraryBrowser::openFolder(const QString &id) {
  if (!configured() || id == folder_) { return; }
  qsizetype known = -1;
  for (qsizetype i = 0; i < crumbs_.size(); ++i) { if (crumbs_[i].toMap()["id"] == id) { known = i; break; } }
  if (known >= 0) { crumbs_ = crumbs_.mid(0, known + 1); }
  else if (id.isEmpty()) { return; }
  else {
    const auto row = model_.get(id);
    crumbs_.append(QVariantMap{{"id", id}, {"name", row.value("name").toString()}});
  }
  folder_ = id;
  model_.apply({}, true);
  list();
}
void LibraryBrowser::goUp() {
  if (crumbs_.size() < 2) { return; }
  openFolder(crumbs_[crumbs_.size() - 2].toMap()["id"].toString());
}
void LibraryBrowser::list() {
  if (list_) { list_->abort(); }
  auto url = origin_.resolved(QUrl("/trpc/assets.list"));
  QUrlQuery query;
  const bool global = filtered();
  QJsonObject input{{"page_size", global ? 1000 : 500}};
  if (global) {
    url = origin_.resolved(QUrl("/trpc/assets.search"));
    input.insert("query", search_.trimmed());
  } else if (!folder_.isEmpty()) { input.insert("parent_id", folder_); }
  query.addQueryItem("input", QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact)));
  url.setQuery(query);
  auto *reply = network_.get(request(url));
  list_ = reply;
  error_.clear();
  emit changed();
  const auto epoch = epoch_;
  const auto folder = folder_;
  connect(reply, &QNetworkReply::readyRead, reply, [reply] { if (reply->bytesAvailable() > ResponseLimit) { reply->abort(); } });
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, folder, global] {
    reply->deleteLater();
    if (epoch != epoch_ || folder != folder_ || list_ != reply) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const auto data = trpcData(reply->readAll());
    list_.clear();
    if (reply->error() != QNetworkReply::NoError || status != 200 || !data["assets"].isArray()) {
      error_ = tr("Could not load assets (HTTP %1). Refresh to try again.").arg(status);
      emit changed();
      return;
    }
    // Folders first, as in the web asset grid, then the newest asset first.
    auto rows = data["assets"].toArray().toVariantList();
    if (global) {
      const auto search = search_.trimmed(), tag = tag_.trimmed();
      rows.removeIf([&](const QVariant &value) {
        const auto asset = value.toMap();
        if (!search.isEmpty() && !asset["name"].toString().contains(search, Qt::CaseInsensitive)) { return true; }
        if (favorites_ && !asset["favorite"].toBool()) { return true; }
        if (!tag.isEmpty() && !asset["metadata"].toMap()["tags"].toStringList().contains(tag, Qt::CaseInsensitive)) { return true; }
        if (type_.isEmpty()) { return false; }
        auto kind = asset["content_type"] == "folder" ? QStringLiteral("folder") : mediaType(asset);
        if (kind.isEmpty() || kind == "model3d") { kind = "other"; }
        return kind != type_;
      });
    }
    std::stable_sort(rows.begin(), rows.end(), [](const QVariant &a, const QVariant &b) {
      const auto left = a.toMap(), right = b.toMap();
      const bool leftFolder = left["content_type"] == "folder", rightFolder = right["content_type"] == "folder";
      if (leftFolder != rightFolder) { return leftFolder; }
      return left["created_at"].toString() > right["created_at"].toString();
    });
    model_.apply(QJsonArray::fromVariantList(rows));
    emit changed();
  });
}
void LibraryBrowser::filterChanged() {
  model_.apply({}, true);
  emit changed();
  if (configured() && !crumbs_.isEmpty()) { list(); }
}
void LibraryBrowser::setSearchText(const QString &value) { if (search_ != value) { search_ = value; filterChanged(); } }
void LibraryBrowser::setTypeFilter(const QString &value) {
  if (type_ == value || !QStringList{"", "image", "video", "audio", "folder", "other"}.contains(value)) { return; }
  type_ = value; filterChanged();
}
void LibraryBrowser::setTagFilter(const QString &value) { if (tag_ != value) { tag_ = value; filterChanged(); } }
void LibraryBrowser::setFavoritesOnly(bool value) { if (favorites_ != value) { favorites_ = value; filterChanged(); } }
void LibraryBrowser::createFolder(const QString &name) {
  if (!configured() || name.trimmed().isEmpty()) { return; }
  QNetworkRequest post = request(origin_.resolved(QUrl("/api/assets")));
  post.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  const QJsonObject fields{{"name", name.trimmed()}, {"content_type", "folder"}, {"parent_id", folder_.isEmpty() ? user_ : folder_}};
  auto *reply = network_.post(post, QJsonDocument(fields).toJson(QJsonDocument::Compact));
  const auto epoch = epoch_;
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch] {
    reply->deleteLater();
    if (epoch != epoch_) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      error_ = tr("Could not create the folder (HTTP %1).").arg(status);
      emit changed();
      return;
    }
    list();
  });
}
void LibraryBrowser::moveAsset(const QString &id, const QString &parentId) {
  if (!configured() || id.isEmpty() || id == parentId) { return; }
  QNetworkRequest post = request(origin_.resolved(QUrl("/trpc/assets.update")));
  post.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  // An empty parent moves the asset to the home folder, the server's default.
  auto *reply = network_.post(post, QJsonDocument(QJsonObject{{"id", id}, {"parent_id", parentId.isEmpty() ? user_ : parentId}}).toJson(QJsonDocument::Compact));
  const auto epoch = epoch_;
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch] {
    reply->deleteLater();
    if (epoch != epoch_) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status != 200) {
      error_ = tr("Could not move the asset (HTTP %1).").arg(status);
      emit changed();
      return;
    }
    list();
  });
}
QString LibraryBrowser::mediaType(const QVariantMap &asset) const {
  const auto type = asset.value("content_type").toString();
  const auto name = asset.value("name").toString().toLower();
  if (type.toLower().startsWith("model/") || name.endsWith(".glb") || name.endsWith(".gltf")) { return "model3d"; }
  for (const auto &kind : {QStringLiteral("image"), QStringLiteral("video"), QStringLiteral("audio")}) {
    if (type.startsWith(kind + '/')) { return kind; }
  }
  return {};
}
QUrl LibraryBrowser::mediaUrl(const QString &path) const {
  if (path.isEmpty() || origin_.isEmpty()) { return {}; }
  return origin_.resolved(QUrl(path));
}
}
namespace nodetool::node_editor {
void LibraryBrowser::dragAsset(const QVariantMap &asset) {
  const auto id = asset.value("id").toString();
  if (id.isEmpty() || asset.value("content_type") == "folder" || dragging_) { return; }
  dragging_ = true;
  emit dragStarted(id);
  const auto payload = QJsonDocument(QJsonObject{{"type", "asset"}, {"payload", QJsonObject::fromVariantMap(asset)}}).toJson(QJsonDocument::Compact);
  // QDrag::exec runs a nested event loop, so it starts after the QML handler returns.
  QTimer::singleShot(0, this, [this, payload, id] {
    auto mime = std::make_unique<QMimeData>();
    mime->setData("application/x-nodetool-drag", payload);
    mime->setData("application/x-nodetool-asset", id.toUtf8());
    QDrag drag(this);
    drag.setMimeData(mime.release());  // QDrag owns the mime data from here.
    drag.exec(Qt::CopyAction, Qt::CopyAction);
    dragging_ = false;
  });
}
}
