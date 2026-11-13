#include "MediaResolver.h"
#include "LocalMediaStore.h"
#include <QBuffer>
#include <QImage>
#include <QImageWriter>
#include <QDir>
#include <QCryptographicHash>
#include <QFile>
#include <QFileInfo>
#include <QHttpMultiPart>
#include <QMimeDatabase>
#include <QSaveFile>
#include <QTimer>
#include <QRegularExpression>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QUrlQuery>
#include <QUuid>
#include <memory>
namespace nodetool::node_editor {
namespace {
constexpr qint64 ItemLimit = 32 * 1024 * 1024;
constexpr qint64 CacheLimit = 128 * 1024 * 1024;
bool sameOrigin(const QUrl &a, const QUrl &b) {
  return a.scheme() == b.scheme() && a.host() == b.host() &&
         a.port(a.scheme() == "https" ? 443 : 80) == b.port(b.scheme() == "https" ? 443 : 80);
}
bool httpUrl(const QUrl &url) {
  return url.isValid() && (url.scheme() == "http" || url.scheme() == "https") &&
         !url.host().isEmpty() && url.userInfo().isEmpty();
}
}
MediaResolver::MediaResolver(QObject *parent) : QObject(parent) {}
void MediaResolver::configure(const QUrl &server, const QString &token) {
  clear();
  server_ = QUrl{};
  token_.clear();
  if (!httpUrl(server) || server.hasQuery() || server.hasFragment()) { return; }
  const bool loopback = server.host() == "localhost" || server.host() == "127.0.0.1" || server.host() == "::1";
  if (!token.isEmpty() && server.scheme() != "https" && !loopback) { return; }
  server_ = server;
  token_ = token;
}
QString MediaResolver::resolvedText(const QString &key) const {
  const auto identity = identities_.value(key);
  if (!leases_.value(key).contains(identity) || !entries_.contains(identity)) { return {}; }
  QFile file(entries_.value(identity).url.toLocalFile());
  if (!file.open(QIODevice::ReadOnly)) { return {}; }
  return QString::fromUtf8(file.read(65536));
}
void MediaResolver::cancel(const QString &key) {
  pending_.removeIf([&key](const auto &request) { return request.key == key; });
  serials_.remove(key);
  identities_.remove(key);
  auto reply = replies_.take(key);
  if (reply) { reply->abort(); }
  auto upload = uploads_.take(key);
  if (upload) { upload->abort(); }
}
void MediaResolver::release(const QString &key) { leases_.remove(key); }
bool MediaResolver::useCached(const QString &key, quint64 serial, const QString &identity) {
  if (!current(key, serial)) { return false; }
  identities_[key] = identity;
  auto entry = entries_.find(identity);
  if (entry == entries_.end()) { return false; }
  entry->used = ++next_;
  leases_[key].insert(identity);
  emit resolved(key, entry->url);
  return true;
}
bool MediaResolver::makeRoom(qint64 bytes) {
  while (entries_.size() >= 256 || diskBytes_ + bytes > CacheLimit) {
    auto oldest = entries_.end();
    for (auto it = entries_.begin(); it != entries_.end(); ++it) {
      bool leased = false;
      for (auto lease = leases_.cbegin(); lease != leases_.cend(); ++lease) {
        if (lease->contains(it.key())) { leased = true; break; }
      }
      if (!leased && (oldest == entries_.end() || it->used < oldest->used)) { oldest = it; }
    }
    if (oldest == entries_.end() || !QFile::remove(oldest->url.toLocalFile())) { return false; }
    diskBytes_ -= oldest->bytes;
    entries_.erase(oldest);
  }
  return true;
}
void MediaResolver::clear() {
  emit cleared();
  pending_.clear();
  serials_.clear();
  identities_.clear();
  leases_.clear();
  entries_.clear();
  const auto replies = replies_;
  replies_.clear();
  for (const auto &reply : replies) { if (reply) { reply->abort(); } }
  const auto uploads = uploads_;
  uploads_.clear();
  for (const auto &upload : uploads) { if (upload) { upload->abort(); } }
  if (cache_.isValid()) {
    for (const auto &name : QDir(cache_.path()).entryList(QDir::Files)) { QFile::remove(cache_.filePath(name)); }
  }
  diskBytes_ = 0;

}
namespace {
// A QImage over the store's pixels, which it keeps alive without a copy.
QImage localImage(const QString &uri) {
  const auto stored = LocalMediaStore::instance().image(uri);
  if (stored.isNull()) { return {}; }
  // native-rules #2: naked new of a shared_ptr box, freed by the naked delete in the cleanup lambda below
  auto *owner = new std::shared_ptr<const std::vector<uint8_t>>(stored.rgba);
  return QImage(stored.rgba->data(), int(stored.width), int(stored.height), int(stored.width) * 4,
                QImage::Format_RGBA8888,
                [](void *data) { delete static_cast<std::shared_ptr<const std::vector<uint8_t>> *>(data); }, owner);
}
}
bool MediaResolver::current(const QString &key, quint64 serial) const { return serials_.value(key) == serial; }
void MediaResolver::resolve(const QString &key, const QVariant &source) {
  cancel(key);
  const auto serial = ++next_;
  serials_[key] = serial;
  auto map = source.toMap();
  if (source.metaType() == QMetaType::fromType<QJsonObject>()) { map = source.value<QJsonObject>().toVariantMap(); }
  QString uri = map.isEmpty() && source.metaType() == QMetaType::fromType<QString>()
                    ? source.toString() : map.value("uri").toString();
  QString id = map.value("asset_id").toString().trimmed();
  const auto data = map.isEmpty() ? source : map.value("data");
  if (uri.isEmpty() && id.isEmpty()) {
    if (data.metaType() == QMetaType::fromType<QByteArray>()) {
      if (useCached(key, serial, "bytes:" + QString::fromLatin1(QCryptographicHash::hash(data.toByteArray(), QCryptographicHash::Sha256).toHex()))) { return; }
      store(key, serial, data.toByteArray(), {});
      return;
    }
    if (data.metaType() == QMetaType::fromType<QVariantList>()) {
      const auto values = data.toList();
      if (values.size() > ItemLimit) { emit failed(key, "Media exceeds the 32 MiB preview limit"); return; }
      QByteArray bytes;
      bytes.reserve(values.size());
      for (const auto &value : values) {
        bool ok = false;
        const auto number = value.toInt(&ok);
        if (!ok || number < 0 || number > 255) { emit failed(key, "Invalid media byte array"); return; }
        bytes.append(static_cast<char>(number));
      }
      if (useCached(key, serial, "bytes:" + QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex()))) { return; }
      store(key, serial, bytes, {});
      return;
    }
    if (data.metaType() == QMetaType::fromType<QString>()) {
      uri = data.toString();
      if (!uri.isEmpty() && !uri.contains(':') && !uri.startsWith('/')) { uri.prepend("data:application/octet-stream;base64,"); }
    }
  }
  if (id.isEmpty() && uri.startsWith("asset://")) {
    id = uri.mid(8).section('?', 0, 0).section('#', 0, 0).section('/', -1);
    if (id.contains('.')) { id = id.section('.', 0, -2); }
  }
  if (id.isEmpty() && LocalMediaStore::isLocalMedia(uri)) {
    if (useCached(key, serial, uri)) { return; }
    const auto clip = LocalMediaStore::instance().clip(uri);
    if (!clip.isNull()) {
      store(key, serial, clip.bytes, {}, clip.contentType);
      return;
    }
    const auto image = localImage(uri);
    if (image.isNull()) { emit failed(key, "This run's image is no longer kept"); return; }
    // The cache file only feeds the preview, so it is written for speed: BMP
    // when the image is opaque (Qt's BMP drops alpha), otherwise PNG without
    // compression.
    bool opaque = true;
    for (int y = 0; y < image.height() && opaque; ++y) {
      const auto *line = reinterpret_cast<const uchar *>(image.constScanLine(y));
      for (int x = 0; x < image.width() && opaque; ++x) { opaque = line[x * 4 + 3] == 255; }
    }
    QByteArray bytes;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::WriteOnly);
    QImageWriter writer(&buffer, opaque ? "BMP" : "PNG");
    writer.setQuality(100);
    if (!writer.write(opaque ? image.convertToFormat(QImage::Format_RGB888) : image)) {
      emit failed(key, "Could not prepare the run's image");
      return;
    }
    // Cached under the URI that useCached recorded, so later resolves reuse it.
    store(key, serial, bytes, opaque ? "bmp" : "png", opaque ? "image/bmp" : "image/png");
    return;
  }
  if (!id.isEmpty()) {
    if (server_.isEmpty()) { emit failed(key, "Connect to a server to resolve assets"); return; }
    auto url = server_.resolved(QUrl("/trpc/assets.get"));
    QUrlQuery query;
    query.addQueryItem("input", QString::fromUtf8(QJsonDocument(QJsonObject{{"id", id}}).toJson(QJsonDocument::Compact)));
    url.setQuery(query);
    if (useCached(key, serial, "asset:" + id)) { return; }
    fetch(key, serial, url, true);
    return;
  }
  if (uri.startsWith("data:")) {
    const auto comma = uri.indexOf(',');
    if (comma < 0 || uri.size() > ItemLimit * 2 || !uri.left(comma).endsWith(";base64")) { emit failed(key, "Unsupported inline media encoding"); return; }
    const auto decoded = QByteArray::fromBase64Encoding(uri.mid(comma + 1).toLatin1(), QByteArray::AbortOnBase64DecodingErrors);
    if (!decoded) { emit failed(key, "Invalid inline media data"); return; }
    if (useCached(key, serial, "bytes:" + QString::fromLatin1(QCryptographicHash::hash(decoded.decoded, QCryptographicHash::Sha256).toHex()))) { return; }
    store(key, serial, decoded.decoded, {}, uri.mid(5, comma - 5).section(';', 0, 0));
    return;
  }
  if (uri.startsWith("package://")) { uri = "/api/assets/packages/" + uri.mid(10); }
  auto url = QUrl(uri);
  if (url.scheme() == "file") {
    QUrlQuery query;
    query.addQueryItem("path", url.toLocalFile());
    url = QUrl("/api/files/local");
    url.setQuery(query);
  }
  if (url.isRelative() && url.path().startsWith("/api/") && !uri.startsWith("//")) { url = server_.resolved(url); }
  if (!httpUrl(url)) { emit failed(key, "Unsupported media locator. Use an asset, HTTP URL, package asset, or server file"); return; }
  if (useCached(key, serial, url.toString(QUrl::FullyEncoded))) { return; }
  fetch(key, serial, url, false);
}
void MediaResolver::drainFetches() {
  while (replies_.size() < 4 && !pending_.isEmpty()) {
    const auto request = pending_.dequeue();
    if (current(request.key, request.serial) && !useCached(request.key, request.serial, identities_.value(request.key))) {
      fetch(request.key, request.serial, request.url, request.lookup, request.redirects);
    }
  }
}
void MediaResolver::fetch(const QString &key, quint64 serial, const QUrl &url, bool lookup, int redirects) {
  if (!current(key, serial)) { return; }
  if (replies_.size() >= 4) {
    if (pending_.size() >= 256) { emit failed(key, "Too many pending media previews. Close another gallery and retry"); return; }
    pending_.enqueue({key, serial, url, lookup, redirects});
    return;
  }
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::CookieLoadControlAttribute, QNetworkRequest::Manual);
  request.setAttribute(QNetworkRequest::CookieSaveControlAttribute, QNetworkRequest::Manual);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (sameOrigin(server_, url) && !token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
  auto *reply = network_.get(request);
  replies_[key] = reply;
  connect(reply, &QNetworkReply::finished, this, [this] { QTimer::singleShot(0, this, [this] { drainFetches(); }); });
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > ItemLimit) { reply->abort(); }
  });
  connect(reply, &QNetworkReply::finished, this, [this, reply, key, serial, url, lookup, redirects] {
    reply->deleteLater();
    if (!current(key, serial)) { return; }
    replies_.remove(key);
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (status >= 300 && status < 400) {
      auto target = url.resolved(reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl());
      if (redirects >= 5 || !httpUrl(target) || (url.scheme() == "https" && target.scheme() != "https") || (lookup && !sameOrigin(server_, target))) {
        emit failed(key, "Media redirect was refused"); return;
      }
      fetch(key, serial, target, lookup, redirects + 1);
      return;
    }
    if (reply->bytesAvailable() > ItemLimit) { emit failed(key, "Media exceeds the 32 MiB preview limit"); return; }
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      emit failed(key, QString("Media request failed (HTTP %1)").arg(status)); return;
    }
    const auto bytes = reply->readAll();
    if (bytes.size() > ItemLimit) { emit failed(key, "Media exceeds the 32 MiB preview limit"); return; }
    if (lookup) {
      const auto root = QJsonDocument::fromJson(bytes).object();
      auto data = root.value("result").toObject().value("data").toObject();
      if (data.contains("json")) { data = data.value("json").toObject(); }
      const auto locator = data.value("get_url").toString();
      auto target = QUrl(locator);
      if (target.isRelative() && locator.startsWith("/api/") && !locator.startsWith("//")) { target = server_.resolved(target); }
      if (!httpUrl(target)) { emit failed(key, "Asset has no supported download URL"); return; }
      fetch(key, serial, target, false);
      return;
    }
    store(key, serial, bytes, QFileInfo(url.path()).suffix(), reply->header(QNetworkRequest::ContentTypeHeader).toString());
  });
}
QString MediaResolver::suggestedFilename(const QString &key, const QString &requested, const QString &kind) const {
  // The name is a suggestion inside the user's chosen directory, never a path.
  auto name = QFileInfo(QString(requested).replace('\\', '/')).fileName().trimmed();
  if (!name.isEmpty() && !QFileInfo(name).suffix().isEmpty()) { return name; }
  const auto identity = identities_.value(key);
  const auto entry = entries_.constFind(identity);
  QString extension;
  if (entry != entries_.cend() && leases_.value(key).contains(identity)) {
    const auto mime = entry->contentType.section(';', 0, 0).trimmed().toLower();
    static const QHash<QString, QString> audioExtensions{
      {"audio/mp3", "mp3"}, {"audio/mpeg", "mp3"}, {"audio/mpeg3", "mp3"},
      {"audio/wav", "wav"}, {"audio/wave", "wav"}, {"audio/x-wav", "wav"}, {"audio/vnd.wave", "wav"},
      {"audio/ogg", "ogg"}, {"audio/vorbis", "ogg"}, {"audio/opus", "opus"},
      {"audio/webm", "webm"}, {"audio/flac", "flac"}, {"audio/x-flac", "flac"},
      {"audio/aac", "aac"}, {"audio/aacp", "aac"}, {"audio/mp4", "m4a"}, {"audio/x-m4a", "m4a"},
      {"audio/aiff", "aiff"}, {"audio/x-aiff", "aiff"}, {"audio/basic", "au"}, {"audio/x-ms-wma", "wma"}
    };
    extension = LocalMediaStore::isLocalMedia(identity) && entry->contentType.startsWith("image/") ? QStringLiteral("png") : audioExtensions.value(mime);
    if (extension.isEmpty() && mime.startsWith("audio/")) {
      extension = mime.mid(6);
      if (extension.startsWith("x-")) { extension.remove(0, 2); }
      extension = extension.section('+', 0, 0);
      if (!extension.contains(QRegularExpression("^[a-z0-9]{1,8}$"))) { extension.clear(); }
    }
    if (extension.isEmpty() && (mime.startsWith("video/") || mime.startsWith("image/"))) {
      extension = QMimeDatabase().mimeTypeForName(mime).preferredSuffix();
    }
    if (extension.isEmpty()) { extension = QFileInfo(entry->url.path()).suffix(); }
  }
  if (name.isEmpty()) { name = kind == "audio" ? "audio" : kind == "video" ? "video" : "image"; }
  return extension.isEmpty() ? name : name + '.' + extension;
}
QByteArray MediaResolver::savedLocalImage(const QString &identity) const {
  if (!LocalMediaStore::isLocalMedia(identity)) { return {}; }
  auto image = localImage(identity);
  if (image.isNull()) {
    const auto entry = entries_.constFind(identity);
    if (entry != entries_.cend()) { image.load(entry->url.toLocalFile()); }
  }
  QByteArray bytes;
  QBuffer buffer(&bytes);
  buffer.open(QIODevice::WriteOnly);
  return !image.isNull() && image.save(&buffer, "PNG") ? bytes : QByteArray{};
}
bool MediaResolver::saveResolved(const QString &key, const QUrl &destination) {
  const auto identity = identities_.value(key);
  const auto entry = entries_.constFind(identity);
  if (!serials_.contains(key) || entry == entries_.cend() || !leases_.value(key).contains(identity) || !destination.isLocalFile()) {
    emit saveFailed(key, "The media preview is no longer available"); return false;
  }
  QSaveFile output(destination.toLocalFile());
  if (LocalMediaStore::isLocalMedia(identity) && entry->contentType.startsWith("image/")) {
    const auto png = savedLocalImage(identity);
    if (png.isEmpty() || !output.open(QIODevice::WriteOnly) || output.write(png) != png.size() || !output.commit()) {
      emit saveFailed(key, "Could not save media to the selected file"); return false;
    }
    emit saved(key, destination);
    return true;
  }
  QFile source(entry->url.toLocalFile());
  if (!source.open(QIODevice::ReadOnly) || !output.open(QIODevice::WriteOnly)) {
    emit saveFailed(key, "Could not save media to the selected file"); return false;
  }
  while (!source.atEnd()) {
    const auto bytes = source.read(64 * 1024);
    if (bytes.isEmpty() || output.write(bytes) != bytes.size()) {
      output.cancelWriting(); emit saveFailed(key, "Could not save media to the selected file"); return false;
    }
  }
  if (!output.commit()) { emit saveFailed(key, "Could not save media to the selected file"); return false; }
  emit saved(key, destination);
  return true;
}
QByteArray MediaResolver::resolvedBytes(const QString &key) const {
  const auto identity = identities_.value(key);
  const auto entry = entries_.constFind(identity);
  if (!serials_.contains(key) || entry == entries_.cend() || !leases_.value(key).contains(identity)) { return {}; }
  QFile file(entry->url.toLocalFile());
  return file.open(QIODevice::ReadOnly) ? file.read(ItemLimit) : QByteArray{};
}
// Web: ContentCardBody.tsx handleAddToAssets -> AssetStore.createAsset -> uploadAsset. The
// multipart "json" part carries {content_type, name} and the server files the asset under the
// account's own folder, so no parent_id is sent.
bool MediaResolver::saveToAssets(const QString &key, const QString &requested, const QString &kind) {
  const auto identity = identities_.value(key);
  const auto entry = entries_.constFind(identity);
  if (!serials_.contains(key) || entry == entries_.cend() || !leases_.value(key).contains(identity)) {
    emit assetSaveFailed(key, "The media preview is no longer available"); return false;
  }
  if (server_.isEmpty()) { emit assetSaveFailed(key, "Connect to a server to save assets"); return false; }
  if (uploads_.contains(key) && uploads_.value(key)) { emit assetSaveFailed(key, "This media is already being saved"); return false; }
  auto multipart = std::make_unique<QHttpMultiPart>(QHttpMultiPart::FormDataType);
  QIODevice *file = nullptr;
  auto mime = entry->contentType.section(';', 0, 0).trimmed();
  if (LocalMediaStore::isLocalMedia(identity) && entry->contentType.startsWith("image/")) {
    auto *buffer = new QBuffer(multipart.get());
    buffer->setData(savedLocalImage(identity));
    file = buffer;
    mime = QStringLiteral("image/png");
  } else {
    file = new QFile(entry->url.toLocalFile(), multipart.get());
  }
  if (!file->open(QIODevice::ReadOnly) || file->size() == 0) { emit assetSaveFailed(key, "Could not read the cached media"); return false; }
  const auto serial = serials_.value(key);
  return postAsset(key, std::move(multipart), file, suggestedFilename(key, requested, kind), mime,
    [this, key, serial] { return current(key, serial); });
}
bool MediaResolver::saveText(const QString &key, const QString &text, const QUrl &destination) {
  QSaveFile output(destination.toLocalFile());
  const auto bytes = text.toUtf8();
  if (!destination.isLocalFile() || !output.open(QIODevice::WriteOnly) || output.write(bytes) != bytes.size() || !output.commit()) {
    emit saveFailed(key, "Could not save the output to the selected file"); return false;
  }
  emit saved(key, destination);
  return true;
}
bool MediaResolver::saveTextToAssets(const QString &key, const QString &text, const QString &name, const QString &contentType) {
  if (server_.isEmpty()) { emit assetSaveFailed(key, "Connect to a server to save assets"); return false; }
  if (uploads_.contains(key) && uploads_.value(key)) { emit assetSaveFailed(key, "This output is already being saved"); return false; }
  if (text.isEmpty()) { emit assetSaveFailed(key, "The output is empty"); return false; }
  auto multipart = std::make_unique<QHttpMultiPart>(QHttpMultiPart::FormDataType);
  // Parent: the multipart, which the upload reply owns.
  auto *buffer = new QBuffer(multipart.get());
  buffer->setData(text.toUtf8());
  buffer->open(QIODevice::ReadOnly);
  return postAsset(key, std::move(multipart), buffer, name, contentType, [] { return true; });
}
bool MediaResolver::postAsset(const QString &key, std::unique_ptr<QHttpMultiPart> multipart, QIODevice *file, const QString &name,
    const QString &mime, std::function<bool()> live) {
  const auto type = mime.isEmpty() ? QStringLiteral("application/octet-stream") : mime;
  QHttpPart metadata;
  metadata.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"json\"");
  metadata.setBody(QJsonDocument(QJsonObject{{"name", name}, {"content_type", type}}).toJson(QJsonDocument::Compact));
  multipart->append(metadata);
  QHttpPart data;
  data.setHeader(QNetworkRequest::ContentTypeHeader, type);
  // The user-visible name is metadata. A fixed multipart filename avoids header injection.
  data.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"file\"; filename=\"upload\"");
  data.setBodyDevice(file);
  multipart->append(data);
  QNetworkRequest request(server_.resolved(QUrl("/api/assets")));
  request.setTransferTimeout(120000);
  request.setAttribute(QNetworkRequest::CookieLoadControlAttribute, QNetworkRequest::Manual);
  request.setAttribute(QNetworkRequest::CookieSaveControlAttribute, QNetworkRequest::Manual);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
  auto *reply = network_.post(request, multipart.get());
  multipart.release()->setParent(reply);
  uploads_[key] = reply;
  connect(reply, &QNetworkReply::readyRead, reply, [reply] { if (reply->bytesAvailable() > 1024 * 1024) { reply->abort(); } });
  connect(reply, &QNetworkReply::finished, this, [this, reply, key, live = std::move(live)] {
    reply->deleteLater();
    if (uploads_.value(key) == reply) { uploads_.remove(key); }
    if (!live()) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const auto id = QJsonDocument::fromJson(reply->readAll()).object().value("id").toString();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300 || id.isEmpty()) {
      emit assetSaveFailed(key, QString("Could not save to assets (HTTP %1)").arg(status)); return;
    }
    emit assetSaved(key, id);
  });
  return true;
}
void MediaResolver::store(const QString &key, quint64 serial, const QByteArray &bytes, const QString &suffix, const QString &contentType) {
  if (!current(key, serial)) { return; }
  const auto knownIdentity = identities_.value(key);
  if (entries_.contains(knownIdentity) && useCached(key, serial, knownIdentity)) { return; }
  if (bytes.isEmpty()) { emit failed(key, "Media response was empty"); return; }
  if ((bytes.size() > ItemLimit && LocalMediaStore::instance().clip(knownIdentity).isNull()) || !cache_.isValid() || !makeRoom(bytes.size())) {
    emit failed(key, "Preview cache limit reached. Close the workflow to release previews"); return;
  }
  const QRegularExpression plainSuffix("^[a-zA-Z0-9]{1,8}$");
  auto fileSuffix = suffix;
  if (!fileSuffix.contains(plainSuffix)) {
    // AVFoundation, the macOS media backend, identifies a file by its
    // extension. A data URI or an extensionless URL gets one from its type.
    QMimeDatabase types;
    auto type = types.mimeTypeForName(contentType.section(';', 0, 0).trimmed());
    if (!type.isValid() || type.isDefault()) { type = types.mimeTypeForData(bytes); }
    fileSuffix = type.preferredSuffix();
  }
  const auto extension = fileSuffix.contains(plainSuffix) ? "." + fileSuffix : QString{};
  const auto path = cache_.filePath(QUuid::createUuid().toString(QUuid::Id128) + extension);
  QFile file(path);
  if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size()) { file.remove(); emit failed(key, "Could not cache media preview"); return; }
  file.close();
  diskBytes_ += bytes.size();
  const auto identity = identities_.value(key);
  entries_.insert(identity, {QUrl::fromLocalFile(path), bytes.size(), ++next_, contentType.isEmpty() ? QMimeDatabase().mimeTypeForData(bytes).name() : contentType});
  leases_[key].insert(identity);
  emit resolved(key, QUrl::fromLocalFile(path));
}
}
