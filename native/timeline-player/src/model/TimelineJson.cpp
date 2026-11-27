#include "model/StepPatternValidation.h"
#include "model/TimelineJson.h"

#include "scene/ClipScene.h"
#include "scene/TimeRemap.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

namespace nt {
namespace {

bool validAutomationMode(const QJsonValue& value) {
    if (value.isUndefined()) { return true; }
    if (!value.isString()) { return false; }
    const auto mode = value.toString();
    return mode == u"off" || mode == u"read" || mode == u"touch" || mode == u"latch" || mode == u"write";
}

bool validFableEffectKind(const QString& kind) {
    return kind == u"eq" || kind == u"ott" || kind == u"comp" || kind == u"drive" ||
           kind == u"lab" || kind == u"chorus" || kind == u"echo" || kind == u"reverb" ||
           kind == u"limiter";
}

bool validFableEffects(const QJsonArray& effects) {
    for (const QJsonValue& ev : effects) {
        const QJsonObject e = ev.toObject();
        if (e.value(u"type").toString() != u"fable") { continue; }
        if (!validFableEffectKind(e.value(u"kind").toString())) { return false; }
        const QJsonValue params = e.value(u"params");
        if (!params.isUndefined()) {
            if (!params.isObject()) { return false; }
            const QJsonObject obj = params.toObject();
            for (auto it = obj.begin(); it != obj.end(); ++it) {
                const bool ok = it.value().isBool() || (it.value().isDouble() && std::isfinite(it.value().toDouble()));
                if (!ok) { return false; }
            }
        }
    }
    return true;
}

std::optional<TrackType> trackTypeFrom(const QString& s) {
    if (s == u"video") return TrackType::Video;
    if (s == u"audio") return TrackType::Audio;
    if (s == u"overlay") return TrackType::Overlay;
    if (s == u"subtitle") return TrackType::Subtitle;
    if (s == u"midi") return TrackType::Midi;
    if (s == u"chord") return TrackType::Chord;
    return std::nullopt;
}

std::optional<MediaType> mediaTypeFrom(const QString& s) {
    if (s == u"image") return MediaType::Image;
    if (s == u"video") return MediaType::Video;
    if (s == u"audio") return MediaType::Audio;
    if (s == u"overlay") return MediaType::Overlay;
    if (s == u"text") return MediaType::Text;
    if (s == u"shape") return MediaType::Shape;
    if (s == u"model3d") return MediaType::Model3d;
    if (s == u"group") return MediaType::Group;
    if (s == u"adjustment") return MediaType::Adjustment;
    if (s == u"midi") return MediaType::Midi;
    return std::nullopt;
}

Vec2 vec2From(const QJsonValue& v, Vec2 fallback) {
    if (!v.isObject()) {
        return fallback;
    }
    const QJsonObject o = v.toObject();
    return Vec2{o.value(u"x").toDouble(fallback.x), o.value(u"y").toDouble(fallback.y)};
}

}  // namespace

ParseResult parseTimelineJson(const QByteArray& json, const QString& baseDir) {
    QJsonParseError err{};
    const QJsonDocument doc = QJsonDocument::fromJson(json, &err);
    if (err.error != QJsonParseError::NoError) {
        ParseResult result;
        result.error = QStringLiteral("JSON parse error at %1: %2").arg(err.offset).arg(err.errorString());
        return result;
    }
    if (!doc.isObject()) {
        ParseResult result;
        result.error = QStringLiteral("root is not an object");
        return result;
    }
    return parseTimeline(doc.object(), baseDir);
}

ParseResult parseTimeline(const QJsonObject& root, const QString& baseDir) {
    ParseResult result;
    // Check before constructing a renderable or editable model. Keep the original
    // root untouched so an absent version stays absent on save.
    const auto version = root.value(u"workingColorSpaceVersion");
    if (!version.isUndefined() && (!version.isDouble() || version.toDouble() != 1.0)) {
        const auto encoded = QJsonDocument(QJsonArray{version}).toJson(QJsonDocument::Compact);
        result.unsupportedColorSpaceVersionText = QString::fromUtf8(encoded.mid(1, encoded.size() - 2));
        result.error = QStringLiteral("Document workingColorSpaceVersion is %1. This build supports versions up to 1. Open it with a build that supports this value.")
                           .arg(result.unsupportedColorSpaceVersionText);
        result.unsupportedColorSpaceVersion = true;
        return result;
    }
    Timeline tl;
    tl.id = root.value(u"id").toString().toStdString();
    tl.name = root.value(u"name").toString().toStdString();
    tl.fps = root.value(u"fps").toDouble(30.0);
    tl.dropFrame = root.value(u"dropFrame").toBool();
    tl.width = root.value(u"width").toInt(1920);
    tl.height = root.value(u"height").toInt(1080);
    tl.durationMs = root.value(u"durationMs").toDouble(0.0);
    tl.masterVolumeDb = root.value(u"master").toObject().value(u"volumeDb").toDouble(0.0);
    if (tl.fps <= 0.0 || tl.width <= 0 || tl.height <= 0) {
        result.error = QStringLiteral("fps, width and height must be positive");
        return result;
    }

    if (!validAutomationMode(root.value(u"master").toObject().value(u"automationMode"))) {
        result.error = QStringLiteral("master: invalid automationMode");
        return result;
    }
    if (!validFableEffects(root.value(u"master").toObject().value(u"effects").toArray())) {
        result.error = QStringLiteral("master: invalid fable effect");
        return result;
    }

    for (const QJsonValue& tv : root.value(u"tracks").toArray()) {
        const QJsonObject t = tv.toObject();
        Track track;
        track.id = t.value(u"id").toString().toStdString();
        track.name = t.value(u"name").toString().toStdString();
        const auto type = trackTypeFrom(t.value(u"type").toString());
        if (!type) {
            result.error = QStringLiteral("track %1: unknown type").arg(QString::fromStdString(track.id));
            return result;
        }
        track.type = *type;
        track.index = t.value(u"index").toInt(static_cast<int>(tl.tracks.size()));
        track.visible = t.value(u"visible").toBool(true);
        track.locked = t.value(u"locked").toBool(false);
        track.muted = t.value(u"muted").toBool(false);
        track.solo = t.value(u"solo").toBool(false);
        track.volumeDb = t.value(u"volumeDb").toDouble(0.0);
        track.pan = t.value(u"pan").toDouble(0.0);
        if (!validAutomationMode(t.value(u"automationMode"))) {
            result.error = QStringLiteral("track %1: invalid automationMode").arg(QString::fromStdString(track.id));
            return result;
        }
        if (!validFableEffects(t.value(u"effects").toArray())) {
            result.error = QStringLiteral("track %1: invalid fable effect").arg(QString::fromStdString(track.id));
            return result;
        }
        const auto stepTemplate = t.value(u"stepTemplate");
        if (!stepTemplate.isUndefined() && (!stepTemplate.isObject() ||
            !midi::validateStoredStepPattern(stepTemplate.toObject()).isEmpty())) {
            result.error = QStringLiteral("track %1: invalid step template").arg(QString::fromStdString(track.id));
            return result;
        }
        track.raw = t;
        tl.tracks.push_back(std::move(track));
    }

    for (const QJsonValue& cv : root.value(u"clips").toArray()) {
        const QJsonObject c = cv.toObject();
        Clip clip;
        clip.id = c.value(u"id").toString().toStdString();
        clip.trackId = c.value(u"trackId").toString().toStdString();
        clip.name = c.value(u"name").toString().toStdString();
        clip.startMs = c.value(u"startMs").toDouble();
        clip.durationMs = c.value(u"durationMs").toDouble();
        clip.inPointMs = c.value(u"inPointMs").toDouble(0.0);
        const auto media = mediaTypeFrom(c.value(u"mediaType").toString());
        if (!media) {
            result.error = QStringLiteral("clip %1: unknown mediaType").arg(QString::fromStdString(clip.id));
            return result;
        }
        clip.mediaType = *media;
        if (c.contains(u"width")) clip.width = c.value(u"width").toInt();
        if (c.contains(u"height")) clip.height = c.value(u"height").toInt();
        clip.hidden = c.value(u"hidden").toBool(false);
        clip.muted = c.value(u"muted").toBool(false);
        clip.opacity = c.value(u"opacity").toDouble(1.0);
        clip.fadeInMs = c.value(u"fadeInMs").toDouble(0.0);
        clip.fadeOutMs = c.value(u"fadeOutMs").toDouble(0.0);
        clip.hasFadeInMs = c.contains(u"fadeInMs");
        clip.hasFadeOutMs = c.contains(u"fadeOutMs");
        clip.fadeInShape = c.value(u"fadeInShape").toString().toStdString();
        clip.fadeOutShape = c.value(u"fadeOutShape").toString().toStdString();
        clip.speedMultiplier = c.value(u"speedMultiplier").toDouble(1.0);
        clip.speedBaked = c.value(u"speedBaked").toBool(false);
        clip.timeRemap = speed::parseTimeRemap(c.value(u"timeRemap"));
        clip.volumeDb = c.value(u"volumeDb").toDouble(0.0);
        clip.linkId = c.value(u"linkId").toString().toStdString();
        clip.status = c.value(u"status").toString().toStdString();
        if (c.value(u"transform").isObject()) {
            const QJsonObject t = c.value(u"transform").toObject();
            ClipTransform xf;
            xf.position = vec2From(t.value(u"position"), xf.position);
            xf.scale = vec2From(t.value(u"scale"), xf.scale);
            xf.rotation = t.value(u"rotation").toDouble(0.0);
            xf.anchor = vec2From(t.value(u"anchor"), xf.anchor);
            if (t.value(u"rotationX").isDouble()) xf.rotationX = t.value(u"rotationX").toDouble();
            if (t.value(u"rotationY").isDouble()) xf.rotationY = t.value(u"rotationY").toDouble();
            if (t.value(u"perspective").isDouble()) xf.perspective = t.value(u"perspective").toDouble();
            if (t.value(u"depthPx").isDouble()) xf.depthPx = t.value(u"depthPx").toDouble();
            clip.transform = xf;
        }
        if (c.value(u"transitionIn").isObject()) {
            const QJsonObject t = c.value(u"transitionIn").toObject();
            ClipTransitionIn tr;
            tr.type = t.value(u"type").toString().toStdString();
            tr.durationMs = t.value(u"durationMs").toDouble(0.0);
            tr.easing = t.value(u"easing").toString().toStdString();
            clip.transitionIn = tr;
        }
        // Prototype-only fields, resolved against the fixture's folder:
        // `mediaPath` (the picture) and `audioPath` (the sound, when the
        // picture file is a proxy with no audio track).
        const auto local = [&](const QString& path) {
            return (baseDir.isEmpty() || QFileInfo(path).isAbsolute()) ? path.toStdString()
                                                                         : QDir(baseDir).filePath(path).toStdString();
        };
        const QString mediaPath = c.value(u"mediaPath").toString();
        if (!mediaPath.isEmpty()) clip.mediaPath = local(mediaPath);
        const QString originalMediaPath = c.value(u"originalMediaPath").toString();
        if (!originalMediaPath.isEmpty()) clip.originalMediaPath = local(originalMediaPath);
        const QString audioPath = c.value(u"audioPath").toString();
        if (!audioPath.isEmpty()) clip.audioPath = local(audioPath);
        clip.raw = c;
        if (clip.mediaType == MediaType::Midi) {
            auto notes = std::make_shared<std::vector<MidiNote>>();
            const auto values = c.value("notes").toArray();
            notes->reserve(static_cast<std::size_t>(values.size()));
            for (const auto& value : values) {
                const auto note = value.toObject();
                notes->push_back({note.value("id").toString(), note.value("pitch").toInt(),
                    note.value("velocity").toInt(), note.value("startTick").toDouble(),
                    note.value("durationTick").toDouble(), note});
            }
            clip.notes = std::move(notes);
        }
        clip.scene = scene::parseClipScene(c);
        if (!tl.findTrack(clip.trackId)) {
            result.error = QStringLiteral("clip %1: unknown trackId").arg(QString::fromStdString(clip.id));
            return result;
        }
        if (clip.durationMs <= 0.0) {
            result.error = QStringLiteral("clip %1: durationMs must be positive").arg(QString::fromStdString(clip.id));
            return result;
        }
        const QJsonValue patternVal = c.value(u"pattern");
        const bool hasPattern = !patternVal.isUndefined();
        if (hasPattern && !patternVal.isObject()) {
            result.error = QStringLiteral("clip %1: pattern must be an object").arg(QString::fromStdString(clip.id));
            return result;
        }
        const QJsonValue notesVal = c.value(u"notes");
        const bool hasNotes = !notesVal.isUndefined();
        if (hasPattern && hasNotes) {
            result.error = QStringLiteral("clip %1: cannot hold both pattern and notes").arg(QString::fromStdString(clip.id));
            return result;
        }
        if ((hasNotes && !notesVal.isArray()) ||
            (hasPattern && (clip.mediaType != MediaType::Midi || c.contains(u"controllers") ||
                            !midi::validateStoredStepPattern(patternVal.toObject()).isEmpty()))) {
            result.error = QStringLiteral("clip %1: invalid MIDI pattern or notes").arg(QString::fromStdString(clip.id));
            return result;
        }
        const auto nonnegativeInteger = [](const QJsonValue& value) {
            return value.isDouble() && std::isfinite(value.toDouble()) && value.toDouble() >= 0 &&
                   value.toDouble() <= 9007199254740991.0 && std::floor(value.toDouble()) == value.toDouble();
        };
        if (c.contains(u"patternPhaseTicks") && !nonnegativeInteger(c.value(u"patternPhaseTicks"))) {
            result.error = QStringLiteral("patternPhaseTicks must be a nonnegative integer.");
            return result;
        }
        if (c.contains(u"patternRowCycles")) {
            const auto cycles = c.value(u"patternRowCycles");
            if (!cycles.isObject()) { result.error = "patternRowCycles must be an object."; return result; }
            const auto states = cycles.toObject();
            for (auto it = states.begin(); it != states.end(); ++it) {
                const auto state = it.value().toObject();
                if (!it.value().isObject() || !nonnegativeInteger(state.value(u"cycleOffset")) ||
                    (state.contains(u"lastCycle") && !nonnegativeInteger(state.value(u"lastCycle"))) ||
                    (state.contains(u"wanderPos") && !nonnegativeInteger(state.value(u"wanderPos")))) {
                    result.error = "Invalid pattern row cycle state.";
                    return result;
                }
            }
        }
        tl.clips.push_back(std::move(clip));
    }

    tl.scene = scene::parseSequenceScene(root);
    tl.raw = root;
    tl.indexClips();
    result.timeline = std::move(tl);
    return result;
}

namespace {
// The sequence-row fields of a file; everything else in the sequence is document.
constexpr const char* kSequenceRowKeys[] = {"id", "projectId", "workflowId", "name", "fps", "width", "height",
                                            "durationMs", "createdAt", "updatedAt"};
constexpr QLatin1StringView kTimelineFileFormat("nodetool.timeline");
constexpr QLatin1StringView kTimelineFileSuffix(".timeline.json");
}  // namespace

bool isTimelineFile(const QJsonObject& root) {
    return root.value(u"format").toString() == kTimelineFileFormat;
}

QJsonObject timelineFileSequence(const QJsonObject& file, const QString& name) {
    QJsonObject sequence = file.value(u"document").toObject();
    for (const char* key : kSequenceRowKeys) {
        sequence.remove(QLatin1String(key));
    }
    for (const char* key : {"id", "fps", "width", "height"}) {
        if (file.contains(QLatin1String(key))) {
            sequence.insert(QLatin1String(key), file.value(QLatin1String(key)));
        }
    }
    if (file.contains(u"duration_ms")) {
        sequence.insert(QStringLiteral("durationMs"), file.value(u"duration_ms"));
    }
    if (!name.isEmpty()) {
        sequence.insert(QStringLiteral("name"), name);
    }
    return sequence;
}

QJsonObject timelineFileWithSequence(const QJsonObject& file, const QJsonObject& sequence) {
    QJsonObject document = sequence;
    for (const char* key : kSequenceRowKeys) {
        document.remove(QLatin1String(key));
    }
    QJsonObject result = file;
    result.remove(QStringLiteral("name"));
    for (const char* key : {"fps", "width", "height"}) {
        if (sequence.contains(QLatin1String(key))) {
            result.insert(QLatin1String(key), sequence.value(QLatin1String(key)));
        }
    }
    // The server computes the duration from the clips. The number is informative.
    if (sequence.contains(u"durationMs")) {
        result.insert(QStringLiteral("duration_ms"), sequence.value(u"durationMs"));
    }
    result.insert(QStringLiteral("document"), document);
    return result;
}

ParseResult loadTimelineFile(const QString& path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        ParseResult result;
        result.error = QStringLiteral("cannot open %1: %2").arg(path, file.errorString());
        return result;
    }
    const QByteArray bytes = file.readAll();
    const QFileInfo info(path);
    const QString baseDir = info.absolutePath();
    const QString absolutePath = info.absoluteFilePath();
    const QJsonObject root = QJsonDocument::fromJson(bytes).object();
    if (!isTimelineFile(root)) {
        auto result = parseTimelineJson(bytes, baseDir);
        if (result.timeline) {
            result.timeline->sourcePath = absolutePath;
        }
        return result;
    }
    const QJsonValue version = root.value(u"version");
    if (version.toInt(-1) != kTimelineFileVersion || !version.isDouble()) {
        ParseResult result;
        result.error = QStringLiteral("%1 is a timeline file of version %2. This build reads version %3.")
                           .arg(path, QString::fromUtf8(QJsonDocument(QJsonArray{version}).toJson(QJsonDocument::Compact)).mid(1).chopped(1))
                           .arg(kTimelineFileVersion);
        return result;
    }
    if (!root.value(u"document").isObject()) {
        ParseResult result;
        result.error = QStringLiteral("%1: \"document\" must be an object").arg(path);
        return result;
    }
    QString name = info.fileName();
    if (name.endsWith(kTimelineFileSuffix)) {
        name.chop(kTimelineFileSuffix.size());
    }
    auto result = parseTimeline(timelineFileSequence(root, name), baseDir);
    if (result.timeline) {
        result.timeline->sourcePath = absolutePath;
    }
    return result;
}

}  // namespace nt
