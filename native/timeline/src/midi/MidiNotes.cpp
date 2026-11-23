#include "midi/MidiNotes.h"

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
    double low;
    double high;
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
