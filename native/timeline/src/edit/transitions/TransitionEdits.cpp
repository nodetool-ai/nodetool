#include "TransitionEdits.h"
#include "TransitionHandle.h"
#include "edit/ClipOps.h"
#include <QJsonArray>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <optional>

namespace nt::edit::transitions {
namespace {
struct Cut {
    QJsonArray clips;
    QSet<QString> lockedTracks;
    QSet<QString> blockedLinks;
    qsizetype incoming = -1;
    qsizetype previous = -1;

    Cut(const QJsonObject& doc, const QString& id) : clips(doc.value("clips").toArray()) {
        for (const auto& value : doc.value("tracks").toArray()) {
            const auto track = value.toObject();
            if (track.value("locked").toBool()) { lockedTracks.insert(track.value("id").toString()); }
        }
        for (qsizetype i = 0; i < clips.size(); ++i) {
            const auto clip = clips[i].toObject();
            if (clipId(clip) == id) { incoming = i; }
            if (locked(clip) && clip.contains("linkId")) { blockedLinks.insert(clip.value("linkId").toString()); }
        }
        if (incoming < 0) { return; }
        const auto target = clips[incoming].toObject();
        for (qsizetype i = 0; i < clips.size(); ++i) {
            const auto c = clips[i].toObject();
            if (clipId(c) == id || clipTrackId(c) != clipTrackId(target) || clipStartMs(c) >= clipStartMs(target)
                || clipEndMs(c) < clipStartMs(target) - 1) { continue; }
            if (previous < 0 || clipEndMs(c) > clipEndMs(clips[previous].toObject())) { previous = i; }
        }
    }
    bool locked(const QJsonObject& clip) const {
        return clip.value("locked").toBool() || lockedTracks.contains(clipTrackId(clip));
    }
    bool editable() const { return incoming >= 0 && !locked(clips[incoming].toObject()); }
    void grow(double wanted) {
        if (previous < 0 || wanted <= 0) { return; }
        const auto prev = clips[previous].toObject();
        const auto target = clips[incoming].toObject();
        const double missing = wanted - std::max(0.0, clipEndMs(prev) - clipStartMs(target));
        if (missing <= 0) { return; }
        // Check the whole link group for locks, even members with another out-point.
        if (locked(prev) || (prev.contains("linkId") && blockedLinks.contains(prev.value("linkId").toString()))) { return; }
        QJsonArray grown = clips;
        for (qsizetype i = 0; i < clips.size(); ++i) {
            const auto c = clips[i].toObject();
            const bool linked = prev.contains("linkId") && c.value("linkId") == prev.value("linkId")
                && std::abs(clipEndMs(c) - clipEndMs(prev)) <= 1;
            if (i != previous && !linked) { continue; }
            if (locked(c)) { return; }
            auto next = extendHandle(c, missing);
            if (!next) { return; }
            grown[i] = *next;
        }
        clips = grown;
    }
};
QJsonObject buildTransition(const QString& mode, const QJsonObject& previous) {
    if (mode == "none") { return {{"type", "crossfade"}, {"durationMs", 0}}; }
    QJsonObject next{{"type", mode}, {"durationMs", previous.value("durationMs").toDouble() > 0 ? previous.value("durationMs").toDouble() : 500}};
    if (previous.contains("easing")) { next.insert("easing", previous.value("easing")); }
    if (mode == "dipToColor") { next.insert("color", previous.value("color").isString() ? previous.value("color") : QJsonValue("#000000")); }
    if (mode == "wipe" || mode == "push" || mode == "slide") {
        next.insert("direction", previous.value("direction").isString() ? previous.value("direction") : QJsonValue("left"));
    }
    if (mode == "wipe") { next.insert("softness", previous.value("softness").isDouble() ? previous.value("softness") : QJsonValue(0.1)); }
    return next;
}
}
QJsonObject setTransitionDuration(QJsonObject document, const QJsonObject& payload) {
    Cut cut(document, payload.value("clipId").toString());
    const auto value = payload.value("durationMs");
    if (!cut.editable() || !value.isDouble() || !std::isfinite(value.toDouble())) { return document; }
    auto target = cut.clips[cut.incoming].toObject();
    const double maximum = cut.previous < 0 ? clipDurationMs(target)
        : std::min(clipDurationMs(target), clipDurationMs(cut.clips[cut.previous].toObject()));
    const double wanted = std::max(0.0, std::min(value.toDouble(), maximum));
    cut.grow(wanted);
    auto transition = target.value("transitionIn").toObject();
    if (transition.value("durationMs").toDouble() <= 0) { transition = {{"type", "crossfade"}}; }
    transition.insert("durationMs", wanted);
    target.insert("transitionIn", transition);
    cut.clips[cut.incoming] = target;
    document.insert("clips", cut.clips);
    return document;
}
QJsonObject removeTransition(QJsonObject document, const QJsonObject& payload) {
    Cut cut(document, payload.value("clipId").toString());
    if (!cut.editable()) { return document; }
    auto target = cut.clips[cut.incoming].toObject();
    target.remove("transitionIn"); cut.clips[cut.incoming] = target;
    document.insert("clips", cut.clips);
    return document;
}
QJsonObject setClipTransition(QJsonObject document, const QJsonObject& payload) {
    Cut cut(document, payload.value("clipId").toString());
    if (!cut.editable()) { return document; }
    auto target = cut.clips[cut.incoming].toObject();
    if (payload.contains("mode")) {
        const auto mode = payload.value("mode").toString();
        if (mode == "auto") { return removeTransition(document, payload); }
        static const QSet<QString> modes{"none", "crossfade", "dipToColor", "wipe", "push", "slide", "zoom"};
        if (!modes.contains(mode)) { return document; }
        const auto next = buildTransition(mode, target.value("transitionIn").toObject());
        target.insert("transitionIn", next); cut.clips[cut.incoming] = target;
        document.insert("clips", cut.clips);
        return setTransitionDuration(document, {{"clipId", payload.value("clipId")}, {"durationMs", next.value("durationMs")}});
    }
    if (!target.value("transitionIn").isObject()) { return document; }
    auto next = target.value("transitionIn").toObject();
    const auto patch = payload.value("patch").toObject();
    for (auto it = patch.begin(); it != patch.end(); ++it) {
        // JSON null represents the component's undefined easing when it clears the field.
        if (it.key() == "easing" && (it.value().isNull() || it.value().toString().trimmed().isEmpty())) { next.remove(it.key()); }
        else { next.insert(it.key(), it.value()); }
    }
    target.insert("transitionIn", next); cut.clips[cut.incoming] = target;
    document.insert("clips", cut.clips);
    return document;
}
}
