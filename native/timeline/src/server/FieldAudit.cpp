#include "server/FieldAudit.h"

#include <QJsonArray>
#include <QSet>
#include <QStringList>

#include "scene/Animation.h"

#include <map>
#include <set>

namespace nt::server {
namespace {

using Fields = QSet<QString>;

// Fields TimelineJson reads into the model, or that the loader uses
// (`currentAssetId`, `status`). Keep in step with TimelineJson.cpp.
const Fields kClipSupported = {
    QStringLiteral("id"),           QStringLiteral("trackId"),        QStringLiteral("name"),
    QStringLiteral("startMs"),      QStringLiteral("durationMs"),     QStringLiteral("inPointMs"),
    QStringLiteral("width"),        QStringLiteral("height"),         QStringLiteral("hidden"),
    QStringLiteral("muted"),        QStringLiteral("opacity"),        QStringLiteral("fadeInMs"),
    QStringLiteral("fadeOutMs"),    QStringLiteral("fadeInShape"),    QStringLiteral("fadeOutShape"),
    QStringLiteral("speedMultiplier"), QStringLiteral("speedBaked"),  QStringLiteral("currentAssetId"),
    QStringLiteral("status"),       QStringLiteral("volumeDb"),
};
// No effect on picture or sound.
const Fields kClipInert = {
    QStringLiteral("sourceType"), QStringLiteral("bindingKind"), QStringLiteral("workflowId"),
    QStringLiteral("selectedOutputNodeId"), QStringLiteral("paramOverrides"), QStringLiteral("prompt"),
    QStringLiteral("negativePrompt"), QStringLiteral("provider"), QStringLiteral("model"), QStringLiteral("voice"),
    QStringLiteral("sourceClipId"), QStringLiteral("linkId"), QStringLiteral("aspectRatio"),
    QStringLiteral("resolution"), QStringLiteral("referenceImageIds"), QStringLiteral("referenceEntityIds"),
    QStringLiteral("strength"), QStringLiteral("numInferenceSteps"), QStringLiteral("seed"),
    QStringLiteral("dependencyHash"), QStringLiteral("lastGeneratedHash"), QStringLiteral("activeTakeId"),
    QStringLiteral("thumbnailAssetId"), QStringLiteral("waveformAssetId"), QStringLiteral("storyboardBoardId"),
    QStringLiteral("storyboardShotId"), QStringLiteral("storyboardElementId"),
    QStringLiteral("storyboardElementRole"), QStringLiteral("storyboardMaterializationBaseline"),
    QStringLiteral("scriptId"), QStringLiteral("scriptLineId"), QStringLiteral("beatId"), QStringLiteral("locked"),
    QStringLiteral("versions"), QStringLiteral("speaker"), QStringLiteral("paragraphId"),
    QStringLiteral("sourceScene"), QStringLiteral("outPointMs"), QStringLiteral("audioRole"),
};
// Read by SceneEval (M1e): groups, animations, repeats, stepped time, the
// whole transform and transition, the camera. `animations` entries are
// checked one by one below.
const Fields kClipScene = {
    QStringLiteral("parentId"), QStringLiteral("repeater"), QStringLiteral("temporalEcho"),
    QStringLiteral("steppedTime"), QStringLiteral("animationLinks"), QStringLiteral("trackBinding"),
};
const Fields kClipPlan = {
};
// `layout` and `flexItem`: the flex layout (scene/FlexLayout.h), in the plan.
const Fields kClipFlex = {QStringLiteral("layout"), QStringLiteral("flexItem")};
const Fields kClipPixels = {
    QStringLiteral("reframe"),
    QStringLiteral("effects"), QStringLiteral("mask"), QStringLiteral("matte"), QStringLiteral("generatedMatte"),
    QStringLiteral("crop"), QStringLiteral("borderRadius"), QStringLiteral("motionBlur"),
    QStringLiteral("textStyle"), QStringLiteral("shapeStyle"), QStringLiteral("model3dStyle"),
    QStringLiteral("caption"), QStringLiteral("compositionId"), QStringLiteral("compositionParams"),
};
const Fields kClipAudio = {
    QStringLiteral("audioEffects"), QStringLiteral("notes"), QStringLiteral("harmony"),
};

const Fields kTrackSupported = {
    QStringLiteral("id"),      QStringLiteral("name"), QStringLiteral("index"), QStringLiteral("visible"),
    QStringLiteral("locked"),  QStringLiteral("muted"), QStringLiteral("solo"), QStringLiteral("heightPx"),
    QStringLiteral("volumeDb"), QStringLiteral("pan"),
};
const Fields kTrackInert = {QStringLiteral("folderId")};
const Fields kTrackAudio = {
    QStringLiteral("instrument"), QStringLiteral("chords"), QStringLiteral("automation"),
};
// Track effect types that change the picture; the rest change sound.
const Fields kVideoTrackEffects = {
    QStringLiteral("colorCorrection"), QStringLiteral("videoBlur"), QStringLiteral("sharpen"),
    QStringLiteral("vignette"), QStringLiteral("chromaKey"),
};

const Fields kSequenceSupported = {
    QStringLiteral("id"), QStringLiteral("name"), QStringLiteral("fps"), QStringLiteral("width"),
    QStringLiteral("height"), QStringLiteral("durationMs"), QStringLiteral("tracks"), QStringLiteral("clips"),
};
const Fields kSequenceInert = {
    QStringLiteral("projectId"), QStringLiteral("workflowId"), QStringLiteral("createdAt"),
    QStringLiteral("updatedAt"), QStringLiteral("markers"), QStringLiteral("trackFolders"),
    QStringLiteral("storyboardMaterializations"), QStringLiteral("transcript"), QStringLiteral("scriptEnabled"),
    QStringLiteral("setup"), QStringLiteral("templateId"), QStringLiteral("source"), QStringLiteral("mediaTracks"),
};
// Annotations on the ruler: no field reaches picture or sound. The list matches
// `timelineMarker` in the protocol schema, which strips any other field on save.
const Fields kMarkerFields = {
    QStringLiteral("id"), QStringLiteral("timeMs"), QStringLiteral("label"), QStringLiteral("color"),
    QStringLiteral("note"), QStringLiteral("durationMs"), QStringLiteral("author"),
};
const Fields kSequenceAudio = {QStringLiteral("tempo")};
const Fields kSequenceScene = {QStringLiteral("camera2d")};  // read by SceneEval

bool isEmptyValue(const QJsonValue& v) {
    switch (v.type()) {
    case QJsonValue::Null:
    case QJsonValue::Undefined: return true;
    case QJsonValue::Bool: return !v.toBool();
    case QJsonValue::String: return v.toString().isEmpty();
    case QJsonValue::Array: return v.toArray().isEmpty();
    case QJsonValue::Object: return v.toObject().isEmpty();
    default: return false;
    }
}

struct Collector {
    QJsonArray entries;
    void add(const QString& field, const char* effect) {
        entries.append(QJsonObject{{QStringLiteral("field"), field}, {QStringLiteral("effect"), QLatin1String(effect)}});
    }
};

void auditClip(const QJsonObject& c, Collector& out) {
    for (auto it = c.begin(); it != c.end(); ++it) {
        const QString key = it.key();
        const QJsonValue v = it.value();
        if (kClipSupported.contains(key) || kClipInert.contains(key) || kClipScene.contains(key) || isEmptyValue(v)) {
            continue;
        }
        if (key == u"mediaType") {
            const QString t = v.toString();
            if (t == u"image" || t == u"video" || t == u"audio" || t == u"group") continue;
            out.add(QStringLiteral("mediaType=") + t, t == u"midi" ? "audio" : "pixels");
        } else if (key == u"blendMode") {
            if (v.toString() != u"normal") out.add(QStringLiteral("blendMode=") + v.toString(), "pixels");
        } else if (key == u"transform") {
            continue;  // every field read by SceneEval
        } else if (key == u"transitionIn") {
            // The plan holds every cut. The compositor draws a cut's opacity,
            // offset and scale, not its mask, iris, dip solid or effect.
            static const QSet<QString> drawnTypes = {QStringLiteral("crossfade"), QStringLiteral("push"),
                                                     QStringLiteral("slide"), QStringLiteral("zoom")};
            const QString type = v.toObject().value(u"type").toString();
            const double duration = v.toObject().value(u"durationMs").toDouble(0);
            if (duration > 0 && !drawnTypes.contains(type)) out.add(QStringLiteral("transitionIn.type=") + type, "pixels");
            continue;
        } else if (key == u"animations") {
            std::set<std::string> seen;
            for (const auto& def : nt::scene::parseAnimations(v.toArray())) {
                const std::string why = nt::scene::unsupportedReason(def, c);
                if (!why.empty() && seen.insert(why).second) out.add(QStringLiteral("animations.") + QString::fromStdString(why), "plan");
            }
            static const QSet<QString> effectPresets = {QStringLiteral("wipe"), QStringLiteral("blur"),
                                                        QStringLiteral("colorFade"), QStringLiteral("flash"),
                                                        QStringLiteral("hueShift")};
            static const QSet<QString> motion = {
                QStringLiteral("offsetX"), QStringLiteral("offsetY"), QStringLiteral("scale"), QStringLiteral("scaleX"),
                QStringLiteral("scaleY"), QStringLiteral("rotation"), QStringLiteral("rotationX"),
                QStringLiteral("rotationY"), QStringLiteral("opacity"), QStringLiteral("positionX"),
                QStringLiteral("positionY"), QStringLiteral("anchorX"), QStringLiteral("anchorY")};
            for (const QJsonValue& a : v.toArray()) {
                const QJsonObject o = a.toObject();
                if (!o.value(u"styleTracks").toArray().isEmpty() || o.value(u"textAnimator").isObject()) {
                    if (seen.insert("styleTracks").second) out.add(QStringLiteral("animations.styleTracks"), "pixels");
                }
                // Wipes, blur and grade channels are in the plan, not drawn.
                bool effects = effectPresets.contains(o.value(u"preset").toString());
                for (const QJsonValue& cv : o.value(u"custom").toObject().value(u"curves").toArray()) {
                    effects = effects || !motion.contains(cv.toObject().value(u"property").toString());
                }
                if (effects && seen.insert("effectChannels").second) out.add(QStringLiteral("animations.effectChannels"), "pixels");
            }
        } else if (key == u"timeRemap") {
            continue;
        } else if (kClipFlex.contains(key)) {
            continue;
        } else if (kClipPlan.contains(key)) {
            out.add(key, "plan");
        } else if (kClipPixels.contains(key)) {
            out.add(key, "pixels");
        } else if (kClipAudio.contains(key)) {
            out.add(key, "audio");
        } else {
            out.add(key, "unknown");
        }
    }
}

// A precompositing group (D35): the compositor composes its children on a
// surface and draws it with the group's opacity, stacking and cut geometry.
// What it does not draw is a pixel-level difference:
//   blend mode or effects - not applied to the composed group;
//   a cut with a mask, iris, dip solid or effect (`precomposite.cut=<type>`);
//   an adjustment child, or the depth-of-field blur of the scene camera.
void auditGroupSurface(const QJsonObject& g, const QJsonObject& sequence, const std::map<QString, QJsonObject>& byId,
                       Collector& out) {
    const QString id = g.value(u"id").toString();
    QStringList reasons;
    if (g.value(u"blendMode").isString() && g.value(u"blendMode").toString() != u"normal") reasons << QStringLiteral("blendMode");
    for (const QJsonValue& e : g.value(u"effects").toArray()) {
        if (e.toObject().value(u"enabled").toBool(false)) {
            reasons << QStringLiteral("effects");
            break;
        }
    }
    // The compositor draws a cut's opacity, offset and scale (crossfade, push,
    // slide, zoom, and the auto dissolve); not a mask, iris, dip or effect.
    const QJsonObject cut = g.value(u"transitionIn").toObject();
    static const QSet<QString> drawnCuts = {QStringLiteral("crossfade"), QStringLiteral("push"), QStringLiteral("slide"),
                                            QStringLiteral("zoom")};
    if (cut.value(u"durationMs").toDouble(0) > 0 && !drawnCuts.contains(cut.value(u"type").toString())) {
        reasons << QStringLiteral("cut=") + cut.value(u"type").toString();
    }
    bool adjusted = false;
    for (const auto& [childId, c] : byId) {
        if (c.value(u"parentId").toString() == id && c.value(u"mediaType").toString() == u"adjustment") adjusted = true;
    }
    if (adjusted) reasons << QStringLiteral("adjustment");
    const QJsonObject cam = sequence.value(u"camera2d").toObject();
    if (!cam.isEmpty() && g.value(u"transform").toObject().contains(u"depthPx") &&
        (cam.value(u"aperturePx").toDouble(0) > 0 || !cam.value(u"keyframes").toArray().isEmpty())) {
        reasons << QStringLiteral("cameraBlur");  // depth of field can give the group a surface
    }
    for (const QString& r : reasons) out.add(QStringLiteral("precomposite.") + r, "pixels");
}

bool hasPlanEntry(const QJsonArray& entries) {
    for (const QJsonValue& e : entries) {
        if (e.toObject().value(u"effect").toString() == u"plan") return true;
    }
    return false;
}

void auditTrack(const QJsonObject& t, Collector& out) {
    for (auto it = t.begin(); it != t.end(); ++it) {
        const QString key = it.key();
        const QJsonValue v = it.value();
        if (kTrackSupported.contains(key) || kTrackInert.contains(key) || isEmptyValue(v)) continue;
        if (key == u"type") {
            const QString type = v.toString();
            if (type == u"video" || type == u"overlay" || type == u"audio") continue;
            out.add(QStringLiteral("type=") + type, type == u"subtitle" ? "pixels" : "audio");
        } else if (key == u"effects") {
            bool picture = false;
            for (const QJsonValue& e : v.toArray()) {
                picture = picture || kVideoTrackEffects.contains(e.toObject().value(u"type").toString());
            }
            out.add(key, picture ? "pixels" : "audio");
        } else if (kTrackAudio.contains(key)) {
            out.add(key, "audio");
        } else {
            out.add(key, "unknown");
        }
    }
}

}  // namespace

QJsonObject auditTimelineFields(const QJsonObject& sequence) {
    std::map<QString, std::pair<QString, int>> counts;  // "clip.animations" -> (effect, count)
    auto tally = [&counts](const QString& entity, const QJsonArray& entries) {
        for (const QJsonValue& e : entries) {
            const QJsonObject o = e.toObject();
            auto& slot = counts[entity + u'.' + o.value(u"field").toString()];
            slot.first = o.value(u"effect").toString();
            ++slot.second;
        }
    };

    Collector seq;
    for (auto it = sequence.begin(); it != sequence.end(); ++it) {
        const QString key = it.key();
        if (kSequenceSupported.contains(key) || kSequenceInert.contains(key) || kSequenceScene.contains(key) ||
            isEmptyValue(it.value())) {
            continue;
        }
        if (key == u"master") {
            // The model reads `master.volumeDb`.
            if (!it.value().toObject().value(u"effects").toArray().isEmpty()) seq.add(QStringLiteral("master.effects"), "audio");
            continue;
        }
        seq.add(key, kSequenceAudio.contains(key) ? "audio" : "unknown");
    }
    tally(QStringLiteral("sequence"), seq.entries);
    for (const QJsonValue& mv : sequence.value(u"markers").toArray()) {
        const QJsonObject marker = mv.toObject();
        Collector c;
        for (auto it = marker.begin(); it != marker.end(); ++it) {
            if (!kMarkerFields.contains(it.key())) c.add(it.key(), "unknown");
        }
        tally(QStringLiteral("marker"), c.entries);
    }

    QJsonArray tracks;
    for (const QJsonValue& tv : sequence.value(u"tracks").toArray()) {
        Collector c;
        auditTrack(tv.toObject(), c);
        if (c.entries.isEmpty()) continue;
        tally(QStringLiteral("track"), c.entries);
        tracks.append(QJsonObject{{QStringLiteral("id"), tv.toObject().value(u"id")}, {QStringLiteral("fields"), c.entries}});
    }
    std::map<QString, QJsonObject> byId;
    for (const QJsonValue& cv : sequence.value(u"clips").toArray()) byId[cv.toObject().value(u"id").toString()] = cv.toObject();
    std::set<QString> automatedTracks;
    for (const QJsonValue& tv : sequence.value(u"tracks").toArray()) {
        const auto track = tv.toObject();
        for (const auto& value : track.value(u"automation").toArray()) {
            const bool picture = track.value(u"type").toString() == u"video" || track.value(u"type").toString() == u"overlay";
            if (picture && value.toObject().value(u"target").toObject().value(u"kind").toString() == u"clip") { continue; }
            automatedTracks.insert(track.value(u"id").toString());
        }
    }
    // Own entries first, then what a clip inherits: a group with a plan-level
    // field moves every child, and track automation animates every clip on it.
    std::map<QString, Collector> own;
    std::vector<QString> order;
    for (const QJsonValue& cv : sequence.value(u"clips").toArray()) {
        const QJsonObject c = cv.toObject();
        const QString id = c.value(u"id").toString();
        if (!own.count(id)) order.push_back(id);
        Collector col;
        auditClip(c, col);
        if (c.value(u"mediaType").toString() == u"group") auditGroupSurface(c, sequence, byId, col);
        if (automatedTracks.count(c.value(u"trackId").toString())) col.add(QStringLiteral("track.automation"), "plan");
        own[id] = col;
    }
    QJsonArray clips;
    QJsonArray planUnsupported;
    for (const QString& id : order) {
        Collector col = own[id];
        QString cursor = byId[id].value(u"parentId").toString();
        for (int hops = 0; !cursor.isEmpty() && hops < 64; hops++) {
            const auto it = own.find(cursor);
            if (it == own.end()) break;
            if (hasPlanEntry(it->second.entries)) {
                col.add(QStringLiteral("parent.") + cursor, "plan");
                break;
            }
            cursor = byId[cursor].value(u"parentId").toString();
        }
        if (col.entries.isEmpty()) continue;
        if (hasPlanEntry(col.entries)) planUnsupported.append(id);
        QJsonArray tallied;  // "parent.<id>" counts as one field name
        for (const QJsonValue& e : col.entries) {
            QJsonObject o = e.toObject();
            if (o.value(u"field").toString().startsWith(u"parent.")) o.insert(QStringLiteral("field"), QStringLiteral("parent"));
            tallied.append(o);
        }
        tally(QStringLiteral("clip"), tallied);
        clips.append(QJsonObject{{QStringLiteral("id"), id}, {QStringLiteral("fields"), col.entries}});
    }
    QJsonObject fields;
    for (const auto& [name, slot] : counts) {
        fields.insert(name, QJsonObject{{QStringLiteral("effect"), slot.first}, {QStringLiteral("count"), slot.second}});
    }
    return QJsonObject{{QStringLiteral("planUnsupported"), planUnsupported},
                       {QStringLiteral("sequence"), seq.entries},
                       {QStringLiteral("tracks"), tracks},
                       {QStringLiteral("clips"), clips},
                       {QStringLiteral("fields"), fields}};
}

}  // namespace nt::server
