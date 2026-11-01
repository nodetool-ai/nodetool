#include "aiassist/StoryboardAssembly.h"
#include <QHash>
#include <QSet>
#include <QUuid>
#include <algorithm>
#include <cmath>
#include <optional>
#include <limits>
namespace nt::aiassist {
namespace {
QString newId() { return QUuid::createUuid().toString(QUuid::Id128); }
QJsonObject track(const QString& type, const QString& name, int index) {
    return {{"id", newId()}, {"name", name}, {"type", type}, {"index", index}, {"visible", true}, {"locked", false}};
}
QJsonObject clip(QJsonObject overrides) {
    QJsonObject result{{"id", newId()}, {"trackId", ""}, {"name", ""}, {"startMs", 0}, {"durationMs", 0},
        {"mediaType", "video"}, {"sourceType", "generated"}, {"status", "draft"}, {"locked", false}, {"versions", QJsonArray{}}};
    for (auto it = overrides.begin(); it != overrides.end(); ++it) { result.insert(it.key(), it.value()); }
    return result;
}
QString asset(const QJsonObject& shot, const QString& key) { return shot.value(key).toObject().value("asset_id").toString(); }
double directed(const QJsonObject& shot) { const double seconds = shot.value("duration_seconds").toDouble(); return seconds > 0 ? std::round(seconds * 1000) : 4000; }
std::optional<double> sourceDuration(const QJsonObject& shot) {
    const double seconds = shot.value("clip").toObject().value("duration").toDouble();
    return seconds > 0 ? std::optional<double>(std::round(seconds * 1000)) : std::nullopt;
}
struct Source { QString assetId; QString owner; double in = 0; std::optional<double> available; std::optional<double> window; };
std::optional<Source> source(const QJsonObject& shot, const QHash<QString, QJsonObject>& byId, const QHash<QString, double>& claims) {
    const auto id = shot.value("id").toString();
    if (!asset(shot, "clip").isEmpty()) {
        auto available = sourceDuration(shot); std::optional<double> window;
        if (claims.contains(id)) { window = claims.value(id); available = available ? std::min(*available, *window) : *window; }
        return Source{asset(shot, "clip"), id, 0, available, window};
    }
    const auto coverage = shot.value("covered_by").toObject();
    const auto cover = byId.value(coverage.value("shot_id").toString());
    if (asset(cover, "clip").isEmpty()) { return std::nullopt; }
    const double in = std::max(0.0, std::round(coverage.value("start_seconds").toDouble() * 1000));
    std::optional<double> window;
    const double end = coverage.value("end_seconds").toDouble();
    if (end > 0) { window = std::max(0.0, std::round(end * 1000) - in); }
    auto available = sourceDuration(cover);
    if (available) { available = std::max(0.0, *available - in); }
    if (window) { available = available ? std::min(*window, *available) : *window; }
    return Source{asset(cover, "clip"), cover.value("id").toString(), in, available, window};
}
QJsonObject currentTake(const QJsonObject& line) {
    for (const auto& value : line.value("takes").toArray()) {
        const auto take = value.toObject();
        if (take.value("id") == line.value("currentTakeId")) { return take; }
    }
    return {};
}
std::optional<double> lineDuration(const QJsonObject& line) {
    const auto take = currentTake(line);
    if (take.value("assetId").toString().isEmpty()) { return std::nullopt; }
    const double duration = take.value("durationMs").toDouble();
    return (duration > 0 ? duration : 3000) + std::max(0.0, line.value("pauseAfterMs").toDouble());
}
}
StoryboardAssemblyResult assembleStoryboard(const QJsonObject& existing, const QJsonObject& boardResponse, const QJsonObject& scriptResponse) {
    StoryboardAssemblyResult result{existing, {}, {}, {}, {}, {}};
    const auto boardId = boardResponse.value("id").toString();
    if (boardId.isEmpty()) { result.error = "A storyboard id is required."; return result; }
    for (const auto& value : existing.value("storyboardMaterializations").toArray()) {
        if (value.toObject().value("boardId").toString() == boardId) { result.error = "This storyboard has finished editable layers. Use finish_storyboard to preserve manual edits."; return result; }
    }
    for (const auto& value : existing.value("clips").toArray()) {
        const auto item = value.toObject();
        if (item.value("storyboardBoardId").toString() == boardId && !item.value("storyboardElementId").toString().isEmpty()) {
            result.error = "This storyboard has finished editable layers. Use finish_storyboard to preserve manual edits."; return result;
        }
    }
    const auto board = boardResponse.value("document").toObject();
    const auto screenplay = board.value("screenplay").toObject();
    const auto script = scriptResponse.value("document").toObject();
    const auto scriptId = scriptResponse.value("id").toString();
    const bool linked = !scriptId.isEmpty() && !screenplay.value("script_id").toString().isEmpty();
    if (linked && screenplay.value("script_id").toString() != scriptId) { result.error = "The script does not match the storyboard link."; return result; }
    QHash<QString, QJsonObject> byId;
    QHash<QString, double> claims;
    std::vector<QJsonObject> shots;
    for (const auto& value : board.value("shots").toArray()) {
        const auto shot = value.toObject(); shots.push_back(shot); byId.insert(shot.value("id").toString(), shot);
        const auto coverage = shot.value("covered_by").toObject();
        const auto owner = coverage.value("shot_id").toString();
        if (!owner.isEmpty() && owner != shot.value("id").toString() && asset(shot, "clip").isEmpty()) {
            const double start = std::max(0.0, std::round(coverage.value("start_seconds").toDouble() * 1000));
            if (!claims.contains(owner) || start < claims.value(owner)) { claims.insert(owner, start); }
        }
    }
    std::stable_sort(shots.begin(), shots.end(), [](const auto& a, const auto& b) { return a.value("index").toInt() < b.value("index").toInt(); });
    QHash<QString, QJsonObject> lines;
    QHash<QString, QJsonObject> cast;
    for (const auto& section : script.value("sections").toArray()) {
        for (const auto& value : section.toObject().value("lines").toArray()) { const auto line = value.toObject(); lines.insert(line.value("id").toString(), line); }
    }
    for (const auto& value : script.value("cast").toArray()) { const auto speaker = value.toObject(); cast.insert(speaker.value("id").toString(), speaker); }
    const auto shotTrack = track("video", "Shots", 0);
    const auto audioTrack = track("audio", "Shot Audio", 1);
    const auto voiceTrack = track("audio", "Voiceover", 2);
    QJsonArray tracks{shotTrack};
    if (linked) { tracks.append(audioTrack); tracks.append(voiceTrack); }
    QJsonArray clips;
    bool hasShotAudio = false;
    double cursor = 0;
    for (const auto& shot : shots) {
        const auto shotId = shot.value("id").toString();
        auto media = source(shot, byId, claims);
        const auto strategy = shot.value("production").toObject().value("media_strategy").toString(board.value("production").toObject().value("media_strategy").toString());
        const auto still = asset(shot, "keyframe");
        const bool useVideo = strategy != "still_motion_graphics" && media.has_value();
        const bool useStill = !useVideo && strategy != "generated_video" && !still.isEmpty();
        const bool graphics = !useVideo && !useStill && strategy != "generated_video" && shot.value("graphics").toObject().value("mode").toString() == "graphics_first";
        const auto lineIds = shot.value("script_line_ids").toArray();
        if (!useVideo && !useStill && !graphics) {
            result.skippedShotIds.append(shotId);
            if (linked) { for (const auto& id : lineIds) { result.skippedLineIds.append(id); } }
            continue;
        }
        if (!useVideo) { media.reset(); }
        std::optional<double> audioDuration;
        if (linked && !lineIds.isEmpty() && shot.value("duration_source").toString() != "manual") {
            double total = 0; bool complete = true;
            for (const auto& id : lineIds) { const auto ms = lineDuration(lines.value(id.toString())); if (!ms) { complete = false; break; } total += *ms; }
            if (complete) { audioDuration = total; }
        }
        const double duration = audioDuration.value_or(media && media->available ? *media->available : directed(shot));
        if (!std::isfinite(duration) || duration <= 0) { result.error = "A storyboard shot has an empty or invalid source window."; return result; }
        if (linked && media && media->available && *media->available != duration) { result.trimmedShots.append(QJsonObject{{"shotId", shotId}, {"usedMs", duration}, {"sourceMs", *media->available}}); }
        if (!linked && media && !media->window && duration != directed(shot)) { result.retimedShots.append(QJsonObject{{"shotId", shotId}, {"usedMs", duration}, {"directedMs", directed(shot)}}); }
        auto video = clip({{"trackId", shotTrack.value("id")}, {"name", shot.value("slug").toString(QString("Shot %1").arg(shot.value("index").toInt() + 1))},
            {"startMs", cursor}, {"durationMs", duration}, {"mediaType", media ? "video" : "image"}, {"sourceType", "imported"}, {"status", "generated"},
            {"storyboardBoardId", boardId}, {"storyboardShotId", shotId}});
        if (!graphics) { video.insert("currentAssetId", media ? media->assetId : still); }
        if (media) {
            video.insert("linkId", newId());
            if ((!linked && (media->available || media->in > 0)) || (linked && media->owner != shotId)) { video.insert("inPointMs", media->in); video.insert("outPointMs", media->in + duration); }
        }
        if (!graphics) { clips.append(video); }
        if (media) {
            auto audio = video;
            audio.insert("id", newId()); audio.insert("trackId", audioTrack.value("id")); audio.insert("mediaType", "audio"); audio.insert("name", video.value("name").toString() + " (audio)");
            clips.append(audio); hasShotAudio = true;
        }
        if (linked) {
            double offset = 0;
            for (const auto& id : lineIds) {
                const auto line = lines.value(id.toString()); const auto take = currentTake(line); const auto ms = lineDuration(line);
                if (!ms) { result.skippedLineIds.append(id); continue; }
                const auto speaker = cast.value(line.value("speakerId").toString());
                const auto voice = line.value("voiceOverride").isObject() ? line.value("voiceOverride").toObject() : speaker.value("voice").toObject();
                auto audio = clip({{"trackId", voiceTrack.value("id")}, {"name", line.value("text").toString().left(40).isEmpty() ? "Line" : line.value("text").toString().left(40)},
                    {"startMs", cursor + offset}, {"durationMs", *ms - std::max(0.0, line.value("pauseAfterMs").toDouble())}, {"mediaType", "audio"}, {"sourceType", "generated"}, {"bindingKind", "text-to-audio"},
                    {"status", "generated"}, {"currentAssetId", take.value("assetId")}, {"prompt", line.value("text")}, {"scriptId", scriptId}, {"scriptLineId", line.value("id")}, {"storyboardBoardId", boardId}, {"storyboardShotId", shotId}});
                for (const auto& key : {"provider", "model", "voice"}) { if (voice.contains(key)) { audio.insert(key, voice.value(key)); } }
                if (!speaker.value("name").toString().isEmpty()) { audio.insert("speaker", speaker.value("name")); }
                QJsonArray words;
                for (const auto& value : take.value("words").toArray()) { const auto word = value.toObject(); words.append(QJsonObject{{"word", word.value("word")}, {"startMs", word.value("startMs")}, {"endMs", word.value("endMs")}}); }
                if (!words.isEmpty()) { audio.insert("caption", QJsonObject{{"words", words}}); }
                clips.append(audio); offset += *ms;
            }
        }
        cursor += duration;
    }
    if (!linked && hasShotAudio) { tracks.append(audioTrack); }
    const auto addDraft = [&](const QString& name, const QString& prompt, const QString& binding) {
        if (prompt.trimmed().isEmpty() || cursor <= 0) { return; }
        const auto audio = track("audio", name, static_cast<int>(tracks.size())); tracks.append(audio);
        clips.append(clip({{"trackId", audio.value("id")}, {"name", name}, {"startMs", 0}, {"durationMs", cursor}, {"mediaType", "audio"},
            {"sourceType", "generated"}, {"bindingKind", binding}, {"prompt", prompt.trimmed()}, {"status", "draft"}, {"storyboardBoardId", boardId}}));
    };
    if (!linked) { addDraft("Narration", screenplay.value("narration").toString(), "text-to-audio"); }
    addDraft("Music", screenplay.value("music_prompt").toString(), "text-to-music");
    QSet<QString> ownedTracks; QSet<QString> foreignTracks; QJsonArray foreignClips;
    for (const auto& value : existing.value("clips").toArray()) {
        const auto item = value.toObject();
        const bool owned = item.value("storyboardBoardId").toString() == boardId || (linked && item.value("scriptId").toString() == scriptId);
        if (owned) { ownedTracks.insert(item.value("trackId").toString()); }
        else { foreignTracks.insert(item.value("trackId").toString()); foreignClips.append(item); }
    }
    for (const auto& value : existing.value("tracks").toArray()) {
        const auto item = value.toObject(); const auto id = item.value("id").toString();
        if (foreignTracks.contains(id) || !ownedTracks.contains(id)) { tracks.append(item); }
    }
    for (qsizetype i = 0; i < tracks.size(); ++i) { auto item = tracks.at(i).toObject(); item.insert("index", static_cast<int>(i)); tracks[i] = item; }
    for (const auto& value : foreignClips) { clips.append(value); }
    result.document.insert("tracks", tracks); result.document.insert("clips", clips);
    double duration = cursor;
    for (const auto& value : clips) { const auto item = value.toObject(); duration = std::max(duration, item.value("startMs").toDouble() + item.value("durationMs").toDouble()); }
    result.document.insert("durationMs", duration);
    const auto aspect = board.value("aspectRatio").toString().split(':');
    bool validWidth = false; bool validHeight = false;
    const double aspectWidth = aspect.size() == 2 ? aspect.at(0).toDouble(&validWidth) : 0;
    const double aspectHeight = aspect.size() == 2 ? aspect.at(1).toDouble(&validHeight) : 0;
    int width = 1920; int height = 1080;
    if (validWidth && validHeight && std::isfinite(aspectWidth) && std::isfinite(aspectHeight) && aspectWidth > 0 && aspectHeight > 0) {
        const double longEdge = 1080 * std::max(aspectWidth, aspectHeight) / std::min(aspectWidth, aspectHeight);
        if (std::isfinite(longEdge) && longEdge <= std::numeric_limits<int>::max() - 1.0) {
            if (aspectWidth >= aspectHeight) { width = static_cast<int>(std::round(longEdge / 2) * 2); }
            else { width = 1080; height = static_cast<int>(std::round(longEdge / 2) * 2); }
        } else {
            result.document = existing;
            result.error = "The storyboard aspect ratio exceeds the native canvas range.";
            return result;
        }
    }
    result.document.insert("width", width); result.document.insert("height", height);
    return result;
}
}
