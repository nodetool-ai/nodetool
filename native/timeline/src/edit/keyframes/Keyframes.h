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
const QJsonArray& rowSpecs();
QJsonArray times(const QJsonObject& clip, const QStringList& properties = {});
QStringList properties(const QString& row);
int inputCount(const QString& row);
double inputValue(const QJsonObject& clip, const QString& row, int index, double atMs);
QJsonObject transform(const QJsonObject& clip);
// Another kind of animation already drives this row's value, so the row takes no keys.
bool rowDrivenElsewhere(const QJsonObject& clip, const QString& row);
// What a keyable effect parameter defaults to and how far it goes, empty for any other parameter.
QJsonObject effectParamSpec(const QString& type, const QString& key);
QStringList keyableEffectParams(const QString& type);
// The clip as its panel shows it: what a switched-off group holds, back in place. Read only.
QJsonObject withBypassRestored(const QJsonObject& clip);
// One row sampled for its value and velocity graphs, in the units its fields show.
// `curves` has one list of samples + 1 values per input, over fromMs..toMs. `velocity` has
// `samples` values per second. This part follows the view.
QJsonObject rowGraphSamples(const QJsonObject& clip, const QString& row, double fromMs, double toMs, int samples);
// This part follows the document. `lo` and `hi` fit the whole clip. `keys` lists each
// keyframe with its `values`, and the `handles` of the segment arriving at it.
QJsonObject rowGraphKeys(const QJsonObject& clip, const QString& row);
// Both parts together.
QJsonObject rowGraph(const QJsonObject& clip, const QString& row, double fromMs, double toMs, int samples);
// Influence handles for an easing: its control points, or the nearest form when the
// easing is not a Bezier. Empty for hold, which has no curve to shape.
QJsonObject bezierHandles(const QString& easing);
QString bezierEasing(double x1, double y1, double x2, double y2);
} // namespace nt::keyframes
