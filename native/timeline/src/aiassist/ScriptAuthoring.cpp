#include "aiassist/ScriptAuthoring.h"
#include "aiassist/AssistDocument.h"
#include <QHash>
#include <QUuid>
namespace nt::aiassist {
namespace {
QString id() { return QUuid::createUuid().toString(QUuid::Id128); }
QString resolvedLineId(const QJsonObject& script, const QString& input) {
    QStringList ids;
    for (const auto& section : script.value("document").toObject().value("sections").toArray()) {
        for (const auto& line : section.toObject().value("lines").toArray()) { ids.append(line.toObject().value("id").toString()); }
    }
    return resolveId(input, ids).value_or(QString{});
}
QJsonValue effectiveVoice(const QJsonObject& line, const QJsonObject& speaker) {
    const auto overridden = line.value("voiceOverride");
    if (!overridden.isUndefined() && !overridden.isNull()) { return overridden; }
    const auto voice = speaker.value("voice");
    return voice.isUndefined() ? QJsonValue::Null : voice;
}
QString lineStatus(const QJsonObject& line, const QJsonValue& voice, const QJsonValue& speed) {
    QJsonObject current;
    for (const auto& value : line.value("takes").toArray()) {
        const auto take = value.toObject();
        if (take.value("id") == line.value("currentTakeId")) { current = take; break; }
    }
    if (current.isEmpty()) { return "draft"; }
    const auto voiceSnapshot = current.value("voiceSnapshot");
    const bool voiceMatches = (voiceSnapshot.isUndefined() ? QJsonValue::Null : voiceSnapshot) == voice;
    const bool directionMatches = !current.contains("directionSnapshot") || current.value("directionSnapshot") == QJsonValue(line.value("direction").toString().trimmed());
    const bool speedMatches = !current.contains("speedSnapshot") || current.value("speedSnapshot") == speed;
    return current.value("textSnapshot") == line.value("text") && voiceMatches && directionMatches && speedMatches ? "voiced" : "stale";
}
}
QJsonObject addScriptLine(QJsonObject script, const QJsonObject& payload) {
    auto document = script.value("document").toObject();
    auto sections = document.value("sections").toArray();
    const auto lineId = payload.value("lineId").toString().isEmpty() ? id() : payload.value("lineId").toString();
    for (const auto& section : sections) {
        for (const auto& line : section.toObject().value("lines").toArray()) { if (line.toObject().value("id").toString() == lineId) { return script; } }
    }
    const QJsonObject line{{"id", lineId}, {"text", ""}, {"takes", QJsonArray{}}};
    if (sections.isEmpty()) {
        const auto sectionId = payload.value("newSectionId").toString().isEmpty() ? id() : payload.value("newSectionId").toString();
        sections.append(QJsonObject{{"id", sectionId}, {"lines", QJsonArray{line}}});
    } else {
        auto section = sections.last().toObject();
        auto lines = section.value("lines").toArray(); lines.append(line); section.insert("lines", lines); sections[sections.size() - 1] = section;
    }
    document.insert("sections", sections); script.insert("document", document); return script;
}
QJsonObject patchScriptLineText(QJsonObject script, const QJsonObject& payload) {
    if (!payload.value("text").isString()) { return script; }
    const auto lineId = resolvedLineId(script, payload.value("lineId").toString());
    if (lineId.isEmpty()) { return script; }
    auto document = script.value("document").toObject(); auto sections = document.value("sections").toArray();
    for (qsizetype i = 0; i < sections.size(); ++i) {
        auto section = sections.at(i).toObject(); auto lines = section.value("lines").toArray();
        for (qsizetype j = 0; j < lines.size(); ++j) {
            auto line = lines.at(j).toObject(); if (line.value("id").toString() != lineId) { continue; }
            line.insert("text", payload.value("text")); lines[j] = line;
        }
        section.insert("lines", lines); sections[i] = section;
    }
    document.insert("sections", sections); script.insert("document", document); return script;
}
QJsonObject removeEmptyScriptLine(QJsonObject script, const QJsonObject& payload) {
    const auto lineId = resolvedLineId(script, payload.value("lineId").toString());
    if (lineId.isEmpty()) { return script; }
    auto document = script.value("document").toObject(); auto sections = document.value("sections").toArray();
    for (qsizetype i = 0; i < sections.size(); ++i) {
        auto section = sections.at(i).toObject(); QJsonArray lines;
        for (const auto& value : section.value("lines").toArray()) {
            const auto line = value.toObject();
            if (line.value("id").toString() == lineId && line.value("text").isString() && line.value("text").toString().isEmpty()) { continue; }
            lines.append(value);
        }
        section.insert("lines", lines); sections[i] = section;
    }
    document.insert("sections", sections); script.insert("document", document); return script;
}
QJsonObject scriptPanelHeader(const QJsonObject& script) {
    int count = 0;
    for (const auto& section : script.value("document").toObject().value("sections").toArray()) { count += section.toObject().value("lines").toArray().size(); }
    const auto title = script.value("name").toString();
    return {{"title", title.isEmpty() ? QStringLiteral("Untitled script") : title}, {"lineCount", count}};
}
QUrl scriptEditorUrl(const QUrl& server, const QString& scriptId) {
    if (scriptId.isEmpty() || server.host().isEmpty() || (server.scheme() != "http" && server.scheme() != "https")) { return {}; }
    const auto origin = server.adjusted(QUrl::RemovePath | QUrl::RemoveQuery | QUrl::RemoveFragment | QUrl::RemoveUserInfo);
    return QUrl::fromEncoded(origin.toEncoded() + QByteArray("/studio/script/") + QUrl::toPercentEncoding(scriptId));
}
QJsonArray scriptPanelRows(const QJsonObject& script, const QJsonObject& timeline) {
    const auto document = script.value("document").toObject();
    QHash<QString, QJsonObject> cast;
    for (const auto& value : document.value("cast").toArray()) { const auto speaker = value.toObject(); const auto speakerId = speaker.value("id").toString(); if (!cast.contains(speakerId)) { cast.insert(speakerId, speaker); } }
    QHash<QString, QJsonObject> linkedClips;
    for (const auto& value : timeline.value("clips").toArray()) {
        const auto clip = value.toObject(); const auto lineId = clip.value("scriptLineId").toString();
        if (clip.value("scriptId") == script.value("id") && !lineId.isEmpty() && !linkedClips.contains(lineId)) { linkedClips.insert(lineId, clip); }
    }
    const auto pace = document.value("setup").toObject().value("pace").toString();
    const QJsonValue speed = pace == "slow" ? QJsonValue(0.85) : pace == "fast" ? QJsonValue(1.15) : QJsonValue(QJsonValue::Null);
    QJsonArray rows;
    for (const auto& value : document.value("sections").toArray()) {
        const auto section = value.toObject();
        if (!section.value("title").toString().isEmpty()) { rows.append(QJsonObject{{"kind", "section"}, {"id", section.value("id")}, {"title", section.value("title")}}); }
        QJsonValue previousSpeaker;
        const auto lines = section.value("lines").toArray();
        for (qsizetype i = 0; i < lines.size(); ++i) {
            auto line = lines.at(i).toObject();
            const auto speaker = cast.value(line.value("speakerId").toString());
            const auto clip = linkedClips.value(line.value("id").toString());
            const bool showSpeaker = i == 0 || previousSpeaker != line.value("speakerId");
            previousSpeaker = line.value("speakerId");
            const auto status = lineStatus(line, effectiveVoice(line, speaker), speed);
            line.insert("kind", "line"); line.insert("sectionId", section.value("id")); line.insert("showSpeaker", showSpeaker && !speaker.isEmpty());
            line.insert("speakerName", speaker.value("name").toString());
            if (speaker.contains("color")) { line.insert("speakerColor", speaker.value("color")); }
            line.insert("status", status); line.insert("hasVoice", effectiveVoice(line, speaker).isObject()); line.insert("canVoice", status != "voiced" && !line.value("text").toString().trimmed().isEmpty());
            line.insert("clipId", clip.value("id").isUndefined() ? QJsonValue::Null : clip.value("id"));
            if (!clip.isEmpty()) { line.insert("clipStartMs", clip.value("startMs")); }
            rows.append(line);
        }
    }
    return rows;
}
}
