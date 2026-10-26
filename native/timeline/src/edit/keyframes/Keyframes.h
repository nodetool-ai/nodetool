#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QStringList>
#include <optional>

// Pure raw-JSON ports of Inspector/keyframeRows.ts and timeline/keyframes.ts.
// Times are clip-relative milliseconds. Curves retain the web's ordering,
// normalized-time tolerance and later-keyframe easing rule.
namespace nt::keyframes {
QJsonValue helper(const QString& name, const QJsonArray& args);
QJsonObject edit(QJsonObject document, const QJsonObject& payload);
QJsonArray rowSpecs();
QJsonArray times(const QJsonObject& clip, const QStringList& properties = {});
QStringList properties(const QString& row);
double inputValue(const QJsonObject& clip, const QString& row, int index, double atMs);
QJsonObject transform(const QJsonObject& clip);
} // namespace nt::keyframes
