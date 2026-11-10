#include "PreviewSourceAssets.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QSet>
#include <QUrlQuery>
#include <algorithm>

namespace nodetool::node_editor {
namespace {
constexpr qsizetype ResponseLimit = 8 * 1024 * 1024;
QJsonValue assetValue(const QJsonObject &asset) {
  const auto content = asset["content_type"].toString();
  const auto metadata = asset["metadata"].toObject();
  const auto id = asset["id"].toString();
  const QJsonObject ref{{"asset_id", id}, {"uri", "asset://" + id}};
  const auto typed = [&ref](const QString &type) { auto value = ref; value["type"] = type; return value; };
  if (content.startsWith("image/")) { return typed("image"); }
  if (content.startsWith("video/")) { return typed("video"); }
  if (content.startsWith("audio/")) { return typed("audio"); }
  if (content.startsWith("text/")) { return metadata["text"].toString(); }
  if (content.contains("json") && metadata.contains("json")) { return metadata["json"]; }
  const auto name = asset["name"].toString();
  if (content.startsWith("model/") || name.endsWith(".glb", Qt::CaseInsensitive) || name.endsWith(".gltf", Qt::CaseInsensitive)) {
    return typed("model_3d");
  }
  return typed("asset");
}
}
PreviewSourceAssets::PreviewSourceAssets(QObject *parent) : QObject(parent), network_(this) {}
void PreviewSourceAssets::configure(const QUrl &origin, const QString &token, const QString &userId) {
  ++epoch_;
  origin_ = origin; token_ = token; user_ = userId;
  workflow_.clear(); assets_.clear(); requested_.clear();
  emit changed();
}
void PreviewSourceAssets::request(const QString &workflowId, const QHash<QString, Wire> &previews) {
  if (workflowId != workflow_) { ++epoch_; workflow_ = workflowId; assets_.clear(); requested_.clear(); }
  previews_ = previews;
  if (origin_.isEmpty() || workflow_.isEmpty()) { return; }
  for (const auto &wire : previews) {
    if (requested_.contains(wire.source)) { continue; }
    requested_.insert(wire.source);
    fetch(wire.source, epoch_);
  }
}
void PreviewSourceAssets::fetch(const QString &source, quint64 epoch) {
  auto url = origin_.resolved(QUrl("/trpc/assets.list"));
  QUrlQuery query;
  query.addQueryItem("input", QString::fromUtf8(QJsonDocument(QJsonObject{{"workflow_id", workflow_}, {"node_id", source}}).toJson(QJsonDocument::Compact)));
  url.setQuery(query);
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
  if (!user_.isEmpty()) { request.setRawHeader("x-user-id", user_.toUtf8()); }
  auto reply = network_.get(request);
  connect(reply, &QNetworkReply::readyRead, this, [reply] { if (reply->bytesAvailable() > ResponseLimit) { reply->abort(); } });
  connect(reply, &QNetworkReply::finished, this, [this, reply, source, epoch] {
    reply->deleteLater();
    if (epoch != epoch_ || reply->error() != QNetworkReply::NoError) { return; }
    auto data = QJsonDocument::fromJson(reply->readAll()).object()["result"].toObject()["data"].toObject();
    if (data.contains("json")) { data = data["json"].toObject(); }
    QJsonArray scoped;
    for (const auto &value : data["assets"].toArray()) {
      const auto asset = value.toObject();
      if (asset["node_id"] == source && asset["workflow_id"] == workflow_ && asset["content_type"] != "folder") { scoped.append(asset); }
    }
    assets_.insert(source, scoped);
    emit changed();
  });
}
QJsonValue PreviewSourceAssets::previewValue(const QJsonArray &assets, const QString &outputName) {
  QList<QJsonObject> sorted;
  for (const auto &value : assets) { if (!value.toObject()["job_id"].toString().isEmpty()) { sorted.append(value.toObject()); } }
  if (sorted.isEmpty()) { return QJsonValue(QJsonValue::Undefined); }
  std::stable_sort(sorted.begin(), sorted.end(), [](const auto &a, const auto &b) { return a["created_at"].toString() > b["created_at"].toString(); });
  const auto job = sorted.first()["job_id"].toString();
  QList<QJsonObject> last;
  for (const auto &asset : sorted) { if (asset["job_id"] == job) { last.append(asset); } }
  const bool named = std::any_of(last.cbegin(), last.cend(), [](const auto &asset) { return !asset["metadata"].toObject()["output_name"].toString().isEmpty(); });
  QJsonArray values;
  for (const auto &asset : last) {
    if (named && !outputName.isEmpty() && asset["metadata"].toObject()["output_name"].toString() != outputName) { continue; }
    values.append(assetValue(asset));
  }
  if (values.isEmpty()) { return QJsonValue(QJsonValue::Undefined); }
  return values.size() == 1 ? values.first() : QJsonValue(values);
}
QHash<QString, QJsonValue> PreviewSourceAssets::values() const {
  QHash<QString, QJsonValue> result;
  for (auto it = previews_.cbegin(); it != previews_.cend(); ++it) {
    const auto value = previewValue(assets_.value(it->source), it->handle);
    if (!value.isUndefined()) { result.insert(it.key(), value); }
  }
  return result;
}
}
