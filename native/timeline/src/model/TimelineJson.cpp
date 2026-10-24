#include "model/TimelineJson.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

namespace nt {
namespace {

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
    ParseResult result;
    QJsonParseError err{};
    const QJsonDocument doc = QJsonDocument::fromJson(json, &err);
    if (err.error != QJsonParseError::NoError) {
        result.error = QStringLiteral("JSON parse error at %1: %2").arg(err.offset).arg(err.errorString());
        return result;
    }
    if (!doc.isObject()) {
        result.error = QStringLiteral("root is not an object");
        return result;
    }
    const QJsonObject root = doc.object();

    Timeline tl;
    tl.id = root.value(u"id").toString().toStdString();
    tl.name = root.value(u"name").toString().toStdString();
    tl.fps = root.value(u"fps").toDouble(30.0);
    tl.width = root.value(u"width").toInt(1920);
    tl.height = root.value(u"height").toInt(1080);
    tl.durationMs = root.value(u"durationMs").toDouble(0.0);
    if (tl.fps <= 0.0 || tl.width <= 0 || tl.height <= 0) {
        result.error = QStringLiteral("fps, width and height must be positive");
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
        clip.fadeInShape = c.value(u"fadeInShape").toString().toStdString();
        clip.fadeOutShape = c.value(u"fadeOutShape").toString().toStdString();
        clip.speedMultiplier = c.value(u"speedMultiplier").toDouble(1.0);
        clip.speedBaked = c.value(u"speedBaked").toBool(false);
        if (c.value(u"transform").isObject()) {
            const QJsonObject t = c.value(u"transform").toObject();
            ClipTransform xf;
            xf.position = vec2From(t.value(u"position"), xf.position);
            xf.scale = vec2From(t.value(u"scale"), xf.scale);
            xf.rotation = t.value(u"rotation").toDouble(0.0);
            xf.anchor = vec2From(t.value(u"anchor"), xf.anchor);
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
        const QString mediaPath = c.value(u"mediaPath").toString();
        if (!mediaPath.isEmpty()) {
            clip.mediaPath = (baseDir.isEmpty() || QFileInfo(mediaPath).isAbsolute())
                                 ? mediaPath.toStdString()
                                 : QDir(baseDir).filePath(mediaPath).toStdString();
        }
        clip.raw = c;
        if (!tl.findTrack(clip.trackId)) {
            result.error = QStringLiteral("clip %1: unknown trackId").arg(QString::fromStdString(clip.id));
            return result;
        }
        if (clip.durationMs <= 0.0) {
            result.error = QStringLiteral("clip %1: durationMs must be positive").arg(QString::fromStdString(clip.id));
            return result;
        }
        tl.clips.push_back(std::move(clip));
    }

    tl.raw = root;
    result.timeline = std::move(tl);
    return result;
}

ParseResult loadTimelineFile(const QString& path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        ParseResult result;
        result.error = QStringLiteral("cannot open %1: %2").arg(path, file.errorString());
        return result;
    }
    return parseTimelineJson(file.readAll(), QFileInfo(path).absolutePath());
}

}  // namespace nt
