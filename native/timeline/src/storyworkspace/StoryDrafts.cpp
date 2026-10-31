#include "storyworkspace/StoryDrafts.h"
#include "aiassist/AssistDocument.h"
#include <QJsonArray>
#include <QSet>
#include <algorithm>
#include <cmath>

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
    if (!((field == "name" && value.isString()) || (field == "entityId" && (value.isNull() || identifier(value))))) {
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
}
