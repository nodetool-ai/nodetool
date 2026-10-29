#include "aiassist/ShotPlan.h"
#include "ai/catalog/ModelCatalog.h"
#include "aiassist/AssistDocument.h"
#include "aiassist/AgentBridge.h"
#include "edit/EditActions.h"
#include <QSet>
#include <QHash>
#include <QCryptographicHash>
#include <QDateTime>
#include <QJsonDocument>
#include <QUuid>
#include <algorithm>
#include <cmath>
namespace nt::aiassist {
namespace {
QString id() { return QUuid::createUuid().toString(QUuid::Id128); }
QString shotKey(const QString& kind) { return kind == "image" ? "keyframe" : "clip"; }
std::optional<QString> shotIdOf(const QJsonObject& board, const QString& input) {
    QStringList ids;
    for (const auto& value : board.value("document").toObject().value("shots").toArray()) { ids.append(value.toObject().value("id").toString()); }
    return resolveId(input, ids);
}
nt::edit::IdSet frozen(const QJsonObject& timeline) {
    nt::edit::EditDoc document;
    for (const auto& value : timeline.value("clips").toArray()) { document.clips.push_back(value.toObject()); }
    for (const auto& value : timeline.value("tracks").toArray()) { const auto track = value.toObject(); document.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()}); }
    return nt::edit::lockedUserTargetIds(document);
}
QString jsonString(const QString& value) {
    const auto bytes = QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact);
    return QString::fromUtf8(bytes.mid(1, bytes.size() - 2));
}
QString hash(const QString& value) { return QString::fromLatin1(QCryptographicHash::hash(value.toUtf8(), QCryptographicHash::Sha256).toHex()); }
QString referenceId(const QJsonObject& image) {
    const auto asset = image.value("asset_id").toString();
    if (!asset.isEmpty()) { return asset; }
    auto uri = image.value("uri").toString();
    if (!uri.startsWith("asset://")) { return {}; }
    uri.remove(0, 8); const auto extension = uri.lastIndexOf('.');
    return extension > 0 ? uri.left(extension) : uri;
}
QJsonArray selectedEntities(const QJsonObject& board, const QJsonObject& shot, const QJsonArray& library) {
    QHash<QString, QJsonObject> byId;
    for (const auto& value : library) { const auto entity = value.toObject(); byId.insert(entity.value("id").toString(), entity); }
    QStringList text;
    for (const auto& key : {"action", "motion", "dialogue", "narration", "slug"}) { text.append(shot.value(key).toString()); }
    const auto lower = text.join('\n').toLower();
    const auto explicitIds = shot.value("entity_ids").toArray();
    QJsonArray result;
    for (const auto& value : board.value("entityIds").toArray()) {
        const auto entity = byId.value(value.toString()); if (entity.isEmpty()) { continue; }
        const auto kind = entity.value("kind").toString(); const auto name = entity.value("name").toString().trimmed().toLower();
        const bool selected = shot.contains("entity_ids") && shot.value("entity_ids").isArray()
            ? explicitIds.contains(entity.value("id")) : kind == "style" || kind == "location" || (!name.isEmpty() && lower.contains(name));
        if (selected) { result.append(entity); }
    }
    return result;
}
QString conditioningHash(const QJsonArray& entities) {
    QStringList entries;
    for (const auto& value : entities) {
        const auto entity = value.toObject(); const auto images = entity.value("reference_images").toArray(); QString reference = "null";
        if (!images.isEmpty()) {
            const auto image = images.first().toObject(); QString identity;
            for (const auto& key : {"asset_id", "uri", "temp_id"}) { identity = image.value(key).toString(); if (!identity.isEmpty()) { break; } }
            const auto data = image.value("data").toString();
            const auto content = data.isEmpty() ? QStringLiteral("null") : jsonString(hash(data));
            reference = "{\"identity\":" + (identity.isEmpty() ? QStringLiteral("null") : jsonString(identity)) + ",\"content_hash\":" + content + '}';
        }
        entries.append("{\"name\":" + jsonString(entity.value("name").toString()) + ",\"descriptor\":" + jsonString(entity.value("descriptor").toString()) + ",\"reference\":" + reference + '}');
    }
    return entries.isEmpty() ? QString{} : hash('[' + entries.join(',') + ']');
}

}
QJsonArray shotEntityLibrary(const QJsonArray& assets) {
    QJsonArray library;
    QHash<QString, QJsonObject> byId;
    for (const auto& value : assets) { const auto asset = value.toObject(); byId.insert(asset.value("id").toString(), asset); }
    const auto entities = nt::ai::catalogEntities(assets);
    for (const auto& value : entities) {
        const auto selected = QJsonObject::fromVariantMap(value.toMap());
        const auto reference = selected.value("referenceAssetId").toString();
        QJsonObject entity{{"type", "entity"}, {"id", selected.value("id")}, {"kind", selected.value("kind")},
            {"name", selected.value("name")}, {"descriptor", selected.value("descriptor")},
            {"voice_id", selected.value("voice_id").isString() ? selected.value("voice_id") : QJsonValue(QJsonValue::Null)},
            {"lora", selected.value("lora").isUndefined() ? QJsonValue(QJsonValue::Null) : selected.value("lora")},
            {"palette", selected.value("palette").isUndefined() ? QJsonValue(QJsonValue::Null) : selected.value("palette")},
            {"reference_images", QJsonArray{QJsonObject{{"type", "image"}, {"asset_id", reference}, {"uri", "asset://" + reference}}}}};
        if (selected.value("description").isString()) { entity.insert("description", selected.value("description")); }
        if (selected.value("tags").isArray()) {
            QJsonArray tags; for (const auto& tag : selected.value("tags").toArray()) { if (tag.isString()) { tags.append(tag); } }
            entity.insert("tags", tags);
        }
        const auto asset = byId.value(selected.value("id").toString());
        entity.insert("project_id", asset.value("project_id").isString() ? asset.value("project_id") : QJsonValue("default"));
        if (!asset.value("created_at").isUndefined()) { entity.insert("created_at", asset.value("created_at")); }
        library.append(entity);
    }
    return library;
}
std::optional<double> linkedShotRenderSeconds(const QJsonObject& shot, const QJsonObject& script) {
    const auto ids = shot.value("script_line_ids").toArray();
    if (ids.isEmpty() || shot.value("duration_source").toString() == "manual") { return std::nullopt; }
    QHash<QString, QJsonObject> lines;
    for (const auto& section : script.value("document").toObject().value("sections").toArray()) {
        for (const auto& value : section.toObject().value("lines").toArray()) { const auto line = value.toObject(); lines.insert(line.value("id").toString(), line); }
    }
    double total = 0;
    for (const auto& id : ids) {
        const auto line = lines.value(id.toString()); QJsonObject current;
        for (const auto& value : line.value("takes").toArray()) { if (value.toObject().value("id") == line.value("currentTakeId")) { current = value.toObject(); break; } }
        if (current.value("assetId").toString().isEmpty()) { return std::nullopt; }
        const double ms = current.value("durationMs").toDouble();
        total += (ms > 0 ? ms : 3000) + std::max(0.0, line.value("pauseAfterMs").toDouble());
    }
    return total > 0 ? std::optional<double>(std::ceil(total / 1000)) : std::nullopt;
}
ShotRenderPlan planShotRender(const QJsonObject& response, const QString& shotId, const QString& kind, const QJsonObject& model, const QJsonArray& entityLibrary, std::optional<double> linkedDurationSeconds) {
    ShotRenderPlan plan;
    const auto resolved = shotIdOf(response, shotId);
    if (!resolved || (kind != "image" && kind != "video")) { plan.error = "Choose an existing storyboard shot and media kind."; return plan; }
    if (model.value("id").toString().isEmpty() || model.value("provider").toString().isEmpty()) { plan.error = "Choose a shot model."; return plan; }
    const auto board = response.value("document").toObject();
    for (const auto& value : board.value("shots").toArray()) { if (value.toObject().value("id").toString() == *resolved) { plan.shot = value.toObject(); break; } }
    plan.shotId = *resolved;
    const auto entities = selectedEntities(board, plan.shot, entityLibrary);
    QJsonArray entityReferences;
    for (const auto& entity : entities) {
        for (const auto& value : entity.toObject().value("reference_images").toArray()) {
            const auto asset = referenceId(value.toObject()); if (!asset.isEmpty()) { entityReferences.append(asset); }
        }
    }
    QJsonValue styleEntityId = QJsonValue::Null;
    QHash<QString, QString> kinds;
    for (const auto& value : entityLibrary) { const auto entity = value.toObject(); kinds.insert(entity.value("id").toString(), entity.value("kind").toString()); }
    for (const auto& value : board.value("entityIds").toArray()) { if (kinds.value(value.toString()) == "style") { styleEntityId = value; } }
    auto mode = plan.shot.value("render_mode").toString();
    if (mode != "direct" && mode != "reference") { mode = "keyframe"; }
    const auto requirement = plan.shot.value("production").toObject();
    if (!requirement.value("protected_inputs").toArray().isEmpty()) { plan.error = "This generation route cannot prove protected source fidelity. Materialize protected assets and exact values as editable Timeline layers instead."; return plan; }
    const auto strategy = requirement.value("media_strategy").toString();
    if (kind == "video" && strategy == "still_motion_graphics") { plan.error = "still_motion_graphics forbids video generation. Materialize editable Timeline layers instead."; return plan; }
    const auto camera = plan.shot.value("camera").toObject();
    QStringList parts;
    const auto add = [&parts](const QString& text, const QString& suffix = {}) { if (!text.trimmed().isEmpty()) { parts.append(text.trimmed() + suffix); } };
    if (kind == "video" && mode == "keyframe") { add(plan.shot.value("motion").toString()); add(plan.shot.value("action").toString()); }
    else {
        add(plan.shot.value("action").toString()); add(camera.value("framing").toString(), " shot"); add(camera.value("angle").toString()); add(camera.value("lens").toString(), " lens");
        for (const auto& value : board.value("screenplay").toObject().value("scenes").toArray()) {
            const auto scene = value.toObject(); if (scene.value("id") == plan.shot.value("scene_id")) { add(scene.value("lighting").toString()); break; }
        }
        if (kind == "video") { add(plan.shot.value("motion").toString()); }
    }
    if (kind == "video") { add(camera.value("movement").toString()); add(camera.value("equipment").toString()); }
    if (kind == "image" || mode != "keyframe") { add(board.value("style").toString()); }
    QString prompt = parts.join(", ");
    const auto productionPrompt = prompt;
    if (kind == "video") {
        const auto direction = plan.shot.value("production").toObject().value("local_direction").toString();
        if (!direction.trimmed().isEmpty()) { prompt += "\n\n" + direction; }
    }
    plan.renderInputs = {{"kind", kind == "image" ? "keyframe" : "clip"},
        {"prompt_hash", QString::fromLatin1(QCryptographicHash::hash(prompt.toUtf8(), QCryptographicHash::Sha256).toHex())},
        {"model", model.value("id")}, {"aspect_ratio", board.value("aspectRatio").toString("16:9")}, {"style_entity_id", styleEntityId},
        {"recorded_at", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
    if (kind == "video") {
        plan.renderInputs.insert("render_mode", mode);
        if (mode == "keyframe") { plan.renderInputs.insert("source_version_id", plan.shot.value("keyframe").toObject().value("asset_id")); }
    } else { plan.renderInputs.insert("reference_asset_ids", QJsonArray{}); }
    if (kind == "image") {
        plan.renderInputs.insert("reference_asset_ids", entityReferences);
        const auto conditioning = conditioningHash(entities);
        if (!conditioning.isEmpty()) { plan.renderInputs.insert("entity_conditioning_hash", conditioning); }
    }
    QStringList tokens;
    for (const auto& entity : entities) { tokens.append("entity://" + entity.toObject().value("id").toString()); }
    const bool hasEntityImage = std::any_of(entities.begin(), entities.end(), [](const QJsonValue& value) {
        return !value.toObject().value("reference_images").toArray().isEmpty();
    });
    const bool useEditModel = kind == "image" && hasEntityImage && model.value("supported_tasks").toArray().contains("image_to_image");
    if (kind == "video" || useEditModel) {
        if (!tokens.isEmpty()) { prompt += "\n" + tokens.join(' '); }
    } else {
        QStringList lines; QSet<QString> seen;
        for (const auto& value : entities) {
            const auto entity = value.toObject(); const auto name = entity.value("name").toString().trimmed(); const auto descriptor = entity.value("descriptor").toString().trimmed();
            const auto key = name + ": " + descriptor;
            if (descriptor.isEmpty() || seen.contains(key)) { continue; }
            seen.insert(key); lines.append(name.isEmpty() ? "- " + descriptor : "- " + name + ": " + descriptor);
        }
        if (!lines.isEmpty()) { prompt += "\n\nConsistency references:\n" + lines.join('\n'); }
    }
    if (prompt.trimmed().isEmpty()) { plan.error = "Describe the shot before rendering."; return plan; }
    plan.request = {{"mode", kind}, {"prompt", prompt}, {"provider", model.value("provider")}, {"model", model.value("id")},
        {"aspect_ratio", board.value("aspectRatio").toString("16:9")}, {"resolution", kind == "image" ? "1K" : "1080p"}, {"variations", 1}};
    QString task = kind == "image" ? "text_to_image" : mode == "keyframe" ? "image_to_video" : mode == "reference" ? "reference_to_video" : "text_to_video";
    if (kind == "video" && mode == "keyframe") {
        const auto asset = plan.shot.value("keyframe").toObject().value("asset_id").toString();
        if (asset.isEmpty()) { plan.error = "Generate a persisted still first, or choose direct rendering."; return plan; }
        plan.request.insert("source_asset_id", asset);
    }
    QJsonArray productionReferences;
    for (const auto& value : board.value("creativeContext").toObject().value("reference_bindings").toArray()) { productionReferences.append(value); }
    for (const auto& value : plan.shot.value("production").toObject().value("reference_bindings").toArray()) { productionReferences.append(value); }
    if (kind == "video" && (mode == "reference" || !productionReferences.isEmpty())) {
        QJsonArray assetIds; QSet<QString> seen;
        const auto append = [&assetIds, &seen](const QString& asset) { if (!asset.trimmed().isEmpty() && !seen.contains(asset)) { seen.insert(asset); assetIds.append(asset); } };
        if (mode == "reference") { for (const auto& asset : entityReferences) { append(asset.toString()); } }
        for (const auto& value : productionReferences) { append(value.toObject().value("asset_id").toString()); }
        if (assetIds.isEmpty()) { plan.error = "Reference rendering needs persisted reference images."; return plan; }
        QJsonArray images; for (const auto& asset : assetIds) { images.append(QJsonObject{{"type", "image"}, {"asset_id", asset}}); }
        plan.request.insert("reference_images", images); plan.request.insert("capability", "reference_to_video"); plan.request.remove("source_asset_id");
        task = "reference_to_video";
        plan.renderInputs.insert("render_mode", "reference"); plan.renderInputs.remove("source_version_id");
        plan.renderInputs.insert("reference_asset_ids", assetIds);
    }
    if (kind == "video") {
        QJsonArray entityIds; for (const auto& value : entities) { entityIds.append(value.toObject().value("id")); }
        const auto creative = board.value("creativeContext").isObject() ? board.value("creativeContext").toObject() : board.value("creative_context").toObject();
        QJsonObject input{{"batchId", model.value("productionBatchId").toString("storyboard-render-plan")}, {"destinationId", plan.shotId},
            {"destinationKind", "storyboard_shot"}, {"operation", "initial_generation"}, {"prompt", productionPrompt}, {"requirement", requirement},
            {"entityIds", entityIds}, {"referenceAssetIds", mode == "reference" ? entityReferences : QJsonArray{}},
            {"referenceBindings", creative.value("reference_bindings").toArray()}, {"provider", model.value("provider")}, {"model", model.value("id")},
            {"routeSupport", QJsonObject{{"referenceToVideo", true}, {"audioDrivenPerformance", false}}}};
        const auto seconds = linkedDurationSeconds.value_or(plan.shot.value("duration_seconds").toDouble());
        if (seconds > 0) { input.insert("requestedDurationMs", std::round(seconds * 1000)); }
        const auto compiled = assistantCompileProduction(input);
        if (compiled.contains("error")) { plan.error = compiled.value("error").toString(); return plan; }
        plan.productionCandidates = compiled.value("candidates").toArray();
        if (plan.productionCandidates.isEmpty()) { plan.error = "Production compilation returned no candidate."; return plan; }
        const auto candidate = plan.productionCandidates.first().toObject();
        const auto snapshot = candidate.value("snapshot").toObject();
        auto compiledPrompt = snapshot.value("prompt").toString();
        if (!tokens.isEmpty()) { compiledPrompt += "\n" + tokens.join(' '); }
        plan.request.insert("prompt", compiledPrompt);
        if (snapshot.contains("requestedDurationMs")) { plan.request.insert("duration", snapshot.value("requestedDurationMs").toDouble() / 1000); }
        if (candidate.value("executionRoute") == "reference_to_video") {
            QJsonArray images; for (const auto& asset : candidate.value("referenceAssetIds").toArray()) { images.append(QJsonObject{{"type", "image"}, {"asset_id", asset}}); }
            plan.request.insert("reference_images", images); plan.request.insert("capability", "reference_to_video"); plan.request.remove("source_asset_id");
            task = "reference_to_video";
            plan.renderInputs.insert("render_mode", "reference"); plan.renderInputs.remove("source_version_id");
            plan.renderInputs.insert("reference_asset_ids", candidate.value("referenceAssetIds"));
        }
    }
    const auto tasks = model.value("supported_tasks").toArray();
    if (!tasks.isEmpty() && !tasks.contains(task)) { plan.error = "The selected model does not support " + task + '.'; return plan; }
    if (kind == "image") { plan.requests.append(plan.request); }
    else { for (const auto& candidate : plan.productionCandidates) { Q_UNUSED(candidate); plan.requests.append(plan.request); } }
    return plan;
}
QJsonObject appendShotCandidate(QJsonObject board, const QString& shotId, const QString& kind, const QJsonObject& candidate) {
    auto document = board.value("document").toObject(); auto shots = document.value("shots").toArray();
    const auto resolved = shotIdOf(board, shotId); if (!resolved || candidate.value("asset_id").toString().isEmpty()) { return board; }
    const auto key = shotKey(kind); const auto versionsKey = key + "_versions";
    for (qsizetype i = 0; i < shots.size(); ++i) {
        auto shot = shots.at(i).toObject(); if (shot.value("id").toString() != *resolved) { continue; }
        auto versions = shot.value(versionsKey).toArray();
        if (!shot.contains(versionsKey) && shot.value(key).isObject()) { versions.append(shot.value(key)); }
        for (const auto& value : versions) { if (value.toObject().value("asset_id") == candidate.value("asset_id")) { return board; } }
        versions.append(candidate); shot.insert(versionsKey, versions); shots[i] = shot; break;
    }
    document.insert("shots", shots); board.insert("document", document); return board;
}
QJsonObject acceptShotCandidate(QJsonObject board, const QString& shotId, const QString& kind, int index) {
    const auto resolved = shotIdOf(board, shotId); if (!resolved || index < 0) { return board; }
    auto document = board.value("document").toObject(); auto shots = document.value("shots").toArray(); const auto key = shotKey(kind);
    for (qsizetype i = 0; i < shots.size(); ++i) {
        auto shot = shots.at(i).toObject(); if (shot.value("id").toString() != *resolved) { continue; }
        auto versions = shot.value(key + "_versions").toArray();
        if (!shot.contains(key + "_versions") && shot.value(key).isObject()) { versions.append(shot.value(key)); }
        if (index >= versions.size() || versions.at(index).toObject().value("asset_id").toString().isEmpty()) { return board; }
        shot.insert(key, versions.at(index)); shot.insert("status", kind == "image" ? "keyframe_ready" : "rendered"); shots[i] = shot; break;
    }
    document.insert("shots", shots); board.insert("document", document); return board;
}
bool shotClipEditable(const QJsonObject& timeline, const QString& clipId) {
    return frozen(timeline).count(clipId) == 0;
}
QJsonObject linkShot(QJsonObject timeline, const QJsonObject& input) {
    auto clips = timeline.value("clips").toArray(); QJsonObject source;
    QStringList ids; for (const auto& value : clips) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = resolveId(input.value("clipId").toString(), ids); if (!resolved) { return timeline; }
    for (const auto& value : clips) { if (value.toObject().value("id").toString() == *resolved) { source = value.toObject(); break; } }
    const auto locked = frozen(timeline);
    if (source.isEmpty() || locked.count(source.value("id").toString()) || !source.value("scriptLineId").toString().isEmpty() || source.value("mediaType") != "video") { return timeline; }
    const bool unlink = input.value("unlink").toBool();
    if (!unlink && (input.value("boardId").toString().isEmpty() || input.value("shotId").toString().isEmpty())) { return timeline; }
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto candidate = clips.at(i).toObject();
        const bool partner = candidate.value("id") == source.value("id") || (!source.value("linkId").toString().isEmpty() && candidate.value("linkId") == source.value("linkId") && (unlink || candidate.value("mediaType") == "audio") &&
            (!unlink || candidate.value("storyboardShotId") == source.value("storyboardShotId")));
        if (!partner || !candidate.value("scriptLineId").toString().isEmpty() || locked.count(candidate.value("id").toString())) { continue; }
        if (unlink) { candidate.remove("storyboardBoardId"); candidate.remove("storyboardShotId"); }
        else { candidate.insert("storyboardBoardId", input.value("boardId")); candidate.insert("storyboardShotId", input.value("shotId")); }
        clips[i] = candidate;
    }
    timeline.insert("clips", clips); return timeline;
}
QJsonObject insertDerivedClip(QJsonObject timeline, const QJsonObject& input) {
    const auto source = input.value("source").toObject(); if (source.isEmpty() || !shotClipEditable(timeline, source.value("id").toString())) { return timeline; }
    bool exists = false;
    for (const auto& value : timeline.value("clips").toArray()) { if (value.toObject() == source) { exists = true; break; } }
    if (!exists) { return timeline; }
    auto tracks = timeline.value("tracks").toArray(); qsizetype slot = 0;
    for (qsizetype i = 0; i < tracks.size(); ++i) { if (tracks.at(i).toObject().value("id") == source.value("trackId")) { slot = i; break; } }
    const auto trackId = id(); tracks.insert(slot, QJsonObject{{"id", trackId}, {"type", "video"}, {"name", "Derived shots"}, {"visible", true}, {"locked", false}});
    for (qsizetype i = 0; i < tracks.size(); ++i) { auto track = tracks.at(i).toObject(); track.insert("index", static_cast<int>(i)); tracks[i] = track; }
    auto clips = timeline.value("clips").toArray(); clips.append(QJsonObject{{"id", id()}, {"trackId", trackId}, {"name", input.value("name")}, {"startMs", source.value("startMs")}, {"durationMs", source.value("durationMs")},
        {"mediaType", "video"}, {"sourceType", "imported"}, {"status", "draft"}, {"locked", false}, {"versions", QJsonArray{}}, {"storyboardBoardId", source.value("storyboardBoardId")}, {"storyboardShotId", input.value("shotId")}});
    timeline.insert("tracks", tracks); timeline.insert("clips", clips); return timeline;
}
QJsonObject deriveShot(QJsonObject board, const QJsonObject& sourceClip, const QJsonArray& references, const QString& action, const QString& newShotId) {
    auto document = board.value("document").toObject(); auto shots = document.value("shots").toArray();
    for (qsizetype i = 0; i < shots.size(); ++i) {
        const auto source = shots.at(i).toObject(); if (source.value("id") != sourceClip.value("storyboardShotId")) { continue; }
        QJsonObject shot{{"id", newShotId}, {"type", "shot"}, {"slug", source.value("slug").toString(QString("Shot %1").arg(source.value("index").toInt()+1)) + " (derived)"},
            {"action", action.trimmed().isEmpty() ? source.value("action") : QJsonValue(action.trimmed())}, {"duration_seconds", sourceClip.value("durationMs").toDouble()/1000}, {"duration_source", "manual"}, {"render_mode", "reference"}, {"status", "planned"},
            {"production", QJsonObject{{"schema_version", 1}, {"speech_mode", "none"}, {"requested_take_count", 1}, {"reference_bindings", references}}}};
        for (const auto& key : {"camera", "motion", "entity_ids", "location_id", "clip_model", "scene_id"}) { if (source.contains(key)) { shot.insert(key, source.value(key)); } }
        shots.insert(i + 1, shot);
        for (qsizetype j = 0; j < shots.size(); ++j) { auto item = shots.at(j).toObject(); item.insert("index", static_cast<int>(j)); shots[j] = item; }
        document.insert("shots", shots); board.insert("document", document); return board;
    }
    return board;
}
}
