#include "edit/ClipGestureController.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/targeting/TargetingEdits.h"
#include "edit/transitions/TransitionEdits.h"
#include "wiring/KeyActions.h"
#include "wiring/SourceDurations.h"
#include <QHash>
#include <QJsonDocument>
#include <algorithm>
#include <cmath>

namespace {
using namespace nt::edit;
QStringList targets(const ClipGestureController& gestures, const QVariantMap& context) {
    return context.contains("clipIds") ? context.value("clipIds").toStringList() : gestures.selection();
}
bool disabled(const QJsonObject& clip) {
    const auto type = clip.value("mediaType").toString();
    return clip.value(type == "audio" || type == "midi" ? "muted" : "hidden").toBool();
}
bool editClips(ClipGestureController& gestures, const QVariantMap& context, const QString& action, const QString& label) {
    const auto ids = targets(gestures, context);
    if (ids.isEmpty()) { return false; }
    const IdSet requested(ids.begin(), ids.end());
    auto raw = gestures.timeline()->timeline().raw;
    const auto doc = structure::editDocument(raw);
    const auto editable = editableUserTargets(doc, requested, false, false);
    const auto before = raw.value("clips").toArray();
    auto clips = before;
    if (action == "applyDefaultTransition" || action == "removeTransition") {
        QJsonObject caps;
        if (action == "applyDefaultTransition") {
            for (const auto& c : gestures.timeline()->timeline().clips) {
                if (c.mediaType != nt::MediaType::Video && c.mediaType != nt::MediaType::Audio) { continue; }
                const auto& path = c.mediaType == nt::MediaType::Audio && !c.audioPath.empty() ? c.audioPath : c.mediaPath;
                if (const auto cap = nt::wiring::knownSourceDuration(QString::fromStdString(path))) {
                    caps.insert(QString::fromStdString(c.id), *cap);
                }
            }
        }
        for (const auto& id : ids) {
            if (!editable.contains(id)) { continue; }
            raw = action == "removeTransition" ? transitions::removeTransition(std::move(raw), {{"clipId", id}})
                : transitions::setTransitionDuration(std::move(raw), {{"clipId", id}, {"durationMs", 500}, {"sourceCaps", caps}});
        }
        clips = raw.value("clips").toArray();
    } else if (action == "linkClips") {
        QString onlyLink;
        bool sameLink = true;
        bool first = true;
        for (const auto& c : doc.clips) {
            if (!requested.contains(clipId(c))) { continue; }
            if (first) { onlyLink = clipLinkId(c); first = false; }
            else if (clipLinkId(c) != onlyLink) { sameLink = false; }
        }
        if (sameLink && !onlyLink.isEmpty()) {
            const auto lockedTracks = lockedTrackIds(doc);
            for (const auto& c : doc.clips) {
                if (clipLinkId(c) == onlyLink && (c.value("locked").toBool() || lockedTracks.contains(clipTrackId(c)))) { return true; }
            }
            for (qsizetype i = 0; i < clips.size(); ++i) {
                auto c = clips[i].toObject();
                if (clipLinkId(c) == onlyLink) { c.remove("linkId"); clips[i] = c; }
            }
        } else {
            IdSet linkable;
            for (const auto& c : doc.clips) {
                if (editable.contains(clipId(c)) && !isGroupClip(c)) { linkable.insert(clipId(c)); }
            }
            if (linkable.size() < 2) { return true; }
            const auto link = newId();
            QHash<QString, int> counts;
            for (qsizetype i = 0; i < clips.size(); ++i) {
                auto c = clips[i].toObject();
                if (linkable.contains(clipId(c))) { c.insert("linkId", link); clips[i] = c; }
                if (!clipLinkId(c).isEmpty()) { ++counts[clipLinkId(c)]; }
            }
            for (qsizetype i = 0; i < clips.size(); ++i) {
                auto c = clips[i].toObject();
                if (!clipLinkId(c).isEmpty() && counts.value(clipLinkId(c)) == 1) { c.remove("linkId"); clips[i] = c; }
            }
        }
    } else {
        bool enable = true;
        for (const auto& c : doc.clips) {
            if (requested.contains(clipId(c)) && !disabled(c)) { enable = false; }
        }
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto c = clips[i].toObject();
            if (!requested.contains(clipId(c))) { continue; }
            if (action == "toggleClipLock") { c.insert("locked", !c.value("locked").toBool()); }
            else if (action == "toggleClipEnabled") {
                if (c.value("locked").toBool()) { continue; }
                const auto type = c.value("mediaType").toString();
                c.insert("muted", !enable);
                if (type != "audio" && type != "midi") { c.insert("hidden", !enable); }
            } else {
                if (!editable.contains(clipId(c))) { continue; }
                double span = 0;
                if (action == "applyFades") {
                    const auto type = c.value("mediaType").toString();
                    if (type != "audio" && type != "video" && type != "midi") { continue; }
                    span = std::floor(std::min(500.0, clipDurationMs(c) / 2));
                    if (span <= 0) { continue; }
                } else if (c.value("fadeInMs").toDouble() == 0 && c.value("fadeOutMs").toDouble() == 0) { continue; }
                c.insert("fadeInMs", span); c.insert("fadeOutMs", span);
            }
            clips[i] = c;
        }
    }
    gestures.timeline()->commitEdit(label, before, clips);
    return true;
}
const bool registered = [] {
    struct Action { QString name; QString label; QString key; };
    for (const auto& action : {Action{"applyDefaultTransition", "Cross-fade in", "Ctrl+T"},
            Action{"applyFades", "Fade in and out", "Alt+T"}, Action{"toggleClipEnabled", "Enable / disable clip", "Ctrl+Shift+E"},
            Action{"linkClips", "Link / unlink clips", "Ctrl+L"}, Action{"toggleClipLock", "Lock / unlock clip", {}},
            Action{"removeFades", "Remove fades", {}}, Action{"removeTransition", "Remove transition", {}}}) {
        nt::wiring::registerKeyAction({action.name, action.label, action.key.isEmpty() ? QList<QKeySequence>{} : QList<QKeySequence>{QKeySequence(action.key)},
            [action](ClipGestureController& gestures, const QVariantMap& context) { return editClips(gestures, context, action.name, action.label); }});
    }
    nt::wiring::registerKeyAction({"closeGapAt", "Close gap", {}, [](ClipGestureController& gestures, const QVariantMap& context) {
        const auto trackId = context.value("trackId").toString();
        if (trackId.isEmpty()) { return false; }
        const auto before = gestures.timeline()->clipsJson();
        const auto next = nt::targeting::closeGapAt(gestures.editDoc(), nt::targeting::TrackTargeting::current().state(),
                                                   trackId, context.value("timeMs").toDouble());
        gestures.timeline()->commitEdit("Close gap", before, structure::clipsToJson(next));
        return true;
    }});
    nt::wiring::registerKeyAction({"addText", "Add text", {}, [](ClipGestureController& gestures, const QVariantMap& context) {
        const auto trackId = context.value("trackId").toString();
        bool allowed = false;
        for (const auto& t : gestures.editDoc().tracks) {
            if (t.id == trackId) { allowed = !t.locked && (t.type == "video" || t.type == "overlay"); break; }
        }
        const double at = context.value("timeMs").toDouble();
        if (!allowed || !std::isfinite(at) || at < 0) { return false; }
        const auto id = newId();
        const auto before = gestures.timeline()->clipsJson();
        auto clips = before;
        clips.append(QJsonObject{{"id", id}, {"trackId", trackId}, {"name", "Text"}, {"startMs", at}, {"durationMs", 3000},
            {"mediaType", "text"}, {"sourceType", "imported"}, {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}},
            {"textStyle", QJsonObject{{"text", "Text"}, {"fontSizePx", 96}, {"color", "#FFFFFF"}}}});
        gestures.timeline()->commitEdit("Add text", before, clips);
        gestures.setSelection({id});
        return true;
    }});
    return true;
}();
}
