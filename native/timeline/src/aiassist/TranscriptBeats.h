#pragma once
#include <QJsonObject>
namespace nt::aiassist {
QJsonObject reflowTranscript(QJsonObject document, const QJsonObject& payload = {});
QJsonObject addTranscriptBeat(QJsonObject document, const QJsonObject& payload);
QJsonObject setTranscriptBeatText(QJsonObject document, const QJsonObject& payload);
QJsonObject deleteTranscriptParagraph(QJsonObject document, const QJsonObject& payload);
QJsonObject applyTranscriptBeatTake(QJsonObject document, const QJsonObject& payload);
}
