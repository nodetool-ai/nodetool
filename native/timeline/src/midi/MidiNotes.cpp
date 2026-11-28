#include "midi/MidiNotes.h"
#include <stdexcept>
#include "app/EditRegistry.h"

#include <QSet>
#include <QUuid>

#include <cmath>

namespace nt::midi {
namespace {

bool integerIn(const QJsonValue& value, double low, double high, double& out) {
    if (!value.isDouble()) {
        return false;
    }
    out = value.toDouble();
    return std::isfinite(out) && out == std::floor(out) && out >= low && out <= high;
}

bool numberIn(const QJsonValue& value, double low, double high, double& out) {
    if (!value.isDouble()) {
        return false;
    }
    out = value.toDouble();
    return std::isfinite(out) && out >= low && out <= high;
}

struct ExpressionKind {
    QLatin1StringView key;
    double low = 0;
    double high = 0;
};
constexpr ExpressionKind kExpressionKinds[] = {
    {QLatin1StringView("pitch"), -48.0, 48.0},
    {QLatin1StringView("volume"), 0.0, 4.0},
    {QLatin1StringView("pan"), -1.0, 1.0},
    {QLatin1StringView("brightness"), 0.0, 1.0},
};

bool sanitizeExpression(const QJsonValue& value, double durationTick, QJsonObject& out) {
    if (!value.isObject()) {
        return false;
    }
    const auto expression = value.toObject();
    for (const auto& kind : kExpressionKinds) {
        const QString key(kind.key);
        if (!expression.contains(key)) {
            continue;
        }
        if (!expression.value(key).isArray()) {
            return false;
        }
        const auto points = expression.value(key).toArray();
        if (points.size() > MAX_EXPRESSION_POINTS) {
            return false;
        }
        QJsonArray cleaned;
        double previous = 0;
        for (const auto& entry : points) {
            const auto point = entry.toObject();
            double tick = 0;
            double pointValue = 0;
            if (!entry.isObject() ||
                !integerIn(point.value(u"tick"), 0, durationTick, tick) || tick < previous ||
                !numberIn(point.value(u"value"), kind.low, kind.high, pointValue)) {
                return false;
            }
            previous = tick;
            cleaned.append(QJsonObject{{"tick", tick}, {"value", pointValue}});
        }
        out.insert(key, cleaned);
    }
    return true;
}

}  // namespace

bool sanitizeNotes(const QJsonArray& notes, QJsonArray& out) {
    if (notes.size() > MAX_NOTES_PER_CLIP) {
        return false;
    }
    constexpr double maxTick = 9007199254740991.0;
    QJsonArray result;
    QSet<QString> ids;
    for (const auto& value : notes) {
        const auto note = value.toObject();
        double pitch = 0;
        double velocity = 0;
        double startTick = 0;
        double durationTick = 0;
        if (!integerIn(note.value(u"pitch"), 0, 127, pitch) || !integerIn(note.value(u"velocity"), 1, 127, velocity) ||
            !integerIn(note.value(u"startTick"), 0, maxTick, startTick) ||
            !integerIn(note.value(u"durationTick"), 1, maxTick, durationTick)) {
            return false;
        }
        auto id = note.value(u"id").toString();
        if (id.isEmpty() || ids.contains(id)) {
            id = QUuid::createUuid().toString(QUuid::Id128);
        }
        ids.insert(id);
        QJsonObject clean{{"id", id},
                          {"pitch", pitch},
                          {"velocity", velocity},
                          {"startTick", startTick},
                          {"durationTick", durationTick}};
        if (note.contains(u"muted")) {
            if (!note.value(u"muted").isBool()) {
                return false;
            }
            clean.insert("muted", note.value(u"muted").toBool());
        }
        double optional = 0;
        if (note.contains(u"channel")) {
            if (!integerIn(note.value(u"channel"), 0, 15, optional)) {
                return false;
            }
            clean.insert("channel", optional);
        }
        if (note.contains(u"releaseVelocity")) {
            if (!integerIn(note.value(u"releaseVelocity"), 0, 127, optional)) {
                return false;
            }
            clean.insert("releaseVelocity", optional);
        }
        if (note.contains(u"expression")) {
            QJsonObject expression;
            if (!sanitizeExpression(note.value(u"expression"), durationTick, expression)) {
                return false;
            }
            clean.insert("expression", expression);
        }
        result.append(clean);
    }
    out = result;
    return true;
}

bool sanitizeControllers(const QJsonArray& lanes, QJsonArray& out) {
    if (lanes.size() > MAX_CONTROLLER_LANES_PER_CLIP) {
        return false;
    }
    constexpr double maxTick = 9007199254740991.0;
    QJsonArray result;
    QSet<QString> laneIds;
    QSet<QString> identities;
    for (const auto& entry : lanes) {
        const auto lane = entry.toObject();
        if (!entry.isObject() || !lane.value(u"points").isArray()) {
            return false;
        }
        const auto kind = lane.value(u"kind").toString();
        double low = 0;
        double high = 127;
        if (kind == u"pitchBend") {
            low = -8192;
            high = 8191;
        } else if (kind != u"cc" && kind != u"channelPressure" && kind != u"polyPressure") {
            return false;
        }
        QJsonObject clean{{"kind", kind}};
        double cc = -1;
        double pitch = -1;
        double channel = 0;
        if (kind == u"cc") {
            if (!integerIn(lane.value(u"cc"), 0, 127, cc)) {
                return false;
            }
            clean.insert("cc", cc);
        } else if (lane.contains(u"cc")) {
            return false;
        }
        if (kind == u"polyPressure") {
            if (!integerIn(lane.value(u"pitch"), 0, 127, pitch)) {
                return false;
            }
            clean.insert("pitch", pitch);
        } else if (lane.contains(u"pitch")) {
            return false;
        }
        if (lane.contains(u"channel")) {
            if (!integerIn(lane.value(u"channel"), 0, 15, channel)) {
                return false;
            }
            clean.insert("channel", channel);
        }
        if (lane.contains(u"interpolation")) {
            const auto interpolation = lane.value(u"interpolation").toString();
            if (interpolation != u"linear" && interpolation != u"step") {
                return false;
            }
            clean.insert("interpolation", interpolation);
        }
        const auto identity = QStringLiteral("%1/%2/%3/%4").arg(kind).arg(cc).arg(pitch).arg(channel);
        if (identities.contains(identity)) {
            return false;
        }
        identities.insert(identity);
        auto laneId = lane.value(u"id").toString();
        if (laneId.isEmpty() || laneIds.contains(laneId)) {
            laneId = QUuid::createUuid().toString(QUuid::Id128);
        }
        laneIds.insert(laneId);
        clean.insert("id", laneId);

        const auto points = lane.value(u"points").toArray();
        if (points.size() > MAX_CONTROLLER_POINTS_PER_LANE) {
            return false;
        }
        QJsonArray cleanPoints;
        QSet<QString> pointIds;
        double previous = 0;
        for (const auto& pointValue : points) {
            const auto point = pointValue.toObject();
            double tick = 0;
            double value = 0;
            if (!pointValue.isObject() || !integerIn(point.value(u"tick"), 0, maxTick, tick) || tick < previous ||
                !integerIn(point.value(u"value"), low, high, value)) {
                return false;
            }
            previous = tick;
            auto pointId = point.value(u"id").toString();
            if (pointId.isEmpty() || pointIds.contains(pointId)) {
                pointId = QUuid::createUuid().toString(QUuid::Id128);
            }
            pointIds.insert(pointId);
            cleanPoints.append(QJsonObject{{"id", pointId}, {"tick", tick}, {"value", value}});
        }
        clean.insert("points", cleanPoints);
        result.append(clean);
    }
    out = result;
    return true;
}

namespace {

// The clip `clipId` of an editable midi clip (clip and track unlocked), or -1.
qsizetype editableMidiClip(const QJsonObject& raw, const QString& clipId) {
    const auto clips = raw.value(u"clips").toArray();
    for (qsizetype index = 0; index < clips.size(); ++index) {
        const auto clip = clips.at(index).toObject();
        if (clip.value(u"id").toString() != clipId) {
            continue;
        }
        if (clip.value(u"mediaType").toString() != u"midi" || clip.value(u"locked").toBool() ||
            clip.contains(u"pattern")) {
            return -1;
        }
        const auto trackId = clip.value(u"trackId").toString();
        for (const auto& track : raw.value(u"tracks").toArray()) {
            if (track.toObject().value(u"id").toString() == trackId && track.toObject().value(u"locked").toBool()) {
                return -1;
            }
        }
        return index;
    }
    return -1;
}

}  // namespace

QJsonObject setClipEvents(QJsonObject raw, const QJsonObject& payload) {
    const auto clipId = payload.value(u"clipId").toString();
    QJsonArray notes;
    QJsonArray controllers;
    if (clipId.isEmpty() || !payload.value(u"notes").isArray() || !payload.value(u"controllers").isArray() ||
        !sanitizeNotes(payload.value(u"notes").toArray(), notes) ||
        !sanitizeControllers(payload.value(u"controllers").toArray(), controllers)) {
        return raw;
    }
    const auto index = editableMidiClip(raw, clipId);
    if (index < 0) {
        return raw;
    }
    auto clips = raw.value(u"clips").toArray();
    auto clip = clips.at(index).toObject();
    clip.insert("notes", notes);
    if (controllers.isEmpty()) {
        clip.remove("controllers");
    } else {
        clip.insert("controllers", controllers);
    }
    clips.replace(index, clip);
    raw.insert("clips", clips);
    return raw;
}

QJsonObject setClipControllers(QJsonObject raw, const QJsonObject& payload) {
    const auto clipId = payload.value(u"clipId").toString();
    QJsonArray lanes;
    if (clipId.isEmpty() || !payload.value(u"controllers").isArray() ||
        !sanitizeControllers(payload.value(u"controllers").toArray(), lanes)) {
        return raw;
    }
    const auto index = editableMidiClip(raw, clipId);
    if (index < 0) {
        return raw;
    }
    auto clips = raw.value(u"clips").toArray();
    auto clip = clips.at(index).toObject();
    if (lanes.isEmpty()) {
        clip.remove("controllers");
    } else {
        clip.insert("controllers", lanes);
    }
    clips.replace(index, clip);
    raw.insert("clips", clips);
    return raw;
}

QJsonObject setClipNotes(QJsonObject raw, const QJsonObject& payload) {
    const auto clipId = payload.value(u"clipId").toString();
    QJsonArray notes;
    if (clipId.isEmpty() || !payload.value(u"notes").isArray() || !sanitizeNotes(payload.value(u"notes").toArray(), notes)) {
        return raw;
    }
    auto clips = raw.value(u"clips").toArray();
    for (qsizetype index = 0; index < clips.size(); ++index) {
        auto clip = clips.at(index).toObject();
        if (clip.value(u"id").toString() != clipId) {
            continue;
        }
        if (clip.value(u"mediaType").toString() != u"midi" || clip.value(u"locked").toBool()) {
            return raw;
        }
        const auto trackId = clip.value(u"trackId").toString();
        for (const auto& track : raw.value(u"tracks").toArray()) {
            if (track.toObject().value(u"id").toString() == trackId && track.toObject().value(u"locked").toBool()) {
                return raw;
            }
        }
        clip.insert("notes", notes);
        clips.replace(index, clip);
        raw.insert("clips", clips);
        return raw;
    }
    return raw;
}

}  // namespace nt::midi

// Patch payloads are a codec boundary. Each update names an existing note and
// supplies absolute fields, so replay and undo do not depend on gesture state.
namespace nt::midi {
namespace {
std::optional<QJsonObject> updatedNote(const QString& name, const QJsonObject& existing, const QJsonObject& patch, bool adding) {
    const QSet<QString> fields{"id", "pitch", "velocity", "startTick", "durationTick", "muted", "channel", "releaseVelocity", "expression"};
    for (auto it = patch.begin(); it != patch.end(); ++it) {
        if (!fields.contains(it.key())) { return std::nullopt; }
    }
    if ((name == "midi.resizeNotes" && !patch.contains("durationTick")) ||
        (name == "midi.setNoteVelocities" && !patch.contains("velocity"))) { return std::nullopt; }
    auto note = adding || name == "midi.patchNotes" ? patch : existing;
    if (!adding) {
        for (auto it = patch.begin(); it != patch.end(); ++it) {
            const bool allowed = name == "midi.patchNotes" || it.key() == "id" ||
                (name == "midi.moveNotes" && (it.key() == "startTick" || it.key() == "pitch")) ||
                (name == "midi.resizeNotes" && it.key() == "durationTick") ||
                (name == "midi.setNoteVelocities" && it.key() == "velocity");
            if (!allowed) { return std::nullopt; }
            note.insert(it.key(), it.value());
        }
    }
    // A shortened note keeps expression points only within its new length.
    if ((name == "midi.resizeNotes" || name == "midi.patchNotes") && note.contains("expression")) {
        QJsonObject checked;
        if (!sanitizeExpression(note.value("expression"), 9007199254740991.0, checked)) { return std::nullopt; }
        auto expression = checked;
        for (auto it = expression.begin(); it != expression.end(); ++it) {
            QJsonArray kept;
            for (const auto& point : it.value().toArray()) {
                if (point.toObject().value("tick").toDouble() <= note.value("durationTick").toDouble()) { kept.append(point); }
            }
            const auto points = it.value().toArray();
            const double duration = note.value("durationTick").toDouble();
            if (kept.size() < points.size() && (kept.isEmpty() || kept.last().toObject().value("tick").toDouble() < duration)) {
                double atEnd = it.key() == "volume" ? 1 : it.key() == "brightness" ? 0.5 : 0;
                for (qsizetype p = 0; p < points.size(); ++p) {
                    const auto point = points.at(p).toObject();
                    const double tick = point.value("tick").toDouble();
                    if (tick > duration) {
                        if (p > 0) {
                            const auto previous = points.at(p - 1).toObject();
                            const double from = previous.value("tick").toDouble();
                            const double value = previous.value("value").toDouble();
                            atEnd = value + (point.value("value").toDouble() - value) * (duration - from) / (tick - from);
                        }
                        break;
                    }
                    atEnd = point.value("value").toDouble();
                }
                kept.append(QJsonObject{{"tick", duration}, {"value", atEnd}});
            }
            it.value() = kept;
        }
        note.insert("expression", expression);
    }
    QJsonArray clean;
    if (!sanitizeNotes(QJsonArray{note}, clean)) { return std::nullopt; }
    return clean.first().toObject();
}
} // namespace

namespace {
template<class Index>
QString resolveNoteId(const Index& positions, const QString& id) {
    if (positions.contains(id)) { return id; }
    if (id.size() == 12 && std::all_of(id.cbegin(), id.cend(), [](QChar c) {
        return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f');
    })) {
        QString match;
        for (auto it = positions.cbegin(); it != positions.cend(); ++it) {
            if (!it.key().startsWith(id)) { continue; }
            if (!match.isEmpty()) { throw std::invalid_argument("Ambiguous note id prefix. Use a full id."); }
            match = it.key();
        }
        if (!match.isEmpty()) { return match; }
    }
    throw std::invalid_argument("Unknown note id.");
}
} // namespace

QJsonObject patchClipNotes(const QString& name, QJsonObject raw, const QJsonObject& payload) {
    const auto index = editableMidiClip(raw, payload.value("clipId").toString());
    if (index < 0) { return raw; }
    auto clips = raw.value("clips").toArray();
    auto clip = clips.at(index).toObject();
    auto notes = clip.value("notes").toArray();
    QHash<QString, qsizetype> positions;
    for (qsizetype i = 0; i < notes.size(); ++i) {
        const auto id = notes.at(i).toObject().value("id").toString();
        if (id.isEmpty() || positions.contains(id)) { return raw; }
        positions.insert(id, i);
    }
    QSet<QString> seen;
    if (name == "midi.removeNotes") {
        if (!payload.value("noteIds").isArray()) { return raw; }
        for (const auto& entry : payload.value("noteIds").toArray()) {
            const auto id = resolveNoteId(positions, entry.toString());
            if (!positions.contains(id) || seen.contains(id)) { return raw; }
            seen.insert(id);
        }
        QJsonArray kept;
        for (const auto& entry : notes) {
            if (!seen.contains(entry.toObject().value("id").toString())) { kept.append(entry); }
        }
        notes = kept;
    } else {
        if (!payload.value("notes").isArray()) { return raw; }
        const auto updates = payload.value("notes").toArray();
        if (updates.size() > MAX_NOTES_PER_CLIP) { return raw; }
        for (const auto& entry : updates) {
            if (!entry.isObject()) { return raw; }
            auto patch = entry.toObject();
            const bool adding = name == "midi.addNotes";
            const auto id = adding ? patch.value("id").toString() : resolveNoteId(positions, patch.value("id").toString());
            patch.insert("id", id);
            if (id.isEmpty() || seen.contains(id) || (adding ? positions.contains(id) : !positions.contains(id))) { return raw; }
            seen.insert(id);
            const auto updated = updatedNote(name, adding ? QJsonObject{} : notes.at(positions.value(id)).toObject(), patch, adding);
            if (!updated) { return raw; }
            if (adding) { notes.append(*updated); }
            else { notes.replace(positions.value(id), *updated); }
        }
    }
    if (name == "midi.patchNotes" && payload.contains("noteIds")) {
        if (!payload.value("noteIds").isArray()) { return raw; }
        QSet<QString> removed;
        for (const auto& value : payload.value("noteIds").toArray()) {
            const auto id = resolveNoteId(positions, value.toString());
            if (!positions.contains(id) || seen.contains(id) || removed.contains(id)) { return raw; }
            removed.insert(id);
        }
        QJsonArray kept;
        for (const auto& value : notes) {
            if (!removed.contains(value.toObject().value("id").toString())) { kept.append(value); }
        }
        notes = kept;
    }
    if (name == "midi.patchNotes" && payload.contains("addedNotes")) {
        if (!payload.value("addedNotes").isArray()) { return raw; }
        for (const auto& value : payload.value("addedNotes").toArray()) {
            if (!value.isObject()) { return raw; }
            const auto patch = value.toObject();
            const auto id = patch.value("id").toString();
            if (id.isEmpty() || positions.contains(id) || seen.contains(id)) { return raw; }
            const auto added = updatedNote("midi.addNotes", {}, patch, true);
            if (!added) { return raw; }
            seen.insert(id);
            notes.append(*added);
        }
    }
    if (notes.size() > MAX_NOTES_PER_CLIP || notes == clip.value("notes").toArray()) { return raw; }
    clip.insert("notes", notes);
    clips.replace(index, clip);
    raw.insert("clips", clips);
    return raw;
}

nt::app::TypedEditResult patchTypedNotes(const QString& name, const nt::Timeline& before, const QJsonObject& payload) {
    const auto id = payload.value("clipId").toString();
    const auto* old = before.findClip(id.toStdString());
    const auto* track = old ? before.findTrack(old->trackId) : nullptr;
    if (!old || old->mediaType != nt::MediaType::Midi || !old->notes || old->raw.value("locked").toBool() ||
        old->raw.contains("pattern") || (track && track->locked)) { throw std::invalid_argument("Clip is missing, locked, non-MIDI or a pattern region."); }
    auto notes = std::make_shared<std::vector<nt::MidiNote>>(*old->notes);
    QHash<QString, std::size_t> positions;
    for (std::size_t i = 0; i < notes->size(); ++i) {
        const auto& note = (*notes)[i];
        if (note.id.isEmpty() || positions.contains(note.id)) { throw std::invalid_argument("Duplicate or missing note id in clip."); }
        positions.insert(note.id, i);
    }
    QSet<QString> seen, removed;
    const auto remove = [&](const QJsonValue& value) {
        if (!value.isArray()) { return false; }
        for (const auto& entry : value.toArray()) {
            const auto noteId = resolveNoteId(positions, entry.toString());
            if (!positions.contains(noteId) || removed.contains(noteId) || seen.contains(noteId)) { return false; }
            removed.insert(noteId);
        }
        return true;
    };
    if (name == "midi.removeNotes") {
        if (!remove(payload.value("noteIds"))) { throw std::invalid_argument("Invalid or duplicate removed note id."); }
    } else {
        if (!payload.value("notes").isArray()) { throw std::invalid_argument("Invalid notes array or note limit exceeded."); }
        const auto updates = payload.value("notes").toArray();
        if (updates.size() > MAX_NOTES_PER_CLIP) { throw std::invalid_argument("Invalid notes array or note limit exceeded."); }
        for (const auto& entry : updates) {
            if (!entry.isObject()) { throw std::invalid_argument("Invalid notes array or note limit exceeded."); }
            auto patch = entry.toObject();
            const bool adding = name == "midi.addNotes";
            const auto noteId = adding ? patch.value("id").toString() : resolveNoteId(positions, patch.value("id").toString());
            patch.insert("id", noteId);
            const bool exists = positions.contains(noteId);
            if (noteId.isEmpty() || seen.contains(noteId) || (adding ? exists : !exists)) { throw std::invalid_argument("Invalid or duplicate patch note id."); }
            seen.insert(noteId);
            const auto updated = updatedNote(name, adding ? QJsonObject{} : (*notes)[positions.value(noteId)].raw, patch, adding);
            if (!updated) { throw std::invalid_argument("Invalid note patch fields, values or expression."); }
            nt::MidiNote note{noteId, updated->value("pitch").toInt(), updated->value("velocity").toInt(),
                updated->value("startTick").toDouble(), updated->value("durationTick").toDouble(), *updated};
            if (adding) { notes->push_back(std::move(note)); }
            else { (*notes)[positions.value(noteId)] = std::move(note); }
        }
        if (name == "midi.patchNotes" && payload.contains("noteIds") && !remove(payload.value("noteIds"))) { throw std::invalid_argument("Invalid or duplicate removed note id."); }
    }
    if (name == "midi.patchNotes" && payload.contains("addedNotes")) {
        if (!payload.value("addedNotes").isArray()) { throw std::invalid_argument("Invalid added notes."); }
        for (const auto& value : payload.value("addedNotes").toArray()) {
            if (!value.isObject()) { throw std::invalid_argument("Invalid added note."); }
            const auto patch = value.toObject();
            const auto noteId = patch.value("id").toString();
            if (noteId.isEmpty() || positions.contains(noteId) || seen.contains(noteId)) { throw std::invalid_argument("Duplicate added note id."); }
            const auto added = updatedNote("midi.addNotes", {}, patch, true);
            if (!added) { throw std::invalid_argument("Invalid added note."); }
            seen.insert(noteId);
            notes->push_back({noteId, added->value("pitch").toInt(), added->value("velocity").toInt(),
                added->value("startTick").toDouble(), added->value("durationTick").toDouble(), *added});
        }
    }
    std::erase_if(*notes, [&removed](const nt::MidiNote& note) { return removed.contains(note.id); });
    if (notes->size() > MAX_NOTES_PER_CLIP) { throw std::invalid_argument("Invalid notes array or note limit exceeded."); }
    QJsonArray encoded;
    for (const auto& note : *notes) { encoded.append(note.raw); }
    if (encoded == old->raw.value("notes").toArray()) { return {}; }
    auto next = std::make_shared<nt::Timeline>(before);
    const auto index = static_cast<std::size_t>(old - before.clips.data());
    auto& clip = next->clips[index];
    clip.raw.insert("notes", encoded);
    clip.notes = std::move(notes);
    auto clips = before.raw.value("clips").toArray();
    clips.replace(static_cast<qsizetype>(index), clip.raw);
    next->raw.insert("clips", clips);
    next->revision = nt::nextTimelineRevision();
    ChangeSet changes;
    changes.clips.insert(id, {QStringLiteral("notes")});
    changes.noteClipIds.insert(id);
    changes.recordNoteRanges(id, old->raw.value("notes").toArray(), encoded);
    changes.documentFields.insert("clips");
    return {std::move(next), std::move(changes)};
}
} // namespace nt::midi
