#include "aiassist/ScriptExtraction.h"
#include <QDateTime>
#include <QHash>
#include <QStringList>
#include <QUuid>
#include <algorithm>
namespace nt::aiassist {
namespace {
QString paragraphKey(const QJsonObject& clip) {
    const auto paragraph = clip.value("paragraphId");
    return paragraph.isUndefined() || paragraph.isNull() ? clip.value("id").toString() : paragraph.toString();
}
struct Paragraph {
    QList<QJsonObject> clips;
    QString speaker;
    QString text;
};
}
QJsonObject extractScriptFromTimeline(const QJsonArray& clips, const ScriptExtractionContext& context) {
    if (!context.id) { return {}; }
    QList<QJsonObject> sorted;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (clip.contains("caption") || clip.value("bindingKind").toString() == "text-to-audio") { sorted.append(clip); }
    }
    std::stable_sort(sorted.begin(), sorted.end(), [](const auto& left, const auto& right) {
        const auto start = left.value("startMs").toDouble();
        const auto other = right.value("startMs").toDouble();
        return start == other ? left.value("id").toString() < right.value("id").toString() : start < other;
    });
    QList<Paragraph> paragraphs;
    for (qsizetype i = 0; i < sorted.size();) {
        const auto key = paragraphKey(sorted.at(i));
        Paragraph paragraph;
        while (i < sorted.size() && paragraphKey(sorted.at(i)) == key) { paragraph.clips.append(sorted.at(i)); ++i; }
        paragraph.speaker = paragraph.clips.first().value("speaker").toString().trimmed();
        QStringList words;
        for (const auto& clip : paragraph.clips) {
            for (const auto& word : clip.value("caption").toObject().value("words").toArray()) { words.append(word.toObject().value("word").toString()); }
        }
        const bool draft = paragraph.clips.size() == 1 && words.isEmpty() && paragraph.clips.first().value("sourceType").toString() != "imported";
        paragraph.text = draft ? paragraph.clips.first().value("prompt").toString() : words.join(QChar(u' '));
        paragraphs.append(std::move(paragraph));
    }
    QJsonArray cast;
    QHash<QString, QString> speakers;
    for (const auto& paragraph : paragraphs) {
        if (paragraph.speaker.isEmpty() || speakers.contains(paragraph.speaker)) { continue; }
        const auto id = context.id("spk");
        speakers.insert(paragraph.speaker, id);
        cast.append(QJsonObject{{"id", id}, {"name", paragraph.speaker}, {"voice", QJsonValue::Null}});
    }
    QJsonArray lines;
    for (const auto& paragraph : paragraphs) {
        QJsonArray takes;
        QJsonValue currentTake = QJsonValue::Null;
        if (paragraph.clips.size() == 1) {
            const auto clip = paragraph.clips.first();
            if (!clip.value("currentAssetId").toString().isEmpty()) {
                QJsonArray words;
                for (const auto& value : clip.value("caption").toObject().value("words").toArray()) {
                    const auto word = value.toObject();
                    words.append(QJsonObject{{"word", word.value("word")}, {"startMs", word.value("startMs")}, {"endMs", word.value("endMs")}});
                }
                const auto id = context.id("take");
                takes.append(QJsonObject{{"id", id}, {"assetId", clip.value("currentAssetId")}, {"durationMs", clip.value("durationMs")},
                    {"words", words}, {"textSnapshot", paragraph.text}, {"voiceSnapshot", QJsonValue::Null}, {"createdAt", context.createdAt}});
                currentTake = id;
            }
        }
        lines.append(QJsonObject{{"id", context.id("line")}, {"speakerId", paragraph.speaker.isEmpty() ? QJsonValue::Null : QJsonValue(speakers.value(paragraph.speaker))},
            {"text", paragraph.text}, {"takes", takes}, {"currentTakeId", currentTake}});
    }
    return {{"cast", cast}, {"sections", QJsonArray{QJsonObject{{"id", context.id("sec")}, {"lines", lines}}}}};
}
QJsonObject extractScriptFromTimeline(const QJsonArray& clips) {
    return extractScriptFromTimeline(clips, {[](const QString&) { return QUuid::createUuid().toString(QUuid::Id128); }, QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)});
}
}
