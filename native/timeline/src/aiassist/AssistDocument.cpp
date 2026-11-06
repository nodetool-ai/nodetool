#include "aiassist/AssistDocument.h"
#include <QRegularExpression>
#include <limits>
#include "edit/ClipOps.h"
#include "edit/EditActions.h"
#include <QSet>
#include <QUuid>
#include <algorithm>
#include <cmath>
namespace nt::aiassist {
std::optional<QString> resolveId(const QString& input, const QStringList& authorized) {
    if (authorized.contains(input)) { return input; }
    static const QRegularExpression shortId(QStringLiteral("^[0-9a-f]{12}$"));
    if (input.size() != 12 || !shortId.match(input).hasMatch()) { return std::nullopt; }
    static const QRegularExpression fullId(QStringLiteral("^[0-9a-f]{32}$"));
    std::optional<QString> result;
    for (const auto& id : authorized) {
        if (id.size() == 32 && fullId.match(id).hasMatch() && id.startsWith(input)) {
            if (result) { return std::nullopt; }
            result = id;
        }
    }
    return result;
}
QJsonObject correctTranscript(QJsonObject document, const QJsonObject& payload) {
    auto clips = document.value("clips").toArray();
    QStringList ids;
    for (const auto& value : clips) { ids.append(value.toObject().value("id").toString()); }
    const auto id = resolveId(payload.value("clipId").toString(), ids);
    if (!id || !payload.value("text").isString() || !payload.value("wordIndex").isDouble()) { return document; }
    const double indexValue = payload.value("wordIndex").toDouble();
    if (!std::isfinite(indexValue) || indexValue < 0 || indexValue > std::numeric_limits<int>::max() || indexValue != static_cast<int>(indexValue)) { return document; }
    const int index = static_cast<int>(indexValue);
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips.at(i).toObject();
        if (clip.value("id").toString() != *id) { continue; }
        nt::edit::EditDoc editDoc;
        for (const auto& value : clips) { editDoc.clips.push_back(value.toObject()); }
        for (const auto& value : document.value("tracks").toArray()) {
            const auto track = value.toObject();
            editDoc.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
        }
        if (nt::edit::lockedUserTargetIds(editDoc).contains(*id)) { return document; }
        auto caption = clip.value("caption").toObject();
        auto words = caption.value("words").toArray();
        if (index >= words.size()) { return document; }
        auto word = words.at(index).toObject();
        word.insert("word", payload.value("text"));
        words[index] = word;
        caption.insert("words", words);
        clip.insert("caption", caption);
        clips[i] = clip;
        document.insert("clips", clips);
        return document;
    }
    return document;
}
QJsonObject deleteTranscriptRange(QJsonObject document, const QJsonObject& payload) {
    const double start = payload.value("startMs").toDouble(-1);
    const double end = payload.value("endMs").toDouble(-1);
    if (!std::isfinite(start) || !std::isfinite(end) || start < 0 || end <= start) { return document; }
    const auto clips = document.value("clips").toArray();
    nt::edit::EditDoc editDoc;
    for (const auto& value : clips) { editDoc.clips.push_back(value.toObject()); }
    for (const auto& value : document.value("tracks").toArray()) {
        const auto track = value.toObject();
        editDoc.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
    }
    const auto locked = nt::edit::lockedUserTargetIds(editDoc);
    for (const auto& clip : editDoc.clips) {
        if (!locked.contains(clip.value("id").toString())) { continue; }
        for (const auto& wordValue : clip.value("caption").toObject().value("words").toArray()) {
            const auto word = wordValue.toObject();
            const double offset = clip.value("startMs").toDouble();
            if (offset + word.value("startMs").toDouble() < end && offset + word.value("endMs").toDouble() > start) { return document; }
        }
    }
    QHash<QString, QString> heads, tails;
    auto relink = [](QJsonObject clip, QHash<QString, QString>& groups) {
        const auto link = clip.value("linkId").toString();
        if (!link.isEmpty()) {
            if (!groups.contains(link)) { groups.insert(link, QUuid::createUuid().toString(QUuid::Id128)); }
            clip.insert("linkId", groups.value(link));
        }
        return clip;
    };
    QJsonArray next;
    double duration = 0;
    auto append = [&next, &duration](QJsonObject clip) {
        duration = std::max(duration, clip.value("startMs").toDouble() + clip.value("durationMs").toDouble());
        next.append(clip);
    };
    for (const auto& clip : editDoc.clips) {
        const double a = clip.value("startMs").toDouble();
        const double b = a + clip.value("durationMs").toDouble();
        if (b <= start || locked.contains(clip.value("id").toString())) { append(clip); continue; }
        if (a >= end) { auto moved = clip; moved.insert("startMs", a - (end - start)); append(moved); continue; }
        if (clip.contains("timeRemap")) { append(clip); continue; }
        if (start > a) {
            auto head = nt::edit::splitClip(clip, start).first;
            head.insert("id", clip.value("id"));
            append(relink(head, heads));
        }
        if (end < b) {
            auto tail = nt::edit::splitClip(clip, end).second;
            tail.insert("startMs", start);
            append(relink(tail, tails));
        }
    }
    document.insert("clips", next);
    document.insert("durationMs", duration);
    return document;
}
QJsonObject removeFillers(QJsonObject document, const QJsonObject&) {
    static const QSet<QString> fillers{"um", "umm", "uh", "uhh", "uhm", "erm", "er", "eh", "ah", "hmm", "mhm", "mm", "uh-huh", "mm-hmm"};
    static const QRegularExpression punctuation("[.,!?;:]+$");
    std::vector<std::pair<double, double>> ranges;
    for (const auto& clipValue : document.value("clips").toArray()) {
        const auto clip = clipValue.toObject();
        for (const auto& wordValue : clip.value("caption").toObject().value("words").toArray()) {
            const auto word = wordValue.toObject();
            auto normalized = word.value("word").toString().toLower();
            normalized.remove(punctuation);
            const auto kind = word.value("kind").toString();
            if (kind == "filler" || (kind.isEmpty() && fillers.contains(normalized.trimmed()))) {
                ranges.emplace_back(clip.value("startMs").toDouble() + word.value("startMs").toDouble(), clip.value("startMs").toDouble() + word.value("endMs").toDouble());
            }
        }
    }
    std::sort(ranges.begin(), ranges.end(), std::greater<>());
    for (const auto& [start, end] : ranges) { document = deleteTranscriptRange(document, {{"startMs", start}, {"endMs", end}}); }
    return document;
}
QJsonArray transcript(const QJsonObject& document) {
    QJsonArray rows;
    for (const auto& value : document.value("clips").toArray()) {
        const auto clip = value.toObject();
        const auto words = clip.value("caption").toObject().value("words").toArray();
        for (qsizetype i = 0; i < words.size(); ++i) {
            auto word = words.at(i).toObject();
            word.insert("absoluteStartMs", clip.value("startMs").toDouble() + word.value("startMs").toDouble());
            word.insert("absoluteEndMs", clip.value("startMs").toDouble() + word.value("endMs").toDouble());
            word.insert("clipId", clip.value("id"));
            word.insert("wordIndex", static_cast<int>(i));
            rows.append(word);
        }
    }
    return rows;
}
bool acceptsResult(const QJsonObject& observed, const QJsonObject& current) {
    return !observed.value("id").toString().isEmpty() && observed == current;
}
}
