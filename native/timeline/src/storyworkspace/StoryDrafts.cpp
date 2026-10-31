#include "storyworkspace/StoryDrafts.h"
#include "aiassist/AssistDocument.h"
#include <QJsonArray>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <vector>

namespace nt::storyworkspace {
namespace {
DraftResult invalid(const QString& message) { return {{}, message}; }
bool identifier(const QJsonValue& value) {
    if (!value.isString() || value.toString().trimmed().isEmpty()) { return false; }
    const auto text = value.toString();
    // References have no authorized lookup scope here. Keep full and named ids.
    const bool hexPrefix = text.size() == 12 && std::all_of(text.begin(), text.end(), [](QChar c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    });
    return !hexPrefix;
}
bool idArray(const QJsonValue& value) {
    if (!value.isArray()) { return false; }
    QSet<QString> seen;
    for (const auto& id : value.toArray()) {
        if (!identifier(id) || seen.contains(id.toString())) { return false; }
        seen.insert(id.toString());
    }
    return true;
}
bool references(const QJsonValue& value, bool bindings) {
    if (!value.isArray() || value.toArray().size() > 32) { return false; }
    for (const auto& entry : value.toArray()) {
        if (!entry.isObject()) { return false; }
        const auto ref = entry.toObject();
        if (bindings) {
            if (!identifier(ref.value("asset_id")) || !QStringList{"product", "character", "location", "style"}.contains(ref.value("kind").toString())) { return false; }
            if (ref.contains("entity_id") && !identifier(ref.value("entity_id"))) { return false; }
            if (ref.contains("label") && (!ref.value("label").isString() || ref.value("label").toString().trimmed().isEmpty())) { return false; }
        } else {
            if (!ref.value("uri").isString() || ref.value("uri").toString().trimmed().isEmpty()) { return false; }
            const auto uri = ref.value("uri").toString();
            for (const auto& scheme : {QStringLiteral("asset://"), QStringLiteral("entity://")}) {
                if (uri.startsWith(scheme) && !identifier(uri.mid(scheme.size()))) { return false; }
            }
            for (const auto& key : {"name", "revision"}) {
                if (ref.contains(key) && (!ref.value(key).isString() || ref.value(key).toString().trimmed().isEmpty())) { return false; }
            }
        }
    }
    return true;
}
// Shots in board order: by index, then grouped under the scene of their first appearance.
std::vector<QJsonObject> sceneOrdered(const QJsonArray& source) {
    std::vector<QJsonObject> sorted;
    for (const auto& value : source) { sorted.push_back(value.toObject()); }
    std::stable_sort(sorted.begin(), sorted.end(), [](const QJsonObject& a, const QJsonObject& b) { return a.value("index").toInt() < b.value("index").toInt(); });
    std::vector<QString> scenes;
    for (const auto& shot : sorted) {
        const auto scene = shot.value("scene_id").toString();
        if (std::find(scenes.begin(), scenes.end(), scene) == scenes.end()) { scenes.push_back(scene); }
    }
    std::vector<QJsonObject> ordered;
    for (const auto& scene : scenes) { for (const auto& shot : sorted) { if (shot.value("scene_id").toString() == scene) { ordered.push_back(shot); } } }
    return ordered;
}
// The caller's order is the intent: stamp it, group scenes into contiguous runs, and stamp again.
DraftResult restamped(const QJsonObject& board, std::vector<QJsonObject> shots) {
    QJsonArray proposed;
    for (auto& shot : shots) { shot.insert("index", static_cast<int>(proposed.size())); proposed.append(shot); }
    QJsonArray result;
    for (auto shot : sceneOrdered(proposed)) { shot.insert("index", static_cast<int>(result.size())); result.append(shot); }
    auto document = board.value("document").toObject(); document.insert("shots", result);
    auto next = board; next.insert("document", document); return {next, {}};
}
}
DraftResult patchShot(const QJsonObject& board, const QString& shotId, const QString& field, const QJsonValue& value) {
    auto document = board.value("document").toObject();
    if (!document.value("shots").isArray()) { return invalid("Open a storyboard before editing a shot."); }
    auto shots = document.value("shots").toArray();
    QStringList ids;
    for (const auto& shot : shots) { ids.append(shot.toObject().value("id").toString()); }
    const auto id = nt::aiassist::resolveId(shotId, ids);
    if (!id) { return invalid("Shot is unavailable or its prefix is ambiguous."); }
    const QStringList textFields{"action", "dialogue", "narration", "motion", "sound", "notes", "end_state", "slug"};
    const QStringList cameraFields{"camera.framing", "camera.angle", "camera.movement", "camera.lens", "camera.equipment"};
    const bool referenceField = field == "production.references" || field == "production.reference_bindings";
    const bool valid = ((textFields.contains(field) || cameraFields.contains(field)) && value.isString()) ||
        (field == "duration_seconds" && value.isDouble() && std::isfinite(value.toDouble()) && value.toDouble() > 0) ||
        (field == "entity_ids" && idArray(value)) ||
        (field == "location_id" && (value.isNull() || identifier(value))) ||
        (field == "render_mode" && QStringList{"keyframe", "direct", "reference"}.contains(value.toString())) ||
        (referenceField && references(value, field == "production.reference_bindings"));
    if (!valid) { return invalid("Unsupported shot field or invalid value. Reference ids must be full ids."); }
    for (qsizetype i = 0; i < shots.size(); ++i) {
        auto shot = shots[i].toObject();
        if (shot.value("id").toString() != *id) { continue; }
        if (cameraFields.contains(field) || referenceField) {
            const auto group = field.section('.', 0, 0);
            auto nested = shot.value(group).toObject();
            if (referenceField) {
                // The persistence schema fills these defaults on every production object.
                if (!nested.contains("schema_version")) { nested.insert("schema_version", 1); }
                if (!nested.contains("speech_mode")) { nested.insert("speech_mode", "none"); }
                if (!nested.contains("requested_take_count")) { nested.insert("requested_take_count", 1); }
            }
            nested.insert(field.section('.', 1), value); shot.insert(group, nested);
        } else { shot.insert(field, value); }
        if (field == "duration_seconds") { shot.insert("duration_source", "manual"); }
        shots[i] = shot;
    }
    document.insert("shots", shots);
    auto result = board; result.insert("document", document);
    return {result, {}};
}
DraftResult patchSpeaker(const QJsonObject& script, const QString& speakerId, const QString& field, const QJsonValue& value) {
    auto document = script.value("document").toObject();
    if (!document.value("cast").isArray()) { return invalid("Open a script before editing its cast."); }
    auto cast = document.value("cast").toArray(); QStringList ids;
    for (const auto& speaker : cast) { ids.append(speaker.toObject().value("id").toString()); }
    const auto id = nt::aiassist::resolveId(speakerId, ids);
    if (!id) { return invalid("Speaker is unavailable or its prefix is ambiguous."); }
    const auto binding = value.toObject();
    const bool voice = field == "voice" && (value.isNull() || (value.isObject()
        && !binding.value("provider").toString().trimmed().isEmpty() && !binding.value("model").toString().trimmed().isEmpty()
        && binding.value("voice").isString()));
    if (!((field == "name" && value.isString()) || (field == "entityId" && (value.isNull() || identifier(value))) || voice)) {
        return invalid("Unsupported speaker field or invalid value. Entity ids must be full ids.");
    }
    for (qsizetype i = 0; i < cast.size(); ++i) {
        auto speaker = cast[i].toObject();
        if (speaker.value("id").toString() == *id) { speaker.insert(field, value); cast[i] = speaker; }
    }
    document.insert("cast", cast); auto result = script; result.insert("document", document); return {result, {}};
}
DraftResult patchEntity(const QJsonObject& asset, const QString& field, const QJsonValue& value) {
    auto metadata = asset.value("metadata").toObject(); auto marker = metadata.value("nodetool_entity").toObject();
    if (!QStringList{"character", "location", "style", "prop"}.contains(marker.value("kind").toString())) { return invalid("This asset is not a production entity."); }
    const bool text = QStringList{"name", "descriptor", "description"}.contains(field) && value.isString();
    const bool voice = field == "voice_id" && (value.isString() || value.isNull());
    const bool reference = field == "reference_asset_id" && (value.isNull() || identifier(value));
    if (!text && !voice && !reference) { return invalid("Unsupported entity field or invalid value. Reference ids must be full ids."); }
    if (reference && value.isNull()) { marker.remove(field); } else { marker.insert(field, value); }
    metadata.insert("nodetool_entity", marker); auto result = asset; result.insert("metadata", metadata); return {result, {}};
}
DraftResult patchDocument(const QJsonObject& resource, const QString& field, const QJsonValue& value) {
    auto document = resource.value("document").toObject();
    if (!document.value("shots").isArray() || field != "entityIds" || !idArray(value)) {
        return invalid("Unsupported document field or invalid value. Entity ids must be full ids.");
    }
    // Match the web store: removing an entity from a board removes its shot bindings.
    QSet<QString> kept, removed;
    for (const auto& id : value.toArray()) { kept.insert(id.toString()); }
    for (const auto& id : document.value("entityIds").toArray()) {
        if (!kept.contains(id.toString())) { removed.insert(id.toString()); }
    }
    auto shots = document.value("shots").toArray();
    for (qsizetype i = 0; i < shots.size(); ++i) {
        auto shot = shots[i].toObject();
        if (!shot.value("entity_ids").isArray()) { continue; }
        QJsonArray ids;
        for (const auto& id : shot.value("entity_ids").toArray()) {
            if (!removed.contains(id.toString())) { ids.append(id); }
        }
        shot.insert("entity_ids", ids); shots[i] = shot;
    }
    document.insert("entityIds", value); document.insert("shots", shots);
    auto result = resource; result.insert("document", document); return {result, {}};
}
DraftResult applyShotDraft(const QJsonObject& board, const QString& shotId, const QJsonObject& patch) {
    auto document = board.value("document").toObject();
    if (!document.value("shots").isArray()) { return invalid("Open a storyboard before editing a shot."); }
    const QStringList text{"slug", "action", "dialogue", "notes", "motion", "end_state", "sound"};
    for (auto it = patch.begin(); it != patch.end(); ++it) {
        const auto& value = it.value(); const auto& key = it.key();
        const bool valid = (text.contains(key) && (value.isString() || (value.isNull() && key != "action"))) ||
            (key == "duration_seconds" && (value.isNull() || (value.isDouble() && std::isfinite(value.toDouble()) && value.toDouble() > 0))) ||
            (key == "duration_source" && (value.isNull() || QStringList{"manual", "audio"}.contains(value.toString()))) ||
            (key == "render_mode" && QStringList{"keyframe", "direct", "reference"}.contains(value.toString())) ||
            ((key == "camera" || key == "graphics") && (value.isNull() || value.isObject()));
        if (!valid) { return invalid("Unsupported shot field or invalid value: " + key); }
    }
    auto shots = document.value("shots").toArray();
    for (qsizetype i = 0; i < shots.size(); ++i) {
        auto shot = shots[i].toObject();
        if (shot.value("id").toString() != shotId) { continue; }
        for (auto it = patch.begin(); it != patch.end(); ++it) {
            if (it.value().isNull()) { shot.remove(it.key()); } else { shot.insert(it.key(), it.value()); }
        }
        shots[i] = shot; document.insert("shots", shots);
        auto result = board; result.insert("document", document); return {result, {}};
    }
    return invalid("The shot is no longer on this storyboard.");
}
DraftResult nudgeShot(const QJsonObject& board, const QString& shotId, int direction) {
    auto document = board.value("document").toObject();
    const auto source = document.value("shots").toArray();
    std::vector<QJsonObject> sorted;
    for (const auto& value : source) { sorted.push_back(value.toObject()); }
    std::stable_sort(sorted.begin(), sorted.end(), [](const QJsonObject& a, const QJsonObject& b) { return a.value("index").toInt() < b.value("index").toInt(); });
    // Scenes in the order of their first shot, as the board shows them.
    std::vector<std::pair<QString, std::vector<QJsonObject>>> groups;
    for (const auto& shot : sorted) {
        const auto scene = shot.value("scene_id").toString();
        auto group = std::find_if(groups.begin(), groups.end(), [&scene](const auto& entry) { return entry.first == scene; });
        if (group == groups.end()) { groups.push_back({scene, {}}); group = groups.end() - 1; }
        group->second.push_back(shot);
    }
    for (auto& [scene, shots] : groups) {
        const auto from = std::find_if(shots.begin(), shots.end(), [&shotId](const QJsonObject& shot) { return shot.value("id").toString() == shotId; });
        if (from == shots.end()) { continue; }
        const auto at = from - shots.begin(); const auto to = at + (direction < 0 ? -1 : 1);
        if (to < 0 || to >= static_cast<qsizetype>(shots.size())) { return invalid("The shot is already at the edge of its scene."); }
        std::swap(shots[at], shots[to]);
        QJsonArray ordered;
        for (const auto& entry : groups) { for (auto shot : entry.second) { shot.insert("index", static_cast<int>(ordered.size())); ordered.append(shot); } }
        document.insert("shots", ordered);
        auto result = board; result.insert("document", document); return {result, {}};
    }
    return invalid("The shot is no longer on this storyboard.");
}
DraftResult removeShotVersion(const QJsonObject& board, const QString& shotId, const QString& kind, int index) {
    if (kind != "image" && kind != "video") { return invalid("Choose a still or clip take."); }
    auto document = board.value("document").toObject();
    auto shots = document.value("shots").toArray();
    const QString key = kind == "image" ? "keyframe" : "clip";
    const auto same = [](const QJsonObject& a, const QJsonObject& b) {
        return b.value("asset_id").toString().isEmpty() ? a.value("uri") == b.value("uri") : a.value("asset_id") == b.value("asset_id");
    };
    for (qsizetype i = 0; i < shots.size(); ++i) {
        auto shot = shots[i].toObject();
        if (shot.value("id").toString() != shotId) { continue; }
        auto versions = shot.value(key + "_versions").toArray();
        if (!shot.contains(key + "_versions") && shot.value(key).isObject()) { versions.append(shot.value(key)); }
        if (index < 0 || index >= versions.size()) { return invalid("The take is no longer on this shot."); }
        const auto current = shot.value(key).toObject();
        qsizetype selected = -1;
        for (qsizetype v = 0; v < versions.size() && !current.isEmpty(); ++v) { if (same(versions.at(v).toObject(), current)) { selected = v; break; } }
        versions.removeAt(index);
        QJsonValue next = QJsonValue::Null;
        if (!versions.isEmpty()) { next = selected == index ? versions.at(std::min<qsizetype>(index, versions.size() - 1)) : shot.value(key); }
        shot.insert(key, next); shot.insert(key + "_versions", versions);
        const auto status = shot.value("status").toString();
        const bool still = shot.value("keyframe").isObject();
        if (versions.isEmpty() && kind == "image" && (status == "keyframe_ready" || status == "approved" || (status == "failed" && !shot.value("clip").isObject()))) { shot.insert("status", "planned"); }
        if (versions.isEmpty() && kind == "video" && QStringList{"rendered", "failed", "clip_generating"}.contains(status)) { shot.insert("status", still ? "keyframe_ready" : "planned"); }
        shots[i] = shot; document.insert("shots", shots);
        auto result = board; result.insert("document", document); return {result, {}};
    }
    return invalid("The shot is no longer on this storyboard.");
}
DraftResult insertShot(const QJsonObject& board, const QString& afterShotId, const QString& newShotId) {
    auto shots = sceneOrdered(board.value("document").toObject().value("shots").toArray());
    if (!board.value("document").toObject().value("shots").isArray() || newShotId.isEmpty()) { return invalid("Open a storyboard before adding a shot."); }
    const auto after = std::find_if(shots.begin(), shots.end(), [&afterShotId](const QJsonObject& shot) { return shot.value("id").toString() == afterShotId; });
    QJsonObject blank{{"type", "shot"}, {"id", newShotId}, {"index", 0}, {"action", ""}, {"status", "planned"}};
    // An appended shot ends the last scene, so it opens no nameless scene of its own.
    const auto scene = after != shots.end() ? after->value("scene_id") : shots.empty() ? QJsonValue{} : shots.back().value("scene_id");
    if (scene.isString()) { blank.insert("scene_id", scene); }
    shots.insert(after != shots.end() ? after + 1 : shots.end(), blank);
    return restamped(board, shots);
}
DraftResult duplicateShot(const QJsonObject& board, const QString& shotId, const QString& newShotId) {
    auto shots = sceneOrdered(board.value("document").toObject().value("shots").toArray());
    const auto source = std::find_if(shots.begin(), shots.end(), [&shotId](const QJsonObject& shot) { return shot.value("id").toString() == shotId; });
    if (source == shots.end() || newShotId.isEmpty()) { return invalid("The shot is no longer on this storyboard."); }
    // The copy covers no script line, so the link fields stay with the original.
    auto copy = *source;
    copy.insert("id", newShotId); copy.insert("duration_source", "manual");
    copy.remove("script_line_ids"); copy.remove("script_text_snapshot"); copy.remove("covered_by");
    shots.insert(source + 1, copy);
    return restamped(board, shots);
}
DraftResult removeShot(const QJsonObject& board, const QString& shotId) {
    const auto source = sceneOrdered(board.value("document").toObject().value("shots").toArray());
    std::vector<QJsonObject> shots;
    bool found = false;
    for (auto shot : source) {
        if (shot.value("id").toString() == shotId) { found = true; continue; }
        // Coverage of a removed shot has no picture behind it: the shot needs its own render again.
        if (shot.value("covered_by").toObject().value("shot_id").toString() == shotId) {
            shot.insert("covered_by", QJsonValue::Null);
            if (shot.value("status").toString() == "rendered" && !shot.value("clip").isObject()) { shot.insert("status", shot.value("keyframe").isObject() ? "keyframe_ready" : "planned"); }
        }
        shots.push_back(shot);
    }
    if (!found) { return invalid("The shot is no longer on this storyboard."); }
    return restamped(board, shots);
}
DraftResult moveShot(const QJsonObject& board, const QString& shotId, const QString& sceneId, int position) {
    auto ordered = sceneOrdered(board.value("document").toObject().value("shots").toArray());
    const auto from = std::find_if(ordered.begin(), ordered.end(), [&shotId](const QJsonObject& shot) { return shot.value("id").toString() == shotId; });
    if (from == ordered.end()) { return invalid("The shot is no longer on this storyboard."); }
    const auto at = from - ordered.begin();
    auto moved = *from;
    if (sceneId.isEmpty()) { moved.remove("scene_id"); } else { moved.insert("scene_id", sceneId); }
    ordered.erase(from);
    std::vector<qsizetype> run;
    for (qsizetype i = 0; i < static_cast<qsizetype>(ordered.size()); ++i) { if (ordered[i].value("scene_id").toString() == sceneId) { run.push_back(i); } }
    const auto target = run.empty() ? std::min<qsizetype>(at, ordered.size())
        : run.front() + std::clamp<qsizetype>(position, 0, static_cast<qsizetype>(run.size()));
    ordered.insert(ordered.begin() + target, moved);
    return restamped(board, ordered);
}
DraftResult patchBoard(const QJsonObject& board, const QString& field, const QJsonValue& value) {
    auto document = board.value("document").toObject();
    if (!document.value("shots").isArray()) { return invalid("Open a storyboard before changing its settings."); }
    const QStringList ratios{"16:9", "9:16", "1:1", "4:3", "21:9"};
    auto result = board;
    if (field == "name" && value.isString() && !value.toString().trimmed().isEmpty()) { result.insert("name", value); return {result, {}}; }
    if ((field == "brief" || field == "style") && value.isString()) { document.insert(field, value); }
    else if (field == "aspectRatio" && ratios.contains(value.toString())) { document.insert(field, value); }
    else { return invalid("Unsupported board field or invalid value: " + field); }
    result.insert("document", document); return {result, {}};
}
}
