#include "TimelineMerge.h"

#include <QHash>
#include <QSet>

#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>

namespace nt::server::sync {
namespace {
struct Collection {
    const char* kind;
    const char* field;
};
constexpr std::array collections{
    Collection{"track", "tracks"}, Collection{"trackFolder", "trackFolders"},
    Collection{"clip", "clips"}, Collection{"marker", "markers"},
    Collection{"mediaTrack", "mediaTracks"}, Collection{"transcript", "transcript"}
};
constexpr std::array scalars{
    "storyboardMaterializations", "camera2d", "tempo", "master", "setup",
    "fps", "width", "height", "scriptEnabled"
};

bool nullish(const QJsonValue& value) { return value.isUndefined() || value.isNull(); }

QJsonValue readScalar(const QJsonObject& doc, const QString& field)
{
    const auto value = doc.value(field);
    return (field == "camera2d" || field == "setup") && nullish(value)
        ? QJsonValue(QJsonValue::Null) : value;
}

// QJsonValue equality is structural: object key order is immaterial, arrays
// are ordered, and an absent value (Undefined) differs from Null.
struct Slot {
    QJsonValue value;
    bool contested;
};
Slot resolveSlot(const QJsonValue& base, const QJsonValue& draft, const QJsonValue& server)
{
    if (draft == server) {
        return {draft, false};
    }
    if (draft == base) {
        return {server, false};
    }
    return {draft, server != base};
}

double number(const QJsonObject& object, const char* key)
{
    const auto value = object.value(key);
    if (!value.isDouble() || !std::isfinite(value.toDouble())) {
        throw std::invalid_argument("camera2d requires finite numbers");
    }
    return value.toDouble();
}

QJsonObject parsePosition(const QJsonValue& value)
{
    if (!value.isObject()) {
        throw std::invalid_argument("camera2d position must be an object");
    }
    const auto object = value.toObject();
    return {{"x", number(object, "x")}, {"y", number(object, "y")}};
}

QJsonObject parseCameraPoint(const QJsonObject& object)
{
    QJsonObject result{{"position", parsePosition(object.value("position"))},
                       {"depthPx", number(object, "depthPx")}};
    for (const auto* key : {"focusDepthPx", "aperturePx"}) {
        if (object.contains(key)) {
            const double value = number(object, key);
            if (QLatin1StringView(key) == QLatin1StringView("aperturePx") && value < 0) {
                throw std::invalid_argument("camera2d aperturePx must be nonnegative");
            }
            result.insert(key, value);
        }
    }
    return result;
}

// Mirrors timelineCamera2d.parse: no schema defaults, optional keys stay
// absent, and unknown keys are stripped at all three object levels.
QJsonObject parseCamera(const QJsonValue& value)
{
    if (!value.isObject()) {
        throw std::invalid_argument("camera2d must be an object");
    }
    const auto object = value.toObject();
    auto result = parseCameraPoint(object);
    const double focalLength = number(object, "focalLengthPx");
    if (focalLength <= 0) {
        throw std::invalid_argument("camera2d focalLengthPx must be positive");
    }
    result.insert("focalLengthPx", focalLength);
    if (object.contains("keyframes")) {
        if (!object.value("keyframes").isArray()) {
            throw std::invalid_argument("camera2d keyframes must be an array");
        }
        QJsonArray keyframes;
        for (const auto& frame : object.value("keyframes").toArray()) {
            if (!frame.isObject()) {
                throw std::invalid_argument("camera2d keyframe must be an object");
            }
            auto parsed = parseCameraPoint(frame.toObject());
            parsed.insert("timeMs", number(frame.toObject(), "timeMs"));
            keyframes.append(parsed);
        }
        result.insert("keyframes", keyframes);
    }
    return result;
}

bool truthy(const QJsonValue& value)
{
    if (nullish(value)) {
        return false;
    }
    if (value.isBool()) {
        return value.toBool();
    }
    if (value.isDouble()) {
        return value.toDouble() != 0;
    }
    if (value.isString()) {
        return !value.toString().isEmpty();
    }
    return true;
}

void writeScalar(QJsonObject& doc, const QString& field, QJsonValue value)
{
    if (field == "camera2d") {
        value = nullish(value) ? QJsonValue(QJsonValue::Null) : QJsonValue(parseCamera(value));
    } else if (field == "setup" && nullish(value)) {
        value = QJsonValue::Null;
    } else if (field == "scriptEnabled") {
        value = truthy(value);
    }
    // QJsonObject::insert removes the key for Undefined.
    doc.insert(field, value);
}

struct TouchMap {
    bool hasOps = false;
    QSet<QString> all;
    QHash<QString, QSet<QString>> ids;

    void add(const QString& kind, const QString& id = {})
    {
        if (id.isEmpty()) {
            all.insert(kind);
        } else {
            ids[kind].insert(id);
        }
    }
    bool touches(const QString& kind, const QString& id) const
    {
        return !hasOps || all.contains(kind) || ids.value(kind).contains(id);
    }
};

QString opKind(const QString& tool)
{
    // Keep the web's substring precedence (track before clip).
    for (const auto* kind : {"track", "marker", "transcript", "clip"}) {
        if (tool.contains(QLatin1StringView(kind))) {
            return QString::fromLatin1(kind);
        }
    }
    return {};
}

QStringList idsUnder(const QJsonObject& input, const char* key)
{
    const auto value = input.value(key);
    const auto values = value.isArray() ? value.toArray() : QJsonArray{value};
    QStringList ids;
    for (const auto& item : values) {
        if (item.isString() && !item.toString().isEmpty()) {
            ids.append(item.toString());
        }
    }
    return ids;
}

TouchMap buildTouchMap(const std::optional<QJsonArray>& ops)
{
    TouchMap result;
    result.hasOps = ops && !ops->isEmpty();
    if (!result.hasOps) {
        return result;
    }
    for (const auto& value : *ops) {
        const auto op = value.toObject();
        auto tool = op.value("tool").toString();
        if (tool.startsWith("ui_timeline_")) {
            tool.remove(0, 12);
        }
        const auto input = op.value("input").toObject();
        if (tool == "delete_track_object") {
            result.add("mediaTrack", input.value("trackId").toString());
            result.add("clip");
            continue;
        }
        if (tool == "bind_to_track" || tool == "unbind_track") {
            result.add("clip");
            continue;
        }
        const auto ownKind = opKind(tool);
        bool hit = false;
        constexpr std::array keyedKinds{
            Collection{"clip", "clip_id"}, Collection{"clip", "clipId"},
            Collection{"track", "track_id"}, Collection{"track", "trackId"},
            Collection{"marker", "marker_id"}
        };
        for (const auto& keyed : keyedKinds) {
            for (const auto& id : idsUnder(input, keyed.field)) {
                result.add(keyed.kind, id);
                hit = true;
            }
        }
        for (const auto* key : {"id", "target"}) {
            for (const auto& id : idsUnder(input, key)) {
                if (!ownKind.isEmpty()) {
                    result.add(ownKind, id);
                } else {
                    for (const auto& collection : collections) {
                        result.add(collection.kind, id);
                    }
                }
                hit = true;
            }
        }
        if (!hit) {
            if (!ownKind.isEmpty()) {
                result.add(ownKind);
            } else {
                for (const auto& collection : collections) {
                    result.add(collection.kind);
                }
            }
        }
    }
    return result;
}

QString idOf(const QJsonValue& unit) { return unit.toObject().value("id").toString(); }
QString labelOf(const Collection& collection, const QJsonValue& unit)
{
    const auto name = unit.toObject().value("name").toString();
    return QLatin1StringView(collection.kind) == QLatin1StringView("clip") && !name.isEmpty()
        ? name : idOf(unit);
}

// JavaScript Map retains the first insertion order and the last value/index
// for duplicate ids. QHash alone would lose that order.
struct Entry {
    QJsonValue item;
    qsizetype index;
};
struct UnitMap {
    QStringList order;
    QHash<QString, Entry> entries;

    explicit UnitMap(const QJsonArray& items)
    {
        entries.reserve(items.size());
        order.reserve(items.size());
        for (qsizetype i = 0; i < items.size(); ++i) {
            const auto id = idOf(items[i]);
            if (!entries.contains(id)) {
                order.append(id);
            }
            entries.insert(id, {items[i], i});
        }
    }
    QJsonValue get(const QString& id) const
    {
        const auto it = entries.constFind(id);
        return it == entries.cend() ? QJsonValue(QJsonValue::Undefined) : it->item;
    }
};

void mergeCollection(const Collection& collection, const QJsonObject& base, const QJsonObject& draft,
                     const QJsonObject& server, const TouchMap& touches, MergeResult& result)
{
    const UnitMap b(base.value(collection.field).toArray());
    const UnitMap d(draft.value(collection.field).toArray());
    const UnitMap s(server.value(collection.field).toArray());
    QJsonArray units;
    QSet<QString> refused;
    QHash<QString, QJsonValue> mergedBases;
    const auto conflict = [&](const QString& id, const QJsonValue& labelSource,
                              const QJsonValue& external, const QString& reason,
                              QJsonValue candidate = QJsonValue(QJsonValue::Undefined)) {
        if (touches.touches(collection.kind, id)) {
            result.conflicts.append({collection.kind, id, labelOf(collection, labelSource), reason,
                                     external, candidate, !candidate.isUndefined()});
        }
    };

    for (const auto& id : d.order) {
        const auto bv = b.get(id);
        const auto dv = d.get(id);
        const auto sv = s.get(id);
        if (sv.isUndefined()) {
            if (bv.isUndefined()) {
                units.append(dv);
            } else if (bv != dv) {
                refused.insert(id);
                conflict(id, dv, QJsonValue::Null, "deleted", dv);
                units.append(dv);
            }
            continue;
        }
        if (bv.isUndefined()) {
            if (dv != sv) {
                refused.insert(id);
                conflict(id, dv, sv, "edited", dv);
            }
            units.append(dv);
            continue;
        }
        const auto outcome = resolveSlot(bv, dv, sv);
        units.append(outcome.value);
        mergedBases.insert(id, outcome.contested ? bv : sv);
        if (outcome.contested) {
            conflict(id, dv, sv, "edited", dv);
        }
    }

    QSet<QString> placed;
    for (const auto& unit : units) {
        placed.insert(idOf(unit));
    }
    for (const auto& id : s.order) {
        if (placed.contains(id)) {
            continue;
        }
        const auto bv = b.get(id);
        const auto entry = s.entries.value(id);
        if (!bv.isUndefined()) {
            if (bv != entry.item) {
                refused.insert(id);
                conflict(id, entry.item, entry.item, "deleted");
            }
            continue;
        }
        units.insert(std::min(entry.index, units.size()), entry.item);
        placed.insert(id);
    }

    QJsonArray nextBase;
    for (const auto& id : s.order) {
        const auto bv = b.get(id);
        nextBase.append(mergedBases.contains(id) ? mergedBases.value(id)
            : refused.contains(id) && !bv.isUndefined() ? bv : s.get(id));
    }
    result.doc.insert(collection.field, units);
    result.nextBase.insert(collection.field, nextBase);
}

void dropDangling(MergeResult& result)
{
    QSet<QString> trackIds;
    for (const auto& track : result.doc.value("tracks").toArray()) {
        trackIds.insert(idOf(track));
    }
    QJsonArray kept;
    QList<MergeConflict> dangling;
    QSet<QString> dropped;
    for (const auto& clip : result.doc.value("clips").toArray()) {
        if (trackIds.contains(clip.toObject().value("trackId").toString())) {
            kept.append(clip);
        } else {
            const auto id = idOf(clip);
            dropped.insert(id);
            dangling.append({"clip", id, labelOf(collections[2], clip), "dangling",
                             QJsonValue::Null, clip, true});
        }
    }
    if (dangling.isEmpty()) {
        return;
    }
    result.conflicts.removeIf([&](const MergeConflict& conflict) {
        return conflict.kind == "clip" && dropped.contains(conflict.id) && conflict.reason == "deleted";
    });
    result.conflicts.append(dangling);
    // Filter by id, just as the web pass does (including duplicate ids).
    QJsonArray clips;
    for (const auto& clip : kept) {
        if (!dropped.contains(idOf(clip))) {
            clips.append(clip);
        }
    }
    result.doc.insert("clips", clips);
}
} // namespace

QJsonObject mergeDocumentOf(const QJsonObject& raw)
{
    QJsonObject result;
    for (const auto& collection : collections) {
        result.insert(collection.field, raw.value(collection.field));
    }
    for (const auto* field : scalars) {
        result.insert(field, readScalar(raw, field));
    }
    return result;
}

QJsonObject mergeDocumentOfSequence(const QJsonObject& raw, const QJsonObject& base)
{
    auto result = mergeDocumentOf(raw);
    for (const auto& collection : collections) {
        if (nullish(raw.value(collection.field))) {
            result.insert(collection.field, QJsonArray{});
        }
    }
    if (nullish(raw.value("scriptEnabled"))) {
        result.insert("scriptEnabled", false);
    }
    for (const auto* field : {"tempo", "master"}) {
        if (nullish(raw.value(field))) {
            result.insert(field, base.value(field));
        }
    }
    return result;
}

MergeResult mergeTimelineDocuments(const QJsonObject& base, const QJsonObject& draft,
                                   const QJsonObject& server, const std::optional<QJsonArray>& ops,
                                   bool mergeWithoutOps)
{
    const auto touches = buildTouchMap(ops);
    MergeResult result{draft, server, {}};
    if (!touches.hasOps && !mergeWithoutOps) {
        result.nextBase = base;
        result.conflicts.append({"document", "document", "document", "replaced", server,
                                 QJsonValue(QJsonValue::Undefined), false});
    } else {
        for (const auto& collection : collections) {
            mergeCollection(collection, base, draft, server, touches, result);
        }
        for (const auto* field : scalars) {
            const auto bv = readScalar(base, field);
            const auto dv = readScalar(draft, field);
            const auto sv = readScalar(server, field);
            const auto outcome = resolveSlot(bv, dv, sv);
            writeScalar(result.doc, field, outcome.value);
            writeScalar(result.nextBase, field, outcome.contested ? bv : sv);
            if (outcome.contested && touches.touches("field", field)) {
                result.conflicts.append({"field", field, field, "edited", sv, outcome.value,
                                         !outcome.value.isUndefined()});
            }
        }
    }
    dropDangling(result);
    return result;
}

QJsonObject applyMergeDocument(const QJsonObject& serverRaw, const QJsonObject& merged)
{
    auto result = serverRaw;
    for (const auto& collection : collections) {
        result.insert(collection.field, merged.value(collection.field));
    }
    for (const auto* field : scalars) {
        result.insert(field, merged.value(field));
    }
    // buildTimelineDocumentPayload sends setup ?? undefined, while the merge
    // view uses null for absence. camera2d stays null in both representations.
    if (nullish(result.value("setup"))) {
        result.remove("setup");
    }
    return result;
}
} // namespace nt::server::sync
