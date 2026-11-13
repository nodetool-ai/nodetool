#include "interfaces/GenerationActivity.h"

#include <QDateTime>
#include <QRegularExpression>
#include <QSet>
#include <algorithm>

#include "run/GenerationWorkflow.h"

namespace nodetool::node_editor {
namespace {
// MEDIA_PREDICTION_CAPABILITIES in web/src/core/chat/mediaPrediction.ts.
bool mediaCapability(const QString &capability) {
  static const QSet<QString> capabilities{"text_to_image", "image_to_image", "text_to_video", "image_to_video",
                                          "reference_to_video", "video_to_video", "extend_video", "lip_sync",
                                          "text_to_speech", "text_to_music"};
  return capabilities.contains(capability);
}

// mediaKindOf in web/src/stores/GenerationActivityStore.ts.
QString mediaKind(const QString &capability) {
  static const QRegularExpression video(QStringLiteral("video|retake|extend|lip_sync|motion"));
  static const QRegularExpression audio(QStringLiteral("audio|speech|music|tts|voice"));
  static const QRegularExpression image(QStringLiteral("image|sketch|inpaint|outpaint|upscale"));
  if (video.match(capability).hasMatch()) { return QStringLiteral("video"); }
  if (audio.match(capability).hasMatch()) { return QStringLiteral("audio"); }
  if (image.match(capability).hasMatch()) { return QStringLiteral("image"); }
  return QStringLiteral("other");
}

// settledStatus in web/src/hooks/useGenerationActivityTracking.ts. An empty
// string means the generation still runs.
QString settledStatus(const QString &status) {
  if (status == "completed") { return QStringLiteral("generated"); }
  if (status == "cancelled") { return QStringLiteral("cancelled"); }
  if (status == "failed" || status == "needs_attention" || status == "interrupted") { return QStringLiteral("failed"); }
  return {};
}

QStringList strings(const QJsonValue &value) {
  QStringList result;
  for (const auto &item : value.toArray()) {
    if (item.isString() && !item.toString().isEmpty()) { result.append(item.toString()); }
  }
  return result;
}

QString string(const QJsonObject &object, const char *key) {
  const auto value = object.value(QLatin1String(key));
  return value.isString() ? value.toString() : QString();
}

qint64 time(const QJsonObject &record, const char *key, qint64 fallback) {
  const auto parsed = QDateTime::fromString(string(record, key), Qt::ISODateWithMs);
  return parsed.isValid() ? parsed.toMSecsSinceEpoch() : fallback;
}

QString kindLabel(const QString &kind) {
  if (kind == "image") { return QStringLiteral("Image"); }
  if (kind == "video") { return QStringLiteral("Video"); }
  if (kind == "audio") { return QStringLiteral("Audio"); }
  return QStringLiteral("Media");
}
}  // namespace

GenerationActivity::GenerationActivity(QObject *parent) : QObject(parent) {}

GenerationActivity::~GenerationActivity() = default;

void GenerationActivity::ingestPrediction(const QJsonObject &message, qint64 now) {
  const auto capability = string(message, "capability");
  const auto id = string(message, "id");
  if (!mediaCapability(capability) || id.isEmpty()) { return; }
  const auto outcome = settledStatus(message.value("status").toString(QStringLiteral("running")));
  auto existing = entries_.find(id);
  if (existing == entries_.end()) {
    // The start was missed. The surface that ran it already shows the result.
    if (!outcome.isEmpty()) { return; }
    Entry entry;
    entry.id = id;
    entry.status = QStringLiteral("generating");
    entry.capability = capability;
    entry.kind = mediaKind(capability);
    entry.provider = string(message, "provider");
    entry.model = string(message, "model");
    entry.workflowId = string(message, "workflow_id");
    entry.params = message.value("params").toObject();
    entry.prompt = entry.params.value("prompt").isString() ? entry.params.value("prompt").toString() : QString();
    entry.presetIds = strings(message.value("preset_ids"));
    entry.recorded = true;
    entry.startedAt = now;
    entries_.insert(id, entry);
    cleared_.remove(id);
    prune();
    emit rowsChanged();
    return;
  }
  // A settled generation keeps its first outcome.
  if (outcome.isEmpty() || existing->status != "generating") { return; }
  existing->status = outcome;
  existing->assetIds = strings(message.value("asset_ids"));
  existing->error = string(message, "error");
  existing->endedAt = now;
  prune();
  emit rowsChanged();
}

void GenerationActivity::replaceHistory(const QJsonArray &records, qint64 now) {
  bool changed = false;
  for (const auto &value : records) {
    const auto record = value.toObject();
    const auto id = string(record, "generation_id");
    const auto capability = string(record, "capability");
    if (id.isEmpty() || !mediaCapability(capability) || cleared_.contains(id)) { continue; }
    const auto outcome = settledStatus(string(record, "status"));
    auto existing = entries_.find(id);
    if (existing != entries_.end()) {
      // The server settles a live generation whose closing message never arrived.
      if (outcome.isEmpty() || existing->status != "generating") { continue; }
      existing->status = outcome;
      existing->assetIds = strings(record.value("asset_ids"));
      existing->endedAt = time(record, "completed_at", now);
      changed = true;
      continue;
    }
    Entry entry;
    entry.id = id;
    entry.status = outcome.isEmpty() ? QStringLiteral("generating") : outcome;
    entry.capability = capability;
    entry.kind = mediaKind(capability);
    entry.provider = string(record, "provider");
    entry.model = string(record, "model");
    entry.prompt = string(record, "prompt");
    entry.workflowId = string(record, "workflow_id");
    entry.assetIds = strings(record.value("asset_ids"));
    for (const auto *key : {"generation_error", "provider_error", "submission_error", "output_error", "attachment_error"}) {
      if (entry.error.isEmpty()) { entry.error = string(record, key); }
    }
    entry.startedAt = time(record, "started_at", now);
    if (!outcome.isEmpty()) { entry.endedAt = time(record, "completed_at", entry.startedAt); }
    entries_.insert(id, entry);
    changed = true;
  }
  if (changed) {
    prune();
    emit rowsChanged();
  }
}

void GenerationActivity::setLoading(bool loading, const QString &error) {
  if (loading_ == loading && error_ == error) { return; }
  loading_ = loading;
  error_ = error;
  emit loadingChanged();
}

void GenerationActivity::setWorkflowNames(const QHash<QString, QString> &names) {
  if (workflowNames_ == names) { return; }
  workflowNames_ = names;
  emit rowsChanged();
}

void GenerationActivity::clearFinished() {
  bool changed = false;
  for (auto it = entries_.begin(); it != entries_.end();) {
    if (it->status != "generating") {
      cleared_.insert(it.key());
      it = entries_.erase(it);
      changed = true;
    } else {
      ++it;
    }
  }
  if (changed) { emit rowsChanged(); }
}

void GenerationActivity::openSource(const QString &id) {
  const auto entry = entries_.constFind(id);
  if (entry != entries_.constEnd() && !entry->workflowId.isEmpty()) { emit openSourceRequested(entry->workflowId); }
}

void GenerationActivity::openAsWorkflow(const QString &id) {
  const auto entry = entries_.constFind(id);
  if (entry == entries_.constEnd()) { return; }
  const auto workflow = recordedGenerationWorkflow({.provider = entry->provider,
                                                    .model = entry->model,
                                                    .capability = entry->capability,
                                                    .prompt = entry->prompt,
                                                    .params = entry->params},
                                                   QStringLiteral("Open as workflow"));
  if (workflow.isEmpty()) {
    // ejection.failed with ejection.unavailable in the web locale.
    emit errorOccurred(QStringLiteral("Could not open as workflow: The exact inputs for this older render were not recorded. "
                                      "Render a new take to open it as a workflow."));
    return;
  }
  emit openAsWorkflowRequested(workflow);
}

QList<const GenerationActivity::Entry *> GenerationActivity::ordered() const {
  QList<const Entry *> running, finished;
  for (const auto &entry : entries_) { (entry.status == "generating" ? running : finished).append(&entry); }
  // Running first, oldest of those first. Then finished, newest first.
  std::sort(running.begin(), running.end(), [](const Entry *a, const Entry *b) {
    return a->startedAt == b->startedAt ? a->id < b->id : a->startedAt < b->startedAt;
  });
  const auto end = [](const Entry *entry) { return entry->endedAt ? entry->endedAt : entry->startedAt; };
  std::sort(finished.begin(), finished.end(), [&](const Entry *a, const Entry *b) {
    return end(a) == end(b) ? a->id < b->id : end(a) > end(b);
  });
  return running + finished;
}

void GenerationActivity::prune() {
  const auto all = ordered();
  int finished = 0;
  QStringList drop;
  for (const auto *entry : all) {
    if (entry->status != "generating" && ++finished > historyLimit) { drop.append(entry->id); }
  }
  for (const auto &id : drop) { entries_.remove(id); }
}

QString GenerationActivity::sourceTitle(const Entry &entry) const {
  if (entry.workflowId.isEmpty()) { return {}; }
  // generations.source.workflow when no open tab names it.
  return workflowNames_.value(entry.workflowId, QStringLiteral("Workflow"));
}

QVariantList GenerationActivity::rows() const {
  QVariantList rows;
  for (const auto *entry : ordered()) {
    const bool mediaMode = entry->kind == "image" || entry->kind == "video";
    rows.append(QVariantMap{
        {"id", entry->id},
        {"status", entry->status},
        {"kind", entry->kind},
        // generations.untitled when the generation sent no prompt.
        {"title", entry->prompt.isEmpty() ? kindLabel(entry->kind) + QStringLiteral(" generation") : entry->prompt},
        {"source", sourceTitle(*entry)},
        {"model", entry->model},
        {"error", entry->error},
        {"assetId", entry->assetIds.value(0)},
        {"workflowId", entry->workflowId},
        {"startedAt", entry->startedAt},
        {"endedAt", entry->endedAt},
        {"canOpenSource", !entry->workflowId.isEmpty()},
        // GenerationTile.tsx offers it for a preset image or video generation.
        {"canOpenAsWorkflow", entry->recorded && !entry->presetIds.isEmpty() && mediaMode},
    });
  }
  return rows;
}

QVariantMap GenerationActivity::counts() const {
  int generating = 0, failed = 0;
  for (const auto &entry : entries_) {
    if (entry.status == "generating") { ++generating; }
    if (entry.status == "failed") { ++failed; }
  }
  return {{"all", entries_.size()}, {"generating", generating}, {"failed", failed}};
}

}  // namespace nodetool::node_editor
