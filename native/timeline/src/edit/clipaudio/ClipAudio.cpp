#include "ClipAudio.h"
#include "app/EditRegistry.h"
#include <QJsonArray>
#include <QSet>
#include <algorithm>
#include <cmath>

namespace {
bool sounding(const QString& type) {
    return type == "audio" || type == "video" || type == "midi";
}
QString parseShape(const QJsonValue& value) {
    const auto shape = value.toString();
    return shape == "sCurve" || shape == "plus3dB" || shape == "minus3dB" ? shape : QStringLiteral("linear");
}
QJsonObject setClipAudio(QJsonObject raw, const QJsonObject& payload) {
    const auto field = payload.value("field").toString();
    const auto input = payload.value("value");
    const bool shape = field == "fadeInShape" || field == "fadeOutShape";
    if (!shape && field != "volumeDb" && field != "fadeInMs" && field != "fadeOutMs") {
        return raw;
    }
    if (!shape && (!input.isDouble() || !std::isfinite(input.toDouble()))) {
        return raw;
    }
    auto clips = raw.value("clips").toArray();
    const auto id = payload.value("clipId").toString();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (clip.value("id").toString() != id || !sounding(clip.value("mediaType").toString())) {
            continue;
        }
        QJsonValue value;
        if (shape) {
            value = parseShape(input);
        } else if (field == "volumeDb") {
            value = input;
        } else {
            value = std::clamp(input.toDouble(), 0.0, std::max(0.0, std::floor(clip.value("durationMs").toDouble() / 2)));
        }
        clip.insert(field, value);
        clips[i] = clip;
        break;
    }
    raw.insert("clips", clips);
    return raw;
}
QJsonObject setClipsGain(QJsonObject raw, const QJsonObject& payload) {
    const auto db = payload.value("db");
    if (!db.isDouble() || !std::isfinite(db.toDouble())) {
        return raw;
    }
    const auto mode = payload.value("mode").toString();
    if (mode != "set" && mode != "adjust") {
        return raw;
    }
    QSet<QString> selected;
    for (const auto& id : payload.value("selectedIds").toArray()) {
        selected.insert(id.toString());
    }
    QSet<QString> lockedTracks;
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("locked").toBool()) {
            lockedTracks.insert(track.value("id").toString());
        }
    }
    auto clips = raw.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (!selected.contains(clip.value("id").toString()) || !sounding(clip.value("mediaType").toString())
                || clip.value("locked").toBool() || lockedTracks.contains(clip.value("trackId").toString())) {
            continue;
        }
        const auto previous = clip.value("volumeDb").toDouble();
        const auto next = std::clamp(mode == "set" ? db.toDouble() : previous + db.toDouble(), -120.0, 24.0);
        if (previous != next) {
            clip.insert("volumeDb", next);
            clips[i] = clip;
        }
    }
    raw.insert("clips", clips);
    return raw;
}
[[maybe_unused]] const bool registeredGain = nt::app::registerEdit("setClipsGain", setClipsGain);
[[maybe_unused]] const bool registered = nt::app::registerEdit("setClipAudio", setClipAudio);
}
void ClipAudio::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) {
        return;
    }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = timeline;
    if (timeline) {
        connect(timeline, &TimelineModel::clipsChanged, this, &ClipAudio::changed);
        connect(timeline, &QObject::destroyed, this, &ClipAudio::changed);
    }
    emit changed();
}
void ClipAudio::setSelection(const QStringList& selection) {
    if (selection != m_selection) {
        m_selection = selection;
        emit changed();
    }
}
QVariantMap ClipAudio::clip() const {
    if (!m_timeline || m_selection.size() != 1) {
        return {};
    }
    for (const auto& value : m_timeline->clipsJson()) {
        const auto clip = value.toObject();
        if (clip.value("id").toString() == m_selection[0] && sounding(clip.value("mediaType").toString())) {
            return clip.toVariantMap();
        }
    }
    return {};
}
QVariantList ClipAudio::audible() const {
    QVariantList result;
    if (m_timeline) {
        for (const auto& value : m_timeline->clipsJson()) {
            const auto clip = value.toObject();
            if (m_selection.contains(clip.value("id").toString()) && sounding(clip.value("mediaType").toString())) {
                result.append(clip.toVariantMap());
            }
        }
    }
    return result;
}
